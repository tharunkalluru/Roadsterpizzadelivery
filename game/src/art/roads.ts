/**
 * Road network builder. Every ribbon is generated directly from RoadEdge.points,
 * widthM and pointElevM, so visuals stay on the same centrelines used by physics.
 * Geometry is bucketed into spatial tiles (for frustum culling) and merged per
 * material inside each tile.
 */
import * as THREE from 'three';
import type { RoadEdge, WorldCore } from '../world/schema';
import type { Quality } from './api';
import {
  GeoBuilder,
  hex,
  PSample,
  addHorizontalPolygon,
  makeSamples,
  polyLength,
  sampleAt,
  sliceSamples,
  strip,
  sweep,
  rightOf,
} from './geo';
import { getWorldMats } from './mats';
import { registerCull } from './cull';

const TILE = 480;
const VERGE_COL = [0.075, 0.066, 0.055];

/** Soft packed-earth darkening beside kerbs (alpha fades out over 7 m) so the ground reads as trafficked urban earth. */
function addVerge(b: GeoBuilder, part: PSample[], inner: number): void {
  const outer = inner + 7;
  const y = 0.004;
  for (let i = 0; i < part.length - 1; i++) {
    const A = part[i], B = part[i + 1];
    for (const sgn of [-1, 1]) {
      const [ax, az] = rightOf(A.tx, A.tz), [bx, bz] = rightOf(B.tx, B.tz);
      const i0 = b.vert(A.x + ax * inner * sgn * A.m, A.y + y, A.z + az * inner * sgn * A.m, 0, 1, 0, 0, 0, [...VERGE_COL, 0.55]);
      const i1 = b.vert(A.x + ax * outer * sgn * A.m, A.y + y, A.z + az * outer * sgn * A.m, 0, 1, 0, 0, 0, [...VERGE_COL, 0]);
      const i2 = b.vert(B.x + bx * outer * sgn * B.m, B.y + y, B.z + bz * outer * sgn * B.m, 0, 1, 0, 0, 0, [...VERGE_COL, 0]);
      const i3 = b.vert(B.x + bx * inner * sgn * B.m, B.y + y, B.z + bz * inner * sgn * B.m, 0, 1, 0, 0, 0, [...VERGE_COL, 0.55]);
      if (sgn > 0) { b.tri(i0, i2, i1); b.tri(i0, i3, i2); } else { b.tri(i0, i1, i2); b.tri(i0, i2, i3); }
    }
  }
}
const PED_CLASSES = new Set(['footway', 'pedestrian', 'path', 'steps', 'cycleway', 'bridleway', 'corridor', 'track']);
const SKIP_MARK = new Set(['service', 'living_street', 'footway', 'pedestrian', 'path', 'steps', 'cycleway', 'track', 'bridleway', 'corridor']);

const DECK_MIN = 0.3;
const BEAM = 0.3;
const PARAPET = 1.0;
const PIER_SPACING = 25;

/** slab thickness under the deck surface at elevation y: solid ramp to ~2 m, 1.2 m deck from ~3.2 m up */
function slabThickness(y: number): number {
  if (y <= 2.0) return Math.max(0, y);
  return Math.max(1.2, 2.0 - (y - 2.0) * (0.8 / 1.2));
}

function densify(points: ArrayLike<ArrayLike<number>>, elev: ArrayLike<number>, maxStep: number): { pts: [number, number][]; elev: number[] } {
  const pts: [number, number][] = [];
  const el: number[] = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const x = points[i][0], z = points[i][1], y = elev[i] ?? 0;
    pts.push([x, z]); el.push(y);
    if (i < n - 1) {
      const dx = points[i + 1][0] - x, dz = points[i + 1][1] - z;
      const k = Math.ceil(Math.hypot(dx, dz) / maxStep);
      const y1 = elev[i + 1] ?? 0;
      for (let j = 1; j < k; j++) { const t = j / k; pts.push([x + dx * t, z + dz * t]); el.push(y + (y1 - y) * t); }
    }
  }
  return { pts, elev: el };
}

