/**
 * Elevated metro viaduct: U-girder deck with parapets and rails, single-pier "T" caps
 * (instanced), and elevated stations (platforms, glazed concourse, curved roof,
 * stairs to both sides, name boards). Geometry follows core.metroLines[*].local and
 * core.metro exactly; stations straddle the nearest alignment point.
 */
import * as THREE from 'three';
import type { WorldCore, MetroStation } from '../world/schema';
import type { Quality } from './api';
import { GeoBuilder, PSample, addBox, hex, boxMatrix, makeSamples, polyLength, sliceSamples, sweep, strip, Profile } from './geo';
import { getWorldMats } from './mats';
import { registerCull } from './cull';
import { createSignTexture } from './sign';
import { createMetroService } from './metroTrains';
import { metroAlignments, type MetroAlignment as Align } from '../world/metroGeometry';
import { stationLayout, stationBodyBoxes, stationRoofProfile, stationRoofObstacles, type StationLayout } from '../world/stationGeometry';
export { metroAlignments } from '../world/metroGeometry';

const SEG_LEN = 360;
interface Zone { align: Align; s0: number; s1: number; station: MetroStation; px: number; pz: number; tx: number; tz: number; plan: StationPlan; layout:StationLayout }
interface StationPlan { stairs: { side: 1 | -1; z: number }[]; columns: { side: 1 | -1; z: number }[] }

const RUN0 = 0.4, RISE0 = 0.26;


function computeZones(core: WorldCore, H: number): { aligns: Align[]; zones: Zone[] } {
  const aligns = metroAlignments(core,H);
  const zones: Zone[] = [];
  for (const st of core.stations) {
    if (!st.inCorridor) continue;
    const layout=stationLayout(core,st,aligns);if(!layout)continue;
    zones.push({align:layout.alignment,s0:layout.alongM-layout.lengthM/2,s1:layout.alongM+layout.lengthM/2,station:st,px:layout.x,pz:layout.z,tx:layout.tx,tz:layout.tz,layout,plan:planStation(core,layout.x,layout.z,layout.tx,layout.tz,H,layout.lengthM,layout.widthM)});
  }
  return { aligns, zones };
}

/** local station frame (x lateral/right, z along travel [local -Z = forward]) to world */
function localToWorld(px: number, pz: number, tx: number, tz: number, lx: number, lz: number): [number, number] {
  const yaw = Math.atan2(-tx, -tz);
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  return [px + lx * c + lz * sn, pz - lx * sn + lz * c];
}

function stairGeometry(H: number): { run: number; bodyBot: number; nSteps: number } {
  const bodyBot = H - 5.4;
  const nSteps = Math.max(2, Math.round(bodyBot / RISE0));
  return { run: nSteps * RUN0, bodyBot, nSteps };
}

