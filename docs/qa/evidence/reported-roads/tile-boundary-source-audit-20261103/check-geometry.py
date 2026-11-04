"""Verify source connector geometry using the retained exporter's 2D projection."""
import argparse
import hashlib
import json
import math
import struct
from pathlib import Path

HERE = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument("--output", type=Path, required=True)
parser.add_argument("--method", choices=["retained-planar", "wgs84-geodetic"], default="retained-planar")
args = parser.parse_args()
assert not args.output.exists(), "Refusing to overwrite evidence"
if args.method == "wgs84-geodetic":
    from geographiclib.geodesic import Geodesic
data = json.loads((HERE / "classification.json").read_text())
raw = json.loads((HERE / "retained-source-2026-10-21.json").read_text())
sources = {s["id"]: s for s in raw["rows"]}
kx = math.cos(math.radians(17.4063)) * 6380050.094 * math.pi / 180
kz = 6341141.900 * math.pi / 180


def point_at(hex_wkb, fraction):
    wkb = bytes.fromhex(hex_wkb)
    endian = "<" if wkb[0] == 1 else ">"
    geometry_type, count = struct.unpack_from(endian + "II", wkb, 1)
    assert geometry_type == 2 and len(wkb) == 9 + count * 16, "Expected a simple 2D LineString"
    points = [struct.unpack_from(endian + "dd", wkb, 9 + i * 16) for i in range(count)]
    lengths, bearings = [0.0], []
    for a, b in zip(points, points[1:]):
        if args.method == "wgs84-geodetic":
            geodesic = Geodesic.WGS84.Inverse(a[1], a[0], b[1], b[0])
            lengths.append(lengths[-1] + geodesic["s12"])
            bearings.append(geodesic["azi1"])
        else:
            lengths.append(lengths[-1] + math.dist(a, b))
    distance = max(0.0, min(1.0, fraction)) * lengths[-1]
    for i in range(1, count):
        if lengths[i] >= distance:
            if args.method == "wgs84-geodetic":
                location = Geodesic.WGS84.Direct(points[i - 1][1], points[i - 1][0], bearings[i - 1], distance - lengths[i - 1])
                return location["lon2"], location["lat2"]
            u = (distance - lengths[i - 1]) / max(lengths[i] - lengths[i - 1], 1e-20)
            return tuple(a + (b - a) * u for a, b in zip(points[i - 1], points[i]))
    return points[-1]


checks = []
for row in data["rows"]:
    endpoints = []
    for source in [row["tileSource"]] + row["coreSources"]:
        for connector in source["connectors"]:
            lon, lat = point_at(sources[source["segmentID"]]["geometryWKB"], connector["at"])
            x, z = (lon - 78.4966) * kx, -(lat - 17.4063) * kz
            endpoints.append({"segmentID": source["segmentID"], "connectorID": connector["connector_id"],
                              "at": connector["at"], "sourceLatLon": [lat, lon], "sourceXZ": [x, z],
                              "distanceToPackedEndpoint": math.dist([x, z], row["sourceEndpointXZ"])})
    checks.append({"road": row["id"], "node": row["node"], "end": row["end"],
                   "sourceEndpointXZ": row["sourceEndpointXZ"], "sources": endpoints})

exact = {way["id"]: way for response in json.loads((HERE / "worsened-exact-osm.json").read_text())["rows"]
         for way in response["response"]["elements"] if way["type"] == "way"}
way_shared = []
for tile, core in [(352232882, 28131038), (1557596671, 288592791), (1557596671, 28129873)]:
    way_shared.append({"tileWay": tile, "tileVersion": exact[tile]["version"], "coreWay": core,
                       "coreVersion": exact[core]["version"],
                       "sharedOSMNodes": sorted(set(exact[tile]["nodes"]) & set(exact[core]["nodes"]))})

output = {"scope": "Connector source-geometry proximity and exact historical OSM node-sharing. Not a survey or physical driving test.",
          "method": args.method,
          "sourceSHA256": hashlib.sha256((HERE / "retained-source-2026-10-21.json").read_bytes()).hexdigest(),
          "origin": {"lat": 17.4063, "lon": 78.4966, "NR": 6380050.094, "MR": 6341141.900},
          "summary": {"endpoints": len(checks), "maxSourceToPackedEndpointDistance": max(e["distanceToPackedEndpoint"] for c in checks for e in c["sources"]),
                      "abovePoint1m": sum(any(e["distanceToPackedEndpoint"] > .1 for e in c["sources"]) for c in checks)},
          "worsenedHistoricalWayNodeSharing": way_shared, "rows": checks}
args.output.write_text(json.dumps(output, indent=2) + "\n")
print(json.dumps({k: v for k, v in output.items() if k != "rows"}, indent=2))
