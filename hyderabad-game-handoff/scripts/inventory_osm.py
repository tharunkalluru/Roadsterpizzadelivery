#!/usr/bin/env python3
"""Audit the frozen OSM source package using Python 3.10+ and the standard library."""

from __future__ import annotations

import argparse
import collections
import hashlib
import json
import math
import re
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

DEFAULT_MANIFEST = Path(__file__).resolve().parents[1] / "resources/osm/resource-acquisition-manifest.json"
MAX_SOURCE_BYTES = 24 * 1024 * 1024
CORRIDOR_RE = re.compile(r"^corridor-(0[1-4])-.+\.osm$")


class SourceError(ValueError):
    """A source is unsafe, malformed, incomplete, or inconsistent with its manifest."""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def safe_path(base: Path, relative_name: str) -> Path:
    """Resolve an ordinary relative POSIX path, including existing symlink checks."""
    if not isinstance(relative_name, str) or not relative_name:
        raise SourceError("Manifest file names must be nonempty strings")
    if "\\" in relative_name or ":" in relative_name or any(ord(c) < 32 for c in relative_name):
        raise SourceError(f"Unsafe file name: {relative_name!r}")
    parts = relative_name.split("/")
    if any(part in ("", ".", "..") for part in parts) or PurePosixPath(relative_name).is_absolute():
        raise SourceError(f"Unsafe relative path: {relative_name!r}")
    base = base.resolve()
    result = (base / relative_name).resolve()
    try:
        result.relative_to(base)
    except ValueError as exc:
        raise SourceError(f"Path escapes its source directory: {relative_name!r}") from exc
    return result


def read_limited(path: Path, limit: int = MAX_SOURCE_BYTES) -> bytes:
    if not path.is_file():
        raise SourceError(f"Missing regular file: {path}")
    if path.stat().st_size > limit:
        raise SourceError(f"File exceeds the {limit}-byte size cap: {path}")
    with path.open("rb") as handle:
        data = handle.read(limit + 1)
    if len(data) > limit:
        raise SourceError(f"File grew beyond the size cap: {path}")
    return data


def load_manifest(path: Path) -> tuple[dict, Path]:
    path = path.expanduser().resolve()
    try:
        manifest = json.loads(read_limited(path, 2 * 1024 * 1024))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise SourceError(f"Invalid JSON manifest: {path}") from exc
    if not isinstance(manifest, dict) or not isinstance(manifest.get("files"), list):
        raise SourceError("Manifest must have a files array")
    if not manifest["files"] or len(manifest["files"]) > 1000:
        raise SourceError("Manifest must list between 1 and 1000 files")
    names = set()
    for entry in manifest["files"]:
        if not isinstance(entry, dict):
            raise SourceError("Each manifest entry must be an object")
        name = entry.get("file")
        safe_path(path.parent, name)
        if name in names:
            raise SourceError(f"Duplicate manifest file: {name}")
        names.add(name)
        if not isinstance(entry.get("sha256"), str) or not re.fullmatch(r"[a-fA-F0-9]{64}", entry["sha256"]):
            raise SourceError(f"Missing or invalid SHA-256 for {name}")
        if not isinstance(entry.get("bytes"), int) or isinstance(entry["bytes"], bool) or entry["bytes"] < 0:
            raise SourceError(f"Missing or invalid byte count for {name}")
    return manifest, path.parent


def verify_manifest(manifest: dict, base: Path) -> dict:
    results = []
    for entry in manifest["files"]:
        item = {"file": entry["file"], "expected_bytes": entry["bytes"], "expected_sha256": entry["sha256"]}
        try:
            data = read_limited(safe_path(base, entry["file"]))
            item["actual_bytes"] = len(data)
            item["actual_sha256"] = hashlib.sha256(data).hexdigest()
            item["ok"] = len(data) == entry["bytes"] and item["actual_sha256"] == entry["sha256"].lower()
            if not item["ok"]:
                item["error"] = "Content does not match the frozen manifest"
        except (OSError, SourceError) as exc:
            item.update(ok=False, error=str(exc))
        results.append(item)
    return {"ok": all(item["ok"] for item in results), "checked_files": len(results), "files": results}


