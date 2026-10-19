/**
 * Elevated pedestrian structures (skywalks, foot-over-bridges) and standalone flyover decks, built
 * from Structure records: a continuous deck following path/elevM (closed rings are sealed),
 * side walls with mesh, a translucent polycarbonate roof on steel ribs for skywalks, instanced
 * steel columns with cap beams, straight stair flights with landings and glazed lift towers.
 * Nothing decorative (people, props) is ever placed on a deck.
 */
import * as THREE from 'three';
import type { Structure, WorldCoreV2 } from '../world/schema';
import type { Quality } from './api';
import { GeoBuilder, PSample, addBox, hex, makeSamples, polyLength, rightOf, sampleAt, sliceSamples, strip, sweep } from './geo';
import { getWorldMats } from './mats';
import { registerCull } from './cull';
import { RoadIndex } from '../world/roadIndex';

export interface StructureObstacle { id: string; poly: [number, number][]; bottom: number; top: number }

const STEEL = hex(0x5d6b78);
const STEEL_LIGHT = hex(0xa9b4bd);
const STEEL_YEL = hex(0xd9a21c);
const TREAD = 0.3;
const RISER = 0.17;
const STAIR_W = 1.8;
const LIFT = 2.3;
const DECK_T = 0.45;

interface StairPlan {
  id: string;
  foot: [number, number];
  top: [number, number];
  dir: [number, number]; // foot -> top
  E: number;
  lift: [number, number] | null;
  landingLen: number;
  /** arclength along the deck where a side-attached flight meets it (null for flights that continue an open end) */
  gapS: number | null;
  connector: [number,number][] | null;
}

interface Layout {
  st: Structure;
  samples: PSample[];
  closed: boolean;
  w: number;
  supports: { x: number; z: number; y: number; qx: number; qz: number; tx: number; tz: number }[];
  stairs: StairPlan[];
}

/* ------------------------------------------------------------------ helpers */

function densify(points: ArrayLike<number>[], elev: ArrayLike<number>, step: number): { pts: [number, number][]; elev: number[] } {
  const pts: [number, number][] = [];
  const el: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const y = elev[i] ?? elev[elev.length - 1] ?? 0;
    pts.push([points[i][0], points[i][1]]); el.push(y);
    if (i < points.length - 1) {
      const dx = points[i + 1][0] - points[i][0], dz = points[i + 1][1] - points[i][1];
      const k = Math.ceil(Math.hypot(dx, dz) / step);
      const y1 = elev[i + 1] ?? y;
      for (let j = 1; j < k; j++) { const t = j / k; pts.push([points[i][0] + dx * t, points[i][1] + dz * t]); el.push(y + (y1 - y) * t); }
    }
  }
  return { pts, elev: el };
}

function nearestOnPath(samples: PSample[], x: number, z: number): { p: PSample; d: number; s: number } {
  let best = { d: Infinity, s: 0 };
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i], b = samples[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
    const d = Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
    if (d < best.d) best = { d, s: a.s + (b.s - a.s) * t };
  }
  return { p: sampleAt(samples, best.s), d: best.d, s: best.s };
}

function orientedBox(b: GeoBuilder, c: [number, number, number], zdir: [number, number, number], ydir: [number, number, number], sx: number, sy: number, sz: number, col: ArrayLike<number>): void {
  const z = new THREE.Vector3(...zdir).normalize();
  let y = new THREE.Vector3(...ydir);
  y = y.sub(z.clone().multiplyScalar(y.dot(z))).normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  const m = new THREE.Matrix4().makeBasis(x, y, z);
  m.setPosition(c[0], c[1], c[2]);
  addBox(b, sx, sy, sz, m, 1, col);
}

type RoadConflict = (x:number,z:number,top?:number)=>boolean;
/** Full physical clearance, including at-grade ends of ramps and explicit supports. */
function roadConflictFn(core: WorldCoreV2): RoadConflict {
  const index=new RoadIndex(core);
  return (x,z,top=Infinity)=>{
    for(const s of index.segmentsNear(x,z)) {
      if(s.road.tunnel || /^(footway|pedestrian|path|steps|cycleway|corridor|track|bridleway)$/.test(s.road.highway))continue;
      const dx=s.bx-s.ax,dz=s.bz-s.az,l2=s.len*s.len||1;
      const t=Math.max(0,Math.min(1,((x-s.ax)*dx+(z-s.az)*dz)/l2));
      const elevation=s.ay+(s.by-s.ay)*t;
      if(elevation>=top || elevation < -.5)continue;
      if(Math.hypot(x-s.ax-dx*t,z-s.az-dz*t)<s.halfWidth+.8)return true;
    }
    return false;
  };
}

function clearRect(onRoad:RoadConflict,center:[number,number],dir:[number,number],start:number,end:number,halfWidth:number,top:number):boolean {
  const nx=-dir[1],nz=dir[0],steps=Math.max(1,Math.ceil((end-start)/.75));
  for(let i=0;i<=steps;i++){
    const along=start+(end-start)*i/steps;
    for(const side of [-1,0,1])if(onRoad(center[0]+dir[0]*along+nx*halfWidth*side,center[1]+dir[1]*along+nz*halfWidth*side,top))return false;
  }
  return true;
}

