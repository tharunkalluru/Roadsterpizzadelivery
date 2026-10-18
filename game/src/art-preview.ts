/**
 * Standalone art preview. Builds a synthetic Hyderabad-like scene (roads, a flyover,
 * a junction, a metro viaduct with a station, a chunk of buildings, the hero car,
 * every traffic kind, pedestrians, markers and a Telugu+English sign).
 *   art-preview.html#car | #carfly | #street | #aerial | #metro | #traffic | #markers | #sign | #real
 *   append &q=low|standard|high
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { art, texturesReady, stationObstacles, buildStorefronts, disposeStorefronts, buildStructures, structureObstacles } from './art';
import type { Quality } from './art/api';
import type { RoadEdge, WorldChunk, WorldCore, Building, GraphNode, MetroStation, WorldChunkV2, WorldCoreV2, Storefront, StoreGroup, Structure } from './world/schema';

const params = new URLSearchParams(location.hash.replace(/^#/, '').replace(/&/g, '&'));
const hashParts = location.hash.replace(/^#/, '').split('&');
const preset0 = hashParts[0] || 'street';
const qParam = hashParts.find((p) => p.startsWith('q='))?.slice(2) as Quality | undefined;
const quality: Quality = qParam === 'low' || qParam === 'high' ? qParam : 'standard';
void params;

const hud = document.getElementById('hud')!;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.3, 4000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = false;

/* ------------------------------------------------------------ synthetic world */

function mkRoad(id: string, name: string, pts: [number, number][], widthM: number, o: Partial<RoadEdge> & { from: string; to: string; elev?: number[] }): RoadEdge {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const elev = o.elev ?? pts.map(() => 0);
  return {
    id, wayId: 1, name, nameId: null, highway: o.highway ?? 'primary', oneway: o.oneway ?? false, lanes: o.lanes ?? null, widthM,
    level: 0, bridge: o.bridge ?? false, tunnel: false, elevationM: Math.max(...elev), pointElevM: elev, surfaceId: 's_' + id,
    fromNode: o.from, toNode: o.to, points: pts, lengthM: len,
    status: { geometry: 'provisional' }, provenance: { source: 'authored', sourceIds: [] },
  };
}

function curve(cx: number, cz: number, r: number, a0: number, a1: number, n: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
  return out;
}

const SHOP_NAMES: Record<StoreGroup, [string, string | null][]> = {
  grocery: [['Sri Venkateswara Kirana & General Stores', null], ['Annapurna Fresh Fruits & Vegetables', null], ['Balaji Supermarket', null], ['Lakshmi Provision Store', 'లక్ష్మి ప్రొవిజన్ స్టోర్']],
  restaurant: [['Sri Raghavendra Tiffin Centre & Fast Food', 'శ్రీ రాఘవేంద్ర టిఫిన్ సెంటర్'], ['శ్రీ రాఘవేంద్ర హోటల్', null], ['Nawab Biryani Point', null], ['Andhra Spice Mess', null], ['Spicy Hub Family Restaurant', null]],
  cafe_bakery: [['Irani Chai & Bakery', null], ['Sweet Magic Bakery & Cakes', null], ['Corner Coffee House', null]],
  pharmacy: [['Sri Sai Medical & General Stores', null], ['Care Plus Pharmacy 24x7', null], ['Arogya Medical Hall', 'ఆరోగ్య మెడికల్ హాల్']],
  hospital_clinic: [['Sunrise Multi-speciality Hospital', null], ["Dr. Ramesh's Dental Clinic", null], ['Shanti Diagnostics Centre', null]],
  bank_atm: [['Deccan Co-operative Bank & ATM', null], ['Nizam Bank ATM', null]],
  apparel: [['Sri Lakshmi Textiles & Readymades', null], ["Fashion Junction Men's Wear", null], ['Trendz Ladies Boutique', null]],
  electronics_mobile: [['Mobile World & Accessories', null], ['Sri Krishna Electronics & Home Appliances', null], ['Digital Hub Mobiles', null]],
  jewellery: [['Sri Mahalakshmi Jewellers', 'శ్రీ మహాలక్ష్మి జ్యువెలర్స్'], ['Navratna Jewellers', null]],
  hotel_lodging: [['Hotel Grand Residency', null], ['Sri Sai Lodge & Rooms', null], ['Hotel Royal Palace Suites', null]],
  auto_service: [['Raju Tyres & Auto Works', null], ['Sri Durga Motor Garage & Two-Wheeler Service', null]],
  hardware: [['Venkat Hardware & Paints', null], ['Sri Ganesh Building Materials & Sanitary', null]],
  education: [['Bright Future Coaching Centre', null], ['Vidya Bharathi Tuition Centre', null]],
  worship: [['శ్రీ ఆంజనేయ స్వామి దేవాలయం', null]],
  office_service: [['Sri Sai Xerox & Internet Cafe', null], ['Reliable Insurance Agency', null], ['Sri Balaji Travels & Cargo', null]],
  other: [['City Gift Corner', null], ['Hair Craft Gents Salon', null], ['Laundry Express', null]],
};
const JC: [number, number] = [600, -300];
const TELUGU_CAM = [88, 1.5, 88, 14];
const GROUPS = Object.keys(SHOP_NAMES) as StoreGroup[];

function mkStore(i: number, bId: string, group: StoreGroup, nameIdx: number, a: [number, number], b: [number, number], heading: number, floor: 0 | 1, roadId: string): Storefront {
  const [name, nameTe] = SHOP_NAMES[group][nameIdx % SHOP_NAMES[group].length];
  return {
    id: `sf_prev_${i}`, placeId: `prev${i}`, name, nameTe, category: group, group, confidence: 0.9, sources: ['synthetic'], license: 'n/a',
    x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2, buildingId: bId, roadId, side: 'left', facade: [a, b], facingHeading: heading, floor, status: 'provisional',
  };
}

