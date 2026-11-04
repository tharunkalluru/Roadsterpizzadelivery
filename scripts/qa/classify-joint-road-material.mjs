import { build } from 'esbuild';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
const option = n => process.argv[process.argv.indexOf(n) + 1], input = option('--input'), output = option('--output');
assert.ok(process.argv.includes('--input') && process.argv.includes('--output'));
const hash = b => createHash('sha256').update(b).digest('hex');
const inputBytes = await readFile(input), artifact = JSON.parse(inputBytes), coreBytes = await readFile('public/city/core.pack.wasm'), core = JSON.parse(gunzipSync(coreBytes));
assert.equal(hash(coreBytes), artifact.inputs['public/city/core.pack.wasm']);
const temp = await mkdtemp(join(tmpdir(), 'joint-road-material-'));
try {
  const compiled = join(temp, 'api.mjs');
  const built = await build({ stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
    import {initTemplates,TiledBatch} from './src/core/util';
    import {placeAirfields,drawAirfieldTile} from './src/world/airfields';
    import {emittedTriangleKey} from './scripts/qa/road-emitted-records';
    export function classify(origin,unknown){
      initTemplates();const airfields=placeAirfields(origin),byTile=new Map();
      for(const r of unknown){const list=byTile.get(r.tile)||[];list.push(r);byTile.set(r.tile,list);}
      const rows=[];
      for(const[tile,records]of byTile){
        const[i,j]=tile.split('_').map(Number),B=Object.fromEntries(['road','st','marks','lit','roof','wall','shop','glow','park','water','kerb'].map(k=>[k,new TiledBatch(500)])),grid=new Map();
        drawAirfieldTile(airfields,i,j,B,grid);
        const emitted=new Set();for(const batch of B.road.tiles.values()){const pos=Float32Array.from(batch.pos);for(let k=0;k<pos.length;k+=9)emitted.add(emittedTriangleKey([Array.from(pos.slice(k,k+3)),Array.from(pos.slice(k+3,k+6)),Array.from(pos.slice(k+6,k+9))]));}
        const source=new Map();for(const s of new Set([...grid.values()].flat()))source.set(emittedTriangleKey([s.a,s.b,s.c]),s.id);
        for(const r of records){const key=emittedTriangleKey(r.points);rows.push({...r,exactActualAirfieldRoadMaterialMatch:emitted.has(key),exactActualLandmarkSurfaceID:source.get(key)||null});}
      }return rows;
    }` }, outfile: compiled, bundle: true, platform: 'node', format: 'esm', target: 'node22', metafile: true, logLevel: 'error' });
  const sourceHashes = Object.fromEntries(await Promise.all(Object.keys(built.metafile.inputs).filter(p => p !== '<stdin>' && !p.includes('node_modules/')).map(async p => [p, hash(await readFile(p))])));
  const rows = (await import(pathToFileURL(compiled))).classify(core.origin, artifact.unmatched);
  const noAirfieldMatch = rows.filter(r => !r.exactActualAirfieldRoadMaterialMatch), noLandmarkBinding = rows.filter(r => !r.exactActualLandmarkSurfaceID);
  for (const [path, expected] of Object.entries(sourceHashes)) assert.equal(hash(await readFile(path)), expected, path);
  assert.equal(hash(await readFile(input)), hash(inputBytes)); assert.equal(hash(await readFile('public/city/core.pack.wasm')), hash(coreBytes));
  const report = { scope: 'Exact independent current drawAirfieldTile Float32 road-material and actual landmarkSurfaceGrid identity match. These are retained non-network surfaces, not city source-road support or a global final acceptance waiver.',
    input: { path: input, sha256: hash(inputBytes) }, coreSHA256: hash(coreBytes), sourceHashes, sourcesUnchanged: true,
    summary: { unknownRoadMaterialTriangles: rows.length, exactAirfieldMaterialMatches: rows.length - noAirfieldMatch.length, exactLandmarkSurfaceBindings: rows.length - noLandmarkBinding.length }, rows };
  await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ output, sha256: hash(await readFile(output)), summary: report.summary, missingAirfield: noAirfieldMatch.length, missingLandmark: noLandmarkBinding.length }));
  assert.equal(noAirfieldMatch.length, 0); assert.equal(noLandmarkBinding.length, 0);
} finally { await rm(temp, { recursive: true, force: true }); }
