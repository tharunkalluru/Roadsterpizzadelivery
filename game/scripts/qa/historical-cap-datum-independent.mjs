import { build } from 'esbuild';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, resolve, join, relative, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url)), output = process.argv[2];
if (!output) throw Error('Supply a new output receipt path.');
const revision = 'a679b72bacefb751057f0282a86571e8e6ef006d', sha = b => createHash('sha256').update(b).digest('hex'), inputs = {}, imported = {};
async function held(file, expected) { const b = await readFile(file), actual = sha(b); if (expected && actual !== expected) throw Error(`Input mismatch: ${file}`); inputs[file] = actual; return b; }
const historicalPath = '/tmp/road-historical-joint-487-tile-806-context-505-core-9413-v3.json';
const historical = JSON.parse(await held(historicalPath, 'd746a980fcb73574f5759f779e487b68f7dac54794edaabd33f35ef6562ebd90'));
const unresolvedPath = '/tmp/source-9413-be04-joint-v5-zero-bank.json', unresolved = JSON.parse(await held(unresolvedPath)).historicalReferenceUnresolved;
const modelPath = Object.keys(historical.inputs).find(p => /model-f6c089/.test(p)); await held(modelPath, historical.inputs[modelPath]);
await held(fileURLToPath(import.meta.url));
await held(resolve(root, historical.observer.path), historical.observer.sha256);
await held(resolve(root, 'package-lock.json'), historical.inputs[resolve(root, 'package-lock.json')]);
function bary(points, p) { const [a,b,c] = points, bx=b[0]-a[0], bz=b[2]-a[2], cx=c[0]-a[0], cz=c[2]-a[2], det=bx*cz-bz*cx; if(Math.abs(det)<1e-10)return null;const u=((p[0]-a[0])*cz-(p[1]-a[2])*cx)/det,v=(bx*(p[1]-a[2])-bz*(p[0]-a[0]))/det;return Math.min(1-u-v,u,v)>=-1e-5?[1-u-v,u,v]:null; }
const byRoad = new Map(); for (const t of historical.triangles) (byRoad.get(t.road) || byRoad.set(t.road, []).get(t.road)).push(t);
const witnesses = unresolved.map(row => ({ ...row, triangles: (byRoad.get(row.road)||[]).filter(t => bary(t.points, row.point)) }));
const tiles = [...new Set(witnesses.flatMap(w => w.triangles.map(t => t.tile)))].sort(), roads = [...new Set(unresolved.map(r => r.road))];
const corePath = resolve(root, 'public/city/core.pack.wasm'); await held(corePath, historical.sourceCoreSHA256);
const temporary = await mkdtemp(join(tmpdir(), 'historical-cap-datum-'));
try {
  const entry = `
    import{readFileSync}from'node:fs';import{gunzipSync}from'node:zlib';import{createHash}from'node:crypto';
    import*as THREE from'three';import{RoundedBoxGeometry}from'three/addons/geometries/RoundedBoxGeometry.js';
    import{initTemplates}from'./src/core/util';import{buildTile}from'./src/world/city';
    import{currentRoadGradePatches,applyRoadGradePatches}from'./src/world/road-grades';import{applyConstructionRoads}from'./src/world/construction';
    import{placeLandmarks}from'./src/world/landmarks';import{placeAirfields}from'./src/world/airfields';import{DESTINATION_IDENTITIES}from'./src/world/destination-data';
    import{railwayNetwork}from'./src/world/railway-geometry';import{roadQuadHeight}from'./src/world/road-surface';
    import{supportAt}from'./src/game/physics';
    import{matchEmittedRoadTriangles,emittedTriangleKey}from'./scripts/qa/road-emitted-records';
    const root=${JSON.stringify(root)},core=JSON.parse(gunzipSync(readFileSync(${JSON.stringify(corePath)}))),world=JSON.parse(readFileSync(${JSON.stringify(modelPath)}));
    const selected=new Set(${JSON.stringify(tiles)}),ids=new Set(${JSON.stringify(roads)}),witnesses=${JSON.stringify(unresolved.map(w=>({road:w.road,point:w.point})))},consumed={},records=[],physicsQueries=[],packs=new Map();
    const hash=b=>createHash('sha256').update(b).digest('hex'),patches=currentRoadGradePatches(world.roads),landmarks=placeLandmarks(core.origin,core.packs.flatMap(p=>p.tiles)),airfields=placeAirfields(core.origin),railway=railwayNetwork(world.railwayPatches);
    initTemplates({rbox:new RoundedBoxGeometry(1,1,1,3,.12),ring:new THREE.RingGeometry(1,1.35,40)});
    for(const pack of core.packs){const keys=pack.tiles.map(t=>t.join('_')).filter(t=>selected.has(t));if(!keys.length)continue;const path='public/city/'+pack.file,bytes=readFileSync(root+'/'+path);consumed[path]=hash(bytes);const data=JSON.parse(gunzipSync(bytes));
      for(const key of keys){const z=data.tiles[key],roads=applyConstructionRoads(applyRoadGradePatches(z.roads,patches),world.construction);
        const furniture=core.trafficSignals===undefined?z.furniture.filter(f=>f.kind!=='traffic_signals'||!f.synth):[...z.furniture.filter(f=>f.kind!=='traffic_signals'),...core.trafficSignals.filter(f=>f.p[0]>=z.i*1000-80&&f.p[0]<(z.i+1)*1000+80&&f.p[1]>=z.j*1000-80&&f.p[1]<(z.j+1)*1000+80)];
        const built=buildTile({...z,roads,furniture},{lowQ:true,metro:core.metro,landmarks,airfields,construction:world.construction,destinations:DESTINATION_IDENTITIES.filter(d=>d.tile[0]===z.i&&d.tile[1]===z.j),railway});
        for(const r of matchEmittedRoadTriangles(built).matched){const s=r.surface;if(!ids.has(s.e.id))continue;if(!Number.isFinite(s.paintLift))throw Error('Every source triangle must declare literal paintLift');
          records.push({road:s.e.id,cls:s.e.cls,segment:s.i,centre:[s.e.pts[s.i],s.e.pts[s.i+1]],tile:key,points:r.points,triangleKey:emittedTriangleKey(r.points),triangulatedPatch:r.triangulatedPatch,paintLift:s.paintLift,structuralQuad:s.roadQuad,structuralRange:[Math.min(...s.roadQuad.map(p=>p[1])),Math.max(...s.roadQuad.map(p=>p[1]))]});}
        for(const w of witnesses){if(w.point.map(v=>Math.floor(v/1000)).join('_')!==key)continue;const hs=records.filter(r=>r.tile===key&&r.road===w.road).map(r=>roadQuadHeight(r.structuralQuad,...w.point)).filter(h=>h!==null);for(const fromY of new Set([0,...hs])){const s=supportAt(built,...w.point,fromY,true);physicsQueries.push({road:w.road,point:w.point,fromY,actualSupportY:s.y,supportRoad:s.s?.e?.id,paintLift:s.s?.paintLift,triangulatedPatch:!!s.s?.roadQuad&&s.s.roadQuad[2][0]===s.s.roadQuad[3][0]&&s.s.roadQuad[2][2]===s.s.roadQuad[3][2],kind:s.kind});}}
      }
    }
    export{records,consumed,roadQuadHeight,physicsQueries};
  `;
  const compiled = join(temporary, 'replay.mjs');
  await build({ stdin: { contents: entry, resolveDir: root, loader: 'ts' }, outfile: compiled, bundle: true, platform: 'node', format: 'esm', target: 'node22', define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' }, logLevel: 'error', plugins: [{ name: 'strict-a679-all-src', setup(b) {
    b.onLoad({ filter: /[/\\]src[/\\]/ }, args => { if(!args.path.startsWith(join(root,'src')+sep))return;const path=relative(root,args.path).split(sep).join('/'),contents=execFileSync('git',['show',revision+':'+path],{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024});imported[path]=sha(contents);if(historical.sourceFiles[path]&&imported[path]!==historical.sourceFiles[path])throw Error('Historical module differs '+path);return{contents,loader:extname(path)==='.json'?'json':'ts',resolveDir:dirname(args.path)}; });
  } }] });
  const replay = await import(pathToFileURL(compiled).href);
  for (const [path, expected] of Object.entries(replay.consumed)) await held(resolve(root,path), historical.scannedSourceSHA256[path]);
  const key = points => points.map(p=>p.map(Math.fround).join(',')).sort().join('|'), matches = new Map();
  for(const r of replay.records){const token=r.road+'/'+r.triangleKey;(matches.get(token)||matches.set(token,[]).get(token)).push(r);}
  const film = {motorway:.08,motorway_link:.07,trunk_link:.068,trunk:.075,primary:.07,secondary:.062,tertiary:.055,primary_link:.066,secondary_link:.06,tertiary_link:.052,unclassified:.048,residential:.045,living_street:.042,service:.038,unknown:.04};
  const roadByID = new Map(historical.roads.map(e=>[e.id,e])), failures=[], results=[];let maxFloat32StructuralError=0;
  for(const w of witnesses){const rows=[];for(const t of w.triangles){const source=matches.get(t.road+'/'+key(t.points))||[];if(!source.length){failures.push({road:w.road,point:w.point,reason:'Historical literal triangle absent from strict replay',triangle:t});continue;}
      for(const s of source){const weights=bary(t.points,w.point),asphalt=weights.reduce((v,b,i)=>v+b*t.points[i][1],0),structuralFromFloat32=asphalt-s.paintLift,structuralSupport=replay.roadQuadHeight(s.structuralQuad,...w.point);
        if(structuralSupport===null){failures.push({road:w.road,point:w.point,reason:'Literal structural quad does not cover Float32 witness'});continue;}
        maxFloat32StructuralError=Math.max(maxFloat32StructuralError,Math.abs(structuralFromFloat32-structuralSupport));
        rows.push({...s,asphalt,wrongOwnClassNormalization:asphalt-(film[roadByID.get(w.road).cls]??.04),structuralFromFloat32,structuralSupport});}
    }
    const heights=rows.map(r=>r.structuralFromFloat32),support=rows.map(r=>r.structuralSupport),range=heights.length?Math.max(...heights)-Math.min(...heights):null,structuralRange=support.length?Math.max(...support)-Math.min(...support):null;
    results.push({road:w.road,point:w.point,oldReportedHeights:w.historicalActualHeights,sourceBoundRows:rows,literalStructuralRange:range,sourceSupportRange:structuralRange,classification:range===null?'unbound':range>.01?'genuine-structural-ambiguity':'film-normalization-false-ambiguity'});
  }
  for(const[file,expected]of Object.entries(inputs))if(sha(await readFile(file))!==expected)throw Error('Input changed during replay '+file);
  const classifications={};for(const r of results)classifications[r.classification]=(classifications[r.classification]||0)+1;
  const directRows=JSON.parse(await held(unresolvedPath)).directConflicts.filter(r=>r.constraint?.category==='independent-finite-headroom'),inside=directRows.filter(r=>tiles.includes(r.constraint.point.map(v=>Math.floor(v/1000)).join('_')));
  const headroomCoverage={totalDirectHeadRows:directRows.length,pointsInReplayedTiles:inside.length,rowsWithAtLeastOneReplayedRoadDatum:inside.filter(r=>r.constraint.roads.some(id=>roads.includes(id))).length,rowsWithBothReplayedRoadDatums:inside.filter(r=>r.constraint.roads.every(id=>roads.includes(id))).length,scope:'No old-gap/direct-headroom row is validated merely because its point shares a replayed tile.'};
  const report={schemaVersion:1,scope:'Targeted stricta679 actual City cap datum replay. Diagnostic only; never a layer waiver or solved-profile approval.',releaseApproved:false,pass:failures.length===0&&maxFloat32StructuralError<.001,revision,summary:{witnesses:results.length,tiles:tiles.length,roads:roads.length,matchedActualSurfaceRecords:replay.records.length,maxFloat32StructuralError,classifications},headroomCoverage,physicsQueries:replay.physicsQueries,failures,results,sourceFiles:imported,beforeAfterUnchangedInputs:inputs,
    requiredExporterChange:'Store finite paintLift directly from each matched actual Surface for every strip/clipped strip/junction-cap triangle, plus structuralQuad or structural-vertex/source-support provenance. Do not infer it from the representative road class or cap flag.',
    fullParityConditions:['Same exact requested/core/context selectors and ROI; literal Float32 triangles/road IDs/segments/parent arcs unchanged; same old full tile context.', 'Record paintLift/structuralQuad per actual matched Surface before dedup; retain differing structural bindings as explicit ambiguity, not one arbitrary winner.', 'New old-source SHA and new exporter/source receipts; exact oldXYZ triangle/copy/footprint/derivation parity against d746.', 'Candidate emitter and structural finite sampler require the same explicit paintLift treatment; genuine structural multi-sheet ambiguities remain unresolved.']};
  await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({output,sha256:sha(await readFile(output)),pass:report.pass,summary:report.summary,failures:failures.length}));process.exitCode=report.pass?0:1;
} finally { await rm(temporary,{recursive:true,force:true}); }
