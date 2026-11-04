import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const option = name => { const at = process.argv.indexOf(name); return at < 0 ? undefined : process.argv[at + 1]; };
const modelFile = option('--model'), outputFile = option('--output');
const allowHeightDiagnostics=process.argv.includes('--allow-endpoint-height-diagnostics');
const sourceFile=option('--source-geometry'),sourceBytes=sourceFile?await readFile(resolve(sourceFile)):undefined,sourceData=sourceBytes?JSON.parse(sourceBytes):undefined;
if (!modelFile || !outputFile) throw Error('Use --model FILE --output FILE. This exports a private source-bound supplement; it never changes the packs.');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const modelBytes = await readFile(resolve(modelFile)), model = JSON.parse(modelBytes);
const coreBytes = await readFile(join(root, 'public/city/core.pack.wasm')), core = JSON.parse(gunzipSync(coreBytes));
if (!model.endpointDisplacements || !Array.isArray(model.roads)) throw Error('Model has no coherent endpoint field.');
if(model.sourceRoadGeometryGeneration!==sourceData?.generationID)throw Error('Tile transport must use the same explicit corrected-source generation as its model.');
if(sourceData&&sourceData.sourceCorePackSHA256!==hash(coreBytes))throw Error('Source geometry raw core mismatch');
const temp = await mkdtemp(join(tmpdir(), 'road-tile-transports-'));
try {
  const moduleFile = join(temp, 'transport.mjs');
  await build({ stdin: { contents: `export * from './src/world/road-node-transport'; export {roadRibbon} from './src/world/bridge-clearance';export{applyVerifiedSourceRoadZone}from'./src/world/road-source-geodesic';`, resolveDir: root, loader: 'ts' }, outfile: moduleFile, bundle: true, platform: 'node', format: 'esm', target: 'node22', logLevel: 'error' });
  const api = await import(pathToFileURL(moduleFile));
  const coreIds = new Set(core.roads.map(e => e.id)), nodes = model.endpointDisplacements, sources = new Map(), packHashes = {}, nodeSources = {}, incidentSourceOffsets = [];
  // Scan every packed tile so a distant owner or border-context copy is not
  // silently missed merely because its endpoint lies in another tile.
  for (const pack of core.packs) {
    const path = 'public/city/' + pack.file, bytes = await readFile(join(root, path)), data = JSON.parse(gunzipSync(bytes));
    for (const [tile, rawZone] of Object.entries(data.tiles)) {
    const normalized=sourceData?api.applyVerifiedSourceRoadZone(rawZone,sourceData):{value:rawZone,report:{mismatched:[]}};
    if(normalized.report.mismatched.length)throw Error('Source-normalized tile mismatch: '+tile);
    const zone=normalized.value;
    for (const [id, node] of Object.entries(nodes)) if (zone.nodes[id] && Math.hypot(zone.nodes[id][0] - node.before[0], zone.nodes[id][1] - node.before[1]) > 1e-7) {
      (nodeSources[tile] ||= {})[id] = zone.nodes[id]; packHashes[path] = hash(bytes);
    }
    for (const e of zone.roads) {
      if (coreIds.has(e.id) || !nodes[e.from] && !nodes[e.to]) continue;
      const prior = sources.get(e.id), entry = prior || { road: e, copies: [] };
      if (!e.ctx) entry.road = e;
      entry.copies.push({ pack: pack.file, tile, context: !!e.ctx, sourceRoad: e }); sources.set(e.id, entry); packHashes[path] = hash(bytes);
    }
    }
  }
  const mask = api.roadTransportMask(model.profiles || [], core.metro.lines), transports = [], tileRoads = [], endpointErrors = [], endpointLevelChecks = [];
  const nodeLevels = new Map();
  for (const e of model.roads) for (const [node, index] of [[e.from, 0], [e.to, e.pts.length - 1]]) if (node) {
    const levels = nodeLevels.get(node) || []; levels.push(e.elev?.[index] || 0); nodeLevels.set(node, levels);
  }
  for (const { road, copies } of sources.values()) {
    if (!copies.some(c => !c.context)) throw Error(`No actual source owner found: ${road.id}`);
    const incidentNodes = { ...nodes };
    for (const [id, point] of [[road.from, road.pts[0]], [road.to, road.pts[road.pts.length - 1]]]) if (id && nodes[id] && Math.hypot(point[0] - nodes[id].before[0], point[1] - nodes[id].before[1]) > 1e-7) {
      const node = nodes[id], delta = [node.after[0] - point[0], node.after[1] - point[1]];
      if (Math.hypot(...delta) > 5) throw Error(`Detailed source endpoint exceeds the modeled displacement bound: ${road.id}`);
      incidentNodes[id] = { before: point, after: node.after, delta };
      incidentSourceOffsets.push({ road: road.id, node: id, coreBefore: node.before, detailedBefore: point, beforeDifference: Math.hypot(point[0] - node.before[0], point[1] - node.before[1]), modeledAfter: node.after, maximumEndpointDisplacement: Math.hypot(...delta) });
    }
    const p = api.transportTileRoadNodes(road, incidentNodes, mask);
    if (!p) throw Error(`Missing incident transport: ${road.id}`);
    transports.push({ ...p, copies: copies.map(({ sourceRoad, ...copy }) => copy) });
    // Full nullable labels only normalize this offline constraint view. Source
    // owner/context application changes pts/elev and retains their other fields.
    const normalized = { ...road, name: road.name ?? null, seg: road.seg ?? road.id, lanes: road.lanes ?? 1, oneway: road.oneway ?? null, maxspeed: road.maxspeed ?? null, pts: p.pts, elev: p.elev, sourceArc: p.sourceArc, sourceXY: p.sourceXY, scenerySource: p.scenerySource };
    tileRoads.push(normalized);
    for (const [node, index] of [[road.from, 0], [road.to, p.pts.length - 1]]) if (nodes[node]) {
      const a = p.pts[index], b = nodes[node].after, error = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (error > 1e-7) endpointErrors.push({ road: road.id, node, error });
      const y = p.elev?.[index] || 0, levels = nodeLevels.get(node) || [];
      const matchesCore=levels.some(h => Math.abs(h-y)<1e-7);
      endpointLevelChecks.push({ road: road.id, node, y, coreLevels: levels, matchesCore, requiresReviewedHeightProfile:!matchesCore });
      if (!matchesCore&&!allowHeightDiagnostics) throw Error(`Tile endpoint needs a reviewed level profile: ${road.id}`);
    }
    for (const copy of copies) {
      const result = api.applyTileRoadNodeTransports([copy.sourceRoad], [p]);
      if (result.mismatched.length || result.applied.length !== 1 || JSON.stringify(result.roads[0].pts) !== JSON.stringify(p.pts)) throw Error(`Context application failed: ${road.id}`);
    }
  }
  if (endpointErrors.length) throw Error('Transported side streets do not meet the modeled core nodes.');
  const fullRoads = [...model.roads, ...tileRoads];
  const footprints = tileRoads.map(e => { const { L, R } = api.roadRibbon(e, fullRoads); return { id: e.id, L, R }; });
  const output = { version: 1, sourceCoreSHA256: hash(coreBytes), sourceModelSHA256: hash(modelBytes), sourceModelFile: resolve(modelFile), sourcePackSHA256: packHashes,
    ...(sourceData?{sourceRoadGeometryGeneration:sourceData.generationID,sourceDataSHA256:hash(sourceBytes)}:{}),
    endpointHeightDiagnosticsOnly:allowHeightDiagnostics,
    scope: (allowHeightDiagnostics?'UNSOLVED height diagnostics: unmatched endpoint levels remain release blockers; no height matching is claimed. ':'')+'Tile-only source roads incident to the coherent core endpoint field. All source owner/context copies are bound; no pack is mutated and no core-cache ID contract changes.',
    summary: { scannedPacks: core.packs.length, modeledNodes: Object.keys(nodes).length, tileRoads: tileRoads.length, ownerCopies: transports.reduce((n, p) => n + p.copies.filter(c => !c.context).length, 0), contextCopies: transports.reduce((n, p) => n + p.copies.filter(c => c.context).length, 0), maximumDisplacement: Math.max(0, ...transports.map(p => p.maximumDisplacement)), endpointErrors },
    endpointLevelChecks, incidentSourceOffsets, nodeSources, transports, tileRoads, footprints };
  await writeFile(resolve(outputFile), JSON.stringify(output));
  console.log(JSON.stringify({ ...output.summary, output: resolve(outputFile), bytes: (await readFile(resolve(outputFile))).length }));
} finally { await rm(temp, { recursive: true, force: true }); }
