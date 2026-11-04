"""Reproduce source-only classifications; does not change game data or source packs."""
import argparse
import collections
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
INVENTORY_SHA = "74f326ae165946b826b6456b39fdc696b940958f901fb2facde2f8250f7c4af4"
SOURCE_SHA = "5ff00c285ca24fd6553754be7ab4beee74a6011cb4ef2d37714ab6838c975f63"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def applies(rule, at):
    lo, hi = rule.get("between") or [0, 1]
    return lo - 1e-9 <= at <= hi + 1e-9


def source_at(source, node, exact_ways):
    connectors = [c for c in source.get("connectors") or [] if c["connector_id"].startswith(node)]
    levels, flags, ways = set(), set(), {}
    for connector in connectors:
        at = connector["at"]
        levels.update(r["value"] for r in source.get("level_rules") or [] if applies(r, at))
        flags.update(v for r in source.get("road_flags") or [] if applies(r, at) for v in r["values"])
        for row in source.get("sources") or []:
            if row.get("dataset") == "OpenStreetMap" and (row.get("record_id") or "").startswith("w") and applies(row, at):
                ways[row["record_id"]] = {**row, "exactHistoricalOSM": exact_ways.get(row["record_id"])}
    return {
        "segmentID": source["id"], "class": source["class"], "name": source["name"],
        "connectors": connectors, "levelValuesAtConnector": sorted(levels), "flagsAtConnector": sorted(flags),
        "levelRules": source.get("level_rules"), "roadFlags": source.get("road_flags"),
        "sourceWaysAtConnector": list(ways.values()), "allSegmentSources": source.get("sources"),
        "accessRestrictions": source.get("access_restrictions"),
    }


def vertical(source):
    return bool(source["levelValuesAtConnector"] or {"is_bridge", "is_tunnel"}.intersection(source["flagsAtConnector"]))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--inventory", type=Path, default=HERE.parent / "all-tile-only-node-height-boundaries.json")
    parser.add_argument("--source", type=Path, default=HERE / "retained-source-2026-10-21.json")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    assert not args.output.exists(), "Refusing to overwrite evidence"
    assert digest(args.inventory) == INVENTORY_SHA
    assert digest(args.source) == SOURCE_SHA
    inventory, raw = json.loads(args.inventory.read_text()), json.loads(args.source.read_text())
    grouped = collections.defaultdict(list)
    for row in raw["rows"]:
        grouped[row["id"][:12]].append(row)
    assert all(len(v) == 1 for v in grouped.values()), "Ambiguous 12-character source ID"
    sources = {k: v[0] for k, v in grouped.items()}
    assert set(raw["requestedPrefixes"]) == set(sources), "Retained query missed a requested source"

    exact_ways, caches = {}, []
    for name in ["all114-exact-osm-lanes.json", "failing21-exact-osm-lanes.json"]:
        path = HERE.parent / name
        data = json.loads(path.read_text())
        for way in data["ways"]:
            key = f'w{way["id"]}@{way["version"]}'
            if key in exact_ways:
                assert exact_ways[key]["tags"] == way["tags"]
            exact_ways[key] = way
        caches.append({"file": name, "sha256": digest(path)})
    for name in ["worsened-exact-osm.json", "representative-exact-osm.json"]:
        path = HERE / name
        for response in json.loads(path.read_text())["rows"]:
            for way in response.get("response", {}).get("elements", []):
                if way["type"] != "way":
                    continue
                key = f'w{way["id"]}@{way["version"]}'
                exact_ways[key] = {"sourceURL": response["url"], "id": way["id"], "version": way["version"],
                                   "timestamp": way["timestamp"], "tags": way.get("tags", {})}
        caches.append({"file": name, "sha256": digest(path)})

    rows = []
    for row in inventory["rows"]:
        tile = source_at(sources[row["id"].split("_")[0]], row["node"], exact_ways)
        core = [source_at(sources[e["id"].split("_")[0]], row["node"], exact_ways) for e in row["currentCoreLevels"]]
        tile_ids = {c["connector_id"] for c in tile["connectors"]}
        shared = [sorted(tile_ids & {c["connector_id"] for c in s["connectors"]}) for s in core]
        levels = [v for s in [tile] + core for v in s["levelValuesAtConnector"]]
        flags = [v for s in [tile] + core for v in s["flagsAtConnector"]]
        if any(v < 0 for v in levels) or "is_tunnel" in flags:
            category = "declared_below_or_tunnel_annotation_at_physical_connector"
        elif any(v > 0 for v in levels) or "is_bridge" in flags:
            category = "declared_positive_or_bridge_annotation_at_physical_connector"
        elif levels:
            category = "explicit_visual_level_zero_at_physical_connector"
        else:
            category = "no_vertical_annotation_at_physical_connector"
        rows.append({**row, "sourceCategory": category, "sourceConnectionVerified": bool(tile_ids) and all(shared),
                     "sharedFullConnectorIDs": shared, "tileSource": tile, "coreSources": core})

    relevant_ways = {w["record_id"] for r in rows for s in [r["tileSource"]] + r["coreSources"] for w in s["sourceWaysAtConnector"]}
    summary = {
        "endpoints": len(rows), "roads": len({r["id"] for r in rows}),
        "allFullSourceConnectionsVerified": all(r["sourceConnectionVerified"] for r in rows),
        "sourceCategories": dict(collections.Counter(r["sourceCategory"] for r in rows)),
        "classes": dict(collections.Counter(r["cls"] for r in rows)),
        "tileVerticalAnnotationAtConnector": sum(vertical(r["tileSource"]) for r in rows),
        "tilePositiveSomewhere": sum(any(q["value"] > 0 for q in r["tileSource"]["levelRules"] or []) for r in rows),
        "currentNegativeCoreEndpoints": sum(any(e["y"] < 0 for e in r["currentCoreLevels"]) for r in rows),
        "allCoreAtConnectorUnannotated": sum(all(not vertical(s) for s in r["coreSources"]) for r in rows),
        "worsened": sum(r["currentMinimumHeightDisagreement"] > r["historicalMinimumHeightDisagreement"] + 1e-6 for r in rows),
        "relevantExactHistoricalWays": len(relevant_ways),
        "relevantExactHistoricalWaysChecked": len(relevant_ways & exact_ways.keys()),
        "allRelevantExactHistoricalWaysCheckedAtEndpoint": sum(all(w["exactHistoricalOSM"] is not None for s in [r["tileSource"]] + r["coreSources"] for w in s["sourceWaysAtConnector"]) for r in rows),
    }
    output = {"scope": "Source authority and exact connector audit of the held 67ea candidate and strict a679 baseline. Not an elevation survey, driving test, or final candidate acceptance.",
              "inputs": {"inventorySHA256": INVENTORY_SHA, "retainedSourceSHA256": SOURCE_SHA,
                         "release": raw["release"], "exactOSMCaches": caches},
              "summary": summary, "rows": rows}
    args.output.write_text(json.dumps(output, indent=2) + "\n")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