/** Ground-reaching parts must stay clear of every carriageway; otherwise they are omitted. */
function planStation(core: WorldCore, px: number, pz: number, tx: number, tz: number, H: number, L:number,W:number): StationPlan {
  const hw = W / 2, hl = L / 2;
  const { run } = stairGeometry(H);
  const segs: { ax: number; az: number; bx: number; bz: number; hw: number }[] = [];
  for (const e of core.roads) {
    if (e.tunnel) continue;
    for (let i = 0; i < e.points.length - 1; i++) {
      const p = e.points[i], q = e.points[i + 1];
      if (Math.min(p[0], q[0]) > px + 200 || Math.max(p[0], q[0]) < px - 200 || Math.min(p[1], q[1]) > pz + 200 || Math.max(p[1], q[1]) < pz - 200) continue;
      segs.push({ ax: p[0], az: p[1], bx: q[0], bz: q[1], hw: e.widthM / 2 });
    }
  }
  const clear = (lx0: number, lx1: number, lz0: number, lz1: number, margin: number): boolean => {
    const nx = Math.max(2, Math.ceil((lx1 - lx0) / 0.7)), nz = Math.max(2, Math.ceil((lz1 - lz0) / 0.7));
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
      const [wx, wz] = localToWorld(px, pz, tx, tz, lx0 + ((lx1 - lx0) * i) / nx, lz0 + ((lz1 - lz0) * j) / nz);
      for (const s of segs) {
        const dx = s.bx - s.ax, dz = s.bz - s.az;
        const l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((wx - s.ax) * dx + (wz - s.az) * dz) / l2));
        if (Math.hypot(wx - (s.ax + dx * t), wz - (s.az + dz * t)) - s.hw < margin) return false;
      }
    }
    return true;
  };
  const plan: StationPlan = { stairs: [], columns: [] };
  for (const side of [-1, 1] as const) {
    const placed: number[] = [];
    for (const z of [-24, 24, -40, 40, -8, 8, -56, 56, -16, 16, -32, 32, -48, 48]) {
      if (placed.length >= 2 || placed.some((q) => Math.abs(q - z) < 9)) continue;
      const xa = side * (hw - 0.1), xb = side * (hw - 0.1 + run);
      if (clear(Math.min(xa, xb), Math.max(xa, xb), z - 1.8, z + 3.3, 1.5)) { placed.push(z); plan.stairs.push({ side, z }); }
    }
    for (let z = -hl + 8; z <= hl - 8 + 0.01; z += 17.5) {
      const x = side * (hw - 1.4);
      if (clear(x - 0.7, x + 0.7, z - 0.7, z + 0.7, 0.3)) plan.columns.push({ side, z });
    }
  }
  return plan;
}

export interface StationObstacle { id: string; poly: [number, number][]; bottom: number; top: number }

/** Shared authored station shells and ground-reaching access/support footprints. */
export function stationObstacles(core: WorldCore): StationObstacle[] {
  const H = core.metro.deckHeightM;
  const { zones } = computeZones(core, H);
  const { run, bodyBot } = stairGeometry(H);
  const out: StationObstacle[] = [];
  for (const z of zones) {
    const hw=z.layout.widthM/2;
    const rect = (lx0: number, lx1: number, lz0: number, lz1: number): [number, number][] =>
      [[lx0, lz0], [lx1, lz0], [lx1, lz1], [lx0, lz1]].map(([lx, lz]) => localToWorld(z.px, z.pz, z.tx, z.tz, lx, lz));
    const a=Math.max(4.2,core.metro.deckWidthM/2),trackX=Math.min(2.3,Math.max(1.75,a*.45));
    for(const box of [...stationBodyBoxes(z.layout.lengthM,z.layout.widthM,H,trackX,z.layout.clearancePortals),...stationRoofObstacles(z.layout.lengthM,z.layout.widthM,H)]){
      out.push({id:`${z.station.id}:${box.id}`,poly:rect(box.x-box.width/2,box.x+box.width/2,box.z-box.length/2,box.z+box.length/2),bottom:box.bottom,top:box.top});
    }
    for (const s of z.plan.stairs) {
      const xa = s.side * (hw - 0.1), xb = s.side * (hw - 0.1 + run);
      out.push({ id: `${z.station.id}:stairs:${s.side}:${s.z}`, poly: rect(Math.min(xa, xb), Math.max(xa, xb), s.z - 1.8, s.z + 3.3), bottom: 0, top: bodyBot + 2.8 });
    }
    for (const c of z.plan.columns) {
      const x = c.side * (hw - 1.4);
      out.push({ id: `${z.station.id}:column:${c.side}:${c.z}`, poly: rect(x - 0.6, x + 0.6, c.z - 0.6, c.z + 0.6), bottom: 0, top: bodyBot });
    }
  }
  return out;
}