/** Source access points are estimates; derive a clear flight and visible elevated connector
 * rather than placing a solid stair through a carriageway or dropping only its collider. */
function clearStairPlan(id:string,originalTop:[number,number],originalDir:[number,number],E:number,flight:number,gapS:number|null,preferredSide:number,onRoad:RoadConflict):StairPlan|null {
  const directionAngles=[0,Math.PI/2,-Math.PI/2,Math.PI,Math.PI/4,-Math.PI/4,Math.PI*3/4,-Math.PI*3/4];
  const baseAngle=Math.atan2(-originalDir[1],-originalDir[0]);
  for(const radius of [0,3,6,9,12,16,20,25,32,40])for(let sector=0;sector<(radius===0?1:16);sector++) {
    const angle=baseAngle+sector*Math.PI/8;
    const top:[number,number]=[originalTop[0]+Math.cos(angle)*radius,originalTop[1]+Math.sin(angle)*radius];
    // A flight's top and entire concrete body reach the ground. Checking the given
    // source foot alone cannot establish that the rest of its footprint is clear.
    if(onRoad(top[0],top[1],E))continue;
    for(const turn of directionAngles) {
      const c=Math.cos(turn),sn=Math.sin(turn),dir:[number,number]=[originalDir[0]*c-originalDir[1]*sn,originalDir[0]*sn+originalDir[1]*c];
      const foot:[number,number]=[top[0]-dir[0]*flight,top[1]-dir[1]*flight];
      if(!clearRect(onRoad,foot,dir,0,flight+.8,STAIR_W/2+.15,E))continue;
      let lift:[number,number]|null=null;
      for(const side of [preferredSide,-preferredSide]){
        const lx=top[0]-dir[0]*.5-dir[1]*side*(STAIR_W/2+.9+LIFT/2),lz=top[1]-dir[1]*.5+dir[0]*side*(STAIR_W/2+.9+LIFT/2);
        if(clearRect(onRoad,[lx,lz],dir,-LIFT/2-.2,LIFT/2+.2,LIFT/2+.2,E+1)) {lift=[lx,lz];break;}
      }
      // Apron supports stay beside the clear flight when a lift cannot fit.
      const apronWidth=lift?STAIR_W+.9+LIFT+.2:STAIR_W+.3;
      const side=lift?((lift[0]-top[0])*(-dir[1])+(lift[1]-top[1])*dir[0]>=0?1:-1):1;
      const center:[number,number]=[top[0]+dir[0]*.1-dir[1]*side*(apronWidth/2-STAIR_W/2),top[1]+dir[1]*.1+dir[0]*side*(apronWidth/2-STAIR_W/2)];
      if(!clearRect(onRoad,center,dir,-.7,.7,apronWidth/2,E))continue;
      return {id,foot,top,dir,E,lift,landingLen:1.5,gapS,connector:radius>.1?[originalTop,top]:null};
    }
  }
  return null;
}