function buildSyntheticWorld(): { core: WorldCore; chunk: WorldChunkV2; chunkJ: WorldChunkV2 } {
  const roads: RoadEdge[] = [
    mkRoad('r_main_a', 'Main Road', [[-320, 0], [-160, 0], [0, 0]], 14, { from: 'n_w', to: 'n_c', lanes: 4 }),
    mkRoad('r_main_b', 'Main Road', [[0, 0], [160, 0], [300, 0]], 14, { from: 'n_c', to: 'n_e', lanes: 4 }),
    mkRoad('r_cross_a', 'Cross Road', [[0, -260], [0, -120], [0, 0]], 9, { from: 'n_n', to: 'n_c', highway: 'secondary' }),
    mkRoad('r_cross_b', 'Cross Road', [[0, 0], [0, 120], [0, 260]], 9, { from: 'n_c', to: 'n_s', highway: 'secondary' }),
    mkRoad('r_curve', 'Ring Lane', [[300, 0], ...curve(300, 80, 80, -Math.PI / 2, 0, 12).slice(1)], 7, { from: 'n_e', to: 'n_ce', highway: 'residential' }),
    mkRoad('r_oneway', 'One-way Link', [[-120, 40], [-60, 40], [-60, 120]], 6, { from: 'n_l1', to: 'n_l2', highway: 'residential', oneway: true }),
    mkRoad('r_service', 'Service', [[60, 30], [120, 30]], 4, { from: 'n_s1', to: 'n_s2', highway: 'service' }),
    mkRoad('r_fly', 'Flyover', [[-260, 70], [-190, 70], [-130, 70], [-70, 70], [70, 70], [130, 70], [190, 70], [260, 70]], 10, {
      from: 'n_f1', to: 'n_f2', bridge: true, highway: 'primary', oneway: true, lanes: 2, elev: [0, 2.5, 6, 6.5, 6.5, 6, 2.5, 0],
    }),
    mkRoad('r_foot', 'Footpath', [[-30, 30], [-30, 8]], 2.5, { from: 'n_p1', to: 'n_p2', highway: 'footway' }),
  ];
  // ---- dual-carriageway flyover (eastbound z=-140, westbound z=-152) with ramps, joined at nodes, plus a slip ramp
  const rampUp = [0, 0.8, 1.7, 2.7, 3.7, 4.7, 5.6, 6.5];
  const xs = [-330, -300, -270, -240, -220, -200];
  const flyEdges: RoadEdge[] = [];
  const flyNodes: GraphNode[] = [];
  for (const [tag, z, dirSign] of [['a', -140, 1], ['b', -152, -1]] as [string, number, number][]) {
    const up = [-330, -300, -265, -235, -215, -200].map((x) => [x, z] as [number, number]);
    const upE = [0, 1.1, 2.6, 4.4, 5.8, 6.5];
    const deck = [[-200, z], [-100, z], [0, z], [100, z], [200, z]] as [number, number][];
    const deckE = [6.5, 6.5, 6.5, 6.5, 6.5];
    const dn = [[200, z], [215, z], [235, z], [265, z], [300, z], [330, z]] as [number, number][];
    const dnE = [6.5, 5.8, 4.4, 2.6, 1.1, 0];
    void rampUp; void xs;
    const segsF: [string, [number, number][], number[], string, string][] = [
      ['up', up, upE, `n_f${tag}0`, `n_f${tag}1`], ['deck', deck, deckE, `n_f${tag}1`, `n_f${tag}2`], ['dn', dn, dnE, `n_f${tag}2`, `n_f${tag}3`],
    ];
    for (const [nm, pts, el, f, t] of segsF) {
      const rev = dirSign < 0;
      flyEdges.push(mkRoad(`r_fl_${tag}_${nm}`, 'Flyover', rev ? pts.slice().reverse() : pts, 10, {
        from: rev ? t : f, to: rev ? f : t, bridge: true, highway: 'primary', oneway: true, lanes: 2, elev: rev ? el.slice().reverse() : el,
      }));
    }
    const nodePos: [number, number][] = [up[0], up[up.length - 1], dn[0], dn[dn.length - 1]];
    nodePos.forEach((p, i) => {
      const ids = i === 0 ? [`r_fl_${tag}_up`] : i === 1 ? [`r_fl_${tag}_up`, `r_fl_${tag}_deck`] : i === 2 ? [`r_fl_${tag}_deck`, `r_fl_${tag}_dn`] : [`r_fl_${tag}_dn`];
      flyNodes.push({ id: `n_f${tag}${i}`, osmNodeId: 0, x: p[0], z: p[1], level: 0, edges: ids, isJunction: false });
    });
  }
  // slip road leaving the eastbound carriageway at x=200 (3-way node on the deck), curving south down to grade
  flyEdges.push(mkRoad('r_fl_slip', 'Flyover slip', [[200, -140], [230, -128], [255, -108], [270, -80], [275, -50], [275, -20]], 7, {
    from: 'n_fa2', to: 'n_slip', bridge: true, highway: 'primary', oneway: true, lanes: 1, elev: [6.5, 5.6, 4.0, 2.2, 0.8, 0],
  }));
  flyNodes.push({ id: 'n_slip', osmNodeId: 0, x: 275, z: -20, level: 0, edges: ['r_fl_slip'], isJunction: false });
  flyNodes.find((n) => n.id === 'n_fa2')!.edges.push('r_fl_slip');
  flyNodes.find((n) => n.id === 'n_fa2')!.isJunction = true;
  roads.push(...flyEdges);

  // ---- junction with a circular skywalk (Uppal-like): crossing roads at (600,-300)
  roads.push(
    mkRoad('r_j_e', 'Junction Road', [[JC[0], JC[1]], [JC[0] + 120, JC[1]], [JC[0] + 260, JC[1]]], 16, { from: 'n_jc', to: 'n_je', lanes: 4 }),
    mkRoad('r_j_w', 'Junction Road', [[JC[0] - 260, JC[1]], [JC[0] - 120, JC[1]], [JC[0], JC[1]]], 16, { from: 'n_jw', to: 'n_jc', lanes: 4 }),
    mkRoad('r_j_n', 'Station Road', [[JC[0], JC[1] - 260], [JC[0], JC[1] - 120], [JC[0], JC[1]]], 12, { from: 'n_jn', to: 'n_jc', highway: 'secondary' }),
    mkRoad('r_j_s', 'Station Road', [[JC[0], JC[1]], [JC[0], JC[1] + 120], [JC[0], JC[1] + 260]], 12, { from: 'n_jc', to: 'n_js', highway: 'secondary' }),
  );
  const node = (id: string, x: number, z: number, edges: string[], j = false): GraphNode => ({ id, osmNodeId: 0, x, z, level: 0, edges, isJunction: j });
  const nodes: GraphNode[] = [
    node('n_w', -320, 0, ['r_main_a']), node('n_c', 0, 0, ['r_main_a', 'r_main_b', 'r_cross_a', 'r_cross_b'], true),
    node('n_e', 300, 0, ['r_main_b', 'r_curve']), node('n_n', 0, -260, ['r_cross_a']), node('n_s', 0, 260, ['r_cross_b']),
    node('n_ce', 380, 80, ['r_curve']), node('n_l1', -120, 40, ['r_oneway']), node('n_l2', -60, 120, ['r_oneway']),
    node('n_s1', 60, 30, ['r_service']), node('n_s2', 120, 30, ['r_service']), node('n_f1', -260, 70, ['r_fly']), node('n_f2', 260, 70, ['r_fly']),
    node('n_p1', -30, 30, ['r_foot']), node('n_p2', -30, 8, ['r_foot']),
    ...flyNodes,
    node('n_jc', JC[0], JC[1], ['r_j_e', 'r_j_w', 'r_j_n', 'r_j_s'], true), node('n_je', JC[0] + 260, JC[1], ['r_j_e']), node('n_jw', JC[0] - 260, JC[1], ['r_j_w']),
    node('n_jn', JC[0], JC[1] - 260, ['r_j_n']), node('n_js', JC[0], JC[1] + 260, ['r_j_s']),
  ];
  const H = 12.5;
  const pillars: WorldCore['metro']['pillars'] = [];
  for (let x = -285; x <= 285; x += 30) pillars.push({ x, z: -0.0, heading: -Math.PI / 2, lineId: 'blue' });
  const station: MetroStation = {
    id: 'st_uppal', name: 'Uppal', sourceName: 'Uppal', nameTe: 'ఉప్పల్', lines: ['blue'], lat: 0, lon: 0, x: 130, z: 0, osmIds: [],
    isDeliveryEntrance: false, inCorridor: true, status: { geometry: 'provisional' },
  };
  const core = {
    manifestVersion: 'synthetic', roads, nodes, directed: [], junctions: [], pois: [],
    metroLines: [{ id: 'blue', name: 'Blue Line', color: '#1f5db0', osmRouteMasterId: 0, geo: [], local: [[[-320, 0], [-100, 0], [100, 0], [320, 0]]] }],
    stations: [station], metro: { pillars, deckHeightM: H, deckWidthM: 9, heightStatus: 'provisional' },
    deliveries: [], names: [], boundary: { polygon: [], warningMarginM: 50, exits: [] },
  } as unknown as WorldCore;

  // buildings
  const stores: Storefront[] = [];
  let storeN = 0;
  let junctionChunk: WorldChunkV2;
  let s = 12345;
  const rnd = (): number => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const buildings: Building[] = [];
  const kinds = ['yes', 'residential', 'commercial', 'apartments', 'retail', 'house', 'industrial', 'yes'];
  const heights = [4.5, 7.5, 10.5, 13.5, 17, 24, 9, 12];
  for (const side of [-1, 1]) {
    let x = -150;
    let n = 0;
    while (x < 170) {
      const w = 8 + Math.floor(rnd() * 9);
      const d = 12 + Math.floor(rnd() * 8);
      const h = heights[Math.floor(rnd() * heights.length)] + (rnd() < 0.15 ? 14 : 0);
      if (Math.abs(x + w / 2) < 14) { x += w + 14; continue; }
      const z0 = side * (11.5 + (rnd() < 0.3 ? 2 : 0));
      const z1 = side * (11.5 + d);
      const fp: [number, number][] = side < 0 ? [[x, z1], [x + w, z1], [x + w, z0], [x, z0]] : [[x, z0], [x + w, z0], [x + w, z1], [x, z1]];
      // L-shape occasionally
      if (rnd() < 0.2 && w > 11) fp.splice(2, 0, [fp[2][0], (fp[2][1] + fp[1][1]) / 2 + side * 3] as [number, number]);
      const id = `b_${side}_${n++}`;
      buildings.push({
        id, osmId: 'way/' + id, footprint: fp, heightM: h, heightStatus: 'provisional', levels: null,
        name: side > 0 && n === 4 ? 'Test Bakery' : null, kind: kinds[Math.floor(rnd() * kinds.length)],
        frontRoadId: 'r_main_a', frontSide: side > 0 ? 'right' : 'left', centroid: [x + w / 2, (z0 + z1) / 2],
      });
      // storefront units on the road-facing wall
      const a0: [number, number] = side > 0 ? [x, z0] : [x + w, z0];
      const b0: [number, number] = side > 0 ? [x + w, z0] : [x, z0];
      const heading = side > 0 ? 0 : Math.PI;
      const units = w >= 12 ? 2 : 1;
      for (let u = 0; u < units; u++) {
        const t0 = u / units, t1 = (u + 1) / units;
        const pa: [number, number] = [a0[0] + (b0[0] - a0[0]) * t0, a0[1]];
        const pb: [number, number] = [a0[0] + (b0[0] - a0[0]) * t1, a0[1]];
        const g = GROUPS[(storeN * 5 + (side > 0 ? 3 : 0)) % GROUPS.length];
        stores.push(mkStore(storeN, id, g, storeN + u, pa, pb, heading, 0, 'r_main_a'));
        storeN++;
      }
      if (h >= 9 && rnd() < 0.5) {
        const g2 = GROUPS[(storeN * 3 + 1) % GROUPS.length];
        stores.push(mkStore(storeN, id, g2, storeN, a0, b0, heading, 1, 'r_main_a'));
        storeN++;
      }
      x += w + 0.4 + (rnd() < 0.2 ? 6 : 0);
    }
  }

  // ---- buildings + storefronts along the four arms of the skywalk junction
  const jb: Building[] = [];
  const jStores: Storefront[] = [];
  let jn = 0;
  const arm = (axis: 'x' | 'z', sign: 1 | -1): void => {
    for (let t = 140; t < 330; t += 21 + (jn % 3) * 3) {
      for (const side of [-1, 1] as const) {
        const w = 15 + (jn % 4) * 2, depth = 14, gap = axis === 'x' ? 12.5 : 9.5;
        const h = [9, 12.5, 16, 7.5, 21][(jn + (side > 0 ? 2 : 0)) % 5];
        const id = `j_${jn++}`;
        const along0 = sign * t;
        let a: [number, number], b: [number, number], fp: [number, number][], heading: number;
        if (axis === 'x') {
          const x0 = JC[0] + Math.min(along0, along0 + sign * w), x1 = JC[0] + Math.max(along0, along0 + sign * w);
          const zf = JC[1] + side * gap, zb = JC[1] + side * (gap + depth);
          fp = [[x0, Math.min(zf, zb)], [x1, Math.min(zf, zb)], [x1, Math.max(zf, zb)], [x0, Math.max(zf, zb)]];
          a = [x0, zf]; b = [x1, zf]; heading = side > 0 ? 0 : Math.PI;
        } else {
          const z0 = JC[1] + Math.min(along0, along0 + sign * w), z1 = JC[1] + Math.max(along0, along0 + sign * w);
          const xf = JC[0] + side * gap, xb = JC[0] + side * (gap + depth);
          fp = [[Math.min(xf, xb), z0], [Math.max(xf, xb), z0], [Math.max(xf, xb), z1], [Math.min(xf, xb), z1]];
          a = [xf, z0]; b = [xf, z1]; heading = side > 0 ? Math.PI / 2 : -Math.PI / 2;
        }
        jb.push({ id, osmId: 'way/' + id, footprint: fp, heightM: h, heightStatus: 'provisional', levels: null, name: null, kind: 'commercial', frontRoadId: null, frontSide: null, centroid: [(fp[0][0] + fp[2][0]) / 2, (fp[0][1] + fp[2][1]) / 2] });
        const g = GROUPS[(jn * 7 + 2) % GROUPS.length];
        jStores.push(mkStore(1000 + jn, id, g, jn, a, b, heading, 0, 'r_j_e'));
        if (h >= 12) jStores.push(mkStore(2000 + jn, id, GROUPS[(jn * 3) % GROUPS.length], jn + 1, a, b, heading, 1, 'r_j_e'));
      }
    }
  };
  arm('x', 1); arm('x', -1); arm('z', 1); arm('z', -1);

  // ---- structures: circular skywalk (660 m, ~105 m radius) with stairs and lifts, and a footbridge
  const R = 105;
  const ring: [number, number][] = [];
  for (let i = 0; i <= 72; i++) { const a = (i / 72) * Math.PI * 2; ring.push([JC[0] + Math.cos(a) * R, JC[1] + Math.sin(a) * R]); }
  const stairsRing = [25, 85, 145, 205, 265, 325].map((deg) => {
    const a = (deg / 180) * Math.PI;
    return { x: JC[0] + Math.cos(a) * (R + 14), z: JC[1] + Math.sin(a) * (R + 14), heading: Math.atan2(Math.cos(a), Math.sin(a)) };
  });
  const supportsRing: [number, number][] = [];
  for (let i = 0; i < 30; i++) { const a = ((i + 0.5) / 30) * Math.PI * 2; supportsRing.push([JC[0] + Math.cos(a) * R, JC[1] + Math.sin(a) * R]); }
  const stt = (id: string, kind: Structure['kind'], name: string, path: [number, number][], elev: number, width: number, stairs: Structure['stairs'], supports: [number, number][]): Structure => ({
    id, kind, name, path, elevM: path.map(() => elev), widthM: width, supports, stairs,
    status: { geometry: 'provisional' }, provenance: { source: 'authored', sourceIds: [] },
  });
  const structures: Structure[] = [
    stt('st_skywalk', 'skywalk', 'Uppal circular skywalk (synthetic)', ring, 5.6, 3.4, stairsRing, supportsRing),
    stt('st_fob', 'footbridge', 'Foot-over-bridge (synthetic)', [[-16, 90], [16, 90]], 5.4, 2.6, [{ x: -16, z: 90, heading: Math.PI / 2 }, { x: 16, z: 90, heading: -Math.PI / 2 }], []),
  ];
  (core as unknown as WorldCoreV2).structures = structures;
  (core as unknown as WorldCoreV2).lines = ['blue'];
  junctionChunk = { id: 'c_3_-2', ix: 3, iz: -2, buildings: jb, storefronts: jStores };
  return { core, chunk: { id: 'c_0_0', ix: 0, iz: 0, buildings, storefronts: stores }, chunkJ: junctionChunk };
}