def parse_osm_xml(data: bytes, label: str = "source") -> ET.Element:
    if len(data) > MAX_SOURCE_BYTES:
        raise SourceError(f"OSM XML exceeds the size cap: {label}")
    upper = data.upper()
    if b"<!DOCTYPE" in upper or b"<!ENTITY" in upper:
        raise SourceError(f"DTD and entity declarations are not accepted: {label}")
    try:
        root = ET.fromstring(data)
    except ET.ParseError as exc:
        raise SourceError(f"Malformed OSM XML: {label}: {exc}") from exc
    if root.tag != "osm":
        raise SourceError(f"Expected an osm root element: {label}")
    errors = list(root.iter("error"))
    if errors:
        raise SourceError(f"API error inside XML payload: {label}: {errors[0].text}")
    return root


def record_from_element(element: ET.Element, source: str) -> dict:
    try:
        record = {
            "type": element.tag,
            "id": int(element.attrib["id"]),
            "version": int(element.attrib.get("version", "0")),
            "timestamp": element.attrib.get("timestamp"),
            "tags": {tag.attrib["k"]: tag.attrib["v"] for tag in element.findall("tag")},
        }
        if element.tag == "node":
            lat, lon = float(element.attrib["lat"]), float(element.attrib["lon"])
            if not math.isfinite(lat) or not math.isfinite(lon) or not (-90 <= lat <= 90 and -180 <= lon <= 180):
                raise ValueError("Invalid geographic coordinates")
            record["lat"], record["lon"] = lat, lon
        elif element.tag == "way":
            record["nodes"] = [int(node.attrib["ref"]) for node in element.findall("nd")]
        else:
            record["members"] = [
                {"type": member.attrib["type"], "ref": int(member.attrib["ref"]), "role": member.attrib.get("role", "")}
                for member in element.findall("member")
            ]
            if any(member["type"] not in ("node", "way", "relation") for member in record["members"]):
                raise ValueError("Unknown relation member type")
        if record["id"] <= 0 or record["version"] < 0:
            raise ValueError("Invalid source ID or version")
        return record
    except (KeyError, TypeError, ValueError) as exc:
        raise SourceError(f"Invalid OSM element in {source}: {element.tag} {element.attrib.get('id')}: {exc}") from exc


def suspicious_name_reasons(name: str) -> list[str]:
    """Review hints only. Never alter, translate, or silently 'repair' a source name."""
    reasons = []
    stripped = name.strip()
    if re.fullmatch(r"(?:abc|asdf|test\d*|unknown|unnamed|n/?a|none)", stripped, re.I):
        reasons.append("Possible placeholder or generic value; inspect evidence")
    if re.match(r"^near\b", stripped, re.I):
        reasons.append("Possible location description rather than a formal name")
    if re.search(r"\b(?:strret|raod|taranka)\b", stripped, re.I):
        reasons.append("Possible spelling error; no correction inferred")
    if stripped != name:
        reasons.append("Leading or trailing whitespace")
    if any(ord(char) < 32 for char in name):
        reasons.append("Control character in display text")
    if not stripped:
        reasons.append("Empty name")
    return reasons


