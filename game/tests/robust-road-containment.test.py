import importlib.util
import math
from pathlib import Path
import random
import unittest
from fractions import Fraction

spec = importlib.util.spec_from_file_location('strict_road_face', Path(__file__).resolve().parents[1] / 'scripts/qa/robust-road-containment.py')
M = importlib.util.module_from_spec(spec)
spec.loader.exec_module(M)


def exact_sign(a, b, c):
    # Deliberately use the expanded shoelace expression, independent of the
    # translated determinant used by the production helper.
    ax, ay = map(Fraction, a); bx, by = map(Fraction, b); cx, cy = map(Fraction, c)
    area = ax*by + bx*cy + cx*ay - ay*bx - by*cx - cy*ax
    return (area > 0) - (area < 0)


class StrictHistoricalRoadFaceTests(unittest.TestCase):
    def test_actual_edges_vertices_winding_and_degenerate(self):
        triangle = [(30000., -20000.), (30010., -20000.), (30000., -19990.)]
        for point in [triangle[0], triangle[1], triangle[2], (30005., -19995.), (30001., -19999.)]:
            self.assertTrue(M.triangle_contains_point(triangle, point))
            self.assertTrue(M.triangle_contains_point(triangle[::-1], point))
        self.assertFalse(M.triangle_contains_point([(0., 0.), (1., 1.), (2., 2.)], (1., 1.)))
        self.assertFalse(M.triangle_contains_point([(0., 0.)]*3, (0., 0.)))

    def test_no_barycentric_tolerance_expands_face(self):
        triangle = [(0., 0.), (10., 0.), (0., 10.)]
        for point in [(5., -1e-8), (-1e-8, 5.), (5., 5.+1e-8)]:
            # The previous -1e-5 barycentric inclusion would admit all three.
            u, v = point[0]/10., point[1]/10.
            self.assertGreaterEqual(min(1.-u-v, u, v), -1e-5)
            self.assertFalse(M.triangle_contains_point(triangle, point))

    def test_next_representable_value_outside_is_rejected(self):
        a = 30000.
        triangle = [(a, a), (a+10., a), (a, a+10.)]
        self.assertFalse(M.triangle_contains_point(triangle, (a+5., math.nextafter(a, -math.inf))))
        self.assertTrue(M.triangle_contains_point(triangle, (a+5., a)))

    def test_overflow_underflow_and_cancellation(self):
        for a, b, c in [((0.,0.),(1e-200,0.),(0.,1e-200)),
                         ((1e308,1e308),(-1e308,1e308),(0.,-1e308)),
                         ((0.,0.),(1.,1.),(2.,math.nextafter(2.,math.inf))),
                         ((30000.,30000.),(30001.,30001.),(30002.,math.nextafter(30002.,-math.inf)))]:
            self.assertEqual(M.orientation_sign(a,b,c), exact_sign(a,b,c))

    def test_deterministic_city_and_near_collinear_reference(self):
        randomizer = random.Random(9413)
        for _ in range(3000):
            a = (randomizer.uniform(-35000,35000), randomizer.uniform(-35000,35000))
            b = (a[0]+randomizer.uniform(-200,200), a[1]+randomizer.uniform(-200,200))
            t = randomizer.random()
            c = (a[0]+t*(b[0]-a[0]), a[1]+t*(b[1]-a[1]))
            c = (c[0], math.nextafter(c[1], randomizer.choice([-math.inf, math.inf])))
            self.assertEqual(M.orientation_sign(a,b,c), exact_sign(a,b,c))
            p = (a[0]+randomizer.uniform(-100,100), a[1]+randomizer.uniform(-100,100))
            winding = exact_sign(a,b,c)
            expected = winding != 0 and all(s == 0 or s == winding for s in [exact_sign(a,b,p),exact_sign(b,c,p),exact_sign(c,a,p)])
            self.assertEqual(M.triangle_contains_point([a,b,c],p), expected)

    def test_invalid_geometry_is_not_silently_coerced(self):
        for invalid in [(math.nan, 0.), (math.inf, 0.), ('1', 0.), (True, 0.), (2**60+1, 0.)]:
            with self.assertRaises(ValueError): M.orientation_sign(invalid, (1., 0.), (0., 1.))
        with self.assertRaises(ValueError): M.triangle_contains_point([(0.,0.)]*2, (0.,0.))


if __name__ == '__main__':
    unittest.main()
