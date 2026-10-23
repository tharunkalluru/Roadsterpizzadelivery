"""Kitchen taxonomy regressions without requiring the original city parquet inputs."""
import ast
from pathlib import Path
import re
import sys
import unittest

PIPELINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PIPELINE))
from pickup_policy import POLICY, food_category, normalized, pickup_eligible


# Compile the actual classifier alone: importing conflate would run its ETL.
tree = ast.parse((PIPELINE / 'conflate.py').read_text())
function = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'group_of')
namespace = dict(re=re, food_category=food_category, normalized=normalized)
exec(compile(ast.Module(body=[function], type_ignores=[]), 'conflate.py', 'exec'), namespace)
group_of = namespace['group_of']


class CategoryTests(unittest.TestCase):
    def test_historical_police_taxonomy_is_not_a_pub(self):
        category = 'police_station community_and_government public_safety_service police_station'
        self.assertEqual(group_of(category, 'Bhagyanagar Institute of Police'), 'office')
        self.assertEqual(group_of(category, 'Community Food Service'), 'office')
        self.assertFalse(food_category(category))

    def test_food_matching_uses_words_not_substrings(self):
        for category in ['public_safety_service', 'republic', 'barber', 'teacher', 'food_bank', 'restaurant_supply', 'food_and_beverage_retail', 'pet_food_store', 'food_wholesaler']:
            with self.subTest(category=category):
                self.assertFalse(food_category(category))
                self.assertNotEqual(group_of(category, 'Source Place'), 'food')

    def test_real_pub_and_restaurant_categories_remain_food(self):
        for category in ['pub', 'bar', 'fast_food', 'food_court', 'food_stall', 'food_truck', 'restaurant', 'Food and Dining > Bakeries', 'café', 'ice_cream']:
            with self.subTest(category=category):
                self.assertTrue(food_category(category))
                self.assertEqual(group_of(category, 'Source Place'), 'food')
        self.assertEqual(group_of('restaurant', 'Police Canteen'), 'food')
        self.assertEqual(group_of('', 'Republic Pub'), 'food')


class ExportEligibilityTests(unittest.TestCase):
    def board(self, **extra):
        return dict(id='ordinary', full='Source business name', group='food', conf=.72, slot=dict(floor=0), **extra)

    def test_exact_legacy_ids_are_quarantined_without_name_matching(self):
        for identifier in POLICY['excludedPlaceIds']:
            b = self.board(); b['id'] = identifier
            original = dict(b)
            self.assertFalse(pickup_eligible(b))
            self.assertEqual(b, original)
        self.assertTrue(pickup_eligible(self.board(category='restaurant')))
        b = self.board(category='restaurant'); b['full'] = 'Police Canteen'
        self.assertTrue(pickup_eligible(b))

    def test_retained_categories_reject_bad_food_groups(self):
        for category in ['police_station', 'public_safety_service', 'school', 'hospital', 'barber', 'food_bank', 'pet_food_store', 'food_wholesaler']:
            with self.subTest(category=category):
                self.assertFalse(pickup_eligible(self.board(category=category)))
        self.assertTrue(pickup_eligible(self.board(category='restaurant')))
        self.assertTrue(pickup_eligible(self.board()), 'legacy exports without categories remain supported')

    def test_existing_confidence_floor_and_non_kitchen_rules_remain(self):
        for update in [dict(group='office'), dict(conf=.49), dict(slot=dict(floor=1)), dict(full='Central Bus Stop'), dict(pickupEligible=False)]:
            b = self.board(); b.update(update)
            with self.subTest(update=update): self.assertFalse(pickup_eligible(b))
        self.assertTrue(pickup_eligible(self.board(category='pub')))


if __name__ == '__main__':
    unittest.main()