/* -------------------------------------------------------------------- scene */

const { core, chunk, chunkJ } = buildSyntheticWorld();
const env = art.buildEnvironment(scene, renderer, quality);
const roadsGroup = art.buildRoads(core, quality);
const metroGroup = art.buildMetro(core, quality);
const chunkGroup = art.buildChunk(chunk, core, quality);
const chunkJGroup = art.buildChunk(chunkJ, core, quality);
const storesGroup = buildStorefronts(chunk, core, quality);
const storesJGroup = buildStorefronts(chunkJ, core, quality);
const structuresGroup = buildStructures(core as WorldCoreV2, quality);
scene.add(roadsGroup, metroGroup, chunkGroup, chunkJGroup, storesGroup, storesJGroup, structuresGroup);

const hero = art.createHeroCar(quality);
hero.root.position.set(-20, 0, -3.5);
hero.root.rotation.y = -Math.PI / 2;
scene.add(hero.root);
hero.setBrakeLights(false);

const traffic = art.createTrafficTemplates(quality);
const kinds = ['car', 'auto', 'bus', 'bike', 'truck'] as const;
const trafficRoot = new THREE.Group();
scene.add(trafficRoot);
kinds.forEach((k, i) => {
  const o = traffic[k].object.clone();
  // westbound lane z=+3.5, spaced along x
  o.position.set(-6 - i * 13, 0, 3.6);
  o.rotation.y = Math.PI / 2;
  trafficRoot.add(o);
});
// extra eastbound traffic ahead of the hero
{
  const a = traffic.auto.object.clone(); a.position.set(10, 0, -3.6); a.rotation.y = -Math.PI / 2; trafficRoot.add(a);
  const b = traffic.bus.object.clone(); b.position.set(34, 0, -3.6); b.rotation.y = -Math.PI / 2; trafficRoot.add(b);
  const c = traffic.car.object.clone(); c.position.set(-45, 0, -3.6); c.rotation.y = -Math.PI / 2; trafficRoot.add(c);
  const d = traffic.bike.object.clone(); d.position.set(0, 0, -6), d.rotation.y = -Math.PI / 2; trafficRoot.add(d);
}
// close-up traffic line-up for #traffic
const lineup = new THREE.Group();
lineup.position.set(200, 0, 150);
kinds.forEach((k, i) => {
  const o = traffic[k].object.clone();
  o.position.set((i - 2) * 7.2, 0, 0);
  o.rotation.y = Math.PI * 0.82;
  lineup.add(o);
});
scene.add(lineup);

