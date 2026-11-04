import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const option = name => { const at = process.argv.indexOf(name); return at < 0 ? undefined : process.argv[at + 1]; };
const node = option('--node'), output = option('--output');
const sourceFile=option('--source-geometry'),sourceBytes=sourceFile?await readFile(resolve(sourceFile)):undefined,sourceData=sourceBytes?JSON.parse(sourceBytes):undefined;
if (!node || !output) throw Error('Use --node EXACT_NODE_ID --output FILE. Exports fixed source geometry only.');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const coreBytes = await readFile(join(root, 'public/city/core.pack.wasm')), core = JSON.parse(gunzipSync(coreBytes));
const coreIds = new Set(core.roads.map(e => e.id)), owners = new Map(), packHashes = {}, nodeTables = [];
if(sourceData&&sourceData.sourceCorePackSHA256!==hash(coreBytes))throw Error('Source geometry raw core mismatch');
const sourceTemp=await mkdtemp(join(tmpdir(),'fixed-tile-source-'));
const sourceModule=join(sourceTemp,'source.mjs');
await build({stdin:{contents:"export{applyVerifiedSourceRoadZone}from'./src/world/road-source-geodesic';",resolveDir:root,loader:'ts'},outfile:sourceModule,bundle:true,platform:'node',format:'esm',target:'node22',logLevel:'error'});
const {applyVerifiedSourceRoadZone}=await import(pathToFileURL(sourceModule));
for (const pack of core.packs) {
  const path = 'public/city/' + pack.file, bytes = await readFile(join(root, path)), data = JSON.parse(gunzipSync(bytes));
  for (const [tile, rawZone] of Object.entries(data.tiles)) {
    const normalized=sourceData?applyVerifiedSourceRoadZone(rawZone,sourceData):{value:rawZone,report:{mismatched:[]}};
    if(normalized.report.mismatched.length)throw Error('Fixed source tile mismatch: '+tile);
    const zone=normalized.value;
    if (zone.nodes[node]) nodeTables.push({ tile, pack: pack.file, point: zone.nodes[node] });
    for (const road of zone.roads) {
      if (coreIds.has(road.id) || road.from !== node && road.to !== node) continue;
      const entry = owners.get(road.id) || { road, copies: [] };
      if (!road.ctx) entry.road = road;
      entry.copies.push({ tile, pack: pack.file, context: !!road.ctx, source: road,rawSource:rawZone.roads.find(e=>e.id===road.id) });
      owners.set(road.id, entry); packHashes[path] = hash(bytes);
    }
  }
}
const roads = [...owners.values()].map(({ road, copies }) => {
  if (!copies.some(c => !c.context)) throw Error('Missing fixed road owner ' + road.id);
  return { ...road, name: road.name ?? null, seg: road.seg ?? road.id, lanes: road.lanes ?? 1,
    oneway: road.oneway ?? null, maxspeed: road.maxspeed ?? null, elev: road.elev ?? null };
});
const temp = await mkdtemp(join(tmpdir(), 'fixed-tile-constraints-'));
try {
  const module = join(temp, 'ribbon.mjs');
  await build({ stdin: { contents: "export {roadRibbon} from './src/world/bridge-clearance';", resolveDir: root, loader: 'ts' }, outfile: module, bundle: true, platform: 'node', format: 'esm', target: 'node22', logLevel: 'error' });
  const { roadRibbon } = await import(pathToFileURL(module));
  const footprints = roads.map(e => { const { L, R } = roadRibbon(e, [...core.roads, ...roads]); return { id: e.id, L, R }; });
  const result = { version: 1, scope: 'Source tile roads used as fixed offline physical constraints. Explicit source normalization changes only authoritative cuts; this is not an inferred runtime overlay or surveyed-height claim.', node,
    ...(sourceData?{sourceRoadGeometryGeneration:sourceData.generationID,sourceDataSHA256:hash(sourceBytes)}:{}),
    sourceCoreSHA256: hash(coreBytes), sourcePackSHA256: packHashes, nodeTables, roads, footprints,
    copies: [...owners.values()].map(({ road, copies }) => ({ id: road.id, copies })) };
  await writeFile(resolve(output), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ output: resolve(output), roads: roads.map(e => e.id), sha256: hash(await readFile(resolve(output))) }));
} finally { await rm(temp, { recursive: true, force: true });await rm(sourceTemp,{recursive:true,force:true}); }
