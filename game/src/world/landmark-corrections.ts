import type { LmData } from './landmarks_data';

// Explicit reviewed changes, shared by map and model placement. OSM is evidence
// of identity/plan location; it does not establish facade appearance or height.
// Exact source versions, rejected alternatives and previous values are retained
// in pipeline/evidence/landmark-source-decisions-2026-10-26.json.
export const LANDMARK_CORRECTIONS: Record<string, Partial<LmData>> = {
  nalsar: { lat: 17.6026889, lon: 78.54669785, rot: 203 }, // midpoint of the two mapped vehicle gates
  osman_sagar: { lat: 17.3759728, lon: 78.3169135, rot: 0, sw: null, sd: null, srot: null },
  purana_pul: { name: 'Purana Pul Darwaza', type: 'city_gate' },
  // The inherited footprint is Deccan Park, a different TCS branch from Synergy Park.
  tcs_synergy: { name: 'TCS Deccan Park', lat: 17.444314547874065, lon: 78.37795746345546, rot: 0 },
  dlf: { lat: 17.447567430923282, lon: 78.35542177112688, rot: 0 },
  gandhi_bhavan: { lat: 17.388124274965815, lon: 78.47076234234507, w: null, d: null, rot: 238.2, h: null },
  // A park anchor replaces the railway station match. The flagmast's exact
  // location inside the park is still illustrative, not a mapped mast survey.
  sanjeevaiah: { lat: 17.432024257971182, lon: 78.47526248542427, w: null, d: null, rot: 0, h: null, sw: 792.31, sd: 658.67, srot: 97.28 },
};

export function correctedLandmarkData(data: LmData): LmData {
  const patch = LANDMARK_CORRECTIONS[data.key];
  return patch ? { ...data, ...patch } : data;
}
