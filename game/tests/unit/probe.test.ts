/** Dev tool: PROBE=x,z,y npx vitest run tests/unit/probe.test.ts --silent=false — collision contacts and surface at a point on the v2 world. */
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { WorldPhysics } from '../../src/world/collision';
it.skipIf(!process.env.PROBE)('probe', () => {
  const base = 'public/world/hyd-metro/v2/';
  const m0 = JSON.parse(readFileSync(base + 'manifest.json', 'utf8'));
  const core = JSON.parse(readFileSync(base + m0.core.file, 'utf8'));
  const w = new WorldPhysics(core, m0.chunkSizeM); w.setKnownChunks(m0.chunks.map((c: any) => c.id));
  for (const c of m0.chunks) w.addChunk(JSON.parse(readFileSync(base + c.file, 'utf8')));
  const [x, z, y] = process.env.PROBE!.split(',').map(Number);
  for (const dz of [-3, -1.5, 0]) console.log(dz, JSON.stringify(w.contacts(x, z + dz, y, 1.4, 1.2)));
  console.log(JSON.stringify(w.roads.surface(x, z, { maxY: y + 0.3, margin: 1 })?.roadId));
});
