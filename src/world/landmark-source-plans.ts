import * as THREE from 'three';
import type { Kit } from './landmarks';

// Named source building outlines, OSM contributors / ODbL 1.0, retrieved
// 2026-10-26. Local metres preserve each source vertex, including concavities.
// Facade materials and vertical dimensions are explicitly illustrative.
export const MAPPED_LANDMARK_PLANS = {"tcs_synergy":{"source":"https://www.openstreetmap.org/way/68883415","version":7,"timestamp":"2023-03-07T03:42:36Z","anchor":{"lat":17.444314547874065,"lon":78.37795746345546},"height":29.4,"heightBasis":"inherited illustrative height; OSM does not supply metres","ring":[[-6.5081,46.1452],[6.091,46.8978],[21.2077,44.8171],[32.1283,38.1324],[40.5312,30.1971],[47.2557,20.1811],[51.8768,10.5746],[54.8194,-0.2825],[54.3945,-12.7997],[51.0376,-23.6568],[-1.4727,9.324],[-9.0364,2.6393],[22.8968,-52.8857],[8.6086,-56.2281],[-4.8297,-55.3869],[-17.0144,-50.794],[-25.8316,-45.371],[-33.8203,-36.185],[-39.2806,-28.2497],[-43.0624,-19.9049],[-45.1552,-11.549],[-46.005,2.6393],[-42.6375,15.5882],[-38.0164,24.3535],[-29.8047,33.4731],[-20.3713,40.6337]]},"dlf":{"source":"https://www.openstreetmap.org/way/413274269","version":5,"timestamp":"2025-08-22T02:52:30Z","anchor":{"lat":17.447567430923282,"lon":78.35542177112688},"height":50,"heightBasis":"inherited illustrative height; OSM does not supply metres","ring":[[-108.3937,-63.8111],[-105.3131,-65.4601],[-101.7544,-66.4783],[-98.44,-66.7329],[-95.9861,-66.5226],[-93.4897,-65.8143],[-91.0358,-65.0285],[-89.198,-63.8111],[-91.1952,-71.6689],[-86.5635,-73.3733],[-81.4326,-74.148],[-71.532,-75.133],[-52.9206,-74.7457],[-52.9206,-65.2388],[-54.9708,-65.2388],[-54.9708,-62.1621],[-46.1006,-62.1621],[-46.1006,-80.4896],[-20.9879,-80.4896],[-20.9879,-38.6881],[-12.1284,-38.5775],[-11.884,-59.5169],[-7.5286,-59.4727],[-7.4118,-69.1234],[58.7587,-68.3377],[58.7587,-70.3298],[66.8747,-70.3408],[66.8747,-71.4919],[72.9616,-71.5029],[72.9723,-72.4215],[75.543,-72.4326],[75.4899,-47.8187],[77.0302,-47.8187],[77.1365,-48.5602],[78.3262,-48.4385],[79.8028,-42.4621],[79.6966,-29.4247],[88.5987,-29.3473],[88.6093,-30.3655],[87.2389,-30.3876],[87.2708,-32.8556],[86.1235,-32.8667],[86.1554,-35.2019],[98.3187,-35.0912],[98.2549,-29.2477],[98.2125,-24.4002],[108.1556,-24.3005],[108.0812,-17.0957],[118.651,-16.9961],[118.6298,4.8509],[121.976,5.7695],[124.6849,7.3964],[127.0326,9.953],[128.4561,12.9191],[129.0934,16.6709],[127.67,21.5627],[124.2494,25.3809],[118.6935,27.5833],[118.6086,39.4476],[118.5661,44.8152],[118.5236,50.8138],[120.0108,52.9276],[120.9031,54.8202],[121.7211,58.7159],[121.3705,64.3713],[119.6602,69.407],[116.3671,73.9335],[115.3367,73.8007],[115.1667,95.028],[96.2153,94.8841],[62.8804,94.2754],[42.5906,94.4635],[42.8243,64.8472],[38.4582,64.3049],[38.4582,63.829],[-12.8401,50.1829],[-14.253,54.5545],[-45.9838,45.424],[-46.6212,45.3686],[-45.357,32.0767],[-54.7052,31.9771],[-54.9177,33.3826],[-62.5025,33.1613],[-72.0526,32.8846],[-79.8923,32.3202],[-88.0083,31.6119],[-96.1242,29.7636],[-102.4024,28.2142],[-109.0949,26.9304],[-117.2108,23.9643],[-123.7652,21.6955],[-131.3181,17.8772],[-137.4476,15.3207],[-145.9884,10.6502],[-150.4076,6.832],[-153.2546,2.3718],[-156.2502,-4.2907],[-156.1015,-11.5067],[-155.3898,-17.4609],[-152.256,-24.1124],[-144.8518,-33.4533],[-136.7358,-39.6842],[-125.0718,-39.6621],[-125.0506,-49.0361],[-114.8313,-49.0029],[-114.81,-60.4466],[-108.3937,-60.4355]]}} as const;
type PlanId = keyof typeof MAPPED_LANDMARK_PLANS;
const inside = (ring: readonly (readonly number[])[], x: number, z: number) => {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
};
// null means no reviewed plan exists: the caller keeps its legacy policy.
// False is authoritative outside these outlines, so adjacent properties survive.
export function mappedLandmarkClearAt(l: { id?: string; x?: number; z?: number }, x: number, z: number): boolean | null {
  const plan = MAPPED_LANDMARK_PLANS[l.id as PlanId];
  return plan && l.x != null && l.z != null ? inside(plan.ring, x - l.x, z - l.z) : null;
}
export function drawMappedLandmarkPlan(K: Kit, id: PlanId) {
  const plan = MAPPED_LANDMARK_PLANS[id], h = plan.height;
  // Geographic outlines must never be rotated to face an unrelated nearby road.
  const ring = plan.ring.map(([x, z]) => [K.x0 + x, K.z0 + z] as [number, number]);
  const area = ring.reduce((a, p, i) => { const q = ring[(i + 1) % ring.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0);
  if (area > 0) ring.reverse(); // clockwise in XZ produces upward roof normals
  for (const face of THREE.ShapeUtils.triangulateShape(ring.map(p => new THREE.Vector2(...p)), [])) {
    const [a, b, c] = face.map(i => ring[i]);
    const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const [p, q] = cross > 0 ? [c, b] : [b, c];
    K.k.B.st.tri([a[0], K.y0 + h, a[1]], [p[0], K.y0 + h, p[1]], [q[0], K.y0 + h, q[1]], '#c8ced1');
  }
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const wall = (low: number, high: number, color: string) => K.k.B.st.quad(
      [a[0], K.y0 + low, a[1]], [b[0], K.y0 + low, b[1]],
      [b[0], K.y0 + high, b[1]], [a[0], K.y0 + high, a[1]], color);
    wall(0, h, '#67899b');
    for (let y = 3.2; y < h - .5; y += 3.2) wall(y, y + .24, '#b8c6ce');
  }
  K.k.solid(ring, K.y0 + h);
  const boardZ = Math.max(...ring.map(p => p[1] - K.z0)) + .3;
  K.board(id === 'dlf' ? 'DLF CYBER CITY' : 'TCS DECCAN PARK', 0, -boardZ, 5, 15, 1.2);
}
