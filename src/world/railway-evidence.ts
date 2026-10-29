export interface RailwayUnderpassEvidence { name: string; roads: readonly string[]; rails: readonly string[]; anchor: readonly [number, number]; radius: number; source: string }
// Official project status is distinct from the retained map coordinates.
// Depths are modeled for vehicle clearance; these are not surveyed elevations.
export const RAILWAY_UNDERPASS_EVIDENCE: readonly RailwayUnderpassEvidence[] = [
  { name: 'Uppuguda', roads: ['48792b56-85e_0'], rails: ['w27951892', 'w817380189'], anchor: [-1399, 7080], radius: 65, source: 'ghmc-2022' },
  { name: 'Uthamnagar', roads: ['1f2aa4ac-981_0', 'c8bde66e-7da_0'], rails: ['w211237562', 'w374872475'], anchor: [3811, -5843], radius: 65, source: 'ghmc-2022' },
  { name: 'Anand Bagh', roads: ['01ceee91-29b_0', '28b00d08-4ff_1'], rails: ['w1308294359', 'w923054875'], anchor: [4642, -5812], radius: 65, source: 'ghmc-2022' },
  { name: 'HITEC City bridge 215', roads: ['38d866dd-418_0', 'cabc645e-6e3_0'], rails: ['w1422240945', 'w1422240947'], anchor: [-11931, -7236], radius: 65, source: 'ghmc-2022' },
  { name: 'Thukaram Gate', roads: ['6b53a1bb-44d_0'], rails: ['w211237562', 'w374872475'], anchor: [2944, -3789], radius: 65, source: 'ghmc-2022' },
  { name: 'Oliphant / St Johns Road', roads: ['57f51bdc-476_1', '840f1b5c-8a1_0'], rails: ['w1187064678', 'w28094793', 'w32066979', 'w374856311', 'w374856315', 'w374872479', 'w817269920', 'w817269928', 'w817723526', 'w826105544', 'w1305179138', 'w32066370'], anchor: [985, -3082], radius: 60, source: 'ghmc-oliphant-hmda' },
  { name: 'Rail Nilayam', roads: ['53217cc3-27e_0', 'e8d215e1-31c_0', 'cec9d400-cb3_0'], rails: ['w245316327', 'w28094799', 'w374872468', 'w817269911', 'w817269912', 'w817269913', 'w817269914', 'w817269915', 'w28094796', 'w817269930', 'w28094797', 'w817269933'], anchor: [1640, -3275], radius: 70, source: 'ghmc-2012-parliament-2017' },
  // OSM way 1188612305 is explicitly tunnel=yes, layer=-1. Both endpoints
  // match this retained carriageway segment within 0.1m. The railway source
  // way ends before the separate bridge 28094784; that other crossing has no
  // permission here, even though it belongs to the same nearby rail corridor.
  { name: 'Rail Nilayam approach mapped road tunnel', roads: ['16e6f5fa-4ea_0'], rails: ['w818582231'], anchor: [1722, -3180], radius: 25, source: 'osm-tunnel-1188612305' },
];
export const VERIFIED_RAIL_UNDERPASS_ROAD_IDS = RAILWAY_UNDERPASS_EVIDENCE.flatMap(p => [...p.roads]);
export const RAILWAY_RESEARCH_SOURCES = {
  'ghmc-2022': 'https://www.ghmc.gov.in/Budget/GHMC%20BUDGET%202022-23.pdf',
  'ghmc-2012-parliament-2017': 'https://eparlib.sansad.in/bitstream/123456789/459185/1/71645.pdf',
  'ghmc-oliphant-hmda': 'https://directorateofevdm.ghmc.telangana.gov.in/cec-api/uploads/downloads/65c7407db97d1_1707556989000.pdf',
  'osm-tunnel-1188612305': 'https://api.openstreetmap.org/api/0.6/way/1188612305/full',
  mmtsChord2024: 'https://www.pib.gov.in/PressReleasePage.aspx?PRID=2011518&lang=2&reg=48',
};

// All three identities and the local location must agree. A bridge tag, street
// name, or a distant crossing on the same source way cannot authorize a cut.
export function railwayUnderpassAt(sites: readonly RailwayUnderpassEvidence[], road: string, rail: string, x: number, z: number) {
  return sites.find(s => s.roads.includes(road) && s.rails.includes(rail) && Math.hypot(x - s.anchor[0], z - s.anchor[1]) <= s.radius);
}
