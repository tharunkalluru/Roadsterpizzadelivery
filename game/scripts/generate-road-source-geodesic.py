"""Compile bounded source-cut repairs. No raw pack, active cache or model writes.

Requires isolated geographiclib==2.1. All geometry comes from retained Overture
WKB, and every actual owner/context copy is bound by the preflight inventory.
"""
import argparse
import bisect
import hashlib
import json
import math
import struct
from pathlib import Path

from geographiclib.geodesic import Geodesic

ROOT = Path(__file__).resolve().parent.parent
EVIDENCE = ROOT / "docs/qa/evidence/reported-roads/tile-boundary-source-audit-20261103"
KX = math.cos(math.radians(17.4063)) * 6380050.094 * math.pi / 180
KZ = 6341141.900 * math.pi / 180


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def project(point):
    return [(point[0] - 78.4966) * KX, -(point[1] - 17.4063) * KZ]


def rounded(point):
    return [round(v, 9) for v in point]


def cumulative(points):
    out = [0.0]
    for a, b in zip(points, points[1:]):
        out.append(out[-1] + math.dist(a, b))
    return out


def lerp_function(x, xs, ys, extrapolate=False):
    i = max(1, min(len(xs) - 1, bisect.bisect_left(xs, x)))
    u = (x - xs[i - 1]) / (xs[i] - xs[i - 1])
    if not extrapolate:
        u = max(0.0, min(1.0, u))
    return ys[i - 1] + (ys[i] - ys[i - 1]) * u