// pedestrians
const ped = art.createPedestrianTemplate(quality);
const pedVariants = (ped.userData.variants ?? []) as { top: number; bottom: number }[];
for (let i = 0; i < 10; i++) {
  const p = ped.clone(true);
  const v = pedVariants[i % pedVariants.length];
  p.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      if (m.name === 'top') { m.material = (m.material as THREE.MeshStandardMaterial).clone(); (m.material as THREE.MeshStandardMaterial).color.setHex(v.top); }
      if (m.name === 'legL' || m.name === 'legR') { m.material = (m.material as THREE.MeshStandardMaterial).clone(); (m.material as THREE.MeshStandardMaterial).color.setHex(v.bottom); }
    }
  });
  p.position.set(-30 + i * 9 + (i % 3), 0.16, i % 2 ? -9.4 : 9.4);
  p.rotation.y = i % 2 ? 0.6 : Math.PI - 0.4;
  const swing = i % 2 ? 0.5 : -0.5;
  p.getObjectByName('legL')!.rotation.x = swing;
  p.getObjectByName('legR')!.rotation.x = -swing;
  scene.add(p);
}
// line-up pedestrians
for (let i = 0; i < 6; i++) {
  const p = ped.clone(true);
  const v = pedVariants[i % pedVariants.length];
  p.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      if (m.name === 'top') { m.material = (m.material as THREE.MeshStandardMaterial).clone(); (m.material as THREE.MeshStandardMaterial).color.setHex(v.top); }
      if (m.name === 'legL' || m.name === 'legR') { m.material = (m.material as THREE.MeshStandardMaterial).clone(); (m.material as THREE.MeshStandardMaterial).color.setHex(v.bottom); }
    }
  });
  p.position.set(-12 + i * 1.3 + 200, 0, 156);
  p.rotation.y = Math.PI * 0.9;
  scene.add(p);
}