/** end face of the slab (closed box section) */
function endFace(b: GeoBuilder, S: PSample, dir: number, hw: number, t: number): void {
  if (t < 0.02) return;
  const [rx, rz] = rightOf(S.tx, S.tz);
  const P = [
    S.x + rx * hw * S.m, S.y, S.z + rz * hw * S.m,
    S.x + rx * hw * S.m, S.y - t, S.z + rz * hw * S.m,
    S.x - rx * hw * S.m, S.y - t, S.z - rz * hw * S.m,
    S.x - rx * hw * S.m, S.y, S.z - rz * hw * S.m,
  ];
  b.quad(P, [0, 1, 0, 0, 1, 0, 1, 1], [S.tx * dir, 0, S.tz * dir]);
}

/** end faces of both barriers at a sample */
function endFace2(b: GeoBuilder, S: PSample, dir: number, a: number, hw: number, h: number): void {
  const [rx, rz] = rightOf(S.tx, S.tz);
  for (const sg of [-1, 1]) {
    const P = [
      S.x + rx * a * sg * S.m, S.y, S.z + rz * a * sg * S.m,
      S.x + rx * hw * sg * S.m, S.y, S.z + rz * hw * sg * S.m,
      S.x + rx * hw * sg * S.m, S.y + h, S.z + rz * hw * sg * S.m,
      S.x + rx * a * sg * S.m, S.y + h, S.z + rz * a * sg * S.m,
    ];
    b.quad(P, [0, 0, 1, 0, 1, 1, 0, 1], [S.tx * dir, 0, S.tz * dir]);
  }
}

/** Give two consecutive edges one shared frame at their common node so decks meet without a seam. */
function joinPair(a: { info: { samples: PSample[] }; start: boolean }, b: { info: { samples: PSample[] }; start: boolean }): void {
  const dirInto = (x: { info: { samples: PSample[] }; start: boolean }): [number, number] => {
    const sm = x.info.samples;
    const p = x.start ? sm[0] : sm[sm.length - 1];
    const q = x.start ? sm[1] : sm[sm.length - 2];
    const dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz) || 1;
    return [dx / l, dz / l];
  };
  const da = dirInto(a), db = dirInto(b);
  let tx = db[0] - da[0], tz = db[1] - da[1];
  const l = Math.hypot(tx, tz);
  if (l < 0.2) return; // near U-turn: leave as is
  tx /= l; tz /= l;
  const apply = (x: { info: { samples: PSample[] }; start: boolean }, d: [number, number], approach: boolean): void => {
    const sm = x.info.samples;
    const S = x.start ? sm[0] : sm[sm.length - 1];
    // tangent must follow increasing arclength: away from node at a start, toward it at an end
    const towardNode = approach ? 1 : -1; // T points toward the node for edge a (approach), away for edge b
    const sgn = x.start ? -towardNode : towardNode;
    S.tx = tx * sgn; S.tz = tz * sgn;
    const along = Math.abs(S.tx * d[0] + S.tz * d[1]);
    S.m = 1 / Math.max(0.45, along);
  };
  apply(a, da, true);
  apply(b, db, false);
}

interface Tile {
  asphalt: GeoBuilder;
  paving: GeoBuilder;
  concrete: GeoBuilder;
  white: GeoBuilder;
  columns: number[]; // x,z,height,radius
  caps: number[]; // x,z,y,width,heading(yaw),depth
  verge: GeoBuilder;
}

function newTile(): Tile {
  return { asphalt: new GeoBuilder(), paving: new GeoBuilder(), concrete: new GeoBuilder(), white: new GeoBuilder(true), columns: [], caps: [], verge: new GeoBuilder(true, 4) };
}

export interface RoadBuildInfo {
  tiles: number;
  edges: number;
  junctions: number;
}

