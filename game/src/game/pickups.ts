import policy from './pickup-policy.json';

export interface PickupIdentity {
  id: string; name: string; board: string; category?: string | null; pickupEligible?: boolean;
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9é]+/g, ' ').trim();
const containsTerm = (s: string, terms: string[]) => {
  const text = ` ${normalize(s)} `;
  return terms.some((term) => text.includes(` ${term} `));
};

export function eligiblePickup(poi: PickupIdentity, placeNames: Set<string>): boolean {
  if (Object.hasOwn(policy.excludedPlaceIds, poi.id) || poi.pickupEligible === false) return false;
  if (poi.board.trim().length < 3 || placeNames.has(poi.board.toLowerCase().trim())) return false;
  // New exports retain the source category. Old packs without it remain usable,
  // except for the documented exact-ID quarantine; do not guess from names.
  if (poi.category && (containsTerm(poi.category, policy.nonKitchenCategories) || !containsTerm(poi.category, policy.foodTerms))) return false;
  return true;
}
