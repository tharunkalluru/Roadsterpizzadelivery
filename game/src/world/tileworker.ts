/// <reference lib="webworker" />
// Background tile builder: fetches packs, builds tile geometry and gameplay grids off the main thread.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { initTemplates } from '../core/util';
import { buildTile, MetroData, TileZone } from './city';
import type { Landmark } from './landmarks';
import { fetchPack } from './packs';

let metro: MetroData | undefined; let lowQ = false; let ready = false; let landmarks: Landmark[] = [];
const packs = new Map<string, Promise<Record<string, TileZone>>>();
const order: string[] = [];
function getPack(url: string) {
  let p = packs.get(url);
  if (!p) {
    p = fetchPack<{ tiles: Record<string, TileZone> }>(url).then((d) => {
      if (!d?.tiles || typeof d.tiles !== 'object' || Array.isArray(d.tiles)) throw new Error('Invalid city tile pack');
      return d.tiles;
    }).catch((error) => {
      // A temporary connection failure must not poison this pack for the rest of the visit.
      if (packs.get(url) === p) { packs.delete(url); const at = order.indexOf(url); if (at >= 0) order.splice(at, 1); }
      throw error;
    });
    packs.set(url, p); order.push(url);
    while (order.length > 6) packs.delete(order.shift()!);   // keep a few packs decoded for neighbouring tiles
  }
  return p;
}

self.onmessage = async (ev: MessageEvent) => {
  const m = ev.data;
  if (m.type === 'init') {
    if (!ready) { initTemplates({ rbox: new RoundedBoxGeometry(1, 1, 1, 3, 0.12), ring: new THREE.RingGeometry(1.0, 1.35, 40) }); ready = true; }
    metro = m.metro; lowQ = m.lowQ; landmarks = m.landmarks || [];
    return;
  }
  if (m.type === 'build') {
    try {
      const tiles = await getPack(m.url);
      const z = tiles[m.key];
      if (!z) { (self as any).postMessage({ type: 'empty', key: m.key, requestId: m.requestId }); return; }
      const t0 = performance.now();
      const built = buildTile(z, { lowQ, metro, landmarks });
      const transfer: ArrayBuffer[] = [];
      for (const b of built.buffers) transfer.push(b.pos.buffer, b.nor.buffer, b.uv.buffer, b.col.buffer);
      (self as any).postMessage({ type: 'built', key: m.key, requestId: m.requestId, built, ms: Math.round(performance.now() - t0) }, transfer);
    } catch (e: any) {
      (self as any).postMessage({ type: 'error', key: m.key, requestId: m.requestId, error: String(e?.message || e) });
    }
  }
};