// markers
const delivery = art.createDeliveryMarker([[36, 9], [46, 9], [46, 11.6], [36, 11.6]], 0.16);
scene.add(delivery);
const lm = [art.createLandingMarker(), art.createLandingMarker(), art.createLandingMarker()];
(['clear', 'uncertain', 'blocked'] as const).forEach((s, i) => {
  lm[i].setState(s);
  lm[i].object.position.set(70 + i * 10, 0, -3.5);
  scene.add(lm[i].object);
});

// sign: "ఉప్పల్ / Uppal" on a pole
void art.createSignTexture([{ text: 'ఉప్పల్', lang: 'te' }, { text: 'Uppal', lang: 'en' }], { bg: '#1f5db0', fg: '#ffffff', width: 1024, height: 384 }).then((tex) => {
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.575), mat);
  sign.position.set(30, 4.2, -9.6);
  sign.rotation.y = 0;
  scene.add(sign);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 4.4, 8), new THREE.MeshStandardMaterial({ color: 0x777c82, metalness: 0.7, roughness: 0.4 }));
  pole.position.set(27.6, 2.2, -9.7);
  const pole2 = pole.clone(); pole2.position.x = 32.4;
  scene.add(pole, pole2);
  const sign2 = sign.clone();
  sign2.position.set(204, 2.3, 168);
  sign2.scale.set(0.8, 0.8, 1);
  sign2.rotation.y = Math.PI * 0.9;
  scene.add(sign2);
});

/* -------------------------------------------------------------- real world */

const realState: { loaded: boolean; fly?: { cam: THREE.Vector3; target: THREE.Vector3; aerialCam: THREE.Vector3; aerialTarget: THREE.Vector3 }; station?: THREE.Vector3; heroPos?: THREE.Vector3; heroYaw?: number; stats?: Record<string, number> } = { loaded: false };

