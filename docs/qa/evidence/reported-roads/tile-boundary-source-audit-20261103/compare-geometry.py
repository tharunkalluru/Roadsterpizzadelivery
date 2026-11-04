"""Compare the retained planar split, WGS84 reference and held packed endpoints."""
import argparse
import collections
import hashlib
import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
assert not args.output.exists(), "Refusing to overwrite evidence"
classification = json.loads((HERE / "classification.json").read_text())
geodetic = json.loads((HERE / "connector-geometry-wgs84.json").read_text())
planar = json.loads((HERE / "connector-geometry.json").read_text())
assert len(classification["rows"]) == len(geodetic["rows"]) == len(planar["rows"])
rows = []
for row, geo, plan in zip(classification["rows"], geodetic["rows"], planar["rows"]):
    assert row["id"] == geo["road"] == plan["road"] and row["node"] == geo["node"] == plan["node"]
    rows.append({"road": row["id"], "node": row["node"],
                 "maxPackedEndpointSeparation": max(math.dist(e["xz"], row["sourceEndpointXZ"]) for e in row["currentCoreLevels"]),
                 "maxWGS84SourceConnectorPairSeparation": max(math.dist(a["sourceXZ"], b["sourceXZ"]) for a in geo["sources"] for b in geo["sources"]),
                 "maxRetainedPlanarSourceToOwnPackedCoreEndpoint": max(math.dist(e["xz"], next(q["sourceXZ"] for q in plan["sources"] if q["segmentID"].startswith(e["id"].split("_")[0]))) for e in row["currentCoreLevels"])})
summary = {"maxPackedEndpointSeparation": max(r["maxPackedEndpointSeparation"] for r in rows),
           "packedEndpointSeparationAbovePoint1m": sum(r["maxPackedEndpointSeparation"] > .1 for r in rows),
           "maxWGS84SourceConnectorPairSeparation": max(r["maxWGS84SourceConnectorPairSeparation"] for r in rows),
           "maxRetainedPlanarSourceToOwnPackedCoreEndpoint": max(r["maxRetainedPlanarSourceToOwnPackedCoreEndpoint"] for r in rows),
           "tileSourceDatasets": dict(collections.Counter("+".join(sorted({s["dataset"] for s in r["tileSource"]["allSegmentSources"] or [] if not s["property"]})) for r in classification["rows"])),
           "positiveGroupClasses": dict(collections.Counter(r["cls"] for r in classification["rows"] if r["sourceCategory"].startswith("declared_positive")))}
output = {"scope": "Source-coordinate diagnosis on held inventory, not a corrected model or physical acceptance.",
          "inputs": {name: hashlib.sha256((HERE / name).read_bytes()).hexdigest() for name in ["classification.json", "connector-geometry.json", "connector-geometry-wgs84.json"]},
          "summary": summary, "rows": rows}
args.output.write_text(json.dumps(output, indent=2) + "\n")
print(json.dumps(summary, indent=2))