export function buildRoads(core: WorldCore, quality: Quality): THREE.Group {
  const mats = getWorldMats(quality);
  const group = new THREE.Group();
  group.name = 'roads';
  const tiles = new Map<string, Tile>();
  const tileFor = (x: number, z: number): Tile => {
    const key = `${Math.floor(x / TILE)}_${Math.floor(z / TILE)}`;
    let t = tiles.get(key);
    if (!t) { t = newTile(); tiles.set(key, t); }
    return t;
  };

  const nodeById = new Map(core.nodes.map((n) => [n.id, n]));
  const roadById = new Map<string, RoadEdge>();
  for (const r of core.roads) roadById.set(r.id, r);

  // ---- per-edge preprocessing: samples (elevated edges densified so the deck follows every point),
  //      deck classification, shared frames at nodes so consecutive edges join without seams
  interface EInfo { e: RoadEdge; samples: PSample[]; deck: boolean; ped: boolean; maxElev: number }
  const infos = new Map<string, EInfo>();
  for (const e of core.roads) {
    if (e.tunnel || e.points.length < 2) continue;
    const maxElev = Math.max(...e.pointElevM, 0);
    const ped = PED_CLASSES.has(e.highway);
    const deck = !ped && maxElev > DECK_MIN;
    let samples: PSample[];
    if (deck) {
      const d = densify(e.points, e.pointElevM, 10);
      samples = makeSamples(d.pts, d.elev);
    } else samples = makeSamples(e.points, e.pointElevM);
    if (samples.length < 2) continue;
    infos.set(e.id, { e, samples, deck, ped, maxElev });
  }
  {
    const ends = new Map<string, { info: EInfo; start: boolean }[]>();
    for (const info of infos.values()) {
      if (info.ped || info.e.fromNode === info.e.toNode) continue;
      for (const [nid, start] of [[info.e.fromNode, true], [info.e.toNode, false]] as [string, boolean][]) {
        const arr = ends.get(nid);
        if (arr) arr.push({ info, start }); else ends.set(nid, [{ info, start }]);
      }
    }
    for (const arr of ends.values()) {
      if (arr.length !== 2 || !(arr[0].info.deck || arr[1].info.deck)) continue;
      joinPair(arr[0], arr[1]);
    }
  }

  // ---- ramp zones: where a solid ramp already rises above ground, at-grade footpaths/markings are not drawn
  const rampGrid = new Map<string, { x: number; z: number; r: number }[]>();
  const RC = 12;
  for (const info of infos.values()) {
    if (!info.deck) continue;
    const r = info.e.widthM / 2 + 1.2;
    for (const p of info.samples) {
      if (p.y < 0.2 || p.y > 2.6) continue;
      const key = `${Math.floor(p.x / RC)}_${Math.floor(p.z / RC)}`;
      const l = rampGrid.get(key);
      if (l) l.push({ x: p.x, z: p.z, r }); else rampGrid.set(key, [{ x: p.x, z: p.z, r }]);
    }
  }
  const inRamp = (x: number, z: number): boolean => {
    if (rampGrid.size === 0) return false;
    const cx = Math.floor(x / RC), cz = Math.floor(z / RC);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const l = rampGrid.get(`${cx + i}_${cz + j}`);
      if (l) for (const q of l) if (Math.hypot(q.x - x, q.z - z) < q.r + 1) return true;
    }
    return false;
  };
  /** split a sample run into the parts that are clear of ramp zones */
  const clearRuns = (part: PSample[]): PSample[][] => {
    if (rampGrid.size === 0 || part.length < 2) return part.length >= 2 ? [part] : [];
    const L0 = part[part.length - 1].s - part[0].s;
    const n = Math.max(2, Math.ceil(L0 / 3));
    const runs: PSample[][] = [];
    let cur: PSample[] = [];
    for (let i = 0; i <= n; i++) {
      const p = sampleAt(part, part[0].s + (L0 * i) / n);
      if (inRamp(p.x, p.z)) { if (cur.length >= 2) runs.push(cur); cur = []; } else cur.push(p);
    }
    if (cur.length >= 2) runs.push(cur);
    return runs;
  };

  // ---- crossing at-grade roads (piers must not stand in a carriageway)
  const gradeGrid = new Map<string, { ax: number; az: number; bx: number; bz: number; tx: number; tz: number; hw: number }[]>();
  const GC = 30;
  for (const info of infos.values()) {
    if (info.deck || info.ped || info.maxElev > 0.45) continue;
    const pts = info.e.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1];
      const l = Math.hypot(dx, dz);
      if (l < 0.5) continue;
      const seg = { ax: pts[i][0], az: pts[i][1], bx: pts[i + 1][0], bz: pts[i + 1][1], tx: dx / l, tz: dz / l, hw: info.e.widthM / 2 };
      const x0 = Math.floor(Math.min(seg.ax, seg.bx) / GC), x1 = Math.floor(Math.max(seg.ax, seg.bx) / GC);
      const z0 = Math.floor(Math.min(seg.az, seg.bz) / GC), z1 = Math.floor(Math.max(seg.az, seg.bz) / GC);
      for (let a = x0; a <= x1; a++) for (let b2 = z0; b2 <= z1; b2++) {
        const k = `${a}_${b2}`;
        const g = gradeGrid.get(k);
        if (g) g.push(seg); else gradeGrid.set(k, [seg]);
      }
    }
  }
  const pierConflict = (x: number, z: number, tx: number, tz: number): boolean => {
    const segs = gradeGrid.get(`${Math.floor(x / GC)}_${Math.floor(z / GC)}`);
    if (!segs) return false;
    for (const sg of segs) {
      const dx = sg.bx - sg.ax, dz = sg.bz - sg.az;
      const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - sg.ax) * dx + (z - sg.az) * dz) / l2));
      const d = Math.hypot(x - (sg.ax + dx * t), z - (sg.az + dz * t));
      if (d < sg.hw + 1.1 && Math.abs(tx * sg.tz - tz * sg.tx) > 0.42) return true;
    }
    return false;
  };

  // node radii (junction fills) and elevations
  const nodeInfo = new Map<string, { x: number; z: number; y: number; r: number; junction: boolean; raised: boolean }>();
  for (const n of core.nodes) {
    let maxW = 0;
    let y = Infinity;
    let yMax = 0;
    for (const eid of n.edges) {
      const e = roadById.get(eid);
      if (!e || e.tunnel) continue;
      maxW = Math.max(maxW, e.widthM);
      const isStart = e.fromNode === n.id;
      const ye = e.pointElevM[isStart ? 0 : e.pointElevM.length - 1] ?? 0;
      y = Math.min(y, ye);
      yMax = Math.max(yMax, ye);
    }
    if (!isFinite(y)) y = 0;
    nodeInfo.set(n.id, { x: n.x, z: n.z, y, r: n.isJunction ? maxW * 0.5 * 1.18 : 0, junction: n.isJunction, raised: yMax > DECK_MIN });
  }

  const segs = quality === 'low' ? 20 : 32;
  const uvAsphalt = (x: number, z: number): [number, number] => [x / 8, z / 8];
  const uvPaving = (x: number, z: number): [number, number] => [x / 2.5, z / 2.5];

  // ---- junction fills
  let junctions = 0;
  for (const [, ni] of nodeInfo) {
    if (!ni.junction || ni.r <= 0 || ni.raised) continue;
    junctions++;
    const poly: [number, number][] = [];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      poly.push([ni.x + Math.cos(a) * ni.r, ni.z + Math.sin(a) * ni.r]);
    }
    addHorizontalPolygon(tileFor(ni.x, ni.z).asphalt, poly, undefined, ni.y, uvAsphalt);
  }

  const zebraAndBars = quality !== 'low' || true;
  let edgeCount = 0;

  for (const info of infos.values()) {
    const { e, samples, deck: elevated, ped, maxElev } = info;
    edgeCount++;
    const L = polyLength(samples);
    const mid = sampleAt(samples, L / 2);
    const tile = tileFor(mid.x, mid.z);
    const w = Math.max(1.5, e.widthM);

    if (ped) {
      strip(tile.paving, samples, -w / 2, w / 2, 0, (x, z) => uvPaving(x, z));
      continue;
    }
    strip(tile.asphalt, samples, -w / 2, w / 2, 0, (x, z) => uvAsphalt(x, z));

    const fromN = nodeInfo.get(e.fromNode);
    const toN = nodeInfo.get(e.toNode);
    const rj0 = fromN?.junction && !fromN.raised ? fromN.r : 0;
    const rj1 = toN?.junction && !toN.raised ? toN.r : 0;

    // ------------------------------------------------ footpaths / kerbs
    if (!elevated) {
      const fw = w >= 7 ? 1.8 : 1.0;
      const kh = 0.16;
      const s0 = rj0 > 0 ? rj0 + 0.6 : 0;
      const s1 = L - (rj1 > 0 ? rj1 + 0.6 : 0);
      for (const part of clearRuns(sliceSamples(samples, s0, s1))) {
        if (quality !== 'low') addVerge(tile.verge, part, w / 2 + fw);
        if (quality === 'low') {
          // cheap kerb: inner face + top only, no end caps
          sweep(tile.paving, part, [[w / 2, 0], [w / 2, kh], [w / 2 + fw, kh]], { tile: 2.5, sign: -1 });
          sweep(tile.paving, part, [[-w / 2, 0], [-w / 2, kh], [-w / 2 - fw, kh]], { tile: 2.5, sign: 1 });
        } else {
          sweep(tile.paving, part, [[w / 2 + fw, 0], [w / 2 + fw, kh], [w / 2, kh], [w / 2, 0]], { tile: 2.5, caps: true });
          sweep(tile.paving, part, [[-w / 2, 0], [-w / 2, kh], [-w / 2 - fw, kh], [-w / 2 - fw, 0]], { tile: 2.5, caps: true });
        }
      }
    } else {
      // ---------------------------------------------- bridge / ramp deck
      // Continuous slab following every (densified) sample's elevation: solid ramp near the
      // ground, 1.2 m deck once clear of it. Margins (beside the carriageway) are part of the slab,
      // so there is no see-through gap, and the profile is closed with an underside.
      const hw = w / 2 + BEAM;
      const slabProfile = (_i: number, p: PSample): [number, number][] => {
        const t = slabThickness(p.y);
        return [[w / 2, 0], [hw, 0], [hw, -t], [-hw, -t], [-hw, 0], [-w / 2, 0]];
      };
      sweep(tile.concrete, samples, slabProfile(0, samples[0]), { sign: -1, tile: 3, profileAt: slabProfile });
      // free ends (nothing continues past them) get an end face
      const cont = (nid: string): boolean => {
        const n = nodeById.get(nid);
        return !!n && n.edges.some((id) => id !== e.id && infos.has(id) && !infos.get(id)!.ped);
      };
      const contStart = cont(e.fromNode), contEnd = cont(e.toNode);
      if (!contStart && samples[0].y > 0.05) endFace(tile.concrete, samples[0], -1, hw, slabThickness(samples[0].y));
      if (!contEnd && samples[samples.length - 1].y > 0.05) endFace(tile.concrete, samples[samples.length - 1], 1, hw, slabThickness(samples[samples.length - 1].y));
      // parapets along the raised part (continuous across edges; closed profile incl. inner face)
      const runs: PSample[][] = [];
      let cur: PSample[] = [];
      for (const p of samples) {
        if (p.y >= 0.25) cur.push(p); else { if (cur.length >= 2) runs.push(cur); cur = []; }
      }
      if (cur.length >= 2) runs.push(cur);
      for (const run of runs) {
        sweep(tile.concrete, run, [[w / 2, 0], [w / 2, PARAPET], [hw, PARAPET], [hw, 0]], { tile: 2, sign: -1 });
        sweep(tile.concrete, run, [[-w / 2, 0], [-w / 2, PARAPET], [-hw, PARAPET], [-hw, 0]], { tile: 2, sign: 1 });
        // coping strip on top of the barrier is part of the profile above; end faces where the barrier stops
        if (run[0] !== samples[0] || !contStart) endFace2(tile.concrete, run[0], -1, w / 2, hw, PARAPET);
        if (run[run.length - 1] !== samples[samples.length - 1] || !contEnd) endFace2(tile.concrete, run[run.length - 1], 1, w / 2, hw, PARAPET);
      }
      // piers (~25 m) wherever the underside is clear of the ground; never in a crossing carriageway
      if (maxElev > 2.5) {
        const n = Math.max(1, Math.round(L / PIER_SPACING));
        for (let k = 0; k < n; k++) {
          let s = ((k + 0.5) * L) / n;
          let p = sampleAt(samples, s);
          for (const off of [0, 4, -4, 8, -8]) {
            const q = sampleAt(samples, Math.max(0, Math.min(L, s + off)));
            if (!pierConflict(q.x, q.z, q.tx, q.tz)) { p = q; s += off; break; }
          }
          const t = slabThickness(p.y);
          const capH = 1.1;
          const colTop = p.y - t - capH;
          if (colTop < 0.4) continue;
          const yaw = Math.atan2(-p.tx, -p.tz); // local +X of the cap box = lateral (right) direction
          const [rx, rz] = rightOf(p.tx, p.tz);
          if (w > 11) {
            for (const sg of [-1, 1]) tile.columns.push(p.x + rx * sg * w * 0.24, p.z + rz * sg * w * 0.24, colTop, 0.62);
          } else tile.columns.push(p.x, p.z, colTop, 0.66);
          tile.caps.push(p.x, p.z, p.y - t - capH / 2, Math.max(2.2, w * 0.86), yaw, 1.5);
        }
      }
    }

    // --------------------------------------------------- markings
    const wide = w >= 5.2;
    if (!wide || SKIP_MARK.has(e.highway)) continue;
    const cutA = rj0 > 0 ? rj0 + 5.4 : 0;
    const cutB = L - (rj1 > 0 ? rj1 + 5.4 : 0);
    const mkAll = sliceSamples(samples, cutA, cutB);
    const mk = elevated ? mkAll : (clearRuns(mkAll)[0] ?? []);
    const white = tile.white;
    const WHT = hex(0xe9e8df), YEL = hex(0xe9b92a);
    const dy = 0.018;
    const uvZero = (): [number, number] => [0, 0];
    // edge lines
    if (w >= 6 && mk.length >= 2) {
      const lw = 0.12;
      const eo = w / 2 - 0.35;
      strip(white, mk, eo - lw / 2, eo + lw / 2, dy, uvZero, WHT);
      strip(white, mk, -eo - lw / 2, -eo + lw / 2, dy, uvZero, WHT);
    }
    const lanes = e.lanes ?? Math.max(1, Math.round(w / 3.4));
    const dash = (r: number, ww: number, on: number, off: number, col: ArrayLike<number>): void => {
      if (mk.length < 2) return;
      const total = mk[mk.length - 1].s - mk[0].s;
      const s0 = mk[0].s;
      const period = on + off;
      const count = Math.floor(total / period);
      for (let i = 0; i < count; i++) {
        const a = s0 + i * period + off * 0.5;
        const part = sliceSamples(mk, a, a + on);
        if (part.length >= 2) strip(white, part, r - ww / 2, r + ww / 2, dy, uvZero, col);
      }
    };
    if (!e.oneway) {
      if (w >= 11) {
        strip(white, mk, -0.2 - 0.06, -0.2 + 0.06, dy, uvZero, YEL);
        strip(white, mk, 0.2 - 0.06, 0.2 + 0.06, dy, uvZero, YEL);
      } else {
        dash(0, 0.13, 3, 5, WHT);
      }
      if (lanes >= 4 && w >= 11) {
        dash(w / 4, 0.12, 3, 6, WHT);
        dash(-w / 4, 0.12, 3, 6, WHT);
      }
    } else if (lanes >= 2 || w >= 7) {
      const n = Math.max(2, lanes);
      for (let k = 1; k < n; k++) dash(-w / 2 + (w * k) / n, 0.12, 3, 6, WHT);
    }

    // ------------------------------------------ stop bars & zebras
    if (zebraAndBars && L > 24 + rj0 + rj1) {
      const placeEnd = (atEnd: boolean, rj: number): void => {
        if (rj <= 0) return;
        const sA = atEnd ? L - rj : rj; // disc boundary
        const dirSign = atEnd ? -1 : 1; // moving away from the junction
        const frame = sampleAt(samples, sA);
        const [rx, rz] = rightOf(frame.tx, frame.tz);
        // stripes across the carriageway (skipped on low; stop bar kept)
        if (quality !== 'low') {
        const stripes = Math.max(4, Math.floor((w - 1) / 1.5));
        const span = w - 0.8;
        const zl = 3.0;
        for (let i = 0; i < stripes; i++) {
          const r0 = -span / 2 + (i + 0.12) * (span / stripes);
          const r1 = -span / 2 + (i + 0.62) * (span / stripes);
          const s0 = sA + dirSign * 0.8;
          const s1 = sA + dirSign * (0.8 + zl);
          const pa = sampleAt(samples, Math.min(s0, s1)), pb = sampleAt(samples, Math.max(s0, s1));
          const P = [
            pa.x + rx * r0, pa.y + dy, pa.z + rz * r0,
            pa.x + rx * r1, pa.y + dy, pa.z + rz * r1,
            pb.x + rx * r1, pb.y + dy, pb.z + rz * r1,
            pb.x + rx * r0, pb.y + dy, pb.z + rz * r0,
          ];
          white.quad(P, [0, 0, 0, 1, 1, 1, 1, 0], [0, 1, 0], WHT);
        }
        }
        // stop bar on the approaching (left-hand traffic) half
        const sb0 = sA + dirSign * 4.0, sb1 = sA + dirSign * 4.5;
        const pa = sampleAt(samples, Math.min(sb0, sb1)), pb = sampleAt(samples, Math.max(sb0, sb1));
        // vehicles arriving at the end (atEnd) travel forward => on their left (r<0); at the start travel backwards => r>0
        let r0: number, r1: number;
        if (e.oneway) { r0 = -w / 2 + 0.25; r1 = w / 2 - 0.25; }
        else if (atEnd) { r0 = -w / 2 + 0.25; r1 = -0.15; }
        else { r0 = 0.15; r1 = w / 2 - 0.25; }
        const P = [
          pa.x + rx * r0, pa.y + dy, pa.z + rz * r0,
          pa.x + rx * r1, pa.y + dy, pa.z + rz * r1,
          pb.x + rx * r1, pb.y + dy, pb.z + rz * r1,
          pb.x + rx * r0, pb.y + dy, pb.z + rz * r0,
        ];
        white.quad(P, [0, 0, 0, 1, 1, 1, 1, 0], [0, 1, 0], WHT);
      };
      if (w >= 6) { placeEnd(false, rj0); placeEnd(true, rj1); }
    }
  }

  // ---- deck caps where three or more elevated edges meet (fills the wedges between their frames)
  for (const n of core.nodes) {
    const ni = nodeInfo.get(n.id);
    if (!ni || !ni.raised) continue;
    const inc = n.edges.map((id) => infos.get(id)).filter((i): i is EInfo => !!i && !i.ped);
    if (inc.length < 3) continue;
    let y = 0, mw = 0;
    for (const i of inc) {
      const st = i.e.fromNode === n.id;
      y = Math.max(y, i.e.pointElevM[st ? 0 : i.e.pointElevM.length - 1] ?? 0);
      mw = Math.max(mw, i.e.widthM);
    }
    if (y <= DECK_MIN) continue;
    const t = slabThickness(y);
    const R = mw / 2 + BEAM;
    const tile = tileFor(n.x, n.z);
    const poly: [number, number][] = [];
    for (let i = 0; i < 20; i++) { const a = (i / 20) * Math.PI * 2; poly.push([n.x + Math.cos(a) * R, n.z + Math.sin(a) * R]); }
    addHorizontalPolygon(tile.asphalt, poly, undefined, y, uvAsphalt);
    addHorizontalPolygon(tile.concrete, poly, undefined, y - t, (x, z) => [x / 3, z / 3], undefined, -1);
    for (let i = 0; i < poly.length; i++) {
      const A = poly[i], B = poly[(i + 1) % poly.length];
      const mx = (A[0] + B[0]) / 2 - n.x, mz = (A[1] + B[1]) / 2 - n.z, ml = Math.hypot(mx, mz) || 1;
      tile.concrete.quad([A[0], y, A[1], A[0], y - t, A[1], B[0], y - t, B[1], B[0], y, B[1]], [0, 0, 0, 1, 1, 1, 1, 0], [mx / ml, 0, mz / ml]);
    }
  }

  // ---------------------------------------------------- emit meshes
  const colGeo = new THREE.CylinderGeometry(1, 1.12, 1, quality === 'low' ? 8 : 14, 1);
  colGeo.translate(0, 0.5, 0);
  const capGeo = new THREE.BoxGeometry(1, 1, 1);
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  const emit = (b: GeoBuilder, mat: THREE.Material, name: string, tileGroup: THREE.Group, cast: boolean): void => {
    if (b.vcount === 0) return;
    const m = new THREE.Mesh(b.build(), mat);
    m.name = name;
    m.receiveShadow = true;
    m.castShadow = cast;
    tileGroup.add(m);
  };

  for (const [key, t] of tiles) {
    const g = new THREE.Group();
    g.name = `roads_${key}`;
    emit(t.asphalt, mats.asphalt, 'asphalt', g, false);
    emit(t.paving, mats.paving, 'footpath', g, true);
    emit(t.concrete, mats.concrete, 'bridge-deck', g, true);
    emit(t.white, mats.lineWhite, 'markings', g, false);
    if (t.verge.vcount > 0) {
      const vm = new THREE.Mesh(t.verge.build(), mats.verge);
      vm.name = 'verge';
      vm.renderOrder = 1;
      vm.receiveShadow = true;
      g.add(vm);
    }
    const nc = t.columns.length / 4;
    if (nc > 0) {
      const im = new THREE.InstancedMesh(colGeo, mats.concrete, nc);
      im.name = 'bridge-piers';
      for (let i = 0; i < nc; i++) {
        pos.set(t.columns[i * 4], 0, t.columns[i * 4 + 1]);
        scl.set(t.columns[i * 4 + 3], t.columns[i * 4 + 2], t.columns[i * 4 + 3]);
        matrix.compose(pos, quat.identity(), scl);
        im.setMatrixAt(i, matrix);
      }
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = true;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      g.add(im);
    }
    const ncap = t.caps.length / 6;
    if (ncap > 0) {
      const im = new THREE.InstancedMesh(capGeo, mats.concrete, ncap);
      im.name = 'bridge-pier-caps';
      for (let i = 0; i < ncap; i++) {
        pos.set(t.caps[i * 6], t.caps[i * 6 + 2], t.caps[i * 6 + 1]);
        quat.setFromAxisAngle(up, t.caps[i * 6 + 4]);
        scl.set(t.caps[i * 6 + 3], 1.1, t.caps[i * 6 + 5]);
        matrix.compose(pos, quat, scl);
        im.setMatrixAt(i, matrix);
      }
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = true;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      g.add(im);
    }
    group.add(g);
    registerCull(g);
  }
  group.userData.info = { tiles: tiles.size, edges: edgeCount, junctions } satisfies RoadBuildInfo;
  group.userData.sharedGeometries = [colGeo, capGeo];
  return group;
}