function layoutOf(st: Structure, onRoad: RoadConflict): Layout | null {
  if (!st.path || st.path.length < 2) return null;
  const el = st.elevM && st.elevM.length ? st.elevM : st.path.map(() => 5);
  const step = st.kind === 'skywalk' || st.kind === 'footbridge' ? 5 : 10;
  const d = densify(st.path, el, step);
  const first = d.pts[0], last = d.pts[d.pts.length - 1];
  const closed = Math.hypot(first[0] - last[0], first[1] - last[1]) < 2 && d.pts.length > 6;
  if (closed && (first[0] !== last[0] || first[1] !== last[1])) { d.pts.push([first[0], first[1]]); d.elev.push(d.elev[0]); }
  const samples = makeSamples(d.pts, d.elev);
  if (samples.length < 2) return null;
  if (closed) {
    const a = samples[0], z = samples[samples.length - 1];
    const sa = samples[1], sb = samples[samples.length - 2];
    const t1x = sa.x - a.x, t1z = sa.z - a.z, l1 = Math.hypot(t1x, t1z) || 1;
    const t2x = z.x - sb.x, t2z = z.z - sb.z, l2 = Math.hypot(t2x, t2z) || 1;
    let tx = t1x / l1 + t2x / l2, tz = t1z / l1 + t2z / l2;
    const l = Math.hypot(tx, tz) || 1;
    tx /= l; tz /= l;
    const dm = Math.max(0.45, tx * (t1x / l1) + tz * (t1z / l1));
    for (const S of [a, z]) { S.tx = tx; S.tz = tz; S.m = 1 / dm; S.y = (a.y + z.y) / 2; }
  }
  const w = Math.max(2.2, st.widthM || 3);
  const out: Layout = { st, samples, closed, w, supports: [], stairs: [] };

  // supports: given positions, plus auto columns where the given ones leave long gaps
  const L = polyLength(samples);
  const spacing = st.kind === 'skywalk' || st.kind === 'footbridge' ? 22 : 25;
  const taken: [number, number][] = [];
  const addSupport = (x: number, z: number): void => {
    const n = nearestOnPath(samples, x, z);
    let sx=x,sz=z;
    if(onRoad(sx,sz,n.p.y-DECK_T)){
      let placed=false;
      for(const radius of [2,4,6,8,12,16]){
        for(const side of [-1,1]){
          const xx=x-n.p.tz*radius*side,zz=z+n.p.tx*radius*side;
          if(!onRoad(xx,zz,n.p.y-DECK_T)){sx=xx;sz=zz;placed=true;break;}
        }
        if(placed)break;
      }
      if(!placed)return;
    }
    out.supports.push({ x:sx, z:sz, y: n.p.y, qx: n.p.x, qz: n.p.z, tx: n.p.tx, tz: n.p.tz });
    taken.push([n.s, 0]);
  };
  for (const sp of st.supports ?? []) addSupport(sp[0], sp[1]);
  const gap = (s: number): number => {
    let g = Infinity;
    for (const t of taken) {
      let dd = Math.abs(t[0] - s);
      if (closed) dd = Math.min(dd, L - dd);
      g = Math.min(g, dd);
    }
    return g;
  };
  const n = Math.max(1, Math.round(L / spacing));
  const spanOnly = !closed && L <= 42 && (st.supports ?? []).length === 0; // short crossing: clear span, no mid column
  for (let k = 0; k < n && !spanOnly; k++) {
    const s0 = ((k + 0.5) * L) / n;
    for (const off of [0, 3, -3, 6, -6, 9, -9]) {
      const s = Math.max(0, Math.min(L, s0 + off));
      const p = sampleAt(samples, s);
      if (p.y < 2.2 || gap(s) < spacing * 0.75) break;
      if (onRoad(p.x, p.z,p.y-DECK_T)) continue;
      out.supports.push({ x: p.x, z: p.z, y: p.y, qx: p.x, qz: p.z, tx: p.tx, tz: p.tz });
      taken.push([s, 0]);
      break;
    }
  }

  // stairs (+ lift towers). (x,z) is the foot; if it is near/on the deck the flight leaves the deck sideways
  // (or continues the deck at an open end). The flight always ends at the deck edge.
  (st.stairs ?? []).forEach((sr, i) => {
    const q = nearestOnPath(samples, sr.x, sr.z);
    const E = Math.max(2.5, q.p.y);
    const steps = Math.ceil(E / RISER);
    const flight = steps * TREAD + 1.5; // + mid landing
    const hx = -Math.sin(sr.heading), hz = -Math.cos(sr.heading);
    const [rx, rz] = rightOf(q.p.tx, q.p.tz);
    let dir: [number, number];
    let top: [number, number];
    const edge = w / 2 + 0.15;
    const atStart = !closed && q.s < 2.5, atEnd = !closed && q.s > L - 2.5;
    if (q.d < 1.5) {
      if (atStart || atEnd) {
        // flight continues the deck beyond the open end, descending
        const sg = atStart ? -1 : 1;
        dir = [-q.p.tx * sg, -q.p.tz * sg]; // foot -> top points back toward the deck
        top = [q.p.x, q.p.z];
      } else {
        const side = hx * rx + hz * rz >= 0 ? 1 : -1;
        dir = [-rx * side, -rz * side];
        top = [q.p.x + rx * side * edge, q.p.z + rz * side * edge];
      }
    } else {
      const vx = sr.x - q.p.x, vz = sr.z - q.p.z, vl = Math.hypot(vx, vz);
      dir = [-vx / vl, -vz / vl];
      top = [q.p.x + (vx / vl) * edge, q.p.z + (vz / vl) * edge];
      // keep geometry consistent: if the given foot is too close for the rise, use the natural run
    }
    const side = (hx * -dir[1] + hz * dir[0]) >= 0 ? 1 : -1;
    const clear=clearStairPlan(`${st.id}:stairs:${i}`,top,dir,E,flight,q.d<1.5&&(atStart||atEnd)?null:q.s,side,onRoad);
    if(clear)out.stairs.push(clear);
  });
  return out;
}

const layoutCache=new WeakMap<WorldCoreV2,{signature:number;layouts:Layout[]}>();
function layoutsFor(core:WorldCoreV2):Layout[]{
  const signature=core.roads.reduce((sum,r)=>sum+r.widthM+r.elevationM,0);
  const cached=layoutCache.get(core);if(cached?.signature===signature)return cached.layouts;
  const onRoad=roadConflictFn(core),layouts=(core.structures??[]).map(st=>layoutOf(st,onRoad)).filter((l):l is Layout=>!!l);
  layoutCache.set(core,{signature,layouts});return layouts;
}

/* ---------------------------------------------------------------- materials */