async function tryReal(v2 = false): Promise<boolean> {
  try {
    const base = v2 ? './world/hyd-metro/v2/' : './world/hyd-uppal-tarnaka/v1/';
    const r = await fetch(base + 'core.json');
    if (!r.ok) return false;
    const real = (await r.json()) as WorldCore;
    const t0 = performance.now();
    const tr0 = performance.now();
    const roads = art.buildRoads(real, quality);
    const tr1 = performance.now();
    const metro = art.buildMetro(real, quality);
    const tr2 = performance.now();
    scene.add(roads, metro);
    let structuresTris = 0, storeCalls = 0, storeTris = 0, storefronts = 0;
    if (v2) {
      const sg = buildStructures(real as WorldCoreV2, quality);
      scene.add(sg);
      structuresTris = (sg.userData.triangles as number) ?? 0;
    }
    const st = v2 ? (real.stations.find((x) => x.name === 'Uppal') ?? real.stations[0]) : (real.stations.find((x) => x.inCorridor && x.name === 'Habsiguda') ?? real.stations.find((x) => x.inCorridor));
    if (!st) return true;
    realState.station = new THREE.Vector3(st.x, 0, st.z);
    const mf = await (await fetch(base + 'manifest.json')).json();
    const CS = (mf.chunkSizeM as number | undefined) ?? 200;
    const cix = Math.floor(st.x / CS), ciz = Math.floor(st.z / CS);
    const m = mf;
    let chunks = 0, buildings = 0, tris = 0, chunkMs = 0;
    for (const c of (m.chunks ?? []) as { ix: number; iz: number; file: string }[]) {
      if (Math.abs(c.ix - cix) > 2 || Math.abs(c.iz - ciz) > 2) continue;
      const ch = (await (await fetch(base + c.file)).json()) as WorldChunk;
      const tc0 = performance.now();
      const g = art.buildChunk(ch, real, quality);
      chunkMs += performance.now() - tc0;
      scene.add(g);
      if (v2) {
        const sf = buildStorefronts(ch as WorldChunkV2, real, quality);
        scene.add(sf);
        const stt2 = sf.userData.stats as { drawCalls: number; triangles: number; storefronts: number };
        storeCalls += stt2.drawCalls; storeTris += stt2.triangles; storefronts += stt2.storefronts;
        await (sf.userData.pending as Promise<void>);
      }
      chunks++; buildings += ch.buildings.length; tris += (g.userData.triangles as number) ?? 0;
    }
    // hero on the nearest road to the station
    let best = Infinity;
    for (const e of real.roads) {
      if (e.bridge || e.pointElevM.some((v) => v > 0.3) || e.widthM < 6) continue;
      for (let i = 0; i < e.points.length - 1; i++) {
        const mx = (e.points[i][0] + e.points[i + 1][0]) / 2, mz = (e.points[i][1] + e.points[i + 1][1]) / 2;
        const d = Math.hypot(mx - st.x, mz - st.z - 25);
        if (d < best) {
          best = d;
          const dx = e.points[i + 1][0] - e.points[i][0], dz = e.points[i + 1][1] - e.points[i][1];
          const l = Math.hypot(dx, dz);
          // left-hand traffic: offset to the left of travel
          const lx = dz / l, lz = -dx / l;
          realState.heroPos = new THREE.Vector3(mx + lx * e.widthM * 0.25, 0, mz + lz * e.widthM * 0.25);
          realState.heroYaw = Math.atan2(-dx, -dz);
        }
      }
    }
    {
      const fe = real.roads.filter((e) => Math.max(...e.pointElevM, 0) > 3).sort((a, b) => b.lengthM - a.lengthM)[0];
      if (fe) {
        const pts = fe.points;
        const at = (f: number): { x: number; z: number; y: number; tx: number; tz: number } => {
          const i = Math.min(pts.length - 2, Math.floor(f * (pts.length - 1)));
          const dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1], l = Math.hypot(dx, dz) || 1;
          return { x: pts[i][0], z: pts[i][1], y: fe.pointElevM[i], tx: dx / l, tz: dz / l };
        };
        const a = at(0.02), b = at(0.2), m = at(0.5);
        realState.fly = {
          cam: new THREE.Vector3(a.x - a.tx * 30 - a.tz * 16, 3.2, a.z - a.tz * 30 + a.tx * 16),
          target: new THREE.Vector3(b.x, 4.5, b.z),
          aerialCam: new THREE.Vector3(m.x - 60, 110, m.z + 90), aerialTarget: new THREE.Vector3(m.x, 4, m.z),
        };
      }
    }
    const obs = stationObstacles(real);
    realState.loaded = true;
    realState.stats = { structureObstacles: v2 ? structureObstacles(real as WorldCoreV2).length : 0, structuresTris, storefronts, storeCalls, storeTris, chunks, buildings, buildingTris: tris, obstacles: obs.length, stairObstacles: obs.filter((o) => o.id.includes(':stairs:')).length, roadsMs: Math.round(tr1 - tr0), metroMs: Math.round(tr2 - tr1), chunkAvgMs: Math.round((chunkMs / Math.max(1, chunks)) * 10) / 10, totalMs: Math.round(performance.now() - t0), roadTris: roads.children.reduce((a2, g2) => a2 + g2.children.reduce((a3, m3) => a3 + (((m3 as THREE.Mesh).geometry?.index?.count ?? 0) / 3), 0), 0) };
    console.log('[real]', JSON.stringify(realState.stats), best);
    return true;
  } catch (e) { console.warn('real load failed', e); return false; }
}

/* ---------------------------------------------------------------- presets */

