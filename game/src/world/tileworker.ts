/// <reference lib="webworker" />
// Background tile builder: fetches packs, builds tile geometry and gameplay grids off the main thread.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { initTemplates, Batch, hash } from '../core/util';
import { buildTile, MetroData, TileZone, type BuiltBuffers } from './city';
import type { Landmark } from './landmarks';
import { fetchPack } from './packs';
import type { Airfield } from './airfields';
import { applyRoadGradePatches, type RoadGradePatch } from './road-grades';
import type { Furniture } from './types';
import { applyConstructionRoads, type ConstructionPlan } from './construction';
import { DESTINATION_IDENTITIES } from './destination-data';

let metro: MetroData | undefined; let lowQ = false; let ready = false; let landmarks: Landmark[] = [];
let airfields:Airfield[]=[];
let roadGrades: RoadGradePatch[] = [];
let trafficSignals: Furniture[] | undefined;
let construction: ConstructionPlan | undefined;
const packs = new Map<string, Promise<Record<string, TileZone>>>();
const order: string[] = [];
const decodedBytes = new Map<string, number>();
const DECODED_CACHE_BUDGET = 96 * 1024 * 1024;
function estimatedPackBytes(tiles: Record<string, TileZone>) {
  let bytes = 0;
  for (const tile of Object.values(tiles)) {
    bytes += tile.roads.reduce((n, r) => n + 512 + r.pts.length * 32 + (r.elev?.length || 0) * 8, 0);
    bytes += tile.buildings.reduce((n, b) => n + 384 + b.ring.length * 32, 0);
    bytes += tile.boards.length * 512 + tile.furniture.length * 256 + tile.areas.reduce((n, a) => n + 256 + a.ring.length * 32, 0);
  }
  return bytes;
}
function prunePacks() {
  let bytes = [...decodedBytes.values()].reduce((a, b) => a + b, 0);
  while (order.length > 6 || bytes > DECODED_CACHE_BUDGET) {
    const key = order.shift(); if (!key) break;
    bytes -= decodedBytes.get(key) || 0; decodedBytes.delete(key); packs.delete(key);
  }
}
const MAX_BUFFER_VERTICES = 48000; // triangle aligned, bounded first-use GPU upload
function prepareBuffers(buffers: BuiltBuffers[]) {
  const out: BuiltBuffers[] = [];
  for (const b of buffers) for (let v = 0; v < b.pos.length / 3; v += MAX_BUFFER_VERTICES) {
    const n = Math.min(MAX_BUFFER_VERTICES, b.pos.length / 3 - v);
    const pos = b.pos.slice(v * 3, (v + n) * 3), nor = b.nor.slice(v * 3, (v + n) * 3), uv = b.uv.slice(v * 2, (v + n) * 2), col = b.col.slice(v * 3, (v + n) * 3);
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < pos.length; i += 3) { minX = Math.min(minX, pos[i]); minY = Math.min(minY, pos[i + 1]); minZ = Math.min(minZ, pos[i + 2]); maxX = Math.max(maxX, pos[i]); maxY = Math.max(maxY, pos[i + 1]); maxZ = Math.max(maxZ, pos[i + 2]); }
    const center: [number, number, number] = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
    out.push({ mat: b.mat, pos, nor, uv, col, detailMeters: b.detailMeters, bounds: { center, radius: Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2 } });
  }
  return out;
}

