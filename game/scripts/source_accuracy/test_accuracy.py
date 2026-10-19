"""Source-independent regressions for the rules used in the full-map overlay."""
import math, unittest
import numpy as np
from build import classify, ndjson_rows
from heights import summarize_pixels

class FrontageAssociationTest(unittest.TestCase):
    def setUp(self):
        self.building={'id':'building','footprint':[[0,2],[0,8],[10,8],[10,2]]}
        self.road={'points':[[-10,0],[30,0]]}
        self.front={'x':5,'z':4,'facade':[[2,2],[8,2]],'side':'right','facingHeading':0,'floor':1}
    def classify(self,**changes):
        return classify({**self.front,**changes},self.building,['building'],self.road)
    def test_containment_supports_a_neutral_listing_but_never_invents_floor(self):
        result=self.classify()
        self.assertEqual(result['association'],'source_contained')
        self.assertEqual(result['display'],'facade')
        self.assertEqual(result['floorBasis'],'unknown')
        self.assertEqual(result['reasons'],['legacy_inferred_floor'])
    def test_same_road_opposite_side_is_not_a_facade(self):
        result=self.classify(side='left')
        self.assertEqual(result['display'],'listing_only')
        self.assertIn('road_side_conflict',result['reasons'])
    def test_nearest_wrong_building_does_not_claim_tenancy(self):
        result=classify(self.front,self.building,['different-building'],self.road)
        self.assertEqual(result['association'],'nearby_ambiguous')
        self.assertEqual(result['display'],'listing_only')
        self.assertIn('source_point_in_different_footprint',result['reasons'])
    def test_unmatched_points_do_not_become_named_kiosks(self):
        result=classify(self.front,None,[],self.road)
        self.assertEqual(result['association'],'unmatched')
        self.assertEqual(result['display'],'listing_only')
    def test_large_building_does_not_relocate_a_point_to_a_distant_edge(self):
        building={'id':'building','footprint':[[0,2],[0,8],[100,8],[100,2]]}
        result=classify({**self.front,'facade':[[80,2],[88,2]]},building,['building'],self.road)
        self.assertEqual(result['display'],'listing_only')
        self.assertIn('facade_far_from_source_point',result['reasons'])
    def test_overlapping_footprints_are_ambiguous_even_when_point_is_contained(self):
        result=classify(self.front,self.building,['building','overlap'],self.road)
        self.assertEqual(result['display'],'listing_only')
        self.assertIn('multiple_containing_footprints',result['reasons'])
    def test_unicode_line_separator_inside_listing_name_is_not_an_ndjson_record_boundary(self):
        self.assertEqual(ndjson_rows('{"name":"Shop\u2028Line"}\n{"name":"Other"}\n'),[{'name':'Shop\u2028Line'},{'name':'Other'}])

class SatelliteScreeningTest(unittest.TestCase):
    def sample(self,heights,presence=None,inside=None):
        h=np.asarray(heights,dtype=float)
        return summarize_pixels(h,np.ones_like(h)*.8 if presence is None else np.asarray(presence),np.ones_like(h,dtype=bool) if inside is None else np.asarray(inside,dtype=bool))
    def test_median_uses_masked_footprint_only(self):
        estimate,status=self.sample([7,8,9,80,90],[.8,.8,.8,.1,.8],[1,1,1,1,0])
        self.assertEqual(status,'accepted');self.assertEqual(estimate['heightM'],8)
        self.assertEqual(estimate['samplePixels'],3);self.assertEqual(estimate['footprintPixels'],4)
    def test_one_pixel_is_insufficient(self):
        self.assertEqual(self.sample([20])[1],'insufficient_pixels')
    def test_sparse_presence_does_not_assign_an_adjacent_roof(self):
        self.assertEqual(self.sample([8]*6,[.8,.8,.2,.2,.2,.2])[1],'weak_presence_mask')
    def test_mixed_roofs_are_rejected_and_nonfinite_or_overcap_values_are_excluded(self):
        self.assertEqual(self.sample([3,4,30,40])[1],'mixed_or_unstable_roofs')
        estimate,status=self.sample([10,12,float('nan'),101])
        self.assertEqual(status,'accepted');self.assertEqual(estimate['heightM'],11);self.assertEqual(estimate['samplePixels'],2)

if __name__=='__main__':unittest.main()
