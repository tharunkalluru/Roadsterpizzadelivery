import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createGroundScenePlacementJob, findGroundScenePlacement, needsGroundScenePlacement } from '../../../src/delivery/scene-placement';
import { loadLevels } from '../../../src/delivery/content/levels';
import { RoadGraph } from '../../../src/game/roadgraph';
import { buildTile } from '../../../src/world/city';
import { initTemplates } from '../../../src/core/util';
import { placeLandmarks } from '../../../src/world/landmarks';
import { railwayNetwork } from '../../../src/world/railway-geometry';

/** Real shipped polygons, generated filler buildings, barriers, roads, water,
 * landmarks and railway clearances. No idealized empty-world substitution. */
export function auditGroundScenePlacements(only?: string, lowQ = true) {
  const unpack = (file: string) => JSON.parse(gunzipSync(readFileSync('public/city/' + file)).toString());
  const core = unpack('core.pack.wasm'), packs = new Map(), railway = railwayNetwork();
  const landmarks = placeLandmarks(core.origin, core.packs.flatMap((pack: any) => pack.tiles)); initTemplates();
  const out = [];
  for (const level of loadLevels().filter(level => needsGroundScenePlacement(level.module) && (!only || only === level.id))) {
    const d = level.destination, graph = new RoadGraph(core.roads), loaded = new Set<string>();
    const c: any = { buildingGrid: new Map(), surfaceGrid: new Map(), walls: new Map(), obstacles: new Map(), waterGrid: new Map(), landmarkSurfaceGrid: new Map(), movingRail: [], rails: new Map() };
    for (let i = Math.floor((d.x - 330) / 1000); i <= Math.floor((d.x + 330) / 1000); i++) for (let j = Math.floor((d.z - 330) / 1000); j <= Math.floor((d.z + 330) / 1000); j++) {
      const key = `${i}_${j}`, pack = core.packs.find((pack: any) => pack.tiles.some((tile: number[]) => tile[0] === i && tile[1] === j));
      if (!pack) continue;
      if (!packs.has(pack.file)) packs.set(pack.file, unpack(pack.file));
      const zone = packs.get(pack.file).tiles[key]; if (!zone) continue;
      const built = buildTile(zone, { lowQ, landmarks, metro: core.metro, railway }); loaded.add(key); graph.addRoads(built.roads);
      for (const name of ['buildingGrid', 'surfaceGrid', 'walls', 'obstacles', 'waterGrid', 'landmarkSurfaceGrid'])
        for (const [cell, items] of built[name] ?? []) c[name].set(cell, [...c[name].get(cell) ?? [], ...items]);
      for (const rail of built.rails) c.rails.set(rail.id, rail);
    }
    const isLoaded = (x: number, z: number) => loaded.has(`${Math.floor(x / 1000)}_${Math.floor(z / 1000)}`);
    const started = performance.now(), result = findGroundScenePlacement(c, graph, level, { isLoaded }), ms = performance.now() - started;
    const job = createGroundScenePlacementJob(c, graph, level, { isLoaded, revision: 'audit' }); let steps = 0, maxSlice = 0;
    while (!job.done && steps < 20000) { const start = performance.now(); job.step(1.5, 64); maxSlice = Math.max(maxSlice, performance.now() - start); steps++; }
    out.push({ id: level.id, fit: !!result, steps, maxSlice: Number(maxSlice.toFixed(2)), operations: job.operations,
      ms: Number(ms.toFixed(2)), attempts: result?.attempts, offset: result ? Number(Math.hypot(result.destination.x - d.x, result.destination.z - d.z).toFixed(1)) : null,
      point: result?.destination, params: result?.moduleParams, budgetedComplete: job.done, budgetedPoint: job.result?.destination });
  }
  return out;
}

if (process.argv.includes('--audit-scenes')) {
  const reports = auditGroundScenePlacements(process.argv.find(arg => arg.startsWith('--level='))?.slice(8));
  for (const report of reports) console.log(JSON.stringify(report));
  writeFileSync('/tmp/roadster-scene-placement-world.json', JSON.stringify(reports, null, 2));
}
