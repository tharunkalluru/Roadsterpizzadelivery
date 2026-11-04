"""Audit held model nodes against available retained source geometry only."""
import argparse
import importlib.util
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("source_geodesic_generator", ROOT / "scripts/generate-road-source-geodesic.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
parser = argparse.ArgumentParser()
parser.add_argument("--preflight", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
parser.add_argument("--extra-source", type=Path, action="append", default=[])
args = parser.parse_args()
assert not args.output.exists(), "Refusing to overwrite evidence"
preflight = json.loads(args.preflight.read_text())
directory = ROOT / "docs/qa/evidence/reported-roads"
sources, files = {}, []
paths = [path for path in sorted(directory.rglob("*.json")) if path.name in {"retained-source-2026-10-21.json", "all114-overture-geometry.json", "extra14-overture-geometry.json", "masab-golkonda-retained-source.json", "langar-de9-retained-geometry.json", "langar-de9-source-bridge-binding.json", "east-93f-source-bridge-binding.json"}]
paths += [path.resolve() for path in args.extra_source]
for path in paths:
    data = json.loads(path.read_text())
    rows = data.get("rows") or data.get("retainedSource", {}).get("rows", [])
    usable = [r for r in rows if r.get("geometryWKB") and r.get("connectors")]
    if not usable:
        continue
    files.append({"file": str(path.relative_to(ROOT)), "sha256": module.sha(path)})
    for source in usable:
        old = sources.get(source["id"][:12])
        if old:
            assert old["id"] == source["id"] and old["geometryWKB"] == source["geometryWKB"] and old["connectors"] == source["connectors"]
        sources[source["id"][:12]] = source

rows, missing = [], set()
for road in preflight["knownModelIncidentRoads"]:
    prefix = road["id"].split("_")[0]
    source = sources.get(prefix)
    if not source:
        missing.add(prefix)
        continue
    line = module.SourceLine(source)
    for end, index in [("from", 0), ("to", -1)]:
        node = preflight["knownModelNodes"].get(road[end])
        if not node:
            continue
        connector = line.connector(road[end])
        after = module.project(line.point(connector["at"]))
        rows.append({"road": road["id"], "node": road[end], "sourceSegmentID": source["id"], "connectorID": connector["connector_id"],
                     "fraction": connector["at"], "packedEndpoint": road["pts"][index], "geodeticSourceEndpoint": after,
                     "inheritedSourceCutDisplacement": math.dist(road["pts"][index], after),
                     "heldInferredBefore": node["before"], "heldInferredAfter": node["after"], "heldInferredDelta": node["delta"],
                     "distanceFromCorrectSourceToHeldInferredAfter": math.dist(after, node["after"])})
nodes_seen = {row["node"] for row in rows}
repair_ids = {r["id"] for r in json.loads((ROOT / "src/world/road-source-geodesic-data.json").read_text())["roads"]}
output = {"scope": "Retained source audit of the held23-node inferred model. Missing source geometry is explicit; this analyzer performs no network query, model mutation, source activation or LP rebase.",
          "preflightSHA256": module.sha(args.preflight), "heldModelSHA256": preflight["modelSHA256"], "sourceFiles": files,
          "summary": {"heldModelNodes": len(preflight["knownModelNodes"]), "incidentRoads": len(preflight["knownModelIncidentRoads"]),
                      "availableIncidentRoads": len({r["road"] for r in rows}), "availableKnownNodes": len(nodes_seen),
                      "missingSourcePrefixes": len(missing), "unavailableKnownNodes": len(set(preflight["knownModelNodes"]) - nodes_seen),
                      "inheritedCutDisplacementsAbovePoint1m": sum(r["inheritedSourceCutDisplacement"] > .1 for r in rows),
                      "maximumInheritedCutDisplacement": max([r["inheritedSourceCutDisplacement"] for r in rows] or [0]),
                      "heldAfterBeyond5mFromCorrectSource": sum(r["distanceFromCorrectSourceToHeldInferredAfter"] > 5 for r in rows),
                      "knownIncidentRoadIDsIn52CutRepair": sorted(repair_ids & {r["id"] for r in preflight["knownModelIncidentRoads"]})},
          "missingSourcePrefixes": sorted(missing), "unavailableKnownNodes": sorted(set(preflight["knownModelNodes"]) - nodes_seen), "rows": rows}
args.output.write_text(json.dumps(output, indent=2) + "\n")
print(json.dumps(output["summary"], indent=2))
