/**
 * Standalone art preview. Builds a synthetic Hyderabad-like scene (roads, a flyover,
 * a junction, a metro viaduct with a station, a chunk of buildings, the hero car,
 * every traffic kind, pedestrians, markers and a Telugu+English sign).
 *   art-preview.html#car | #carfly | #street | #aerial | #metro | #traffic | #markers | #sign | #real
 *   append &q=low|standard|high
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { art, texturesReady, stationObstacles } from './art';
import type { Quality } from './art/api';
import type { RoadEdge, WorldChunk, WorldCore, Building, GraphNode, MetroStation } from './world/schema';

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

function buildSyntheticWorld(): { core: WorldCore; chunk: WorldChunk } {
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
  const node = (id: string, x: number, z: number, edges: string[], j = false): GraphNode => ({ id, osmNodeId: 0, x, z, level: 0, edges, isJunction: j });
  const nodes: GraphNode[] = [
    node('n_w', -320, 0, ['r_main_a']), node('n_c', 0, 0, ['r_main_a', 'r_main_b', 'r_cross_a', 'r_cross_b'], true),
    node('n_e', 300, 0, ['r_main_b', 'r_curve']), node('n_n', 0, -260, ['r_cross_a']), node('n_s', 0, 260, ['r_cross_b']),
    node('n_ce', 380, 80, ['r_curve']), node('n_l1', -120, 40, ['r_oneway']), node('n_l2', -60, 120, ['r_oneway']),
    node('n_s1', 60, 30, ['r_service']), node('n_s2', 120, 30, ['r_service']), node('n_f1', -260, 70, ['r_fly']), node('n_f2', 260, 70, ['r_fly']),
    node('n_p1', -30, 30, ['r_foot']), node('n_p2', -30, 8, ['r_foot']),
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
      x += w + 0.4 + (rnd() < 0.2 ? 6 : 0);
    }
  }
  return { core, chunk: { id: 'c_0_0', ix: 0, iz: 0, buildings } };
}

/* -------------------------------------------------------------------- scene */

const { core, chunk } = buildSyntheticWorld();
const env = art.buildEnvironment(scene, renderer, quality);
const roadsGroup = art.buildRoads(core, quality);
const metroGroup = art.buildMetro(core, quality);
const chunkGroup = art.buildChunk(chunk, core, quality);
scene.add(roadsGroup, metroGroup, chunkGroup);

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

const realState: { loaded: boolean; station?: THREE.Vector3; heroPos?: THREE.Vector3; heroYaw?: number; stats?: Record<string, number> } = { loaded: false };

async function tryReal(): Promise<boolean> {
  try {
    const base = './world/hyd-uppal-tarnaka/v1/';
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
    const st = real.stations.find((x) => x.inCorridor && x.name === 'Habsiguda') ?? real.stations.find((x) => x.inCorridor);
    if (!st) return true;
    realState.station = new THREE.Vector3(st.x, 0, st.z);
    const cix = Math.floor(st.x / 200), ciz = Math.floor(st.z / 200);
    const m = await (await fetch(base + 'manifest.json')).json();
    let chunks = 0, buildings = 0, tris = 0, chunkMs = 0;
    for (const c of (m.chunks ?? []) as { ix: number; iz: number; file: string }[]) {
      if (Math.abs(c.ix - cix) > 2 || Math.abs(c.iz - ciz) > 2) continue;
      const ch = (await (await fetch(base + c.file)).json()) as WorldChunk;
      const tc0 = performance.now();
      const g = art.buildChunk(ch, real, quality);
      chunkMs += performance.now() - tc0;
      scene.add(g);
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
    const obs = stationObstacles(real);
    realState.loaded = true;
    realState.stats = { chunks, buildings, buildingTris: tris, obstacles: obs.length, stairObstacles: obs.filter((o) => o.id.includes(':stairs:')).length, roadsMs: Math.round(tr1 - tr0), metroMs: Math.round(tr2 - tr1), chunkAvgMs: Math.round((chunkMs / Math.max(1, chunks)) * 10) / 10, totalMs: Math.round(performance.now() - t0), roadTris: roads.children.reduce((a2, g2) => a2 + g2.children.reduce((a3, m3) => a3 + (((m3 as THREE.Mesh).geometry?.index?.count ?? 0) / 3), 0), 0) };
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
    case 'real':
    case 'realstreet':
    case 'realmetro': {
      const st = realState.station ?? new THREE.Vector3();
      if (realState.heroPos) { hero.root.position.copy(realState.heroPos); hero.root.rotation.y = realState.heroYaw ?? 0; }
      if (name === 'real') { camera.position.set(st.x - 120, 150, st.z + 190); t.copy(st); }
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
  env.update(name === 'aerial' || name === 'metro' || name === 'junction' || name === 'far' || name === 'real' || name === 'realmetro' ? t : name.startsWith('traffic') ? new THREE.Vector3(200, 0, 150) : hero.root.position);
  if (name !== 'carfly') hero.root.position.y = 0;
  hud.textContent = `preset: ${name}  quality: ${quality}`;
}

let lastPreset = preset0;
if (preset0.startsWith('real')) void tryReal().then(() => { setPreset(lastPreset); });
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
w.__artReal = () => realState;
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
  const out: Record<string, unknown> = { roads: count(roadsGroup), metro: count(metroGroup), chunk: count(chunkGroup), hero: count(hero.root), pedestrian: count(ped) };
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
    const pend = [texturesReady(), chunkGroup.userData.pending as Promise<void>, metroGroup.userData.pending as Promise<void>];
    Promise.all(pend).then(() => { setTimeout(() => { w.__artReady = true; frames = 0; }, 400); });
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
