import unittest
from shapely.geometry import Polygon, LineString
from geometry_reconcile import repair_polygon, geometry_reconciliations

class GeometryReconciliationTests(unittest.TestCase):
    def test_keeps_both_safe_components_and_source_courtyard(self):
        original=Polygon([(-15,-10),(15,-10),(15,10),(-15,10)], [[(-12,-3),(-12,3),(-9,3),(-9,-3)]])
        road=LineString([(0,-20),(0,20)]).buffer(6.45)
        parts=repair_polygon(original,road)
        self.assertEqual(len(parts),2)
        self.assertEqual(sum(len(p.interiors) for p in parts),1)
        for p in parts:
            self.assertAlmostEqual(p.intersection(road).area,0)
            self.assertAlmostEqual(p.difference(original).area,0)
        self.assertEqual(original.area,582)

    def test_does_not_restore_consumed_or_paper_sliver_outline(self):
        original=Polygon([(-1,-1),(1,-1),(1,1),(-1,1)])
        self.assertEqual(repair_polygon(original,original.buffer(1)),[])

    def test_high_overpass_does_not_cut_low_building_but_ground_road_does(self):
        building={'id':'b','osmId':'way/1','footprint':[[-5,-5],[5,-5],[5,5],[-5,5]],'heightM':4,'intrudesCarriageway':True}
        road={'id':'r','points':[[0,-20],[0,20]],'widthM':3,'pointElevM':[12,12]}
        untouched,_=geometry_reconciliations({'roads':[road]},[building],{'b':4})
        self.assertEqual(untouched['b']['status'],'clearance_checked')
        ground,_=geometry_reconciliations({'roads':[{**road,'pointElevM':[0,0]}]},[building],{'b':4})
        self.assertEqual(ground['b']['status'],'clipped')
        self.assertEqual(len(ground['b']['parts']),2)
        self.assertGreater(ground['b']['retainedFraction'],.5)

if __name__=='__main__':unittest.main()