function setPreset(name: string): void {
  const t = new THREE.Vector3();
  switch (name) {
    case 'car':
    case 'carfly':
      camera.position.set(name === 'carfly' ? -15.5 : -14.5, name === 'carfly' ? 0.7 : 1.9, name === 'carfly' ? -8.2 : -7.8);
      t.set(-20, name === 'carfly' ? 2.6 : 0.55, -3.5);
      hero.root.position.y = name === 'carfly' ? 2.4 : 0;
      hero.setThruster(name === 'carfly' ? 0.9 : 0);
      break;
    case 'carside':
      camera.position.set(-20, 1.2, 2.4);
      t.set(-20, 0.55, -3.5);
      break;
    case 'carfront':
      camera.position.set(-13.2, 0.95, -7.2);
      t.set(-18.2, 0.5, -3.5);
      break;
    case 'cartop':
      camera.position.set(-20, 7.5, -3.3);
      t.set(-20, 0.3, -3.5);
      break;
    case 'carrear':
      camera.position.set(-27, 1.8, -6);
      t.set(-20, 0.6, -3.5);
      break;
    case 'street':
      camera.position.set(-42, 3.2, -4.2);
      t.set(10, 2, -2);
      break;
    case 'aerial':
      camera.position.set(-70, 85, 110);
      t.set(40, 0, 10);
      break;
    case 'metro':
      camera.position.set(52, 40, 34);
      t.set(135, 8, 0);
      break;
    case 'metrostreet':
      camera.position.set(70, 2.4, -3.8);
      t.set(135, 8, -3);
      break;
    case 'shops':
      camera.position.set(-62, 2.6, 8.6); t.set(8, 3.4, -13); break;
    case 'shops2':
      camera.position.set(30, 2.6, -8.6); t.set(78, 3.4, 14); break;
    case 'shopsclose':
      camera.position.set(-60, 1.9, -4); t.set(-42, 3.1, -13); break;
    case 'shopsclose2':
      camera.position.set(-76, 2.2, 8.2); t.set(-70, 3.4, 14); break;
    case 'shopsaerial':
      camera.position.set(52, 46, 48); t.set(36, 0, -6); break;
    case 'shopsfar':
      camera.position.set(-205, 3.2, 2); t.set(0, 3.0, -12); break;
    case 'shopsfar2':
      camera.position.set(-318, 3.2, 2); t.set(0, 3.0, -12); break;
    case 'telugu2':
      camera.position.set(52, 1.6, 52); t.set(52, 3.0, 14); break;
    case 'telugu':
      camera.position.set(TELUGU_CAM[0], 2.2, TELUGU_CAM[1]); t.set(TELUGU_CAM[2], 3.0, TELUGU_CAM[3]); break;
    case 'flyover':
      camera.position.set(-310, 10, -108); t.set(-190, 5, -146); break;
    case 'flyoverside':
      camera.position.set(-120, 2.4, -118); t.set(-70, 5.5, -146); break;
    case 'flyoverunder':
      camera.position.set(-62, 1.7, -146); t.set(70, 5.0, -146); break;
    case 'flyoveraerial':
      camera.position.set(-40, 150, -40); t.set(0, 0, -146); break;
    case 'flyoverslip':
      camera.position.set(150, 14, -95); t.set(225, 4, -128); break;
    case 'flyoverramp':
      camera.position.set(-232, 3.0, -125); t.set(-286, 1.5, -146); break;
    case 'skywalk':
      camera.position.set(JC[0] - 190, 62, JC[1] + 200); t.set(JC[0], 3, JC[1]); break;
    case 'skywalkground':
      camera.position.set(JC[0] + 150, 2.6, JC[1] + 85); t.set(JC[0] + 105, 4.4, JC[1] + 44); break;
    case 'skywalkdeck':
      camera.position.set(JC[0] + 68, 7.3, JC[1] + 82); t.set(JC[0] + 26, 6.9, JC[1] + 106); break;
    case 'skywalkstairs':
      camera.position.set(JC[0] + 128, 4.2, JC[1] + 70); t.set(JC[0] + 106, 3.6, JC[1] + 46); break;
    case 'footbridge':
      camera.position.set(-40, 4.5, 118); t.set(0, 4.2, 90); break;
    case 'junction':
      camera.position.set(-22, 26, 38);
      t.set(4, 0, 4);
      break;
    case 'far':
      camera.position.set(-300, 2.2, -3.5);
      t.set(300, 1.5, -3.5);
      break;
    case 'traffic':
      camera.position.set(200, 7, 178);
      t.set(200, 1.2, 150);
      break;
    case 'markers':
      camera.position.set(52, 9, 14);
      t.set(60, 0, -2);
      break;
    case 'sign':
      camera.position.set(30, 4.0, 3);
      t.set(30, 3.9, -9.6);
      break;
    case 'realfly':
    case 'realflyaerial':
    case 'real-v2-fly': {
      const f = realState.fly;
      if (f) { camera.position.copy(name === 'realflyaerial' ? f.aerialCam : f.cam); t.copy(name === 'realflyaerial' ? f.aerialTarget : f.target); }
      break;
    }
    case 'real-v2':
    case 'real-v2-street':
    case 'real-v2-skywalk':
    case 'real':
    case 'realstreet':
    case 'realmetro': {
      const st = realState.station ?? new THREE.Vector3();
      if (realState.heroPos) { hero.root.position.copy(realState.heroPos); hero.root.rotation.y = realState.heroYaw ?? 0; }
      if (name === 'real' || name === 'real-v2') { camera.position.set(st.x - 120, 150, st.z + 190); t.copy(st); }
      else if (name === 'real-v2-skywalk') { camera.position.set(st.x + 60, 24, st.z + 90); t.set(st.x, 5, st.z); }
      else if (name === 'realmetro') { camera.position.set(st.x + 45, 22, st.z + 70); t.set(st.x, 10, st.z); }
      else {
        const f = new THREE.Vector3(-Math.sin(hero.root.rotation.y), 0, -Math.cos(hero.root.rotation.y));
        camera.position.set(hero.root.position.x - f.x * 9, 3.2, hero.root.position.z - f.z * 9);
        t.set(hero.root.position.x + f.x * 12, 1.4, hero.root.position.z + f.z * 12);
      }
      break;
    }
    default:
      camera.position.set(-42, 3.2, -4.2);
      t.set(10, 2, -2);
  }
  controls.target.copy(t);
  camera.lookAt(t);
  controls.update();
  env.update(name === 'aerial' || name === 'metro' || name === 'junction' || name === 'far' || name === 'real' || name === 'realmetro' ? t : name.startsWith('traffic') ? new THREE.Vector3(200, 0, 150) : /^(shops|telugu|flyover|skywalk|footbridge|real-v2|realfly)/.test(name) ? t : hero.root.position);
  if (name !== 'carfly') hero.root.position.y = 0;
  const dressed = !/^(shops|telugu|flyover|skywalk|footbridge|real-v2|realfly)/.test(name);
  hero.root.visible = dressed;
  metroGroup.visible = dressed;
  trafficRoot.visible = dressed;
  hud.textContent = `preset: ${name}  quality: ${quality}`;
}