def inventory_files(paths: list[Path]) -> dict:
    selected = {}
    observations = collections.defaultdict(list)
    source_counts = []
    for path in paths:
        root = parse_osm_xml(read_limited(path), path.name)
        counts = collections.Counter()
        for element in root:
            if element.tag not in ("node", "way", "relation"):
                continue
            record = record_from_element(element, path.name)
            key = (record["type"], record["id"])
            fingerprint = hashlib.sha256(json.dumps(record, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
            observations[key].append({"file": path.name, "version": record["version"], "fingerprint": fingerprint})
            if key not in selected or record["version"] > selected[key]["version"]:
                selected[key] = record
            counts[element.tag] += 1
        source_counts.append({"file": path.name, "counts": dict(counts)})

    version_conflicts, same_version_conflicts = [], []
    for key, entries in observations.items():
        versions = sorted({entry["version"] for entry in entries})
        if len(versions) > 1:
            version_conflicts.append({"type": key[0], "id": key[1], "versions": versions, "selected_version": selected[key]["version"], "observations": entries})
        for version in versions:
            at_version = [entry for entry in entries if entry["version"] == version]
            if len({entry["fingerprint"] for entry in at_version}) > 1:
                same_version_conflicts.append({"type": key[0], "id": key[1], "version": version, "observations": at_version})

    records = list(selected.values())
    roads = [record for record in records if record["type"] == "way" and "highway" in record["tags"]]
    buildings = [record for record in records if "building" in record["tags"]]
    pois = [record for record in records if any(key in record["tags"] for key in ("shop", "amenity", "office", "tourism"))]
    named = [record for record in records if any(key == "name" or key.startswith("name:") for key in record["tags"])]
    missing_way_nodes, partial_relations, restrictions, suspicious = [], [], [], []
    for record in records:
        if record["type"] == "way":
            missing = [ref for ref in record["nodes"] if ("node", ref) not in selected]
            if missing:
                missing_way_nodes.append({"way_id": record["id"], "missing_node_ids": missing})
        elif record["type"] == "relation":
            missing = [member for member in record["members"] if (member["type"], member["ref"]) not in selected]
            if missing:
                partial_relations.append({"relation_id": record["id"], "relation_type": record["tags"].get("type"), "missing_member_count": len(missing), "missing_members": missing})
            if record["tags"].get("type") == "restriction":
                restrictions.append({"relation_id": record["id"], "tags": record["tags"], "missing_members": missing})
        for key, value in record["tags"].items():
            if key == "name" or key.startswith("name:"):
                reasons = suspicious_name_reasons(value)
                if reasons:
                    suspicious.append({"type": record["type"], "id": record["id"], "tag": key, "raw_value": value, "reasons": reasons, "source_files": sorted({entry["file"] for entry in observations[(record["type"], record["id"]) ]})})

    metrics = {
        "unique_counts": dict(collections.Counter(record["type"] for record in records)),
        "highway_ways": len(roads),
        "highway_type_counts": dict(sorted(collections.Counter(record["tags"]["highway"] for record in roads).items())),
        **{f"highway_ways_with_{field}_tag": sum(field in record["tags"] for record in roads) for field in ("name", "width", "lanes", "oneway", "surface")},
        "building_features": len(buildings),
        "building_features_with_height_tag": sum("height" in record["tags"] for record in buildings),
        "building_features_with_levels_tag": sum("building:levels" in record["tags"] for record in buildings),
        "poi_tagged_features": len(pois),
        "poi_features_with_name_tag": sum("name" in record["tags"] for record in pois),
        "named_features": len(named),
        "named_features_with_name_te": sum("name:te" in record["tags"] for record in named),
        "way_geometries_missing_node_references": len(missing_way_nodes),
        "relations_missing_member_references": len(partial_relations),
        "turn_restriction_relations": len(restrictions),
        "suspicious_raw_name_fields": len(suspicious),
    }
    return {
        "source_files": source_counts,
        "metrics": metrics,
        "element_version_conflicts": version_conflicts,
        "same_version_content_conflicts": same_version_conflicts,
        "way_geometries_missing_node_references": missing_way_nodes,
        "relations_missing_member_references": partial_relations,
        "turn_restrictions": restrictions,
        "suspicious_raw_names": sorted(suspicious, key=lambda item: (item["type"], item["id"], item["tag"])),
    }


LIMITATIONS = [
    "Hash verification confirms agreement with the supplied manifest, not independent authenticity, current accuracy, or field verification.",
    "The four overlapping boxes are acquisition extents, not a final playable-road selection. Counts describe OSM elements, not unique real-world roads or businesses.",
    "Highway ways include paths, steps, service areas and other features that may not be car-drivable. Access and direction need explicit classification.",
    "A missing name tag does not establish that a real street has no name. Suspect-name hints require review and never authorize automatic renaming.",
    "Building footprints and POI points do not establish exact facade appearance, storefront order, entrance access, width, height or flight clearance.",
    "OSM layer describes relative stacking and is not a physical height in metres.",
    "Absent turn-restriction relations are unknown coverage, not permission to permit every turn.",
    "Parent relations may extend beyond the boxes. Complete needed relations deliberately; do not interpret missing members as nonexistent objects.",
    "The four source responses were acquired separately. Deduplication chooses the highest object version; different versions or same-version content conflicts require review.",
    "Metro track stop positions are not road delivery entrances. Imported station grouping and display names require reconciliation with the operator.",
    "This script performs no street-image inspection, local survey, lane-level validation, gameplay verification or phone-performance testing.",
    "The sources contain public OSM contributor metadata and may contain public POI contact fields. Runtime data should retain only fields the game needs and required provenance.",
]


def write_new_json(path: Path, report: dict) -> None:
    path = path.expanduser()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def run_inventory(manifest_path: Path) -> dict:
    manifest, base = load_manifest(manifest_path)
    integrity = verify_manifest(manifest, base)
    report = {"generated_at": utc_now(), "manifest": str(manifest_path.expanduser().resolve()), "integrity": integrity, "field_survey_performed": False, "street_imagery_visual_review_performed": False, "limitations": LIMITATIONS}
    if not integrity["ok"]:
        report["status"] = "integrity_failed_inventory_not_run"
        return report
    matches = [(CORRIDOR_RE.fullmatch(entry["file"]), entry["file"]) for entry in manifest["files"]]
    corridor = [(match.group(1), name) for match, name in matches if match]
    if len(corridor) != 4 or {number for number, _ in corridor} != {"01", "02", "03", "04"}:
        raise SourceError("Expected exactly one manifest-listed corridor XML source for each box 01 through 04")
    report.update(inventory_files([safe_path(base, name) for _, name in sorted(corridor)]))
    report["status"] = "source_inventory_complete_requires_geographic_review"
    if report["element_version_conflicts"] or report["same_version_content_conflicts"] or report["way_geometries_missing_node_references"]:
        report["status"] = "source_conflicts_or_incomplete_ways_require_review"
    return report


def print_summary(report: dict) -> None:
    print(f"Status: {report['status']}")
    integrity = report["integrity"]
    print(f"Manifest hashes: {'PASS' if integrity['ok'] else 'FAIL'} ({integrity['checked_files']} files)")
    for item in integrity["files"]:
        if not item["ok"]:
            print(f"  {item['file']}: {item['error']}")
    metrics = report.get("metrics")
    if metrics:
        print("Unique OSM elements: " + json.dumps(metrics["unique_counts"], sort_keys=True))
        print(f"Highway ways: {metrics['highway_ways']}; named: {metrics['highway_ways_with_name_tag']}; width-tagged: {metrics['highway_ways_with_width_tag']}; lane-tagged: {metrics['highway_ways_with_lanes_tag']}")
        print(f"Building features: {metrics['building_features']}; height-tagged: {metrics['building_features_with_height_tag']}; levels-tagged: {metrics['building_features_with_levels_tag']}")
        print(f"POI-tagged features: {metrics['poi_tagged_features']}; named POIs: {metrics['poi_features_with_name_tag']}; named features overall: {metrics['named_features']}")
        print(f"Missing way-node references: {metrics['way_geometries_missing_node_references']}; partial parent relations: {metrics['relations_missing_member_references']}; turn-restriction relations: {metrics['turn_restriction_relations']}")
        print(f"Version conflicts: {len(report['element_version_conflicts'])}; same-version content conflicts: {len(report['same_version_content_conflicts'])}; suspicious raw-name fields: {metrics['suspicious_raw_name_fields']}")
    print("Source integrity is not geographic or storefront verification. See the report limitations.")


class InventorySelfTests(unittest.TestCase):
    def test_path_escape_and_symlink_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory) / "cache"
            base.mkdir()
            for name in ("../outside", "/absolute", "a/../b", "a\\b", "a//b"):
                with self.assertRaises(SourceError):
                    safe_path(base, name)
            outside = Path(directory) / "outside"
            outside.write_text("outside")
            (base / "link").symlink_to(outside)
            with self.assertRaises(SourceError):
                safe_path(base, "link")

    def test_hash_tampering_is_detected(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            (base / "a.osm").write_bytes(b"original")
            manifest = {"files": [{"file": "a.osm", "bytes": 8, "sha256": hashlib.sha256(b"original").hexdigest()}]}
            self.assertTrue(verify_manifest(manifest, base)["ok"])
            (base / "a.osm").write_bytes(b"modified")
            self.assertFalse(verify_manifest(manifest, base)["ok"])

    def test_versions_duplicates_and_missing_members_are_reported(self):
        with tempfile.TemporaryDirectory() as directory:
            a, b = Path(directory) / "a.osm", Path(directory) / "b.osm"
            a.write_text('<osm><node id="1" version="1" lat="17" lon="78"/><way id="2" version="1"><nd ref="1"/><nd ref="9"/><tag k="highway" v="residential"/><tag k="name" v="abc"/></way><relation id="3" version="1"><member type="way" ref="88" role="outer"/><tag k="type" v="multipolygon"/></relation></osm>')
            b.write_text('<osm><node id="1" version="2" lat="17.1" lon="78"/></osm>')
            result = inventory_files([a, b])
            self.assertEqual(result["metrics"]["unique_counts"], {"node": 1, "way": 1, "relation": 1})
            self.assertEqual(result["element_version_conflicts"][0]["selected_version"], 2)
            self.assertEqual(result["way_geometries_missing_node_references"][0]["missing_node_ids"], [9])
            self.assertEqual(result["relations_missing_member_references"][0]["missing_members"][0]["ref"], 88)
            self.assertEqual(result["suspicious_raw_names"][0]["raw_value"], "abc")

    def test_same_version_different_coordinates_is_a_conflict(self):
        with tempfile.TemporaryDirectory() as directory:
            paths = [Path(directory) / name for name in ("a.osm", "b.osm")]
            for path, lat in zip(paths, (17, 18)):
                path.write_text(f'<osm><node id="1" version="1" lat="{lat}" lon="78"/></osm>')
            self.assertEqual(len(inventory_files(paths)["same_version_content_conflicts"]), 1)

    def test_api_error_and_entity_declarations_are_rejected(self):
        for payload in (b'<osm><error>partial response</error></osm>', b'<!DOCTYPE osm><osm/>', b'<html>gateway error</html>'):
            with self.assertRaises(SourceError):
                parse_osm_xml(payload)

    def test_report_never_overwrites_existing_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "report.json"
            write_new_json(path, {"first": True})
            with self.assertRaises(FileExistsError):
                write_new_json(path, {"second": True})
            self.assertEqual(json.loads(path.read_text()), {"first": True})


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--output", "--json-output", type=Path, help="Write a new JSON report; refuses to overwrite any existing file")
    parser.add_argument("--json", action="store_true", help="Print the complete JSON report to stdout")
    parser.add_argument("--self-test", action="store_true", help="Run local synthetic failure tests without network access")
    args = parser.parse_args(argv)
    if args.self_test:
        result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(InventorySelfTests))
        return 0 if result.wasSuccessful() else 1
    try:
        report = run_inventory(args.manifest)
        if args.output:
            write_new_json(args.output, report)
        if args.json:
            print(json.dumps(report, ensure_ascii=False, indent=2))
        else:
            print_summary(report)
            if args.output:
                print(f"JSON report: {args.output.expanduser().resolve()}")
        return 0 if report["status"] == "source_inventory_complete_requires_geographic_review" else 1
    except (OSError, SourceError) as exc:
        print(f"Source inventory failed: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
