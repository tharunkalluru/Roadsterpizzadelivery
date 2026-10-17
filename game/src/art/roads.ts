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
const PED_CLASSES = new Set(['footway', 'pedestrian', 'path', 'steps', 'cycleway', 'bridleway', 'corridor', 'track']);
const SKIP_MARK = new Set(['service', 'living_street', 'footway', 'pedestrian', 'path', 'steps', 'cycleway', 'track', 'bridleway', 'corridor']);

interface Tile {
  asphalt: GeoBuilder;
  paving: GeoBuilder;
  concrete: GeoBuilder;
  white: GeoBuilder;
  columns: number[]; // x,z,height,radius
  caps: number[]; // x,z,y,width,heading(yaw),depth
}

function newTile(): Tile {
  return { asphalt: new GeoBuilder(), paving: new GeoBuilder(), concrete: new GeoBuilder(), white: new GeoBuilder(true), columns: [], caps: [] };
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

  const roadById = new Map<string, RoadEdge>();
  for (const r of core.roads) roadById.set(r.id, r);

  // node radii (junction fills) and elevations
  const nodeInfo = new Map<string, { x: number; z: number; y: number; r: number; junction: boolean }>();
  for (const n of core.nodes) {
    let maxW = 0;
    let y = Infinity;
    for (const eid of n.edges) {
      const e = roadById.get(eid);
      if (!e || e.tunnel) continue;
      maxW = Math.max(maxW, e.widthM);
      const isStart = e.fromNode === n.id;
      const ye = e.pointElevM[isStart ? 0 : e.pointElevM.length - 1] ?? 0;
      y = Math.min(y, ye);
    }
    if (!isFinite(y)) y = 0;
    nodeInfo.set(n.id, { x: n.x, z: n.z, y, r: n.isJunction ? maxW * 0.5 * 1.18 : 0, junction: n.isJunction });
  }

  const segs = quality === 'low' ? 20 : 32;
  const uvAsphalt = (x: number, z: number): [number, number] => [x / 8, z / 8];
  const uvPaving = (x: number, z: number): [number, number] => [x / 2.5, z / 2.5];

  // ---- junction fills
  let junctions = 0;
  for (const [, ni] of nodeInfo) {
    if (!ni.junction || ni.r <= 0) continue;
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

  for (const e of core.roads) {
    if (e.tunnel || e.points.length < 2) continue;
    const samples = makeSamples(e.points, e.pointElevM);
    if (samples.length < 2) continue;
    edgeCount++;
    const L = polyLength(samples);
    const mid = sampleAt(samples, L / 2);
    const tile = tileFor(mid.x, mid.z);
    const w = Math.max(1.5, e.widthM);
    const maxElev = Math.max(...e.pointElevM, 0);
    const elevated = e.bridge || maxElev > 0.45;
    const ped = PED_CLASSES.has(e.highway);

    if (ped) {
      strip(tile.paving, samples, -w / 2, w / 2, 0, (x, z) => uvPaving(x, z));
      continue;
    }
    strip(tile.asphalt, samples, -w / 2, w / 2, 0, (x, z) => uvAsphalt(x, z));

    const fromN = nodeInfo.get(e.fromNode);
    const toN = nodeInfo.get(e.toNode);
    const rj0 = fromN?.junction ? fromN.r : 0;
    const rj1 = toN?.junction ? toN.r : 0;

    // ------------------------------------------------ footpaths / kerbs
    if (!elevated) {
      const fw = w >= 7 ? 1.8 : 1.0;
      const kh = 0.16;
      const s0 = rj0 > 0 ? rj0 + 0.6 : 0;
      const s1 = L - (rj1 > 0 ? rj1 + 0.6 : 0);
      const part = sliceSamples(samples, s0, s1);
      if (part.length >= 2) {
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
      const thick = (y: number): number => Math.min(0.9, Math.max(0, y));
      const deckProfile = (_i: number, p: PSample): [number, number][] => {
        const t = thick(p.y);
        const hw = w / 2 + 0.25;
        return [[hw, 0], [hw, -t], [-hw, -t], [-hw, 0]];
      };
      sweep(tile.paving, samples, deckProfile(0, samples[0]), { sign: -1, tile: 3, profileAt: deckProfile, dy: -0.01 });
      // parapets (not on the near-ground ramp start)
      const ph = 0.95;
      const pw = 0.3;
      const par = (side: 1 | -1): [number, number][] => {
        const a = (w / 2 - pw) * side, b = (w / 2 + 0.25) * side;
        return side > 0 ? [[a, 0], [b, 0], [b, ph], [a, ph]] : [[b, 0], [a, 0], [a, ph], [b, ph]];
      };
      const highPart = sliceSamples(samples, rj0 > 0 ? rj0 : 0, L - (rj1 > 0 ? rj1 : 0));
      if (highPart.length >= 2 && maxElev > 0.45) {
        sweep(tile.paving, highPart, par(1), { tile: 2, caps: true });
        sweep(tile.paving, highPart, par(-1), { tile: 2, caps: true });
      }
      // piers along the elevated part
      if (maxElev > 2.5) {
        const spacing = 22;
        const n = Math.max(1, Math.round(L / spacing));
        for (let k = 0; k <= n; k++) {
          const s = (k / n) * L;
          const p = sampleAt(samples, s);
          if (p.y < 2.2) continue;
          const t = thick(p.y);
          const capH = 1.1;
          const colTop = p.y - t - capH;
          if (colTop < 0.5) continue;
          tile.columns.push(p.x, p.z, colTop, 0.62);
          const yaw = Math.atan2(-p.tx, -p.tz); // local +X of the cap box = lateral (right) direction
          tile.caps.push(p.x, p.z, p.y - t - capH / 2, w * 0.82, yaw, 1.5);
        }
      }
    }

    // --------------------------------------------------- markings
    const wide = w >= 5.2;
    if (!wide || SKIP_MARK.has(e.highway)) continue;
    const cutA = rj0 > 0 ? rj0 + 5.4 : 0;
    const cutB = L - (rj1 > 0 ? rj1 + 5.4 : 0);
    const mk = sliceSamples(samples, cutA, cutB);
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
    emit(t.white, mats.lineWhite, 'markings', g, false);
    const nc = t.columns.length / 4;
    if (nc > 0) {
      const im = new THREE.InstancedMesh(colGeo, mats.paving, nc);
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
      const im = new THREE.InstancedMesh(capGeo, mats.paving, ncap);
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
