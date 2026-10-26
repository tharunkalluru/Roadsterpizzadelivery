import type { LandmarkPlace, PlaceIcon } from '../world/landmark_catalog';

export interface PlaceMarker { x: number; y: number; place: LandmarkPlace; members: LandmarkPlace[] }
export function layoutPlaceMarkers(places: LandmarkPlace[], view: { cx: number; cz: number; scale: number; width: number; height: number }, selected?: string): PlaceMarker[] {
  const { cx, cz, scale, width, height } = view, markers: PlaceMarker[] = [], occupied = new Map<string, PlaceMarker>();
  const cell = scale < 0.07 ? 52 : scale < 0.2 ? 36 : 26;
  const sorted = [...places].sort((a, b) => Number(b.id === selected) - Number(a.id === selected) || b.priority - a.priority || a.id.localeCompare(b.id));
  for (const place of sorted) {
    const x = width / 2 + (place.x - cx) * scale, y = height / 2 + (place.z - cz) * scale;
    if (x < -24 || y < -24 || x > width + 24 || y > height + 24) continue;
    const key = `${Math.floor(x / cell)}_${Math.floor(y / cell)}`, prior = occupied.get(key);
    if (prior) prior.members.push(place);
    else { const marker = { x, y, place, members: [place] }; markers.push(marker); occupied.set(key, marker); }
  }
  return markers;
}
export function hitPlaceMarker(markers: PlaceMarker[], x: number, y: number): PlaceMarker | undefined {
  // A 44 px minimum target supports touch without requiring oversized artwork.
  return [...markers].reverse().filter((p) => Math.abs(x - p.x) <= 22 && Math.abs(y - p.y) <= 22)
    .sort((a, b) => Math.hypot(x - a.x, y - a.y) - Math.hypot(x - b.x, y - b.y))[0];
}

// Compact silhouette atlas: distinctive Charminar, fort, bridge, tower and statue marks, plus consistent
// architectural/category marks. Icons are navigation symbols, not claims of photogrammetric model accuracy.
const ICONS: Record<PlaceIcon, string> = {
  charminar: 'M3 21V6H2V4H3V1H5V4H6V6H5V21M19 21V6H18V4H19V1H21V4H22V6H21V21M5 20V12Q12 2 19 12V20M9 21V16Q12 11 15 16V21M5 9H19M5 12H19',
  fort: 'M2 21V8H5V4H8V8H11V4H14V8H17V4H20V8H22V21ZM9 21V16Q12 11 15 16V21',
  palace: 'M2 21H22M4 21V11H20V21M2 11L12 3L22 11M7 14V19M12 14V19M17 14V19',
  dome: 'M3 21V13H21V21M5 13C5 5 19 5 19 13M12 6V2M10 21V17Q12 14 14 17V21',
  temple: 'M3 21H21M6 21V14H18V21M5 14H19M7 11H17M9 8H15M12 2L18 14M12 2L6 14M10 21V17H14V21',
  church: 'M4 21V12L12 5L20 12V21ZM12 1V7M9 3H15M10 21V16Q12 13 14 16V21',
  statue: 'M5 21H19M7 18H17V21M12 5A2 2 0 1 0 12 1A2 2 0 1 0 12 5M12 6V15M12 8L7 12M12 8L16 5M12 15L9 18M12 15L15 18',
  bridge: 'M1 19H23M5 21V3M19 21V3M5 5L1 17M5 5L12 17M19 5L12 17M19 5L23 17M1 16H23',
  tower: 'M7 21V3H17V21ZM5 21H19M12 1V3M9 7H15M9 10H15M9 13H15M9 16H15',
  tree: 'M12 21V13M6 17H18M12 2L4 12H8L2 17H22L16 12H20Z',
  water: 'M1 10Q4 6 7 10T13 10T19 10T25 10M1 16Q4 12 7 16T13 16T19 16T25 16M5 4H19',
  museum: 'M2 21H22M4 18H20M5 18V10M10 18V10M15 18V10M20 18V10M2 9L12 2L22 9Z',
  train: 'M6 18V4Q6 2 12 2T18 4V18ZM7 10H17M12 4V10M8 15H9M15 15H16M8 18L5 22M16 18L19 22',
  plane: 'M12 1L14 10L22 15V17L14 14V20L17 22H7L10 20V14L2 17V15L10 10Z',
  stadium: 'M2 8C2 2 22 2 22 8V17C22 23 2 23 2 17ZM2 8C2 14 22 14 22 8M7 12V20M17 12V20',
  building: 'M4 21V6H11V2H20V21ZM8 10H9M8 14H9M8 18H9M14 6H16M14 10H16M14 14H16M14 18H16',
};
const atlas = new Map<PlaceIcon, HTMLCanvasElement>();
export function placeIcon(icon: PlaceIcon) {
  let canvas = atlas.get(icon); if (canvas) return canvas;
  canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d')!; g.scale(2, 2);
  g.fillStyle = '#25213d'; g.strokeStyle = '#cfbb8b'; g.lineWidth = 1.2;
  g.beginPath(); g.roundRect(1, 1, 30, 30, 9); g.fill(); g.stroke();
  g.translate(4, 4); g.strokeStyle = '#f6eedc'; g.lineWidth = 1.5; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(new Path2D(ICONS[icon]));
  atlas.set(icon, canvas); return canvas;
}
