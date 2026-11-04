import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { RoadGraph } from '../../../../src/game/roadgraph';
import { RoadGraphSurfaceCache } from '../../../../src/game/road-graph-surface';
import { legacyPointAt } from '../../../../tests/fixtures/legacy-roadgraph-point-at';

const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
export function measure() {
  const modelPath = '/tmp/roadster-road-freezes/source-9413-body-corridors-v1/model-875b620c1583e54ec186f10954c1cb7636f7eb2010fb7f7159d4697b6a227cde.json';
  const negativePath = '/tmp/source-9413-graph-long-cache-pressure-8.json';
  const modelBytes = readFileSync(modelPath), negativeBytes = readFileSync(negativePath), model = JSON.parse(modelBytes.toString());
  assert.equal(hash(modelBytes), '875b620c1583e54ec186f10954c1cb7636f7eb2010fb7f7159d4697b6a227cde');
  const longest = model.roads.filter(e => e.elev?.some(y => y !== e.elev[0])).sort((a, b) => b.pts.length - a.pts.length).slice(0, 8);
  const roads = [...longest, ...model.roads.filter(e => !e.elev?.some(y => y !== e.elev[0])).slice(0, 47)];
  const fixed = new RoadGraph(roads), old = new RoadGraph(roads); old.pointAt = legacyPointAt;
  const edges = roads.map(e => fixed.byId.get(e.id)!), baseline = roads.map(e => old.byId.get(e.id)!);
  assert.equal(edges.length, 55);
  const cache = (fixed as any).roadSurfaces, originalCreate = cache.create, originalBlock = cache.block;
  let entriesCreated = 0, blockMisses = 0, blockRequests = 0;
  cache.create = function (...args: any[]) { entriesCreated++; return originalCreate.apply(this, args); };
  cache.block = function (e: any, entry: any, segment: number) { blockRequests++; if (!entry.blocks.has(Math.floor(segment / RoadGraphSurfaceCache.BLOCK_SEGMENTS))) blockMisses++; return originalBlock.call(this, e, entry, segment); };
  const queries = edges.map((e, i) => ({ s: Math.min(e.len / 2, 12 + i * 3), dir: i % 2 ? 1 as const : -1 as const }));
  let sink = 0;
  const one = (selected: typeof edges) => { for (let i = 0; i < selected.length; i++) { const q = queries[i], p = (selected === edges ? fixed : old).pointAt(selected[i], q.s, q.dir, 1.6); sink += p.y + p.x * .000001; } };
  const beforeCold = performance.now(); one(edges); const coldMillisecondsPer55Calls = performance.now() - beforeCold;
  const cold = { entriesCreated, blockMisses, blockRequests, points: cache.pointCount };
  assert.equal(entriesCreated, 55); assert.equal(blockMisses, 8);
  entriesCreated = blockMisses = blockRequests = 0;
  for (let n = 0; n < 100; n++) one(edges);
  const warmed = { frames: 100, entriesCreated, blockMisses, blockRequests, points: cache.pointCount };
  assert.equal(entriesCreated, 0); assert.equal(blockMisses, 0);
  let maximumPoints = 0, maximumBlocks = 0;
  const accounting = () => {
    let total = 0, blocks = 0;
    for (const entry of cache.entries.values()) { total += entry.points; if (entry.blocks) for (const block of entry.blocks.values()) { assert.equal(cache.blocks.get(block), entry); blocks++; } }
    assert.equal(cache.pointCount, total); assert.equal(cache.blocks.size, blocks); assert.ok(total <= RoadGraphSurfaceCache.MAX_POINTS); assert.ok(cache.entries.size <= RoadGraphSurfaceCache.MAX_EDGES);
    maximumPoints = Math.max(maximumPoints, total); maximumBlocks = Math.max(maximumBlocks, blocks);
  };
  entriesCreated = blockMisses = blockRequests = 0;
  for (let step = 0; step < 94; step++) {
    for (let i = 0; i < 8; i++) { const e = edges[i], segment = Math.min(e.cum.length - 2, Math.floor(step * (e.cum.length - 2) / 93)), source = (e.cum[segment] + e.cum[segment + 1]) / 2, dir = queries[i].dir; queries[i].s = dir === 1 ? source : e.len - source; }
    one(edges); accounting();
  }
  const travel = { steps: 94, entriesCreated, blockMisses, blockRequests, maximumPoints, maximumBlocks, finalPoints: cache.pointCount };
  entriesCreated = blockMisses = blockRequests = 0;
  for (let n = 0; n < 10; n++) one(edges);
  const hotAfterEviction = { frames: 10, entriesCreated, blockMisses, blockRequests };
  assert.equal(entriesCreated, 0); assert.equal(blockMisses, 0, 'last active sections must survive global eviction');
  // Restore observer methods before measuring the production leaf. Precompute
  // query ownership outside timing; both modes retain exact old graph paths.
  cache.create = originalCreate; cache.block = originalBlock;
  const run = (selected: typeof edges, frames: number) => { const start = performance.now(); for (let n = 0; n < frames; n++) one(selected); return (performance.now() - start) / frames; };
  for (let n = 0; n < 3; n++) { run(baseline, 500); run(edges, 500); }
  const pairs: any[] = [];
  for (let n = 0; n < 12; n++) { let before: number, after: number; if (n % 2) { after = run(edges, 1500); before = run(baseline, 1500); } else { before = run(baseline, 1500); after = run(edges, 1500); } pairs.push({ beforeMillisecondsPer55Calls: before, afterMillisecondsPer55Calls: after, delta: after - before }); }
  const median = (a: number[]) => { const sorted = [...a].sort((a, b) => a - b); return (sorted[(sorted.length - 1) >> 1] + sorted[sorted.length >> 1]) / 2; };
  accounting();
  assert.equal(hash(readFileSync(modelPath)), hash(modelBytes)); assert.equal(hash(readFileSync(negativePath)), hash(negativeBytes));
  return { scope: 'Independent desktop Node leaf only: exact current875b eight longest varying source roads plus47flat roads. Cold, warmed and travelling block residency are observed separately from paired production-method CPU timing. Not whole-game FPS, native worker, phone GPU/thermal or final road model approval.',
    consumed: { model: { path: modelPath, sha256: hash(modelBytes) }, previousFullCacheNegative: { path: negativePath, sha256: hash(negativeBytes), summary: JSON.parse(negativeBytes.toString()).summary } },
    roads: roads.map(e => ({ id: e.id, points: e.pts.length })), coldMillisecondsPer55Calls, cold, warmed, travel, hotAfterEviction,
    finalResidency: { edges: cache.entries.size, blocks: cache.blocks.size, generatedPoints: cache.pointCount }, pairs,
    summary: { beforeMillisecondsPer55Calls: median(pairs.map(p => p.beforeMillisecondsPer55Calls)), afterMillisecondsPer55Calls: median(pairs.map(p => p.afterMillisecondsPer55Calls)), pairedMedianDeltaMillisecondsPer55Calls: median(pairs.map(p => p.delta)) }, sink };
}
