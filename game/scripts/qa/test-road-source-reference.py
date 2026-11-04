"""Focused observer controls; run with the isolated geographiclib2.1 path."""
import importlib.util
import json
import math
from pathlib import Path
import unittest
from geographiclib.geodesic import Geodesic

spec = importlib.util.spec_from_file_location("source_reference", Path(__file__).with_name("generate-road-source-reference.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
origin = {"lat": 17.4063, "lon": 78.4966, "NR": 6380050.094, "MR": 6341141.9}
kx = math.cos(math.radians(origin["lat"])) * origin["NR"] * math.pi / 180
kz = origin["MR"] * math.pi / 180


def source(points):
    geo = [[origin["lon"] + x / kx, origin["lat"] - z / kz] for x, z in points]
    lengths = [0.0]
    for a, b in zip(geo, geo[1:]):
        lengths.append(lengths[-1] + Geodesic.WGS84.Inverse(a[1], a[0], b[1], b[0])["s12"])
    return {"geometryLonLat": geo, "vertexFractions": [s / lengths[-1] for s in lengths], "geodeticLengthM": lengths[-1]}


class ProjectionControls(unittest.TestCase):
    def test_realistic_adjacent_vertex_is_one_branch(self):
        line = source([[0, 0], [100, 0], [100, 100]])
        project = module.source_projector({"origin": origin}, line)
        error, at, _ = project([100, 0], [0, 1])
        self.assertLess(error, .000001)
        self.assertAlmostEqual(at, line["vertexFractions"][1] * line["geodeticLengthM"], places=6)

    def test_remote_loop_branch_is_rejected_without_guessing(self):
        line = source([[0, 0], [100, 0], [0, 0], [0, 100]])
        project = module.source_projector({"origin": origin}, line)
        with self.assertRaisesRegex(ValueError, "Ambiguous distinct source branches"):
            project([0, 0], [0, 1])
        error, at, _ = project([0, 0], [0, line["vertexFractions"][1]])
        self.assertLess(error, .000001)
        self.assertAlmostEqual(at, 0, places=6)

    def test_actual_geographic_gap_is_not_an_endpoint_extension(self):
        line = source([[0, 0], [100, 0]])
        project = module.source_projector({"origin": origin}, line)
        for point in [[-.2, 0], [100.2, 0], [50, .2]]:
            with self.assertRaisesRegex(ValueError, "No actual geographic source branch"):
                project(point, [0, 1])


if __name__ == "__main__":
    unittest.main()
