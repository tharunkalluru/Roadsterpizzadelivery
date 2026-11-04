"""Read-only inventory of every actual copy incident to witnessed source cuts."""
import argparse
import gzip
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument("--model", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
parser.add_argument("--additional-node", action="append", default=[])
parser.add_argument("--extra-source", type=Path, action="append", default=[])
args = parser.parse_args()
assert not args.output.exists(), "Refusing to overwrite evidence"
evidence = ROOT / "docs/qa/evidence/reported-roads/tile-boundary-source-audit-20261103"
classification = json.loads((evidence / "classification.json").read_text())
witnesses = [r for r in classification["rows"] if max(math.dist(e["xz"], r["sourceEndpointXZ"]) for e in r["currentCoreLevels"]) > .1]
nodes = {r["node"] for r in witnesses} | set(args.additional_node)
core_bytes = (ROOT / "public/city/core.pack.wasm").read_bytes()
core = json.loads(gzip.decompress(core_bytes))
model = json.loads(args.model.read_text())
known_nodes = set(model["endpointDisplacements"])
roads, copies, node_copies, packs = {}, {}, {}, {}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def add(road, place):
    if road["from"] not in nodes and road["to"] not in nodes:
        return False
    if road["id"] in roads:
        for key in ["cls", "w", "oneway", "from", "to", "pts", "elev"]:
            assert roads[road["id"]][key] == road[key], (road["id"], key, place)
    if road["id"] not in roads or not road.get("ctx"):
        roads[road["id"]] = road
    copies.setdefault(road["id"], []).append(place)
    return True


for road in core["roads"]:
    add(road, {"kind": "core"})
for node in nodes:
    if node in core["nodes"]:
        node_copies.setdefault(node, []).append({"kind": "core", "before": core["nodes"][node]})
for index, pack in enumerate(core["packs"]):
    path = ROOT / "public/city" / pack["file"]
    data = path.read_bytes()
    touched = False
    for key, zone in json.loads(gzip.decompress(data))["tiles"].items():
        for road in zone["roads"]:
            touched = add(road, {"kind": "tile", "pack": pack["file"], "tile": key, "context": bool(road.get("ctx"))}) or touched
        for node in nodes:
            if node in zone["nodes"]:
                node_copies.setdefault(node, []).append({"kind": "tile", "pack": pack["file"], "tile": key, "before": zone["nodes"][node]})
                touched = True
    if touched:
        packs[pack["file"]] = digest(data)
    if index % 75 == 0:
        print("scanned", index + 1, "packs", flush=True)
known = [e for e in core["roads"] if e["from"] in known_nodes or e["to"] in known_nodes]
available = {s["id"][:12] for s in json.loads((evidence / "retained-source-2026-10-21.json").read_text())["rows"]}
for source in args.extra_source:
    extra = json.loads(source.read_text())
    available.update(s["id"][:12] for s in extra.get("rows") or extra.get("retainedSource", {}).get("rows", []))
needed = {e["id"].split("_")[0] for e in roads.values()}
known_prefixes = {e["id"].split("_")[0] for e in known}
output = {"version": 1, "scope": "Source cut witnesses and all packed incident copies. No repair or activation.",
          "sourceCoreSHA256": digest(core_bytes), "classificationSHA256": digest((evidence / "classification.json").read_bytes()),
          "modelSHA256": digest(args.model.read_bytes()), "modelPath": str(args.model),
          "witnesses": witnesses, "nodeIDs": sorted(nodes), "roads": list(roads.values()), "copies": copies,
          "nodeCopies": node_copies, "packSHA256": packs, "knownModelNodes": model["endpointDisplacements"], "knownModelIncidentRoads": known,
          "missingRepairSourcePrefixes": sorted(needed - available), "missingKnownModelSourcePrefixes": sorted(known_prefixes - available),
          "summary": {"witnesses": len(witnesses), "nodes": len(nodes), "incidentRoads": len(roads),
                      "copies": sum(map(len, copies.values())), "affectedPacks": len(packs), "knownModelNodes": len(known_nodes),
                      "knownModelIncidentRoads": len(known), "missingRepairSourcePrefixes": len(needed - available),
                      "missingKnownModelSourcePrefixes": len(known_prefixes - available)}}
if args.additional_node:
    output["additionalNodeIDs"] = sorted(set(args.additional_node))
if args.extra_source:
    output["additionalSourceEvidence"] = [{"file": str(path.resolve().relative_to(ROOT)), "sha256": digest(path.read_bytes())} for path in args.extra_source]
args.output.write_text(json.dumps(output, indent=2) + "\n")
print(json.dumps(output["summary"], indent=2))