function skyline(z: TileZone): BuiltBuffers[] {
  const b = new Batch(), colors = ['#E8A87C', '#F2D49B', '#9FC7C1', '#C9B6E4', '#F4B6C2', '#E7D7C1'];
  for (const building of z.buildings) {
    if (building.ring.length < 3 || !Number.isFinite(building.h) || building.h <= 0) continue;
    const ring = building.ring, color = building.fc && /^#/.test(building.fc) ? building.fc : colors[hash(building.id) % colors.length], h = building.h;
    // Preserve real footprints/heights; omit windows and street details only in the distant visual layer.
    for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; b.quad([p[0], 0, p[1]], [q[0], 0, q[1]], [q[0], h, q[1]], [p[0], h, p[1]], color); }
    const triangles = THREE.ShapeUtils.triangulateShape(ring.map(p => new THREE.Vector2(...p)), []);
    for (const t of triangles) { const p = ring[t[0]], q = ring[t[1]], r = ring[t[2]]; b.tri([p[0], h, p[1]], [r[0], h, r[1]], [q[0], h, q[1]], color); }
  }
  return prepareBuffers([{ mat: 'st', pos: new Float32Array(b.pos), nor: new Float32Array(b.nor), uv: new Float32Array(b.uv), col: new Float32Array(b.col) }]);
}
function getPack(url: string) {
  let p = packs.get(url);
  if (!p) {
    p = fetchPack<{ tiles: Record<string, TileZone> }>(url).then((d) => {
      if (!d?.tiles || typeof d.tiles !== 'object' || Array.isArray(d.tiles)) throw new Error('Invalid city tile pack');
      if (packs.get(url) === p) { decodedBytes.set(url, estimatedPackBytes(d.tiles)); prunePacks(); }
      return d.tiles;
    }).catch((error) => {
      // A temporary connection failure must not poison this pack for the rest of the visit.
      if (packs.get(url) === p) { packs.delete(url); decodedBytes.delete(url); const at = order.indexOf(url); if (at >= 0) order.splice(at, 1); }
      throw error;
    });
    packs.set(url, p); order.push(url);
    prunePacks();
  } else {
    const index = order.indexOf(url); if (index >= 0) order.splice(index, 1); order.push(url);
  }
  return p;
}

self.onmessage = async (ev: MessageEvent) => {
  const m = ev.data;
  if (m.type === 'init') {
    if (!ready) { initTemplates({ rbox: new RoundedBoxGeometry(1, 1, 1, 3, 0.12), ring: new THREE.RingGeometry(1.0, 1.35, 40) }); ready = true; }
    metro = m.metro; lowQ = m.lowQ; landmarks = m.landmarks || [];
    airfields=m.airfields||[]; roadGrades = m.roadGrades || []; trafficSignals = m.trafficSignals; construction = m.construction;
    return;
  }
  if (m.type === 'build' || m.type === 'skyline') {
    try {
      const tiles = await getPack(m.url);
      const z = tiles[m.key];
      const identity = { key: m.key, requestId: m.requestId, protocolVersion: 1, worldEpoch: m.worldEpoch || 0 };
      if (!z) { (self as any).postMessage({ type: 'empty', ...identity }); return; }
      if (m.type === 'skyline') {
        const buffers = skyline(z), transfer = buffers.flatMap(b => [b.pos.buffer, b.nor.buffer, b.uv.buffer, b.col.buffer]);
        (self as any).postMessage({ type: 'skyline', ...identity, buffers }, transfer); return;
      }
      const t0 = performance.now();
      // The canonical source snapshot replaces only legacy signal furniture.
      // Include border context so a junction has one owner and a stable plan.
      const furniture = trafficSignals === undefined ? z.furniture.filter(f => f.kind !== 'traffic_signals' || !f.synth) :
        [...z.furniture.filter(f => f.kind !== 'traffic_signals'), ...trafficSignals.filter(f => f.p[0] >= z.i * 1000 - 80 && f.p[0] < (z.i + 1) * 1000 + 80 && f.p[1] >= z.j * 1000 - 80 && f.p[1] < (z.j + 1) * 1000 + 80)];
      let roads = applyRoadGradePatches(z.roads, roadGrades);
      if (construction) roads = applyConstructionRoads(roads, construction);
      const destinations = DESTINATION_IDENTITIES.filter(d => d.tile[0] === z.i && d.tile[1] === z.j);
      const built = buildTile({ ...z, furniture, roads }, { lowQ, metro, landmarks,airfields, construction, destinations });
      built.buffers = prepareBuffers(built.buffers);
      const transfer: ArrayBuffer[] = [];
      for (const b of built.buffers) transfer.push(b.pos.buffer, b.nor.buffer, b.uv.buffer, b.col.buffer);
      for (const b of built.instances || []) transfer.push(b.matrices.buffer, b.colors.buffer);
      (self as any).postMessage({ type: 'built', ...identity, built, decodedCacheBytes: [...decodedBytes.values()].reduce((a,b) => a+b,0), ms: Math.round(performance.now() - t0) }, transfer);
    } catch (e: any) {
      (self as any).postMessage({ type: 'error', key: m.key, requestId: m.requestId, error: String(e?.message || e) });
    }
  }
};