interface SMats {
  steel: THREE.MeshStandardMaterial;
  roof: THREE.MeshStandardMaterial;
  mesh: THREE.MeshStandardMaterial;
  liftGlass: THREE.MeshStandardMaterial;
}
const smCache = new Map<Quality, SMats>();
function structMats(q: Quality): SMats {
  let m = smCache.get(q);
  if (m) return m;
  m = {
    steel: new THREE.MeshStandardMaterial({ name: 'struct-steel', vertexColors: true, roughness: 0.55, metalness: 0.55 }),
    roof: new THREE.MeshStandardMaterial({ name: 'polycarbonate-roof', color: 0xbfe0ee, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }),
    mesh: new THREE.MeshStandardMaterial({ name: 'rail-mesh', color: 0xaeb9c2, roughness: 0.4, metalness: 0.4, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
    liftGlass: new THREE.MeshStandardMaterial({ name: 'lift-glass', color: 0x7fb4cf, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }),
  };
  smCache.set(q, m);
  return m;
}

/* ----------------------------------------------------------------- the build */

export function buildStructures(core: WorldCoreV2, quality: Quality): THREE.Group {
  const root = new THREE.Group();
  root.name = 'structures';
  const mats = getWorldMats(quality);
  const sm = structMats(quality);
  const colGeo = new THREE.CylinderGeometry(1, 1.12, 1, quality === 'low' ? 8 : 14, 1);
  colGeo.translate(0, 0.5, 0);
  const capGeo = new THREE.BoxGeometry(1, 1, 1);
  let totalTris = 0;

  for (const lay of layoutsFor(core)) {
    const st=lay.st;
    const g = new THREE.Group();
    g.name = `structure_${st.id}`;
    g.userData.structureId = st.id;
    g.userData.kind = st.kind;
    g.userData.name = st.name;
    g.userData.accessPlanning = { geometryStatus:'provisional',stairs:lay.stairs.length,sourceAccessPoints:st.stairs?.length??0,connectors:lay.stairs.filter(sp=>!!sp.connector).length,lifts:lay.stairs.filter(sp=>!!sp.lift).length,note:'Derived clearance placement; access dimensions and relocated connectors are not street-survey verified.' };
    const { samples, w, closed } = lay;
    const roofed = st.kind === 'skywalk';
    const road = st.kind === 'flyover_deck' || st.kind === 'landmark';
    const hw = w / 2 + (road ? 0.3 : 0.12);
    const concrete = new GeoBuilder();
    const walk = new GeoBuilder();
    const asphalt = new GeoBuilder();
    const steel = new GeoBuilder(true);
    const roof = new GeoBuilder();
    const mesh = new GeoBuilder();
    const lglass = new GeoBuilder();
    const L = polyLength(samples);
    // side walls are opened where a stair flight / lift landing meets the deck
    const gaps = lay.stairs.filter((sp) => sp.gapS !== null).map((sp) => [sp.gapS! - 1.9, sp.gapS! + 1.9] as [number, number]).sort((a, b) => a[0] - b[0]);
    const wallRuns: PSample[][] = [];
    {
      let cur = 0;
      for (const [g0, g1] of gaps) {
        if (g0 > cur + 0.5) wallRuns.push(sliceSamples(samples, cur, Math.max(cur, g0)));
        cur = Math.max(cur, g1);
      }
      if (cur < L - 0.5) wallRuns.push(sliceSamples(samples, cur, L));
      if (!gaps.length) { wallRuns.length = 0; wallRuns.push(samples); }
    }
    const wallSweep = (b: GeoBuilder, prof: [number, number][], o: { sign?: 1 | -1; tile?: number; color?: ArrayLike<number> }): void => {
      for (const run of wallRuns) if (run.length >= 2) sweep(b, run, prof, o);
    };

    // ------------------------------------------------------------- deck
    if (road) {
      const thick = (y: number): number => (y <= 2 ? Math.max(0, y) : Math.max(1.2, 2.0 - (y - 2.0) * (0.8 / 1.2)));
      const prof = (_i: number, p: PSample): [number, number][] => {
        const t = thick(p.y);
        return [[w / 2, 0], [hw, 0], [hw, -t], [-hw, -t], [-hw, 0], [-w / 2, 0]];
      };
      sweep(concrete, samples, prof(0, samples[0]), { sign: -1, tile: 3, profileAt: prof });
      strip(asphalt, samples, -w / 2, w / 2, 0, (x, z) => [x / 8, z / 8]);
      sweep(concrete, samples, [[w / 2, 0], [w / 2, 1.0], [hw, 1.0], [hw, 0]], { tile: 2, sign: -1 });
      sweep(concrete, samples, [[-w / 2, 0], [-w / 2, 1.0], [-hw, 1.0], [-hw, 0]], { tile: 2, sign: 1 });
    } else {
      // walking surface + steel box girder
      strip(walk, samples, -hw, hw, 0.0, (x, z) => [x / 2.5, z / 2.5]);
      const gird: [number, number][] = [[hw + 0.08, 0], [hw + 0.08, -DECK_T], [-hw - 0.08, -DECK_T], [-hw - 0.08, 0]];
      sweep(steel, samples, gird, { sign: -1, tile: 3, color: STEEL });
      // yellow edge beam stripe
      sweep(steel, samples, [[hw + 0.085, -0.06], [hw + 0.085, -0.2]], { sign: -1, tile: 3, color: STEEL_YEL });
      sweep(steel, samples, [[-hw - 0.085, -0.2], [-hw - 0.085, -0.06]], { sign: -1, tile: 3, color: STEEL_YEL });
      // solid lower walls with top rail
      const wallH = roofed ? 1.1 : 0.6;
      wallSweep(steel, [[hw - 0.1, 0], [hw - 0.1, wallH], [hw + 0.04, wallH], [hw + 0.04, 0]], { sign: -1, tile: 2, color: STEEL_LIGHT });
      wallSweep(steel, [[-hw + 0.1, 0], [-hw + 0.1, wallH], [-hw - 0.04, wallH], [-hw - 0.04, 0]], { sign: 1, tile: 2, color: STEEL_LIGHT });
      // mesh/glazing above the wall (two sided translucent)
      const topH = roofed ? 2.45 : 1.6;
      wallSweep(mesh, [[hw - 0.02, wallH], [hw - 0.02, topH]], { tile: 2 });
      wallSweep(mesh, [[-hw + 0.02, wallH], [-hw + 0.02, topH]], { tile: 2 });
      // handrail (top of the mesh) and posts
      wallSweep(steel, [[hw - 0.07, topH], [hw - 0.07, topH + 0.07], [hw + 0.03, topH + 0.07], [hw + 0.03, topH]], { sign: -1, tile: 2, color: STEEL });
      wallSweep(steel, [[-hw + 0.07, topH], [-hw + 0.07, topH + 0.07], [-hw - 0.03, topH + 0.07], [-hw - 0.03, topH]], { sign: 1, tile: 2, color: STEEL });

      if (roofed) {
        // polycarbonate arch roof
        const hwr = hw + 0.15;
        const rise = 1.35;
        const arc: [number, number][] = [];
        const seg = quality === 'low' ? 4 : 10;
        for (let i = 0; i <= seg; i++) {
          const a = (i / seg) * Math.PI;
          arc.push([-hwr * Math.cos(a), topH + 0.02 + Math.sin(a) * rise]);
        }
        sweep(roof, samples, arc, { tile: 3 });
        // steel ribs every ~4 m (6 m on low) + ridge and eave beams
        const ribStep = quality === 'low' ? 8 : quality === 'standard' ? 4.5 : 3;
        const nRib = Math.max(2, Math.round(L / ribStep));
        const rseg = quality === 'low' ? 4 : 8;
        for (let k = closed ? 0 : 0; k <= (closed ? nRib - 1 : nRib); k++) {
          const p = sampleAt(samples, (k / nRib) * L);
          const [rx, rz] = rightOf(p.tx, p.tz);
          let prev: [number, number] | null = null;
          for (let i = 0; i <= rseg; i++) {
            const a = (i / rseg) * Math.PI;
            const r = -hwr * Math.cos(a), y = topH + 0.02 + Math.sin(a) * rise;
            if (prev) {
              const dr = r - prev[0], dy = y - prev[1];
              const len = Math.hypot(dr, dy);
              const cr = (r + prev[0]) / 2, cy = (y + prev[1]) / 2;
              orientedBox(steel, [p.x + rx * cr * p.m, p.y + cy, p.z + rz * cr * p.m], [rx * dr / len, dy / len, rz * dr / len], [p.tx, 0, p.tz], 0.1, 0.1, len + 0.02, STEEL);
            }
            prev = [r, y];
          }
          // posts from deck wall to the arch springing
          if (quality !== 'low') {
            for (const sg of [-1, 1]) addBox(steel, 0.08, topH - 0.0, 0.08, new THREE.Matrix4().makeTranslation(p.x + rx * sg * (hw - 0.02) * p.m, p.y + topH / 2, p.z + rz * sg * (hw - 0.02) * p.m), 1, STEEL);
          }
        }
        // ridge + eave longitudinal beams
        sweep(steel, samples, [[-0.07, topH + 0.02 + rise - 0.02], [0.07, topH + 0.02 + rise - 0.02], [0.07, topH + 0.02 + rise + 0.1], [-0.07, topH + 0.02 + rise + 0.1]], { sign: -1, tile: 3, color: STEEL });
        for (const sg of [-1, 1]) {
          const o = hwr * sg;
          sweep(steel, samples, sg > 0
            ? [[o - 0.08, topH - 0.04], [o + 0.08, topH - 0.04], [o + 0.08, topH + 0.1], [o - 0.08, topH + 0.1]]
            : [[o + 0.08, topH - 0.04], [o - 0.08, topH - 0.04], [o - 0.08, topH + 0.1], [o + 0.08, topH + 0.1]], { sign: sg > 0 ? -1 : 1, tile: 3, color: STEEL });
        }
      }
    }
    // end faces of open decks
    if (!closed) {
      for (const [S, dir] of [[samples[0], -1], [samples[samples.length - 1], 1]] as [PSample, number][]) {
        const [rx, rz] = rightOf(S.tx, S.tz);
        const t = road ? 1.2 : DECK_T;
        const hh = hw + (road ? 0 : 0.08);
        (road ? concrete : steel).quad(
          [S.x + rx * hh * S.m, S.y, S.z + rz * hh * S.m, S.x + rx * hh * S.m, S.y - t, S.z + rz * hh * S.m, S.x - rx * hh * S.m, S.y - t, S.z - rz * hh * S.m, S.x - rx * hh * S.m, S.y, S.z - rz * hh * S.m],
          [0, 1, 0, 0, 1, 0, 1, 1], [S.tx * dir, 0, S.tz * dir], road ? undefined : STEEL);
      }
    }

    // ----------------------------------------------------------- columns
    const cols: { x: number; z: number; h: number; r: number }[] = [];
    const caps: { x: number; y: number; z: number; sx: number; sy: number; sz: number; yaw: number }[] = [];
    const capH = road ? 1.1 : 0.5;
    const deckT = road ? 1.2 : DECK_T;
    for (const sp of lay.supports) {
      const colTop = sp.y - deckT - capH;
      if (colTop < 0.3) continue;
      const r = road ? 0.66 : 0.34;
      cols.push({ x: sp.x, z: sp.z, h: colTop, r });
      const off = Math.hypot(sp.x - sp.qx, sp.z - sp.qz);
      if (off > 0.6) {
        // bracket cap from the column to the deck centre
        const cx = (sp.x + sp.qx) / 2, cz = (sp.z + sp.qz) / 2;
        caps.push({ x: cx, y: sp.y - deckT - capH / 2, z: cz, sx: off + 0.8, sy: capH, sz: 0.9, yaw: Math.atan2(-(sp.qz - sp.z), sp.qx - sp.x) });
      } else {
        caps.push({ x: sp.qx, y: sp.y - deckT - capH / 2, z: sp.qz, sx: w + (road ? 0.4 : 1.4), sy: capH, sz: road ? 1.5 : 0.9, yaw: Math.atan2(-sp.tx, -sp.tz) });
      }
    }

    // ------------------------------------------------------ stairs + lifts
    const concreteS = new GeoBuilder(); // stair body
    const liftFrame = new GeoBuilder(true);
    for (const sp of lay.stairs) {
      const { foot, top, dir, E } = sp;
      if(sp.connector){
        const connector=makeSamples(sp.connector,E),hwC=STAIR_W/2+.15;
        strip(walk,connector,-hwC,hwC,0,(x,z)=>[x/2.5,z/2.5]);
        sweep(steel,connector,[[hwC,0],[hwC,-DECK_T],[-hwC,-DECK_T],[-hwC,0]],{sign:-1,tile:2,color:STEEL});
        for(const side of [-1,1])sweep(steel,connector,[[side*hwC,.1],[side*hwC,1.1]],{tile:2,color:STEEL_LIGHT});
      }
      const n = Math.ceil(E / RISER);
      const rise = E / n;
      const pxv = -dir[1], pzv = dir[0];
      const yaw = Math.atan2(dir[0], dir[1]); // local +Z -> dir
      const half = Math.floor(n / 2);
      // flight A (bottom half) -> landing -> flight B (top half)
      const along = (d: number): [number, number] => [foot[0] + dir[0] * d, foot[1] + dir[1] * d];
      let d = 0;
      for (let i = 0; i < n; i++) {
        if (i === half) d += sp.landingLen; // mid landing handled as a flat solid below
        const yTop = (i + 1) * rise;
        const c = along(d + TREAD / 2);
        const m = new THREE.Matrix4().makeRotationY(yaw);
        m.setPosition(c[0], yTop / 2, c[1]);
        addBox(concreteS, STAIR_W, yTop, TREAD, m, 2, undefined, { bottom: false });
        d += TREAD;
      }
      // mid landing slab (solid)
      {
        const yL = half * rise;
        const c = along(half * TREAD + sp.landingLen / 2);
        const m = new THREE.Matrix4().makeRotationY(yaw);
        m.setPosition(c[0], yL / 2, c[1]);
        addBox(concreteS, STAIR_W, yL, sp.landingLen, m, 2, undefined, { bottom: false });
      }
      const flightLen = n * TREAD + sp.landingLen;
      // top landing apron (steel plate) connecting flight, deck edge and the lift
      {
        const apronL = 1.4;
        const wTot = sp.lift ? STAIR_W + 0.9 + LIFT + 0.2 : STAIR_W + .3;
        const side = (sp.lift ? ((sp.lift[0] - top[0]) * pxv + (sp.lift[1] - top[1]) * pzv >= 0 ? 1 : -1) : 1);
        const cx = top[0] + dir[0] * 0.1 + pxv * side * (wTot / 2 - STAIR_W / 2);
        const cz = top[1] + dir[1] * 0.1 + pzv * side * (wTot / 2 - STAIR_W / 2);
        const m = new THREE.Matrix4().makeRotationY(yaw);
        m.setPosition(cx, E - 0.1, cz);
        addBox(steel, wTot, 0.2, apronL, m, 1, STEEL_LIGHT);
        // two legs to the ground
        for (const sx2 of [-1, 1]) {
          const lx = cx + pxv * sx2 * (wTot / 2 - 0.2) - dir[0] * (apronL / 2 - 0.15), lz = cz + pzv * sx2 * (wTot / 2 - 0.2) - dir[1] * (apronL / 2 - 0.15);
          addBox(steel, 0.22, E - 0.2, 0.22, new THREE.Matrix4().makeTranslation(lx, (E - 0.2) / 2, lz), 1, STEEL);
        }
      }
      // handrails + posts both sides of the flight
      for (const sg of [-1, 1]) {
        const ox = pxv * sg * (STAIR_W / 2 - 0.04), oz = pzv * sg * (STAIR_W / 2 - 0.04);
        // sloped rail for each half
        const rail = (d0: number, d1: number, y0: number, y1: number): void => {
          const a = along(d0), b = along(d1);
          const dx = b[0] - a[0], dz = b[1] - a[1], dy = y1 - y0;
          const len = Math.hypot(dx, dz, dy);
          orientedBox(steel, [(a[0] + b[0]) / 2 + ox, (y0 + y1) / 2 + 1.0, (a[1] + b[1]) / 2 + oz], [dx / len, dy / len, dz / len], [0, 1, 0], 0.06, 0.06, len, STEEL);
        };
        rail(0, half * TREAD, 0, half * rise);
        rail(half * TREAD + sp.landingLen, flightLen, half * rise, E);
        if (quality !== 'low') {
          for (let i = 0; i <= n; i += 4) {
            const dd = i < half ? i * TREAD : i * TREAD + sp.landingLen;
            const a = along(dd);
            addBox(steel, 0.05, 1.0, 0.05, new THREE.Matrix4().makeTranslation(a[0] + ox, i * rise + 0.5, a[1] + oz), 1, STEEL);
          }
        }
      }
      // lift tower
      if (sp.lift) {
        const [lx, lz] = sp.lift;
        const H = E + 0.9;
        const m = new THREE.Matrix4().makeRotationY(yaw);
        m.setPosition(lx, 0.15, lz);
        addBox(concreteS, LIFT + 0.2, 0.3, LIFT + 0.2, m, 2, undefined, { bottom: false });
        for (const cx of [-1, 1]) for (const cz of [-1, 1]) {
          const px = lx + pxv * cx * LIFT / 2 + dir[0] * cz * LIFT / 2, pz = lz + pzv * cx * LIFT / 2 + dir[1] * cz * LIFT / 2;
          addBox(liftFrame, 0.16, H, 0.16, new THREE.Matrix4().makeTranslation(px, H / 2, pz), 1, STEEL);
        }
        // glazing (4 faces) + roof + intermediate rings
        const gm = new THREE.Matrix4().makeRotationY(yaw);
        gm.setPosition(lx, 0.3 + (H - 0.3) / 2, lz);
        addBox(lglass, LIFT - 0.1, H - 0.3, LIFT - 0.1, gm, 2, undefined, { top: false, bottom: false });
        const rm = new THREE.Matrix4().makeRotationY(yaw);
        rm.setPosition(lx, H + 0.1, lz);
        addBox(liftFrame, LIFT + 0.3, 0.2, LIFT + 0.3, rm, 1, STEEL_LIGHT);
        for (const ry of [E * 0.5, E]) {
          const bm = new THREE.Matrix4().makeRotationY(yaw);
          bm.setPosition(lx, ry, lz);
          addBox(liftFrame, LIFT + 0.04, 0.1, LIFT + 0.04, bm, 1, STEEL);
        }
        // ground-floor door (dark panel with yellow frame) facing back along the flight
        const dxn = lx - dir[0] * (LIFT / 2 + 0.01), dzn = lz - dir[1] * (LIFT / 2 + 0.01);
        const dm = new THREE.Matrix4().makeRotationY(yaw);
        dm.setPosition(dxn, 1.1, dzn);
        addBox(liftFrame, 1.3, 2.2, 0.06, dm, 1, [0.1, 0.12, 0.15]);
        const dm2 = new THREE.Matrix4().makeRotationY(yaw);
        dm2.setPosition(dxn - dir[0] * 0.02, 2.3, dzn - dir[1] * 0.02);
        addBox(liftFrame, 1.5, 0.12, 0.06, dm2, 1, STEEL_YEL);
      }
    }
    steel.appendBuilder(liftFrame);

    // ----------------------------------------------------------- emit
    const emit = (b: GeoBuilder, mat: THREE.Material, name: string, cast: boolean): void => {
      if (b.vcount === 0) return;
      const m = new THREE.Mesh(b.build(), mat);
      m.name = name;
      m.castShadow = cast;
      m.receiveShadow = true;
      totalTris += b.idx.length / 3;
      g.add(m);
    };
    emit(walk, mats.paving, 'struct-walkway', false);
    emit(asphalt, mats.asphalt, 'struct-asphalt', false);
    emit(concrete, mats.concrete, 'struct-concrete', true);
    emit(concreteS, mats.concrete, 'struct-stairs', true);
    emit(steel, sm.steel, 'struct-steel', true);
    emit(mesh, sm.mesh, 'struct-rail-mesh', false);
    emit(roof, sm.roof, 'struct-roof', false);
    emit(lglass, sm.liftGlass, 'struct-lift-glass', false);

    if (cols.length) {
      const im = new THREE.InstancedMesh(colGeo, mats.concrete, cols.length);
      im.name = 'struct-columns';
      const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
      cols.forEach((c, i) => { ps.set(c.x, 0, c.z); sc.set(c.r, c.h, c.r); mtx.compose(ps, q.identity(), sc); im.setMatrixAt(i, mtx); });
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = true; im.receiveShadow = true;
      im.computeBoundingSphere();
      g.add(im);
      totalTris += cols.length * (quality === 'low' ? 16 : 28);
    }
    if (caps.length) {
      const im = new THREE.InstancedMesh(capGeo, mats.concrete, caps.length);
      im.name = 'struct-caps';
      const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
      const up = new THREE.Vector3(0, 1, 0);
      caps.forEach((c, i) => { ps.set(c.x, c.y, c.z); q.setFromAxisAngle(up, c.yaw); sc.set(c.sx, c.sy, c.sz); mtx.compose(ps, q, sc); im.setMatrixAt(i, mtx); });
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = true; im.receiveShadow = true;
      im.computeBoundingSphere();
      g.add(im);
      totalTris += caps.length * 12;
    }
    root.add(g);
    registerCull(g);
  }
  root.userData.triangles = totalTris;
  root.userData.sharedGeometries = [colGeo, capGeo];
  return root;
}

/** Collision footprints (columns, stair flights, lift towers) in the same format as stationObstacles. */
export function structureObstacles(core: WorldCoreV2): StructureObstacle[] {
  const out: StructureObstacle[] = [];
  for (const lay of layoutsFor(core)) {
    const st=lay.st;
    const road = st.kind === 'flyover_deck' || st.kind === 'landmark';
    const deckT = road ? 1.2 : DECK_T;
    const capH = road ? 1.1 : 0.5;
    lay.supports.forEach((sp, i) => {
      const top = sp.y - deckT - capH;
      if (top < 0.3) return;
      const r = road ? 0.66 : 0.34;
      const poly: [number, number][] = [];
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + Math.PI / 8; poly.push([sp.x + Math.cos(a) * r * 1.08, sp.z + Math.sin(a) * r * 1.08]); }
      out.push({ id: `${st.id}:column:${i}`, poly, bottom: 0, top: sp.y - deckT });
    });
    for (const sp of lay.stairs) {
      if(sp.connector){
        const a=sp.connector[0],b=sp.connector[1],len=Math.hypot(b[0]-a[0],b[1]-a[1]),nx=-(b[1]-a[1])/len*(STAIR_W/2+.15),nz=(b[0]-a[0])/len*(STAIR_W/2+.15);
        out.push({id:`${sp.id}:connector`,poly:[[a[0]+nx,a[1]+nz],[b[0]+nx,b[1]+nz],[b[0]-nx,b[1]-nz],[a[0]-nx,a[1]-nz]],bottom:sp.E-DECK_T,top:sp.E});
      }
      const [dx, dz] = sp.dir;
      const px = -dz, pz = dx;
      const n = Math.ceil(sp.E / RISER);
      const len = n * TREAD + sp.landingLen;
      const hwS = STAIR_W / 2 + 0.1;
      const rect = (c: [number, number], l0: number, l1: number, hwid: number): [number, number][] => [
        [c[0] + dx * l0 - px * hwid, c[1] + dz * l0 - pz * hwid], [c[0] + dx * l1 - px * hwid, c[1] + dz * l1 - pz * hwid],
        [c[0] + dx * l1 + px * hwid, c[1] + dz * l1 + pz * hwid], [c[0] + dx * l0 + px * hwid, c[1] + dz * l0 + pz * hwid],
      ];
      out.push({ id: sp.id, poly: rect(sp.foot, 0, len, hwS), bottom: 0, top: sp.E });
      if (sp.lift) {
        const h = LIFT / 2 + 0.15;
        out.push({ id: `${sp.id}:lift`, poly: rect(sp.lift, -h, h, h), bottom: 0, top: sp.E + 1.0 });
      }
    }
  }
  return out;
}
