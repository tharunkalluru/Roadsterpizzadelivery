// Shared, lightweight place catalogue. The map and model placement use the same identities and anchors.
// Existing coordinates and unmeasured model dimensions are retained as provisional; see docs/landmark-audit.json.
import { LM_DATA } from './landmarks_data';
export type LmKind = 'charminar' | 'charkaman' | 'mecca' | 'chowmahalla' | 'falaknuma' | 'golconda' | 'balahisar' | 'fateh' | 'qstomb' | 'qsmosque' | 'taramati'
  | 'buddha' | 'secretariat' | 'ambedkar' | 'martyrs' | 'birla' | 'assembly' | 'highcourt' | 'osmania'
  | 'cybertowers' | 'cablebridge' | 'thub' | 'stadium' | 'clocktower' | 'salarjung' | 'ouarts' | 'paigah' | `x_${string}`;
export interface LandmarkDefinition { kind: LmKind; name: string; lat: number; lon: number; rot: number; clear: number | [number, number] | [number, number, number, number]; p?: Record<string, number> }

const QT = (name: string, lat: number, lon: number, terrace: number, cube: number, dome: number, h: number, arches: number): LandmarkDefinition =>
  ({ kind: 'qstomb', name, lat, lon, rot: 0, clear: [terrace + 6, terrace + 6], p: { terrace, cube, dome, h, arches } });

export const BASE_LANDMARKS: LandmarkDefinition[] = [
  // ---- Old City ----
  { kind: 'charminar', name: 'Charminar', lat: 17.36160, lon: 78.47463, rot: 11.5, clear: 27 },
  { kind: 'charkaman', name: 'Char Kaman', lat: 17.363451, lon: 78.474999, rot: 11.5, clear: 0 },   // centred on the Gulzar Houz fountain (OSM); arches ~105 m out (Char Kaman south, Machli Kaman north)
  { kind: 'mecca', name: 'Mecca Masjid', lat: 17.36038, lon: 78.47313, rot: 95, clear: [120, 172, -5, 55] },
  { kind: 'chowmahalla', name: 'Chowmahalla Palace', lat: 17.35739, lon: 78.47161, rot: 6, clear: [116, 418] },
  { kind: 'falaknuma', name: 'Falaknuma Palace', lat: 17.33070, lon: 78.46700, rot: 0, clear: [190, 230] },
  { kind: 'golconda', name: 'Golconda Fort', lat: 17.38298, lon: 78.39906, rot: 75, clear: 215 },
  { kind: 'balahisar', name: 'Bala Hisar Darwaza', lat: 17.38429, lon: 78.40262, rot: 90, clear: 14 },
  { kind: 'fateh', name: 'Fateh Darwaza', lat: 17.37930, lon: 78.41280, rot: 110, clear: 10 },
  QT('Tomb of Muhammad Quli Qutb Shah', 17.39423, 78.39493, 60, 22, 17, 45, 5),
  QT('Tomb of Sultan Muhammad Qutb Shah', 17.39590, 78.39611, 44, 30, 18, 40, 5),
  QT('Tomb of Hayat Bakshi Begum', 17.39668, 78.39699, 42, 30, 17, 38, 5),
  QT('Tomb of Abdullah Qutb Shah', 17.39709, 78.39880, 74, 32, 18, 40, 5),
  QT('Tomb of Ibrahim Quli Qutb Shah', 17.39353, 78.39441, 26, 16, 11, 26, 3),
  QT('Tomb of Sultan Quli Qutb Shah', 17.39458, 78.39396, 30, 12, 9, 22, 3),
  { kind: 'qsmosque', name: 'Great Mosque, Qutb Shahi Tombs', lat: 17.39690, lon: 78.39660, rot: 90, clear: [40, 30] },
  { kind: 'taramati', name: 'Taramati Baradari', lat: 17.37610, lon: 78.37811, rot: 183, clear: 30 },
  { kind: 'paigah', name: 'Paigah Tombs', lat: 17.34415, lon: 78.50415, rot: 90, clear: [24, 90] },
  // ---- Hussain Sagar & centre ----
  { kind: 'buddha', name: 'Buddha Statue', lat: 17.41557, lon: 78.47500, rot: 90, clear: [40, 80, 0, 12] },
  { kind: 'secretariat', name: 'Telangana Secretariat', lat: 17.40978, lon: 78.46922, rot: 90, clear: [196, 112] },
  { kind: 'ambedkar', name: 'Dr B.R. Ambedkar Statue', lat: 17.41326, lon: 78.46741, rot: 72, clear: 46 },
  { kind: 'martyrs', name: "Telangana Martyrs' Memorial", lat: 17.40866, lon: 78.47298, rot: 15, clear: [42, 58] },
  { kind: 'birla', name: 'Birla Mandir', lat: 17.40607, lon: 78.46914, rot: 90, clear: [118, 200] },
  { kind: 'assembly', name: 'Telangana Assembly', lat: 17.40135, lon: 78.46774, rot: 45, clear: [70, 132] },
  { kind: 'highcourt', name: 'Telangana High Court', lat: 17.36909, lon: 78.47199, rot: 347, clear: [120, 54] },
  { kind: 'osmania', name: 'Osmania General Hospital', lat: 17.37256, lon: 78.47353, rot: 163, clear: [186, 64] },
  { kind: 'salarjung', name: 'Salar Jung Museum', lat: 17.37136, lon: 78.48043, rot: 340, clear: [126, 82] },
  { kind: 'ouarts', name: 'Osmania University Arts College', lat: 17.41921, lon: 78.52625, rot: 155, clear: [114, 120] },
  // ---- Modern Hyderabad ----
  { kind: 'cybertowers', name: 'Cyber Towers', lat: 17.45048, lon: 78.38112, rot: 56, clear: 49 },
  { kind: 'cablebridge', name: 'Durgam Cheruvu Cable Bridge', lat: 17.43177, lon: 78.38994, rot: 76, clear: 0 },
  { kind: 'thub', name: 'T-Hub', lat: 17.43400, lon: 78.37918, rot: 40, clear: [50, 100] },
  { kind: 'stadium', name: 'G.M.C. Balayogi Stadium', lat: 17.44618, lon: 78.34416, rot: 0, clear: [196, 275] },
  { kind: 'clocktower', name: 'Secunderabad Clock Tower', lat: 17.44090, lon: 78.49855, rot: 0, clear: 9 },
];


