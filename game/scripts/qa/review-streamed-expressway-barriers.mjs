// Read-only actual-worker probe. A full-core clipping disagreement is a
// diagnostic witness, not authority to remove an access barrier.
import { build } from 'esbuild';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = process.argv[2];
if (!output) throw Error('Provide a new output JSON path.');
const temp = await mkdtemp(join(tmpdir(), 'road-streamed-barriers-'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
try {
  const path = join(temp, 'review.mjs');
  const built = await build({ stdin: { resolveDir: root, loader: 'ts', contents: `
    import assert from 'node:assert/strict';
    import { actualWorldWorker } from './tests/fixtures/actual-world-worker';
    import { expresswayBarrierClipper } from './src/world/expressway';
    export async function review() {
      const f = await actualWorldWorker({ allowInactive: true });
      try {
        const core = new Map(f.core.roads.map(e => [e.id, e]));
        const fullClip = expresswayBarrierClipper(f.core.roads), observations = [], witnesses = [];
        for (const key of ['-15_-3', '-15_-4', '-15_-5', '-16_-17', '-16_-18']) {
          if (!f.world.packOf.has(key)) continue;
          const tile = await f.build(key), walls = [...new Set([...tile.walls.values()].flat())];
          const candidates = walls.filter((w: any) => w.expresswayRoad), tileRows = [];
          for (const wall of candidates as any[]) {
            const own = core.get(wall.expresswayRoad); assert.ok(own, 'Emitted expressway wall must have a canonical source road');
            const length = Math.hypot(wall.bx - wall.ax, wall.bz - wall.az);
            // These actual barriers are emitted only at within-tile ownership
            // samples. Retain the actual wall, not a hypothetical remote edge.
            const mx = (wall.ax + wall.bx) / 2, mz = (wall.az + wall.bz) / 2;
            assert.ok(mx >= tile.i * 1000 - 3.1 && mx <= (tile.i + 1) * 1000 + 3.1 && mz >= tile.j * 1000 - 3.1 && mz <= (tile.j + 1) * 1000 + 3.1);
            // No segment ID is carried by the actual collider. Suppress own
            // folds here, so only OTHER canonical source roads can trim it.
            const clip = fullClip(own, { ax: wall.ax, az: wall.az, bx: wall.bx, bz: wall.bz,
              ya: wall.y0a, yb: wall.y0b, bottom: 0, top: wall.y1a - wall.y0a });
            const retained = clip.reduce((n, s) => n + Math.hypot(s.bx - s.ax, s.bz - s.az), 0);
            if (length - retained > .05) {
              const row = { tile: key, road: own.id, wall, length, retained, removedByFullSourceMetres: length - retained, fullSourceSurvivors: clip };
              tileRows.push(row); witnesses.push(row);
            }
          }
          observations.push({ tile: key, actualExpresswayColliders: candidates.length, disagreements: tileRows.length });
        }
        f.verifySources();
        return { schema: 'streamed-expressway-barrier-diagnostic-v1', releaseApproved: false,
          scope: 'Actual World and tileworker emitted in-tile expressway colliders compared with existing full-core clipper. A witness requires a separate source-connection and same-height review before any behavior change.',
          sourceCoreSHA256: f.sourceCoreSHA256, sourcePacks: f.sourcePackHashes, observations, witnesses };
      } finally { f.dispose(); }
    }
  ` }, outfile: path, bundle: true, platform: 'node', format: 'esm', target: 'node22', metafile: true,
    define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' }, logLevel: 'error' });
  const inputs = {};
  for (const file of Object.keys(built.metafile.inputs).filter(p => /^(src|tests)\//.test(p))) inputs[file] = sha(await readFile(resolve(root, file)));
  inputs['scripts/qa/review-streamed-expressway-barriers.mjs'] = sha(await readFile(fileURLToPath(import.meta.url)));
  const result = await (await import(pathToFileURL(path).href)).review();
  for (const [file, hash] of Object.entries(inputs)) if (sha(await readFile(resolve(root, file))) !== hash) throw Error('Source changed during review: ' + file);
  await writeFile(resolve(output), JSON.stringify({ ...result, inputs }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ output: resolve(output), observations: result.observations, witnesses: result.witnesses.length }));
} finally { await rm(temp, { recursive: true, force: true }); }