export function buildMetro(core: WorldCore, quality: Quality): THREE.Group {
  const mats = getWorldMats(quality);
  const group = new THREE.Group();
  group.name = 'metro';
  const H = core.metro.deckHeightM;
  const a = Math.max(4.2, core.metro.deckWidthM / 2);
  const trackX = Math.min(2.3, Math.max(1.75, a * 0.45));

  const { aligns, zones } = computeZones(core, H);

  const trough: Profile = [
    [-1.9, -2.1], [1.9, -2.1], [a, -0.8], [a, 1.0], [a - 0.45, 1.0], [a - 0.45, 0],
    [-(a - 0.45), 0], [-(a - 0.45), 1.0], [-a, 1.0], [-a, -0.8],
  ];
  const flat: Profile = [[-1.9, -2.1], [1.9, -2.1], [a, -0.8], [a, 0], [-a, 0], [-a, -0.8]];
  const BED = hex(0x5d5c58), RAIL = hex(0xb4bac0);
  const railProfile = (r: number): Profile => [[r - 0.07, 0.02], [r + 0.07, 0.02], [r + 0.07, 0.24], [r - 0.07, 0.24]];

  // ---- split each alignment into culling-friendly pieces, honouring station zones
  const pieceMeshes = new Map<string, { concrete: GeoBuilder; track: GeoBuilder }>();
  const makePiece = (): { concrete: GeoBuilder; track: GeoBuilder } => ({ concrete: new GeoBuilder(), track: new GeoBuilder(true) });
  let pieceId = 0;

  for (const al of aligns) {
    const L = polyLength(al.samples);
    const myZones = zones.filter((z) => z.align === al).sort((p, q) => p.s0 - q.s0);
    const ranges: { s0: number; s1: number; station: boolean }[] = [];
    let cur = 0;
    for (const z of myZones) {
      const s0 = Math.max(0, z.s0), s1 = Math.min(L, z.s1);
      if (s0 > cur) ranges.push({ s0: cur, s1: s0, station: false });
      ranges.push({ s0, s1, station: true });
      cur = Math.max(cur, s1);
    }
    if (cur < L) ranges.push({ s0: cur, s1: L, station: false });
    for (const r of ranges) {
      // cut into <= SEG_LEN chunks
      const n = Math.max(1, Math.ceil((r.s1 - r.s0) / SEG_LEN));
      for (let k = 0; k < n; k++) {
        const s0 = r.s0 + ((r.s1 - r.s0) * k) / n;
        const s1 = r.s0 + ((r.s1 - r.s0) * (k + 1)) / n;
        const part = sliceSamples(al.samples, s0, s1);
        if (part.length < 2) continue;
        const key = `p${pieceId++}`;
        const pm = makePiece();
        pieceMeshes.set(key, pm);
        sweep(pm.concrete, part, r.station ? flat : trough, { tile: 3, caps: true });
        // track bed + 4 rails (two tracks)
        for (const tx of [-trackX, trackX]) {
          strip(pm.track, part, tx - 1.45, tx + 1.45, 0.03, () => [0, 0], BED);
          for (const rr of [tx - 0.7175, tx + 0.7175]) sweep(pm.track, part, railProfile(rr), { tile: 1, caps: true, color: RAIL });
        }
      }
    }
  }

  const emit = (b: GeoBuilder, mat: THREE.Material, name: string, g: THREE.Group, cast = true): void => {
    if (b.vcount === 0) return;
    const m = new THREE.Mesh(b.build(), mat);
    m.name = name;
    m.castShadow = cast;
    m.receiveShadow = true;
    g.add(m);
  };

  const viaduct = new THREE.Group();
  viaduct.name = 'viaduct-deck';
  for (const [key, pm] of pieceMeshes) {
    const g = new THREE.Group();
    g.name = key;
    emit(pm.concrete, mats.paving, 'deck', g);
    emit(pm.track, mats.track, 'track', g, false);
    viaduct.add(g);
    registerCull(g);
  }
  group.add(viaduct);

  // ---- T piers (instanced)
  const capH = 2.1;
  const colTop = Math.max(1, H - 2.1 - capH);
  const colGeo = new THREE.CylinderGeometry(0.95, 1.12, 1, quality === 'low' ? 10 : 20, 1);
  colGeo.translate(0, 0.5, 0);
  const capShape = new THREE.Shape();
  const hw = a + 0.7;
  capShape.moveTo(-1.0, 0);
  capShape.lineTo(1.0, 0);
  capShape.lineTo(1.7, 0.45);
  capShape.lineTo(hw, 1.35);
  capShape.lineTo(hw, capH);
  capShape.lineTo(-hw, capH);
  capShape.lineTo(-hw, 1.35);
  capShape.lineTo(-1.7, 0.45);
  capShape.closePath();
  const capGeo = new THREE.ExtrudeGeometry(capShape, { depth: 2.2, bevelEnabled: quality !== 'low', bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 1, curveSegments: 1 });
  capGeo.translate(0, 0, -1.1);
  // metre-based UVs for the concrete material
  {
    const p = capGeo.getAttribute('position');
    const nrm = capGeo.getAttribute('normal');
    const uv = capGeo.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const ax = Math.abs(nrm.getX(i)), az = Math.abs(nrm.getZ(i));
      if (az > ax) uv.setXY(i, p.getX(i) / 2.5, p.getY(i) / 2.5);
      else uv.setXY(i, p.getZ(i) / 2.5, p.getY(i) / 2.5);
    }
  }
  const pillarBuckets = new Map<string, { x: number; z: number; h: number }[]>();
  for (const p of core.metro.pillars) {
    const key = `${Math.floor(p.x / 500)}_${Math.floor(p.z / 500)}`;
    let arr = pillarBuckets.get(key);
    if (!arr) { arr = []; pillarBuckets.set(key, arr); }
    arr.push({ x: p.x, z: p.z, h: p.heading });
  }
  const m4 = new THREE.Matrix4();
  const q4 = new THREE.Quaternion();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const pillars = new THREE.Group();
  pillars.name = 'pillars';
  for (const [key, list] of pillarBuckets) {
    const cols = new THREE.InstancedMesh(colGeo, mats.paving, list.length);
    const caps = new THREE.InstancedMesh(capGeo, mats.paving, list.length);
    cols.name = `pillar-columns-${key}`;
    caps.name = `pillar-caps-${key}`;
    list.forEach((p, i) => {
      q4.setFromAxisAngle(yAxis, p.h);
      m4.compose(new THREE.Vector3(p.x, 0, p.z), q4, new THREE.Vector3(1, colTop, 1));
      cols.setMatrixAt(i, m4);
      m4.compose(new THREE.Vector3(p.x, H - 2.1 - capH, p.z), q4, new THREE.Vector3(1, 1, 1));
      caps.setMatrixAt(i, m4);
    });
    for (const im of [cols, caps]) {
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = true;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      pillars.add(im);
      registerCull(im);
    }
  }
  group.add(pillars);

  // ---- stations
  const boardJobs: Promise<void>[] = [];
  for (const z of zones) {
    const sg = buildStation(z.station, z.px, z.pz, z.tx, z.tz, H, a, trackX, quality, mats, z.align.color, boardJobs, z.plan, z.layout);
    group.add(sg);
    registerCull(sg);
  }
  group.userData.alignmentCount=aligns.length;
  const service = createMetroService(aligns.map(al => ({ ...al, stations: zones.filter(z => z.align === al).map(z => (z.s0 + z.s1) / 2) })), quality,trackX);
  group.add(service);
  group.userData.nearbySound=0;
  group.userData.update = (time:number,target:THREE.Vector3)=>{service.userData.update(time,target);group.userData.nearbySound=service.userData.nearbySound;};
  group.userData.dispose = service.userData.dispose;
  group.userData.pending = Promise.all(boardJobs).then(() => undefined);
  group.userData.sharedGeometries = [colGeo, capGeo];
  return group;
}

