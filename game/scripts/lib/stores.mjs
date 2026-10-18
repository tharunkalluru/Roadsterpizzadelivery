// Overture Places category -> StoreGroup mapping (documented in DATA_SOURCES.md "Category mapping").
// Tokens = basic_category + every level of taxonomy.hierarchy. The FIRST matching rule wins.

export const STORE_GROUPS = ['grocery', 'restaurant', 'cafe_bakery', 'pharmacy', 'hospital_clinic', 'bank_atm', 'apparel', 'electronics_mobile', 'jewellery', 'hotel_lodging', 'auto_service', 'hardware', 'education', 'worship', 'office_service', 'other'];

const set = (...a) => new Set(a);
const RULES = [
  ['pharmacy', { tokens: set('pharmacy', 'pharmacy_and_drug_store', 'drugstore', 'medical_supply_store') }],
  ['bank_atm', { tokens: set('bank_or_credit_union', 'bank', 'credit_union', 'atm') }],
  ['hotel_lodging', { tokens: set('lodging', 'hotel', 'resort', 'hostel', 'lodge', 'inn', 'service_apartment', 'bed_and_breakfast', 'private_lodging', 'cabin', 'campground') }],
  ['cafe_bakery', { tokens: set('cafe', 'coffee_shop', 'tea_room', 'bakery', 'dessert_shop', 'ice_cream_shop', 'smoothie_juice_bar', 'non_alcoholic_beverage_venue', 'juice_bar', 'donut_shop', 'bubble_tea_shop', 'sweet_shop') }],
  ['restaurant', { tokens: set('restaurant', 'casual_eatery', 'fast_food_restaurant', 'bar', 'pub', 'lounge', 'brewery', 'alcoholic_beverage_venue', 'food_truck_stand', 'caterer', 'food_service', 'food_delivery_service', 'food_and_drink', 'dance_club', 'nightlife_venue'), re: /restaurant$|eatery$/ }],
  ['grocery', { tokens: set('grocery_store', 'organic_grocery_store', 'supermarket', 'convenience_store', 'food_and_beverage_store', 'produce_store', 'butcher_shop', 'specialty_foods_store', 'health_food_store', 'candy_store', 'farmers_market', 'market', 'warehouse_club_store', 'superstore', 'discount_store', 'liquor_store', 'wine_shop') }],
  ['hospital_clinic', { tokens: set('health_care', 'hospital', 'specialty_hospital', 'outpatient_care_facility', 'doctors_office', 'dental_clinic', 'diagnostics_imaging_or_lab_service', 'medical_service', 'specialized_health_care', 'specialized_medical_facility', 'emergency_or_urgent_care_facility', 'primary_care_or_general_clinic', 'complementary_and_alternative_medicine', 'vision_or_eye_care_clinic', 'pediatric_clinic', 'behavioral_or_mental_health_clinic', 'medical_service_organization', 'home_health_care', 'senior_living_facility') }],
  ['jewellery', { tokens: set('jewelry_store', 'jewelry_and_watches_manufacturer', 'watch_store', 'jewelry_and_watches_store') }],
  ['electronics_mobile', { tokens: set('electronics_store', 'mobile_phone_store', 'computer_store', 'appliance_store', 'audio_visual_equipment_store', 'camera_and_photography_store', 'electronic_equipment_supplier', 'it_service_and_computer_repair', 'telecommunications_service', 'appliance_repair_service') }],
  ['apparel', { tokens: set('fashion_and_apparel_store', 'clothing_store', 'shoe_store', 'womens_clothing_store', 'mens_clothing_store', 'childrens_clothing_store', 'fashion_boutique', 'fashion_accessories_store', 'fabric_store', 'textile_manufacturer', 'luggage_store') }],
  ['auto_service', { tokens: set('automotive_service', 'auto_dealer', 'vehicle_dealer', 'vehicle_parts_store', 'auto_parts_store', 'automotive_repair', 'gas_station', 'fueling_station', 'vehicle_service', 'motorcycle_dealer', 'motorcycle_service', 'motorcycle_repair', 'car_rental_service', 'vehicle_rental_service', 'auto_detailing', 'car_wash', 'bike_store', 'taxi_or_ride_share_service') }],
  ['hardware', { tokens: set('hardware_home_and_garden_store', 'hardware_store', 'building_supply_store', 'home_improvement_store', 'tile_store', 'kitchen_and_bath_store', 'lighting_store', 'furniture_store', 'mattress_store', 'home_goods_store') }],
  ['education', { tokens: set('education', 'place_of_learning', 'educational_service', 'specialty_school', 'school', 'college_university', 'preschool', 'high_school', 'elementary_school', 'middle_school', 'tutoring_service', 'computer_coaching', 'vocational_and_technical_school', 'language_school', 'driving_school', 'library', 'educational_facility', 'research_institute', 'art_school', 'test_preparation', 'child_care_and_day_care') }],
  ['worship', { tokens: set('place_of_worship', 'religious_organization', 'hindu_place_of_worship', 'christian_place_of_worship', 'muslim_place_of_worship'), re: /place_of_worship$/ }],
  ['office_service', { tokens: set('services_and_business', 'community_and_government', 'government_office', 'professional_service', 'real_estate_service', 'corporate_or_business_office', 'financial_service', 'event_or_party_service', 'travel_service', 'home_service', 'technical_service', 'media_service', 'printing_service', 'design_service', 'legal_service', 'b2b_service', 'manufacturer'), re: /^b2b_/ }],
];

/** @returns {{group: string, rule: string}} */
export function groupOf(cat, tax) {
  const toks = [];
  if (cat) toks.push(cat);
  for (const t of tax || []) toks.push(t);
  if (!toks.length) return 'other';
  for (const [group, m] of RULES) {
    for (const t of toks) if (m.tokens.has(t) || (m.re && m.re.test(t))) return group;
  }
  return 'other';
}

/** groups that sit above ground-floor shops when the frontage already holds two or more ground-floor shops */
export const UPPER_FLOOR_GROUPS = new Set(['office_service', 'hospital_clinic', 'education']);

/** how attractive a group is as a delivery destination (0 = never) */
export const DELIVERY_WEIGHT = { restaurant: 3, cafe_bakery: 3, grocery: 3, pharmacy: 3, hospital_clinic: 2.5, hotel_lodging: 2.5, bank_atm: 2, electronics_mobile: 2, apparel: 2, jewellery: 2, hardware: 1.5, auto_service: 1, education: 1, other: 1, office_service: 0, worship: 0 };
