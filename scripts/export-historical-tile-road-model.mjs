import { build, version as esbuildVersion } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertHistoricalMetadataParity } from './historical-road-surface-metadata.mjs';

// Historical geometry comes exclusively from the selected Git revision. The
// current observer only matches literal emitted Float32 vertices to surfaces.
const root = fileURLToPath(new URL('../', import.meta.url));
const options = {};
for (let i = 2; i < process.argv.length; i++) {
  const name = process.argv[i];
  if (name === '--help') { console.log('node scripts/export-historical-tile-road-model.mjs --historical-manifest FILE --ids FILE [--include-core-ids FILE] [--context-ids FILE] [--metadata-parent FILE] --output NEW_FILE'); process.exit(0); }
  if (!['--historical-manifest', '--ids', '--include-core-ids', '--context-ids', '--metadata-parent', '--output'].includes(name) || !process.argv[i + 1]) throw Error(`Unknown/incomplete option: ${name}`);
  options[name.slice(2)] = resolve(process.argv[++i]);
}
if (!options['historical-manifest'] || !options.ids || !options.output) throw Error('Provide --historical-manifest, --ids and --output.');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const inputs = {}, imported = {};
const generatorPath = fileURLToPath(import.meta.url), generatorSHA256 = sha(await readFile(generatorPath));
inputs[generatorPath] = generatorSHA256;
const metadataHelperPath = join(root, 'scripts/historical-road-surface-metadata.mjs');
inputs[metadataHelperPath] = sha(await readFile(metadataHelperPath));
async function held(path, expected) {
  const bytes = await readFile(path), actual = sha(bytes);
  if (expected && actual !== expected) throw Error(`Historical input changed: ${path}`);
  inputs[path] = actual; return { bytes, value: JSON.parse(bytes) };
}
const manifest = await held(options['historical-manifest']);
const metadataParent = options['metadata-parent'] ? await held(options['metadata-parent']) : null;
const ref = key => resolve(dirname(options['historical-manifest']), manifest.value[key].path);
const model = await held(ref('model'), manifest.value.model.sha256);
const provenance = await held(ref('provenance'), manifest.value.provenance.sha256);
const revision = execFileSync('git', ['rev-parse', '--verify', `${provenance.value.revision}^{commit}`], { cwd: root, encoding: 'utf8' }).trim();
if (revision !== provenance.value.revision || provenance.value.stage !== 'world' || provenance.value.outputSHA256 !== sha(model.bytes)) throw Error('The strict historical World provenance is invalid.');
if (revision !== 'a679b72bacefb751057f0282a86571e8e6ef006d') throw Error('This release comparison requires the accepted a679 historical source.');
const ids = await held(options.ids), requested = Array.isArray(ids.value) ? ids.value : ids.value.ids;
const coreSelector = options['include-core-ids'] ? (await held(options['include-core-ids'])).value : [];
const requestedCore = Array.isArray(coreSelector) ? coreSelector : coreSelector.ids;
const contextSelector = options['context-ids'] ? (await held(options['context-ids'])).value : [];
const requestedContext = Array.isArray(contextSelector) ? contextSelector : contextSelector.ids;
for (const selected of [requested, requestedCore, requestedContext]) if (!Array.isArray(selected) || selected.some(id => typeof id !== 'string') || new Set(selected).size !== selected.length) throw Error('Selectors must be unique string arrays, or {ids:[...]}.');
if (!requested.length && !requestedCore.length) throw Error('Select at least one historical road.');
const tree = execFileSync('git', ['ls-tree', '-r', revision, '--', 'public/city', 'package-lock.json'], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
const blobs = Object.fromEntries(tree.trim().split('\n').map(line => { const match = /^\d+ blob ([a-f0-9]{40})\t(.+)$/.exec(line); if (!match) throw Error('Expected SHA1 Git blob inventory'); return [match[2], match[1]]; }));
const dependencyBytes = await readFile(join(root, 'package-lock.json'));
inputs[join(root, 'package-lock.json')] = sha(dependencyBytes);
const blobHash = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
if (blobHash(dependencyBytes) !== blobs['package-lock.json']) throw Error('Historical geometry dependencies changed.');
const observerPath = 'scripts/qa/road-emitted-records.ts', observerSHA256 = sha(await readFile(join(root, observerPath)));
await mkdir(dirname(options.output), { recursive: true });
// Reserve the output before expensive generation; an existing evidence file is
// never replaced. The reservation is removed only if no result was written.
const reservation = options.output + '.lock';
await writeFile(reservation, 'historical tile export\n', { flag: 'wx' });
try { await readFile(options.output); throw Error('Preserve existing evidence; choose a new output.'); }
catch (error) { if (error.code !== 'ENOENT') { await rm(reservation); throw error; } }
const temporary = await mkdtemp(join(tmpdir(), 'road-historical-tiles-'));
try {
  const bundle = join(temporary, 'export.mjs');
  const entry = `
    import {readFileSync,writeFileSync} from 'node:fs';
    import {gunzipSync} from 'node:zlib';
    import {createHash} from 'node:crypto';
    import * as THREE from 'three';
    import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
    import {initTemplates} from './src/core/util';
    import {buildTile} from './src/world/city';
    import {currentRoadGradePatches,applyRoadGradePatches} from './src/world/road-grades';
    import {applyConstructionRoads} from './src/world/construction';
    import {roadRibbon} from './src/world/bridge-clearance';
    import {excludeStadiumRoads,stadiumExclusionsAt} from './src/world/stadium-roads';
    import {placeLandmarks} from './src/world/landmarks';
    import {placeAirfields} from './src/world/airfields';
    import {DESTINATION_IDENTITIES} from './src/world/destination-data';
    import {railwayNetwork} from './src/world/railway-geometry';
    import {matchEmittedRoadTriangles,emittedTriangleKey} from './scripts/qa/road-emitted-records';
    import {literalHistoricalSurfaceMetadata,appendHistoricalSurfaceRecord} from './scripts/historical-road-surface-metadata.mjs';
    const root=${JSON.stringify(root)},blobs=${JSON.stringify(blobs)},requested=new Set(${JSON.stringify(requested)}),requestedCore=new Set(${JSON.stringify(requestedCore)}),requestedContext=new Set(${JSON.stringify(requestedContext)}),selected=new Set([...requested,...requestedCore,...requestedContext]),observed={},sha=b=>createHash('sha256').update(b).digest('hex');
    const read=path=>{const b=readFileSync(root+'/'+path),git=createHash('sha1').update('blob '+b.length+'\\0').update(b).digest('hex');if(git!==blobs[path])throw Error('Historical source pack differs: '+path);observed[path]=sha(b);return JSON.parse(gunzipSync(b));};
    const core=read('public/city/core.pack.wasm'),world=JSON.parse(readFileSync(${JSON.stringify(ref('model'))})),coreIDs=new Set(core.roads.map(e=>e.id));
    if([...requested].some(id=>coreIDs.has(id)))throw Error('This supplement accepts tile-only IDs; historical core already has its own bound artifact.');
    if([...requestedCore].some(id=>!coreIDs.has(id)))throw Error('The core selector contains an unknown historical core ID.');
    if([...requestedContext].some(id=>coreIDs.has(id)))throw Error('Context selectors must be tile-only; core roads use --include-core-ids.');
    const chosen=new Set(),rawCopies=[],rawSelected=new Map(),sourcePackSHA256={},existing=new Set(core.packs.flatMap(p=>p.tiles.map(t=>t.join('_'))));
    for(const pack of core.packs){const path='public/city/'+pack.file,data=read(path);for(const[key,z]of Object.entries(data.tiles))for(const e of z.roads)if(selected.has(e.id)){rawCopies.push({id:e.id,tile:key,pack:pack.file,context:!!e.ctx});if(!rawSelected.has(e.id)||!e.ctx)rawSelected.set(e.id,e);for(let x=z.i-1;x<=z.i+1;x++)for(let y=z.j-1;y<=z.j+1;y++)if(existing.has(x+'_'+y))chosen.add(x+'_'+y);}}
    const missingRaw=[...requested,...requestedContext].filter(id=>!rawCopies.some(c=>c.id===id));if(missingRaw.length)throw Error('No historical raw source copies: '+missingRaw.join(','));
    const patches=currentRoadGradePatches(world.roads),landmarks=placeLandmarks(core.origin,core.packs.flatMap(p=>p.tiles)),airfields=placeAirfields(core.origin),railway=railwayNetwork(world.railwayPatches);
    initTemplates({rbox:new RoundedBoxGeometry(1,1,1,3,.12),ring:new THREE.RingGeometry(1,1.35,40)});
    // Tile builds retain their complete historical context. Only the evidence
    // output is spatially bounded: all selected roads plus every actual road
    // triangle in a conservative40m neighborhood of their complete paths.
    // This exceeds13.46m verified source correction+5m inference+the largest
    // vehicle half-length; it is not an analytic replacement for any surface.
    const regionCells=new Set(),worldByID=new Map(world.roads.map(e=>[e.id,e])),regionCellSize=40,regionPadding=40;
    for(const id of selected){const e=worldByID.get(id)||rawSelected.get(id);if(!e)throw Error('No historical region source '+id);const margin=Math.max(e.w,e.sceneryWidth||0)/2+3.5+regionPadding;for(let i=1;i<e.pts.length;i++){const a=e.pts[i-1],b=e.pts[i];for(let x=Math.floor((Math.min(a[0],b[0])-margin)/regionCellSize);x<=Math.floor((Math.max(a[0],b[0])+margin)/regionCellSize);x++)for(let z=Math.floor((Math.min(a[1],b[1])-margin)/regionCellSize);z<=Math.floor((Math.max(a[1],b[1])+margin)/regionCellSize);z++)regionCells.add(x+','+z);}}
    const inRegion=points=>{const xs=points.map(p=>p[0]),zs=points.map(p=>p[2]);for(let x=Math.floor(Math.min(...xs)/regionCellSize);x<=Math.floor(Math.max(...xs)/regionCellSize);x++)for(let z=Math.floor(Math.min(...zs)/regionCellSize);z<=Math.floor(Math.max(...zs)/regionCellSize);z++)if(regionCells.has(x+','+z))return true;return false;};
    const owner=new Map(),footprints=new Map(),triangles=[],copies=[],unmatched=[],outsideRegionUnmatched=[],inputDisagreements=[],footprintVariants=[],derivations=[],seen=new Map();let builtTiles=0,roadTriangles=0,omittedDistantMatched=0,duplicateSurfaceMatches=0,distinctSurfaceBindings=0;
    const stadiums=landmarks.filter(l=>l.id==='uppal_stadium'&&l.x!=null&&l.z!=null).flatMap(l=>stadiumExclusionsAt(l.x,l.z));
    const physical=e=>({pts:e.pts,elev:e.elev??null,w:e.w,from:e.from??null,to:e.to??null,oneway:e.oneway??null});
    const arc=(e,raw)=>{let prior=0;return e.pts.map(p=>{let distance=0,best=Infinity,at=0;for(let i=1;i<raw.pts.length;i++){const a=raw.pts[i-1],b=raw.pts[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),u=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(len*len||1))),s=distance+u*len,d=Math.hypot(p[0]-a[0]-u*dx,p[1]-a[1]-u*dz);if(s>=prior-.15&&d<best){best=d;at=s;}distance+=len;}if(best>.15)throw Error('Historical geometry has no raw legacy reference: '+e.id);prior=at;return at;});};
    for(const pack of core.packs){const tileKeys=pack.tiles.map(t=>t.join('_')).filter(k=>chosen.has(k));if(!tileKeys.length)continue;const path='public/city/'+pack.file,data=read(path);sourcePackSHA256[path]=observed[path];
      for(const key of tileKeys){const z=data.tiles[key];if(!z)throw Error('Historical tile missing '+key);const rawByID=new Map(z.roads.map(e=>[e.id,e]));
        const preparedRoads=applyConstructionRoads(applyRoadGradePatches(z.roads,patches),world.construction),roads=[],sources=new Map();
        for(const parent of preparedRoads){const raw=rawByID.get(parent.id);if(!raw)throw Error('Historical prepared road has no raw source '+parent.id);for(const fragment of excludeStadiumRoads([parent],stadiums)){
          if(sources.has(fragment.id))throw Error('Historical derived road ID collision '+fragment.id);
          sources.set(fragment.id,{raw,fragment});roads.push(fragment);
          if(fragment.id!==parent.id||JSON.stringify(physical(fragment))!==JSON.stringify(physical(parent)))derivations.push({actualRoadID:fragment.id,sourceRoadID:parent.id,rawOwner:{pack:pack.file,tile:key,roadIndex:z.roads.indexOf(raw),rawSHA256:sha(JSON.stringify(raw)),context:!!raw.ctx},operation:'strict-a679-excludeStadiumRoads',fragmentPoints:fragment.pts,fragmentLegacyArc:arc(fragment,raw),fragmentEndpoints:[fragment.pts[0],fragment.pts.at(-1)],generatorBinding:'strict historical src/world/stadium-roads.ts; sourceFiles hash recorded'});
        }}
        const furniture=core.trafficSignals===undefined?z.furniture.filter(f=>f.kind!=='traffic_signals'||!f.synth):[...z.furniture.filter(f=>f.kind!=='traffic_signals'),...core.trafficSignals.filter(f=>f.p[0]>=z.i*1000-80&&f.p[0]<(z.i+1)*1000+80&&f.p[1]>=z.j*1000-80&&f.p[1]<(z.j+1)*1000+80)];
        const tile=buildTile({...z,roads:preparedRoads,furniture},{lowQ:true,metro:core.metro,landmarks,airfields,construction:world.construction,destinations:DESTINATION_IDENTITIES.filter(d=>d.tile[0]===z.i&&d.tile[1]===z.j),railway});builtTiles++;
        const result=matchEmittedRoadTriangles(tile);roadTriangles+=result.roadTriangles;for(const record of result.unmatched)(inRegion(record.points)?unmatched:outsideRegionUnmatched).push(record);const arcByID=new Map();
        const triangleByID=new Map();for(const record of result.matched){const s=record.surface,e=s.e,source=sources.get(e.id);if(!source||JSON.stringify(physical(source.fragment))!==JSON.stringify(physical(e)))throw Error('Historical emitted road has no exact raw/derived source '+e.id);const raw=source.raw;if(!selected.has(raw.id)&&!inRegion(record.points)){omittedDistantMatched++;continue;}let a=arcByID.get(e.id);if(!a){a=arc(e,raw);arcByID.set(e.id,a);}const i=s.i;if(i<0||i>=a.length-1)throw Error('Historical surface has an invalid segment '+e.id);
          const t={road:e.id,points:record.points,arc:[a[i],a[i+1]],centre:[e.pts[i],e.pts[i+1]],tile:key,cap:record.triangulatedPatch};(triangleByID.get(e.id)||triangleByID.set(e.id,[]).get(e.id)).push(t);const token=e.id+'/'+emittedTriangleKey(t.points)+'/'+i+'/'+a[i]+','+a[i+1];const metadata=literalHistoricalSurfaceMetadata(s,raw.id,t.arc),added=appendHistoricalSurfaceRecord(seen,triangles,token,t,metadata);if(added.duplicate)duplicateSurfaceMatches++;if(added.distinctBinding)distinctSurfaceBindings++;}
        for(const e of roads){const actual=(triangleByID.get(e.id)||[]);if(!selected.has(sources.get(e.id).raw.id)&&!actual.length)continue;const ribbon=roadRibbon(e,roads),footprint={id:e.id,L:ribbon.L,R:ribbon.R},physicalSHA256=sha(JSON.stringify(physical(e))),footprintSHA256=sha(JSON.stringify(footprint)),prior=owner.get(e.id);
          if(prior&&sha(JSON.stringify(physical(prior)))!==physicalSHA256)inputDisagreements.push({id:e.id,tile:key,pack:pack.file,context:!!e.ctx});
          if(!prior||!e.ctx)owner.set(e.id,e);const old=footprints.get(e.id);if(old&&sha(JSON.stringify(old))!==footprintSHA256)footprintVariants.push({id:e.id,tile:key,pack:pack.file,context:!!e.ctx,footprint});else if(!old)footprints.set(e.id,footprint);
          copies.push({id:e.id,tile:key,pack:pack.file,context:!!e.ctx,physicalSHA256,footprintSHA256,emittedSHA256:sha(JSON.stringify(actual)),emittedTriangles:actual.length});}
        tile.buffers.length=0;
      }
    }
    const emitted=new Set(triangles.map(t=>t.road)),requestedNotRendered=[...requested].filter(id=>!emitted.has(id)),contextNotRendered=[...requestedContext].filter(id=>!emitted.has(id)),includedCoreNotRendered=[...requestedCore].filter(id=>!emitted.has(id)),includedCoreWithoutRawTileCopy=[...requestedCore].filter(id=>!rawCopies.some(c=>c.id===id));
    const report={schemaVersion:1,revision:${JSON.stringify(revision)},sourceCoreSHA256:observed['public/city/core.pack.wasm'],sourcePackSHA256,scannedSourceSHA256:observed,requestedRoadIDs:[...requested],includedCoreRoadIDs:[...requestedCore],contextRoadIDs:[...requestedContext],contextNotRendered,derivations,roads:[...owner.values()],physicalFootprints:[...footprints.values()],triangles,copies,rawRequestedCopies:rawCopies,unmatched,outsideRegionUnmatched,inputDisagreements,footprintVariants,requestedNotRendered,includedCoreNotRendered,includedCoreWithoutRawTileCopy,
      coverageRegion:{kind:'conservative selected-complete-path grid; actual tile builds unchanged',cellSizeM:regionCellSize,paddingM:regionPadding,auxiliaryAllowanceM:3.5,cells:regionCells.size,selectedIDs:[...selected].sort(),allSelectedTrianglesRetained:true,allLocalMatchedTrianglesRetained:true,omittedDistantMatched},
      summary:{builtTiles,roadTriangles,uniqueTriangles:triangles.length,nearbyRoads:owner.size,requested:requested.size,includedCore:requestedCore.size,rawRequestedCopies:rawCopies.length,unmatched:unmatched.length,outsideRegionUnmatched:outsideRegionUnmatched.length,inputDisagreements:inputDisagreements.length,footprintVariants:footprintVariants.length},
      scope:'Actual a679 source modules and buildTile Float32 emission, old worker-equivalent prepared core patches/construction/rail/metro context. Requested tile roads and adjacent tiles/roads/caps retained. Current observer matches literal vertices only. Not a gameplay or final release acceptance.',releaseApproved:false};
    writeFileSync(${JSON.stringify(join(temporary,'result.json'))},JSON.stringify(report),{flag:'wx'});
    writeFileSync(${JSON.stringify(join(temporary,'metadata-summary.json'))},JSON.stringify({duplicateSurfaceMatches,distinctSurfaceBindings,ambiguousTriangleIndices:triangles.flatMap((t,i)=>t.actualSurfaceBindings?[i]:[])}),{flag:'wx'});
  `;
  await build({ stdin: { contents: entry, resolveDir: root, loader: 'ts' }, outfile: bundle, bundle: true, platform: 'node', format: 'esm', target: 'node22',
    define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' }, logLevel: 'error', plugins: [{ name: 'strict-historical-source', setup(builder) {
      builder.onLoad({ filter: /[/\\]src[/\\]/ }, args => {
        if (!args.path.startsWith(join(root, 'src') + sep)) return;
        const path = relative(root, args.path).split(sep).join('/');
        const contents = execFileSync('git', ['show', `${revision}:${path}`], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
        imported[path] = sha(contents); return { contents, loader: extname(path) === '.json' ? 'json' : 'ts', resolveDir: dirname(args.path) };
      });
    } }] });
  await import(pathToFileURL(bundle).href);
  for (const [path, expected] of Object.entries(inputs)) if (sha(await readFile(path)) !== expected) throw Error(`Input changed during export: ${path}`);
  if (sha(await readFile(join(root, observerPath))) !== observerSHA256) throw Error('Emission observer changed during export.');
  const result = JSON.parse(await readFile(join(temporary, 'result.json')));
  for (const [path, expected] of Object.entries(result.scannedSourceSHA256)) if (sha(await readFile(join(root, path))) !== expected) throw Error(`Source pack changed during export: ${path}`);
  result.sourceFiles = Object.fromEntries(Object.entries(imported).sort(([a], [b]) => a.localeCompare(b))); result.observer = { path: observerPath, sha256: observerSHA256 };
  result.inputs = Object.fromEntries(Object.entries(inputs).sort(([a], [b]) => a.localeCompare(b))); result.nodeVersion = process.version; result.esbuildVersion = esbuildVersion;
  result.generatorSHA256 = generatorSHA256;
  const surfaceMetadataSummary = JSON.parse(await readFile(join(temporary, 'metadata-summary.json')));
  const parity = metadataParent ? assertHistoricalMetadataParity(metadataParent.value, result) : null;
  // Preserve the complete original artifact and its historical export receipt.
  // The new export has separate provenance so additive parity is inspectable.
  const output = metadataParent ? { ...metadataParent.value, triangles: result.triangles } : result;
  output.sourceHistoricalTileModelSHA256 = metadataParent ? sha(metadataParent.bytes) : null;
  output.metadataExport = { schemaVersion: 1, generatorSHA256, inputs: result.inputs, sourceFiles: result.sourceFiles,
    observer: result.observer, nodeVersion: result.nodeVersion, esbuildVersion: result.esbuildVersion,
    sourceHistoricalTileModelSHA256: output.sourceHistoricalTileModelSHA256, legacyParity: parity,
    actualSurfaceRecords: result.triangles.length, metadataSHA256: sha(JSON.stringify(result.triangles.map(t => ({ actualSurface: t.actualSurface, actualSurfaceBindings: t.actualSurfaceBindings })))),
    ...surfaceMetadataSummary,
    ambiguityPolicy: 'Every matched Surface is checked before deduplication. Differing literal lift, structuralQuad or source-branch bindings are preserved in actualSurfaceBindings and remain unresolved. Equivalent tile/copy origins are not different datums.',
    releaseApproved: false };
  await writeFile(options.output, JSON.stringify(output), { flag: 'wx' });
  console.log(JSON.stringify({ output: options.output, sha256: sha(await readFile(options.output)), ...output.summary, ...surfaceMetadataSummary, legacyParity: parity, requestedNotRendered: output.requestedNotRendered, includedCoreNotRendered: output.includedCoreNotRendered }));
  process.exitCode = output.unmatched.length || output.inputDisagreements.length || surfaceMetadataSummary.distinctSurfaceBindings ? 1 : 0;
} finally { await rm(temporary, { recursive: true, force: true }); await rm(reservation, { force: true }); }
