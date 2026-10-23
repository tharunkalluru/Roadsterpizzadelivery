"""Pure category and kitchen rules shared with the game's legacy-POI guard.

Categories are source evidence, not guesses from a business's display name.
The exact-ID exceptions quarantine documented bad legacy pickups without
deleting or renaming their storefronts.
"""
import json
import re
from pathlib import Path

POLICY = json.loads((Path(__file__).resolve().parents[1] / 'game/src/game/pickup-policy.json').read_text())


def normalized(value):
    return re.sub(r'[^a-z0-9é]+', ' ', (value or '').lower()).strip()


def contains_term(value, terms):
    text = ' ' + normalized(value) + ' '
    return any(' ' + term + ' ' in text for term in terms)


def non_kitchen_category(category):
    return contains_term(category, POLICY['nonKitchenCategories'])


def food_category(category):
    return not non_kitchen_category(category) and contains_term(category, POLICY['foodTerms'])


def pickup_eligible(record):
    """Guard exports, including placements created before category retention."""
    if (record.get('id') or record.get('uid')) in POLICY['excludedPlaceIds']:
        return False
    if record.get('pickupEligible') is False or record.get('group') != 'food':
        return False
    category = record.get('category')
    if category and not food_category(category):
        return False
    return (record.get('slot', {}).get('floor', 0) == 0 and record.get('conf', 0) >= .5
            and not re.search(r'\b(bus stop|bus station|pa+n shop|beeda|atm|parking)\b', record.get('full', ''), re.I))