function buildStation(
  st: MetroStation,
  px: number,
  pz: number,
  tx: number,
  tz: number,
  H: number,
  a: number,
  trackX: number,
  quality: Quality,
  mats: ReturnType<typeof getWorldMats>,
  lineColor: string,
  jobs: Promise<void>[],
  plan: StationPlan,
  layout:StationLayout,
): THREE.Group {
  const g = new THREE.Group();
  g.name = `station_${st.id}`;
  g.position.set(px, 0, pz);
  g.rotation.y = Math.atan2(-tx, -tz); // local -Z = direction of travel; local +X = right
  const L = layout.lengthM;
  const W = layout.widthM;
  const hl = L / 2;
  const hw = W / 2;
  const concrete = new GeoBuilder();
  const steel = new GeoBuilder(true);
  const glass = new GeoBuilder();
  const roof = new GeoBuilder();
  const yellow = steel;
  const dark = steel;
  const STEELC = hex(0x8d979f), DARKC = hex(0x2a2d31), YELC = hex(0xe9b92a);

  const pIn = trackX + 1.5;
  const bodyTop = H - 1.5,bodyBot = H - 5.4;
  for(const box of stationBodyBoxes(L,W,H,trackX,layout.clearancePortals)){
    const builder=box.material==='concrete'?concrete:box.material==='glass'?glass:steel;
    addBox(builder,box.width,box.top-box.bottom,box.length,boxMatrix(box.x,(box.top+box.bottom)/2,box.z),box.material==='steel'?1:box.material==='glass'?2:3,box.material==='steel'?STEELC:undefined);
  }
  for(const side of [-1,1])addBox(yellow,.35,.04,L-2,boxMatrix(side*(pIn+.5),H+.92,0),1,YELC);
  // columns under the station body and platform overhangs
  const colR = 0.55;
  const cyl = new THREE.CylinderGeometry(colR, colR * 1.15, bodyBot, 12, 1);
  for (const c of plan.columns) {
    concrete.appendGeometry(cyl, new THREE.Matrix4().makeTranslation(c.side * (hw - 1.4), bodyBot / 2, c.z));
  }
  cyl.dispose();

  // curved roof canopy: thin shell swept along the station length
  const rise = 2.2;
  const roofBase = H + 4.6;
  const arc: Profile = stationRoofProfile(W,H);
  const shell: Profile = arc.concat(arc.slice().reverse().map(([x, y]) => [x, y - 0.35] as [number, number]));
  const roofSamples = makeSamples([[0, -hl], [0, hl]], 0).map((s) => ({ ...s }));
  // sweep runs along +Z; "right" there is -X, symmetric profile so this is fine
  sweep(roof, roofSamples, shell, { tile: 4, caps: true });
  // roof ribs
  for (let z = -hl + 4; z <= hl; z += 14) {
    for (let i = 0; i < arc.length - 1; i++) {
      const p0 = arc[i], p1 = arc[i + 1];
      const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      const ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
      addBox(steel, len, 0.28, 0.35, boxMatrix((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2 - 0.45, z, 0, 0, ang), 1, STEELC);
    }
  }
  // roof supports
  const pillarG = new THREE.CylinderGeometry(0.2, 0.2, 1, 8, 1);
  for (const side of [-1, 1]) for (let z = -hl + 4; z <= hl; z += 14) {
    for (const x of [hw - 0.6, pIn + 0.9]) {
      const u = (side * x) / (hw + 1.2);
      const topY = roofBase + rise * (1 - u * u) - 0.45;
      const botY = H + 0.9;
      const m = new THREE.Matrix4().compose(new THREE.Vector3(side * x, (topY + botY) / 2, z), new THREE.Quaternion(), new THREE.Vector3(1, topY - botY, 1));
      steel.appendGeometry(pillarG, m, STEELC);
    }
  }
  pillarG.dispose();
  // platform benches / screens (cheap detail)
  if (quality !== 'low') {
    for (const side of [-1, 1]) for (let z = -hl + 10; z <= hl - 10; z += 12) {
      addBox(dark, 0.5, 0.45, 2.2, boxMatrix(side * (hw - 2.2), H + 1.15, z), 1, DARKC);
      addBox(glass, 0.06, 1.3, 3.2, boxMatrix(side * (pIn + 0.2), H + 1.55, z + 6), 1);
    }
  }

  // Waiting passengers and platform furniture remain above the clear carriageway.
  // Individuals are generic presentation actors, not surveyed crowd positions.
  const skin = hex(0xb87d55);
  const headGeo = new THREE.SphereGeometry(0.13, 6, 4);
  for (const side of [-1, 1]) {
    for (let k = 0; k < (quality === 'low' ? 5 : 13); k++) {
      const z = -hl + 9 + k * (L - 20) / (quality === 'low' ? 5 : 13);
      const x = side * (pIn + 1.3 + (k % 3) * 0.55);
      const y = H + 0.94;
      addBox(steel, .32, .62, .22, boxMatrix(x, y + .9, z), 1, hex([0xb95c37, 0x277a86, 0xd9c26d, 0x687190, 0x734361][k % 5]));
      for (const dx of [-.09,.09]) addBox(dark,.1,.58,.13,boxMatrix(x+dx,y+.29,z),1,DARKC);
      steel.appendGeometry(headGeo,boxMatrix(x,y+1.38,z),skin);
    }
    // Ticket gates and wide concourse circulation underneath the platform.
    for (let k = 0; k < 5; k++) {
      const x=side*(hw-3), z=-5+k*1.6;
      if(layout.clearancePortals.some(p=>x+.8>p.x0&&x-.8<p.x1&&z+.7>p.z0&&z-.7<p.z1&&bodyBot+1.5>p.bottom&&bodyBot<p.top))continue;
      addBox(steel,1.3,.95,.28,boxMatrix(x,bodyBot+1,z),1,STEELC);
      addBox(glass,.06,.5,.6,boxMatrix(x,bodyBot+1.25,z+.42),1);
    }
    for(let z=-hl+12;z<hl;z+=24) {
      addBox(dark,.12,1.7,.12,boxMatrix(side*(hw-1.8),H+1.8,z),1,DARKC);
      addBox(dark,.85,.5,2.4,boxMatrix(side*(hw-1.8),H+2.5,z),1,DARKC);
      addBox(yellow,.87,.07,2.42,boxMatrix(side*(hw-1.8),H+2.68,z),1,YELC);
    }
  }
  headGeo.dispose();

  // stairs / escalators down to the street on both sides
  const rise0 = RISE0, run0 = RUN0;
  const nSteps = Math.max(2, Math.round(bodyBot / rise0));
  const rise1 = bodyBot / nSteps;
  const stairShape = new THREE.Shape();
  stairShape.moveTo(0, bodyBot);
  for (let i = 0; i < nSteps; i++) {
    stairShape.lineTo(i * run0 + run0, bodyBot - i * rise1);
    stairShape.lineTo(i * run0 + run0, bodyBot - (i + 1) * rise1);
  }
  stairShape.lineTo(nSteps * run0, 0);
  stairShape.lineTo(0, bodyBot - 0.8);
  stairShape.closePath();
  const stairGeo = new THREE.ExtrudeGeometry(stairShape, { depth: 2.6, bevelEnabled: false, curveSegments: 1 });
  stairGeo.translate(0, 0, -1.3);
  {
    const p = stairGeo.getAttribute('position');
    const nrm = stairGeo.getAttribute('normal');
    const uv = stairGeo.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      if (Math.abs(nrm.getZ(i)) > 0.5) uv.setXY(i, p.getX(i) / 3, p.getY(i) / 3);
      else uv.setXY(i, p.getZ(i) / 3, (p.getX(i) + p.getY(i)) / 3);
    }
  }
  const run = nSteps * run0;
  const slope = Math.atan2(bodyBot, run);
  for (const { side, z } of plan.stairs) {
    const m = new THREE.Matrix4();
    // stairs start at the glazed wall and descend outward
    const x0 = side * (hw - 0.1);
    m.compose(new THREE.Vector3(x0, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), side > 0 ? 0 : Math.PI), new THREE.Vector3(1, 1, 1));
    concrete.appendGeometry(stairGeo, m);
    // handrails + cover
    for (const dz of [-1.35, 1.35]) {
      const rl = Math.hypot(run, bodyBot);
      addBox(steel, rl, 0.08, 0.08, boxMatrix(x0 + side * (run / 2), bodyBot / 2 + 1.0, z + dz, 0, 0, side > 0 ? -slope : slope), 1, STEELC);
    }
    const rl = Math.hypot(run, bodyBot);
    addBox(roof, rl, 0.14, 3.3, boxMatrix(x0 + side * (run / 2), bodyBot / 2 + 2.6, z, 0, 0, side > 0 ? -slope : slope), 3);
    for (const t of [0.15, 0.55, 0.95]) {
      for (const dz of [-1.6, 1.6]) {
        const yy = bodyBot * (1 - t);
        addBox(steel, 0.12, 2.6, 0.12, boxMatrix(x0 + side * run * t, yy + 1.3, z + dz), 1, STEELC);
      }
    }
    // escalator box alongside stairs
    addBox(dark, rl, 0.55, 1.1, boxMatrix(x0 + side * (run / 2), bodyBot / 2 + 0.1, z + 2.6, 0, 0, side > 0 ? -slope : slope), 1, DARKC);
  }
  stairGeo.dispose();

  const add = (b: GeoBuilder, mat: THREE.Material, name: string, cast: boolean): void => {
    if (b.vcount === 0) return;
    const m = new THREE.Mesh(b.build(), mat);
    m.name = name;
    m.castShadow = cast;
    m.receiveShadow = true;
    g.add(m);
  };
  add(concrete, mats.concrete, 'station-concrete', true);
  add(steel, mats.stationSteel, 'station-steel', true);
  add(roof, mats.stationRoof, 'station-roof', true);
  add(glass, mats.stationGlass, 'station-glass', false);

  // name boards: both long sides + both roof ends, merged into one mesh sharing one material
  const boardMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(lineColor), toneMapped: false });
  const boardB = new GeoBuilder();
  const addBoard = (x: number, y: number, z: number, ry: number, w: number, h: number): void => {
    const c = Math.cos(ry), sn = Math.sin(ry);
    // plane facing +Z rotated about Y by ry
    const pts: number[] = [];
    for (const [lx, ly] of [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]) pts.push(x + lx * c, y + ly, z - lx * sn);
    boardB.quad(pts, [0, 0, 1, 0, 1, 1, 0, 1], [sn, 0, c]);
  };
  for (const side of [-1, 1]) for (const z of [-22, 22]) addBoard(side * (hw + 0.1), bodyTop + 1.1, z, side > 0 ? Math.PI / 2 : -Math.PI / 2, 16, 2.0);
  for (const end of [-1, 1]) addBoard(0, roofBase + 0.2, end * (hl + 0.2), end > 0 ? 0 : Math.PI, 8, 1.0);
  const boardMesh = new THREE.Mesh(boardB.build(), boardMat);
  boardMesh.name = 'station-name-boards';
  g.add(boardMesh);
  const lines: { text: string; lang: 'en' | 'te' }[] = [{ text: st.name, lang: 'en' }];
  if (st.nameTe) lines.push({ text: st.nameTe, lang: 'te' });
  jobs.push(
    createSignTexture(lines, { bg: lineColor, fg: '#ffffff', width: quality === 'high' ? 2048 : 1024, height: quality === 'high' ? 256 : 128 })
      .then((tex) => {
        boardMat.map = tex;
        boardMat.color.set(0xffffff);
        boardMat.needsUpdate = true;
      })
      .catch(() => undefined),
  );
  g.userData.stationId = st.id;
  g.userData.horizontalEnvelope={lengthM:L,widthM:W,basis:layout.basis,sourceFeatureId:layout.sourceFeatureId,status:'provisional',unappliedReason:layout.unappliedReason};
  g.userData.verticalGeometry='authored_provisional';
  g.userData.clearancePortals=layout.clearancePortals;
  return g;
}