export type PlaceCategory = 'Heritage' | 'Worship' | 'Parks & lakes' | 'Culture' | 'Transport' | 'Sport' | 'City life';
export type PlaceIcon = 'charminar' | 'fort' | 'palace' | 'dome' | 'temple' | 'church' | 'statue' | 'bridge' | 'tower' | 'tree' | 'water' | 'museum' | 'train' | 'plane' | 'stadium' | 'building';
export interface LandmarkPlace {
  id: string; name: string; lat: number; lon: number; x: number; z: number;
  category: PlaceCategory; icon: PlaceIcon; priority: number;
}
export const PLACE_CATEGORIES: PlaceCategory[] = ['Heritage', 'Worship', 'Parks & lakes', 'Culture', 'Transport', 'Sport', 'City life'];
// Identity never depends on array position, translated labels, or a shared model recipe (e.g. the six tombs).
export function landmarkId(l: { kind: string; name: string; d?: { key: string } }) {
  if (l.d?.key) return l.d.key;
  if (l.kind.startsWith('x_')) return l.kind.slice(2);
  return l.kind === 'qstomb' ? l.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') : l.kind;
}
const BASE_STYLE: Record<string, [PlaceCategory, PlaceIcon]> = {
  charminar: ['Heritage', 'charminar'], charkaman: ['Heritage', 'palace'], mecca: ['Worship', 'dome'],
  chowmahalla: ['Heritage', 'palace'], falaknuma: ['Heritage', 'palace'], golconda: ['Heritage', 'fort'],
  balahisar: ['Heritage', 'fort'], fateh: ['Heritage', 'fort'], qstomb: ['Heritage', 'dome'],
  qsmosque: ['Worship', 'dome'], taramati: ['Heritage', 'palace'], paigah: ['Heritage', 'dome'],
  buddha: ['Culture', 'statue'], secretariat: ['City life', 'palace'], ambedkar: ['Culture', 'statue'], martyrs: ['Culture', 'statue'],
  birla: ['Worship', 'temple'], assembly: ['City life', 'palace'], highcourt: ['Heritage', 'palace'],
  osmania: ['Heritage', 'dome'], salarjung: ['Culture', 'museum'], ouarts: ['Heritage', 'palace'],
  cybertowers: ['City life', 'tower'], cablebridge: ['City life', 'bridge'], thub: ['City life', 'building'],
  stadium: ['Sport', 'stadium'], clocktower: ['Heritage', 'tower'],
};
function extraStyle(type: string): [PlaceCategory, PlaceIcon] {
  if (/^temple|gurudwara/.test(type)) return ['Worship', 'temple'];
  if (/^mosque|dargah|ashurkhana/.test(type)) return ['Worship', 'dome'];
  if (/^church/.test(type)) return ['Worship', 'church'];
  if (/statue|memorial/.test(type)) return ['Culture', 'statue'];
  if (/dam|lake|promenade/.test(type)) return ['Parks & lakes', 'water'];
  if (/park|zoo/.test(type)) return ['Parks & lakes', 'tree'];
  if (/airport/.test(type)) return ['Transport', 'plane'];
  if (/station|bus_|metro/.test(type)) return ['Transport', 'train'];
  if (/stadium|ground_|racecourse/.test(type)) return ['Sport', 'stadium'];
  if (/bridge/.test(type)) return ['Heritage', 'bridge'];
  if (/clocktower/.test(type)) return ['Heritage', 'tower'];
  if (/palace|colonial|indosaracenic|library_afzalgunj|market_mozamjahi/.test(type)) return ['Heritage', 'palace'];
  if (/museum|auditorium|amphitheatre|cinema|imax|crafts|ramoji/.test(type)) return ['Culture', 'museum'];
  return ['City life', 'building'];
}
const PROMINENT = new Set(['charminar', 'golconda', 'buddha', 'birla', 'cybertowers', 'cablebridge', 'rgia', 'uppal_stadium', 'ramoji', 'chinna_jeeyar']);
export function placeCatalogue(origin: { lat: number; lon: number }): LandmarkPlace[] {
  const kx = Math.cos(origin.lat * Math.PI / 180) * 6380050.094 * Math.PI / 180, kz = 6341141.9 * Math.PI / 180;
  const entries = [
    ...BASE_LANDMARKS.map((l) => ({ id: landmarkId(l), name: l.name, lat: l.lat, lon: l.lon, style: BASE_STYLE[l.kind] })),
    ...LM_DATA.map((l) => ({ id: l.key, name: l.name, lat: l.lat, lon: l.lon, style: extraStyle(l.type) })),
  ];
  return entries.map((p) => ({ id: p.id, name: p.name, lat: p.lat, lon: p.lon,
    x: (p.lon - origin.lon) * kx, z: -(p.lat - origin.lat) * kz,
    category: p.style[0], icon: p.style[1], priority: PROMINENT.has(p.id) ? 2 : 1 }));
}

// A source tile may be absent under a large lake. Keep the recorded world anchor; only the owning streamed
// tile changes. This does not fabricate roads/terrain or turn a provisional anchor into a verified location.
export function assignRenderTiles<T extends { x: number; z: number }>(landmarks: T[], tiles: readonly (readonly number[])[]): (T & { renderTile: [number, number] })[] {
  const indexed = new Set(tiles.map(([i, j]) => `${i}_${j}`));
  return landmarks.map((l) => {
    let tile: [number, number] = [Math.floor(l.x / 1000), Math.floor(l.z / 1000)];
    if (!indexed.has(`${tile[0]}_${tile[1]}`) && tiles.length) {
      let distance = Infinity;
      // Stable tie-break keeps worker restarts and pack order from duplicating a landmark.
      for (const [i, j] of [...tiles].sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
        const d = Math.hypot(Math.max(i * 1000 - l.x, 0, l.x - (i + 1) * 1000), Math.max(j * 1000 - l.z, 0, l.z - (j + 1) * 1000));
        if (d < distance) { distance = d; tile = [i, j]; }
      }
    }
    return { ...l, renderTile: tile };
  });
}