class SourceLine:
    def __init__(self, row):
        self.row = row
        wkb = bytes.fromhex(row["geometryWKB"])
        endian = "<" if wkb[0] else ">"
        kind, count = struct.unpack_from(endian + "II", wkb, 1)
        assert kind == 2 and len(wkb) == 9 + count * 16
        self.points = [struct.unpack_from(endian + "dd", wkb, 9 + i * 16) for i in range(count)]
        self.planar = cumulative(self.points)
        self.geodetic, self.bearings = [0.0], []
        for a, b in zip(self.points, self.points[1:]):
            leg = Geodesic.WGS84.Inverse(a[1], a[0], b[1], b[0])
            self.geodetic.append(self.geodetic[-1] + leg["s12"])
            self.bearings.append(leg["azi1"])
        self.vertex_fractions = [d / self.geodetic[-1] for d in self.geodetic]

    def point(self, fraction):
        distance = max(0.0, min(1.0, fraction)) * self.geodetic[-1]
        closest = min(range(len(self.geodetic)), key=lambda i: abs(self.geodetic[i] - distance))
        # The source includes every official connector as an actual vertex.
        # Rounding 9-decimal fractions can differ by micrometres from that vertex.
        if abs(self.geodetic[closest] - distance) < .00002:
            return self.points[closest]
        i = max(1, min(len(self.points) - 1, bisect.bisect_left(self.geodetic, distance)))
        result = Geodesic.WGS84.Direct(self.points[i - 1][1], self.points[i - 1][0], self.bearings[i - 1], distance - self.geodetic[i - 1])
        return result["lon2"], result["lat2"]

    def planar_to_geodetic(self, fraction):
        d = fraction * self.planar[-1]
        i = max(1, min(len(self.points) - 1, bisect.bisect_left(self.planar, d)))
        u = (d - self.planar[i - 1]) / (self.planar[i] - self.planar[i - 1])
        a, b = self.points[i - 1], self.points[i]
        point = [a[k] + (b[k] - a[k]) * u for k in range(2)]
        leg = Geodesic.WGS84.Inverse(a[1], a[0], point[1], point[0])["s12"]
        return (self.geodetic[i - 1] + leg) / self.geodetic[-1]

    def original_fractions(self, road, lo, hi):
        fractions = [lo]
        xy = [project(p) for p in self.points]
        for point in road["pts"][1:-1]:
            choices = []
            for i, (a, b) in enumerate(zip(xy, xy[1:])):
                dx, dz = b[0] - a[0], b[1] - a[1]
                u = max(0.0, min(1.0, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / (dx * dx + dz * dz)))
                fraction = (self.planar[i] + (self.planar[i + 1] - self.planar[i]) * u) / self.planar[-1]
                if max(lo, fractions[-1]) - 1e-12 <= fraction <= hi + 1e-12:
                    choices.append((math.dist(point, [a[0] + u * dx, a[1] + u * dz]), fraction))
            error, fraction = min(choices)
            assert error < .075, (road["id"], "source interior does not bind", error)
            assert fraction > fractions[-1], (road["id"], "nonmonotonic source interior")
            fractions.append(fraction)
        fractions.append(hi)
        return fractions

    def connector(self, prefix):
        matches = [c for c in self.row["connectors"] if c["connector_id"].startswith(prefix)]
        assert len(matches) == 1, (self.row["id"], prefix, "ambiguous connector")
        return matches[0]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--preflight", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--audit", type=Path, required=True)
    args = parser.parse_args()
    assert not args.output.exists() and not args.audit.exists(), "Refusing to overwrite evidence"
    inventory = json.loads(args.preflight.read_text())
    assert sha(ROOT / "public/city/core.pack.wasm") == inventory["sourceCoreSHA256"]
    for pack, expected_hash in inventory["packSHA256"].items():
        assert sha(ROOT / "public/city" / pack) == expected_hash, (pack, "preflight source pack changed")
    assert not inventory["missingRepairSourcePrefixes"]
    source_path = EVIDENCE / "retained-source-2026-10-21.json"
    retained = json.loads(source_path.read_text())
    sources = {r["id"][:12]: SourceLine(r) for r in retained["rows"]}
    for evidence in inventory.get("additionalSourceEvidence", []):
        path = ROOT / evidence["file"]
        assert sha(path) == evidence["sha256"], "Additional source evidence changed"
        extra = json.loads(path.read_text())
        for row in extra.get("rows") or extra.get("retainedSource", {}).get("rows", []):
            previous = sources.get(row["id"][:12])
            if previous:
                assert previous.row["id"] == row["id"] and previous.row["geometryWKB"] == row["geometryWKB"]
                row = {**previous.row, **row}
            sources[row["id"][:12]] = SourceLine(row)
    selected = set(inventory["nodeIDs"])
    nodes, records, closures = {}, [], []

    for road in inventory["roads"]:
        line = sources[road["id"].split("_")[0]]
        for end in ["from", "to"]:
            node = road[end]
            if node not in selected:
                continue
            connector = line.connector(node)
            position = rounded(project(line.point(connector["at"])))
            record = nodes.setdefault(node, {"connectorID": connector["connector_id"], "after": position,
                                             "referenceSegmentID": line.row["id"], "referenceAt": connector["at"],
                                             "before": [], "incidentRoadIDs": []})
            assert record["connectorID"] == connector["connector_id"]
            assert math.dist(record["after"], position) < .00002, (node, "source connectors disagree")
            record["incidentRoadIDs"].append(road["id"])
            before = road["pts"][0 if end == "from" else -1]
            if before not in record["before"]:
                record["before"].append(before)
    for node, record in nodes.items():
        for copy in inventory["nodeCopies"].get(node, []):
            if copy["before"] not in record["before"]:
                record["before"].append(copy["before"])
        record["incidentRoadIDs"] = sorted(set(record["incidentRoadIDs"]))

    for road in inventory["roads"]:
        line = sources[road["id"].split("_")[0]]
        connectors = [line.connector(road[end]) for end in ["from", "to"]]
        declared = [c["at"] for c in connectors]
        assert declared[0] < declared[1]
        legacy_fractions = line.original_fractions(road, *declared)
        actual_before = [line.planar_to_geodetic(v) for v in declared]
        repaired = [road[end] in selected for end in ["from", "to"]]
        actual_after = [declared[i] if repaired[i] else actual_before[i] for i in range(2)]
        if actual_after[0] >= actual_after[1] - 1e-12:
            closures.extend(road[end] for i, end in enumerate(["from", "to"]) if not repaired[i])
            continue
        lo, hi = actual_after
        fractions = [lo, hi]
        fractions += [f for f in line.vertex_fractions if lo + 1e-12 < f < hi - 1e-12]
        fractions += [f for f in legacy_fractions if lo + 1e-12 < f < hi - 1e-12]
        for rule in (line.row.get("level_rules") or []) + (line.row.get("road_flags") or []):
            fractions += [f for f in rule.get("between") or [0, 1] if lo + 1e-12 < f < hi - 1e-12]
        fractions = sorted(set(fractions))
        # Near-equal official fractions and exact source vertices need one point,
        # otherwise a micrometre-long degenerate road strip would be introduced.
        deduped = []
        for fraction in fractions:
            if not deduped or (fraction - deduped[-1]) * line.geodetic[-1] > .00002:
                deduped.append(fraction)
        if (hi - deduped[-1]) * line.geodetic[-1] <= .00002:
            deduped[-1] = hi
        else:
            deduped.append(hi)
        fractions = deduped
        points = [rounded(project(line.point(f))) for f in fractions]
        heights = None if road.get("elev") is None else [lerp_function(f, legacy_fractions, road["elev"]) for f in fractions]
        for i, index in [(0, 0), (1, -1)]:
            if repaired[i]:
                points[index] = nodes[road[["from", "to"][i]]]["after"][:]
            else:
                # Bounded cut repair retains every unrelated geographic cut.
                points[index] = road["pts"][index][:]
                if heights is not None:
                    heights[index] = road["elev"][index]
        assert len(points) >= 2 and min(math.dist(a, b) for a, b in zip(points, points[1:])) > 1e-7, (road["id"], [(i, fractions[i:i + 2], points[i:i + 2]) for i in range(len(points) - 1) if math.dist(points[i], points[i + 1]) <= 1e-7])
        old_arc = cumulative(road["pts"])
        old_geodetic = [line.planar_to_geodetic(f) for f in legacy_fractions]
        source_arc = [lerp_function(f, old_geodetic, old_arc, extrapolate=True) for f in fractions]
        assert all(a < b for a, b in zip(source_arc, source_arc[1:]))
        expected = {key: road.get(key) for key in ["id", "cls", "w", "lanes", "oneway", "from", "to", "pts", "elev"]}
        records.append({"id": road["id"], "sourceSegmentID": line.row["id"], "expected": expected,
                        "pts": points, "elev": heights, "sourceFractions": fractions,
                        "sourceArc": source_arc, "correctedArc": cumulative(points),
                        "legacyPointFractions": legacy_fractions,
                        "cuts": {"declared": declared, "actualBefore": actual_before, "actualAfter": actual_after,
                                 "repaired": repaired, "unselectedCutsRetained": [road[end] for i, end in enumerate(["from", "to"]) if not repaired[i]]},
                        "copies": inventory["copies"][road["id"]]})
    assert not closures, "Minimum additional connector closure needed: " + ",".join(sorted(set(closures)))
    assert len(records) == len(inventory["roads"])
    used = sorted({r["sourceSegmentID"] for r in records})
    output = {"version": 1, "kind": "overture-wgs84-source-cut-repair", "release": retained["release"],
              "sourceCorePackSHA256": inventory["sourceCoreSHA256"], "sourceEvidenceSHA256": sha(source_path),
              "preflightSHA256": sha(args.preflight), "sourcePackSHA256": inventory["packSHA256"],
              "origin": {"lat": 17.4063, "lon": 78.4966, "NR": 6380050.094, "MR": 6341141.900},
              "heightPolicy": "Inherited game estimates interpolated by their original normalized source fractions; unrelated cut heights retained exactly. Relative source ranges remain distinct. No surveyed heights inferred.",
              "sources": [{"id": sources[s[:12]].row["id"], "geometryLonLat": sources[s[:12]].points,
                           "vertexFractions": sources[s[:12]].vertex_fractions, "geodeticLengthM": sources[s[:12]].geodetic[-1],
                           "connectors": sources[s[:12]].row["connectors"], "levelRules": sources[s[:12]].row.get("level_rules"),
                           "roadFlags": sources[s[:12]].row.get("road_flags"), "accessRestrictions": sources[s[:12]].row.get("access_restrictions"), "provenance": sources[s[:12]].row.get("sources")} for s in used],
              "nodes": nodes, "roads": records}
    if inventory.get("additionalSourceEvidence"):
        output["additionalSourceEvidence"] = inventory["additionalSourceEvidence"]
    output["generationID"] = hashlib.sha256(json.dumps(output, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    args.output.write_text(json.dumps(output, separators=(",", ":")) + "\n")
    audit = {"generationID": output["generationID"], "datasetSHA256": sha(args.output), "summary": {
        "witnesses": len(inventory["witnesses"]), "cuts": len(nodes), "minimumAdditionalClosure": sorted(set(closures)),
        "roads": len(records), "sourceSegments": len(used), "copies": sum(len(r["copies"]) for r in records),
        "coreRoads": sum(any(c["kind"] == "core" for c in r["copies"]) for r in records),
        "tileOnlyRoads": sum(not any(c["kind"] == "core" for c in r["copies"]) for r in records),
        "maximumSourceCutCorrection": max(math.dist(before, n["after"]) for n in nodes.values() for before in n["before"]),
        "explicitSourceFractionExtrapolationRecords": sum(r["sourceArc"][0] < 0 or r["sourceArc"][-1] > cumulative(r["expected"]["pts"])[-1] for r in records)},
        "scope": "Source-only bounded cut repair. No activation, LP rebase, surveyed height claim or physical driving acceptance."}
    args.audit.write_text(json.dumps(audit, indent=2) + "\n")
    print(json.dumps(audit, indent=2))


if __name__ == "__main__":
    main()