let lastPreset = preset0;
if (preset0.startsWith('real')) void tryReal(preset0.startsWith('real-v2')).then(() => { setPreset(lastPreset); });
setPreset(preset0);
window.addEventListener('hashchange', () => {
  lastPreset = location.hash.replace(/^#/, '').split('&')[0] || 'street';
  setPreset(lastPreset);
  frames = 0;
});

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

let frames = 0;
let last = performance.now();
const w = window as unknown as Record<string, unknown>;
w.__artReady = false;
w.__artStats = () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries, quality });
w.__artFrames = () => frames;
w.__artFuzz = () => {
  const out: Record<string, unknown> = {};
  const base = chunk.storefronts[0];
  const mk = (over: Partial<Storefront>, i: number): Storefront => ({ ...base, id: `sf_fz_${i}`, ...over });
  const odd: Storefront[] = [
    mk({ facade: null }, 1), mk({ facade: [[0, 0], [0, 0]] }, 2), mk({ name: 'X'.repeat(300) }, 3), mk({ name: 'A \u{1F600} \u0C36\u0C4D\u0C30\u0C40 Mixed Name' }, 4),
    mk({ nameTe: '   ' }, 5), mk({ buildingId: null }, 6), mk({ name: '' }, 7), mk({ nameTe: 'శ్రీ రాఘవేంద్ర హోటల్ అండ్ రెస్టారెంట్ టిఫిన్ సెంటర్ ఫాస్ట్ ఫుడ్ కార్నర్' }, 8),
    mk({ facade: [[-20, 20], [-19.2, 20]] }, 9), mk({ facade: [[-20, 20], [50, 20]] }, 10),
  ];
  const run = (label: string, list: Storefront[], q: Quality): void => {
    try {
      const t0 = performance.now();
      const g = buildStorefronts({ ...chunk, storefronts: list }, core, q);
      const st = g.userData.stats as Record<string, number>;
      out[label] = { ok: true, ms: Math.round(performance.now() - t0), calls: st.drawCalls, tris: st.triangles, px: st.pxPerMetre, n: st.storefronts };
      disposeStorefronts(g);
    } catch (e) { out[label] = { ok: false, err: String(e) }; }
  };
  for (const q of ['low', 'standard', 'high'] as Quality[]) {
    run(`empty-${q}`, [], q);
    run(`odd-${q}`, odd, q);
    const dense: Storefront[] = [];
    for (let i = 0; i < 320; i++) dense.push(mk({ id: `sf_d${i}`, name: `${SHOP_NAMES[GROUPS[i % 16]][i % SHOP_NAMES[GROUPS[i % 16]].length][0]} ${i}`, group: GROUPS[i % 16], floor: (i % 5 === 0 ? 1 : 0) as 0 | 1, facade: [[-150 + (i % 40) * 8, i < 160 ? -11.5 : 11.5], [-150 + (i % 40) * 8 + 6, i < 160 ? -11.5 : 11.5]], facingHeading: i < 160 ? Math.PI : 0 }, 100 + i));
    run(`dense320-${q}`, dense, q);
    run(`dense110-${q}`, dense.slice(0, 110), q);
  }
  return out;
};
w.__artReal = () => realState;
w.__artStores = () => [...chunk.storefronts, ...chunkJ.storefronts].map((f) => ({ n: f.name, te: f.nameTe, x: Math.round(f.x), z: Math.round(f.z), fl: f.floor, h: f.facingHeading, g: f.group }));
w.__artVisible = () => {
  const fr = new THREE.Frustum();
  fr.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const out: Record<string, number> = {};
  let total = 0;
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!(m.isMesh || (o as THREE.Sprite).isSprite) || !o.visible) return;
    let p: THREE.Object3D | null = o; let hidden = false;
    while (p) { if (!p.visible) hidden = true; p = p.parent; }
    if (hidden) return;
    if (m.geometry && m.frustumCulled) {
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      const sp = m.geometry.boundingSphere!.clone().applyMatrix4(m.matrixWorld);
      if ((m as unknown as THREE.InstancedMesh).isInstancedMesh) { const im = m as unknown as THREE.InstancedMesh; if (!im.boundingSphere) im.computeBoundingSphere(); const s2 = im.boundingSphere!.clone().applyMatrix4(m.matrixWorld); if (!fr.intersectsSphere(s2)) return; }
      else if (!fr.intersectsSphere(sp)) return;
    }
    const k = (m.name || 'unnamed').replace(/-?\d+_-?\d+$/, '');
    out[k] = (out[k] ?? 0) + 1; total++;
  });
  out.TOTAL = total;
  return out;
};
w.__artBreakdown = () => { const out: Record<string, number> = {}; scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.geometry) { const n = (m.geometry.index?.count ?? m.geometry.getAttribute('position').count) / 3; const k = m.name || 'unnamed'; out[k] = (out[k] ?? 0) + Math.round(n * ((m as unknown as THREE.InstancedMesh).isInstancedMesh ? (m as unknown as THREE.InstancedMesh).count : 1)); } }); return out; };
w.__artInfo = () => {
  const count = (o: THREE.Object3D): { meshes: number; tris: number } => { let meshes = 0, tris = 0; o.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) { meshes++; const g = m.geometry; const n = (g.index?.count ?? g.getAttribute('position').count) / 3; tris += (m as unknown as THREE.InstancedMesh).isInstancedMesh ? n * (m as unknown as THREE.InstancedMesh).count : n; } }); return { meshes, tris: Math.round(tris) }; };
  const out: Record<string, unknown> = { roads: count(roadsGroup), metro: count(metroGroup), chunk: count(chunkGroup), hero: count(hero.root), pedestrian: count(ped), stores: count(storesGroup), storesJ: count(storesJGroup), structures: count(structuresGroup), storeStats: storesGroup.userData.stats, storeStatsJ: storesJGroup.userData.stats, structureObstacles: structureObstacles(core as WorldCoreV2).length };
  for (const k of kinds) out[k] = count(traffic[k].object);
  return out;
};

function loop(): void {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  hero.animate(dt, lastPreset === 'carfly' ? 0 : 6, 0.12);
  controls.update();
  renderer.render(scene, camera);
  frames++;
  if (frames === 3) {
    const pend = [texturesReady(), chunkGroup.userData.pending as Promise<void>, metroGroup.userData.pending as Promise<void>, storesGroup.userData.pending as Promise<void>, storesJGroup.userData.pending as Promise<void>];
    Promise.all(pend).then(() => { setTimeout(() => { w.__artReady = true; frames = 0; }, 400); });
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
