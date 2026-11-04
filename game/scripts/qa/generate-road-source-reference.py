"""Reviewer-only geographic correspondence for changed Overture source cuts.

Requires the retained geographiclib==2.1 installation. Does not change runtime
data or infer heights. Ambiguous/missing geographic bindings stay unresolved.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import geographiclib
from geographiclib.geodesic import Geodesic


def cumulative(points):
    out = [0.0]
    for a, b in zip(points, points[1:]):
        out.append(out[-1] + math.dist(a, b))
    return out


def source_projector(data, source):
    origin = data["origin"]
    kx = math.cos(math.radians(origin["lat"])) * origin["NR"] * math.pi / 180
    kz = origin["MR"] * math.pi / 180
    geo = source["geometryLonLat"]
    xy = [[(p[0] - origin["lon"]) * kx, -(p[1] - origin["lat"]) * kz] for p in geo]
    fractions, length = source["vertexFractions"], source["geodeticLengthM"]

    def project(point, interval):
        choices = []
        for i, (a, b) in enumerate(zip(xy, xy[1:])):
            dx, dz = b[0] - a[0], b[1] - a[1]
            if dx * dx + dz * dz < 1e-16:
                continue
            u = max(0.0, min(1.0, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / (dx * dx + dz * dz)))
            error = math.dist(point, [a[0] + dx * u, a[1] + dz * u])
            lon = geo[i][0] + (geo[i + 1][0] - geo[i][0]) * u
            lat = geo[i][1] + (geo[i + 1][1] - geo[i][1]) * u
            distance = fractions[i] * length + Geodesic.WGS84.Inverse(geo[i][1], geo[i][0], lat, lon)["s12"]
            if interval[0] * length - .1 <= distance <= interval[1] * length + .1 and error <= .075:
                choices.append((error, distance, i))
        if not choices:
            raise ValueError("No actual geographic source branch within75mm")
        choices.sort()
        best = choices[0]
        if any(abs(other[1] - best[1]) > .15 for other in choices[1:]):
            raise ValueError("Ambiguous distinct source branches within75mm")
        return best

    return project


def generate(data):
    sources = {s["id"]: s for s in data["sources"]}
    roads, unresolved = [], []
    for patch in data["roads"]:
        try:
            source = sources[patch["sourceSegmentID"]]
            project = source_projector(data, source)
            old_arc = cumulative(patch["expected"]["pts"])
            actual = patch["cuts"]["actualBefore"]
            official, errors = [], []
            for i, point in enumerate(patch["expected"]["pts"]):
                error, at, _ = project(point, actual)
                # The retained old split fractions predate coordinate rounding.
                # Check their geography, then retain that exact official cut.
                if i == 0 or i == len(old_arc) - 1:
                    exact = actual[0 if i == 0 else 1] * source["geodeticLengthM"]
                    if abs(at - exact) > .1:
                        raise ValueError("actualBefore does not bind the historical geographic endpoint")
                    at = exact
                official.append(at)
                errors.append(error)
            if any(b <= a for a, b in zip(official, official[1:])):
                raise ValueError("Historical geographic source reference is not strictly monotonic")
            roads.append({"id": patch["id"], "sourceSegmentID": source["id"], "legacyArc": old_arc,
                          "legacyOfficialMetres": official, "projectionErrors": errors,
                          "correctedArc": patch["correctedArc"],
                          "correctedOfficialMetres": [f * source["geodeticLengthM"] for f in patch["sourceFractions"]]})
        except (KeyError, ValueError) as error:
            unresolved.append({"id": patch["id"], "reason": str(error)})
    return roads, unresolved


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-data", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if geographiclib.__version__ != "2.1":
        raise RuntimeError("Use the retained isolated geographiclib==2.1 installation")
    if args.output.exists():
        raise RuntimeError("Preserve prior reference evidence; choose a new output")
    raw = args.source_data.read_bytes()
    data = json.loads(raw)
    roads, unresolved = generate(data)
    report = {"version": 1, "kind": "verified-overture-geographic-source-reference", "generationID": data["generationID"],
              "sourceDataSHA256": hashlib.sha256(raw).hexdigest(), "sourceCorePackSHA256": data["sourceCorePackSHA256"],
              "geographiclib": geographiclib.__version__,
              "policy": {"maximumProjectionErrorM": .075, "distinctBranchAmbiguityM": .15,
                         "endpointOfficialReference": "actualBefore verified against actual historical geographic source projection",
                         "legacyPointFractionsUsed": False, "legacyHeightsUsed": False},
              "roads": roads, "unresolved": unresolved,
              "summary": {"boundRoads": len(roads), "unresolvedRoads": len(unresolved),
                          "maximumProjectionErrorM": max((max(r["projectionErrors"]) for r in roads), default=0)}}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("x") as out:
        json.dump(report, out, separators=(",", ":"))
    print(json.dumps({**report["summary"], "output": str(args.output), "sha256": hashlib.sha256(args.output.read_bytes()).hexdigest()}))


if __name__ == "__main__":
    main()
