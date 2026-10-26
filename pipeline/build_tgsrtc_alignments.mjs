// Reconstruct reproducible bus road alignments from published GTFS stop order.
// These are inferred paths over the shipped OSM/Overture-derived road network,
// never agency-certified shapes or evidence of a current operational diversion.
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rename, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import { build } from '../game/node_modules/esbuild/lib/main.js';

const root = fileURLToPath(new URL('../', import.meta.url)), args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
const input = resolve(option('--input', join(root, 'game/public/transit/tgsrtc.pack.wasm')));
const corePath = resolve(option('--core', join(root, 'game/public/city/core.pack.wasm')));
const output = resolve(option('--output', input));
const auditPath = resolve(option('--audit', join(root, 'pipeline/evidence/tgsrtc-alignment-audit-2026-10-26.json')));
const requestedDate = option('--date', null);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const decode = bytes => JSON.parse(gunzipSync(bytes));
const atomic = async (path, bytes) => { await mkdir(dirname(path), { recursive: true }); const temp = `${path}.${process.pid}.tmp`; await writeFile(temp, bytes); await rename(temp, path); };
const temporary = await mkdtemp(join(tmpdir(), 'roadster-transit-alignments-'));
try {
  const inputBytes = await readFile(input), coreBytes = await readFile(corePath), feed = decode(inputBytes), core = decode(coreBytes);
  const previousAlignments = feed.alignments;
  const previousPatternAlignments = new Map(feed.patterns.map(pattern => [pattern.id, pattern.alignmentIds]));
  // Rebuilding an already aligned pack preserves its provenance timestamp by
  // default, so identical feed/network bytes reproduce identical output. An
  // explicit --date records a deliberately refreshed source/network review.
  const generatedAt = requestedDate || feed.alignmentProvenance?.generatedAt || new Date().toISOString();
  if (feed.origin.lat !== core.origin.lat || feed.origin.lon !== core.origin.lon) throw new Error('Bus/core projection mismatch');
  // A rebuild always derives from agency stops, never from an earlier inferred path.
  delete feed.alignments; delete feed.alignmentProvenance; feed.schema = 1;
  for (const pattern of feed.patterns) delete pattern.alignmentIds;
  await build({ stdin: { contents: `export { BusServices } from './src/game/bus-services'; export { RoadGraph } from './src/game/roadgraph'; export { busTurnPossible, busLane } from './src/game/bus-path'; export { Traffic } from './src/game/traffic'; export { rng } from './src/core/util'; export { Scene,BufferGeometry,MeshBasicMaterial } from 'three';`, resolveDir: join(root, 'game'), loader: 'ts' }, outfile: join(temporary, 'alignment.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'error' });
  const { BusServices, RoadGraph, busTurnPossible, busLane, Traffic, rng, Scene, BufferGeometry, MeshBasicMaterial } = await import(pathToFileURL(join(temporary, 'alignment.mjs')));
  const roads = new Map(), sources = [{ file: 'core.pack.wasm', sha256: digest(coreBytes) }];
  const keep = road => {
    if (road.w < 6 || road.cls === 'service' || road.ctx || roads.has(road.id)) return;
    roads.set(road.id, { id: road.id, seg: road.seg, from: road.from, to: road.to, pts: road.pts,
      elev: road.elev, oneway: road.oneway, cls: road.cls, w: road.w, lanes: road.lanes, name: road.name, maxspeed: road.maxspeed });
  };
  for (const road of core.roads) keep(road);
  for (const [index, pack] of [...core.packs].sort((a, b) => a.file.localeCompare(b.file)).entries()) {
    const bytes = await readFile(join(dirname(corePath), pack.file)); sources.push({ file: pack.file, sha256: digest(bytes) });
    for (const tile of Object.values(decode(bytes).tiles)) for (const road of tile.roads) keep(road);
    if ((index + 1) % 100 === 0) console.log(`Read ${index + 1}/${core.packs.length} city packs`);
  }
  const graph = new RoadGraph([...roads.values()]); roads.clear();
  const executionSourceFiles = ['game/src/game/traffic.ts','game/src/game/bus-services.ts','game/src/game/bus-path.ts','game/src/game/traffic-path.ts'];
  const executionSources = await Promise.all(executionSourceFiles.map(async file => ({ file, sha256:digest(await readFile(join(root,file))) })));
  const services = new BusServices(graph, feed), cache = new Map(), alignments = {}, reasons = {}, routes = [], rejectedExecutions = [];
  const geometry = new BufferGeometry(), material = new MeshBasicMaterial(), scene = new Scene();
  let executions = 0, replans = 0, executionFailures = 0;
  const execute = (alignment, sourcePattern) => {
    const pattern = { ...sourcePattern, stops: [alignment.fromStop, alignment.toStop], alignmentIds: ['probe'] };
    const localFeed = { ...feed, schema: 2, patterns: [pattern], alignments: { probe: alignment } };
    const runtimeServices = new BusServices(graph, localFeed), first = alignment.steps[0], edge = graph.byId.get(first.edge);
    const run = runtimeServices.bind(edge, first.dir, first.from, 0);
    if (!run) return { okay: false, edge, dir: first.dir, next: alignment.steps[1] && { edge: graph.byId.get(alignment.steps[1].edge), dir: alignment.steps[1].dir }, reason: 'source_stop_has_no_safe_bus_departure' };
    const traffic = Object.assign(Object.create(Traffic.prototype), { cars: [], max: 0, graph, city: undefined, scene, mats: { vBody: material, vLight: material },
      byGroup: { bus: [{ group:'bus',size:[2.5,3.3,11],body:geometry,lights:geometry,decals:[] }] }, r: rng(77), t: 0, plans: 0, stopsByEdge: new Map(), onHorn() {}, services: runtimeServices });
    const car = traffic.spawnAt('bus', edge, first.dir, first.from, busLane(edge)); car.busRun = run;
    let idle = 0, dwelled = false, result;
    const limit = Math.min(7200, Math.max(90, alignment.lengthM / 1.5 + alignment.steps.length * 6 + 60));
    for (let time = 0; time < limit; time += .05) {
      const before = [car.x, car.z];
      traffic.update(.05, car.x, car.z, { x: car.x + 290, y: .55, z: car.z + 290, speed:0,hx:1,hz:0 }, []);
      dwelled ||= car.dwell > 0;
      if (dwelled && run.ended) { result = { okay: true }; break; }
      idle = Math.hypot(car.x - before[0], car.z - before[1]) < .001 && car.dwell <= 0 ? idle + .05 : 0;
      if (idle >= 15) {
        const next = run.path[run.step + 1];
        result = { okay: false, edge:car.edge,dir:car.dir,next,reason:'production_bus_cannot_execute_source_corner' }; break;
      }
    }
    traffic.clear(); executions++;
    return result || { okay:false,edge:car.edge,dir:car.dir,next:run.path[run.step+1],reason:'production_bus_execution_deadline' };
  };
  let totalLegs = 0, resolvedLegs = 0, fullyResolvedPatterns = 0, joinChecks = 0, maximumJoinGapM = 0, playableStopLegs = 0, resolvedPlayableStopLegs = 0;
  const inside = id => { const p = feed.stops[id], b = core.bounds; return p && p[1] >= b.minX && p[1] <= b.maxX && p[2] >= b.minZ && p[2] <= b.maxZ; };
  const auditAlignment = alignment => {
    if (alignment.status !== 'inferred_legal_road_path') return;
    if (!alignment.steps?.length || !alignment.pts?.length || alignment.maxStopSnapM > 100.1) throw new Error('Invalid inferred alignment');
    for (const [i, step] of alignment.steps.entries()) {
      const edge = graph.byId.get(step.edge);
      if (!edge || edge.e.oneway === (step.dir === 1 ? 'forward' : 'backward') || step.from < 0 || step.to < step.from || step.to > edge.len + .002) throw new Error('Alignment violates directed road geometry');
      if (!i) continue;
      const prev = alignment.steps[i - 1], prevEdge = graph.byId.get(prev.edge);
      const p = graph.pointAt(prevEdge, prev.to, prev.dir), q = graph.pointAt(edge, step.from, step.dir);
      const gap = Math.hypot(p.x - q.x, p.z - q.z); joinChecks++; maximumJoinGapM = Math.max(maximumJoinGapM, gap);
      if ((prev.dir === 1 ? prevEdge.to : prevEdge.from) !== (step.dir === 1 ? edge.from : edge.to) || gap > 2) throw new Error('Disconnected route alignment');
      if (!busTurnPossible(graph, prevEdge, prev.dir, edge, step.dir)) throw new Error('Route contains a turn rejected by production bus motion');
    }
  };
  for (const [pIndex, pattern] of feed.patterns.entries()) {
    const ids = [], unresolved = [];
    for (let index = 0; index < pattern.stops.length - 1; index++) {
      const context = [pattern.stops[Math.max(0, index - 1)], pattern.stops[index], pattern.stops[index + 1], pattern.stops[Math.min(pattern.stops.length - 1, index + 2)]];
      const key = JSON.stringify(context); let id = cache.get(key);
      if (!id) {
        id = digest(key).slice(0, 20);
        // A failed turn can be specific to this stop's available approach room.
        // Do not forbid that transition for every other service in the city.
        services.clearExecutionRejections();
        let alignment = services.reconstruct(pattern, index);
        let lastFailure, attempts = 0;
        for (let attempt = 0; alignment.status === 'inferred_legal_road_path'; attempt++) {
          const execution = execute(alignment, pattern);
          if (execution.okay) { alignment.execution = { status:'destination_dwell_verified', stepSeconds:.05, pathSha256:digest(JSON.stringify(alignment.steps)) }; break; }
          attempts++; lastFailure = { reason:execution.reason, edge:execution.edge.e.id, dir:execution.dir,
            nextEdge:execution.next?.edge.e.id, nextDir:execution.next?.dir };
          executionFailures++;
          if (attempt >= 7) { alignment = { status:'unresolved',fromStop:alignment.fromStop,toStop:alignment.toStop,reason:execution.reason }; break; }
          services.rejectExecution(execution.edge, execution.dir, execution.next); replans++;
          alignment = services.reconstruct(pattern, index);
        }
        if (alignment.status === 'unresolved' && lastFailure) rejectedExecutions.push({ alignment:id, pattern:pattern.id, index,
          fromStop:alignment.fromStop, toStop:alignment.toStop, finalReason:alignment.reason, attempts, lastFailure });
        auditAlignment(alignment);
        cache.set(key, id); alignments[id] = alignment;
      }
      ids.push(id); totalLegs++;
      const playable = inside(pattern.stops[index]) && inside(pattern.stops[index + 1]);
      if (playable) { playableStopLegs++; if (alignments[id].status === 'inferred_legal_road_path') resolvedPlayableStopLegs++; }
      if (alignments[id].status === 'inferred_legal_road_path') resolvedLegs++;
      else { const reason = alignments[id].reason; reasons[reason] = (reasons[reason] || 0) + 1; unresolved.push({ index, fromStop: pattern.stops[index], toStop: pattern.stops[index + 1], reason }); }
    }
    pattern.alignmentIds = ids;
    if (!unresolved.length) fullyResolvedPatterns++;
    routes.push({ pattern: pattern.id, number: pattern.number, direction: pattern.direction, publishedTrip: pattern.tripId, legs: ids.length, resolvedLegs: ids.length - unresolved.length, unresolved });
    if ((pIndex + 1) % 250 === 0) console.log(`Reconstructed ${pIndex + 1}/${feed.patterns.length} published stop patterns`);
  }
  const networkSha256 = digest(JSON.stringify(sources));
  const provenance = {
    method: 'GTFS ordered stops constrained to incoming-directed-edge bus paths with arterial preference and production turn limits',
    plannerVersion: 'bus-directed-turns-3',
    executionAdmission: { engine:'Production Traffic.update', stepSeconds:.05, requires:'destination dwell and ended service', retriesPerLeg:8,
      sourceFiles:executionSources,
      limitation:'Offline source-road corridor test. Streamed building/traffic conflicts and live signal waits remain runtime safety constraints.' },
    status: 'inferred_legal_road_paths_not_agency_shapes', generatedAt,
    sourcePage: feed.sourcePage, feedSource: feed.source, feedSourceSha256: feed.sourceSha256, feedVersion: feed.feed.feed_version,
    networkSha256, networkSourceAttribution: core.attribution.filter(a => /OpenStreetMap|Overture/.test(a)),
    networkFiles: sources.length, roadEdges: graph.edges.length,
    constraints: { maximumStopSnapM: 100, inferredStopEndSetbackM: 16, minimumStopEdgeLengthM: 12,
      maximumStopChordCorridorM: 550, maximumStopSeparationM: 7000, minimumRoadWidthM: 6,
      maximumJunctionTurnDegrees: 158.4, minimumNPCBusRadiusM:6.5, motionLookaheadM:120,
      angleWeightedApproachClearance:true, forbidsSameEdgeReversal: true, prefersBusWidthArterials: true,
      excludesServiceRoads: true, respectsMappedOneWaysAndGradeSeparation: true, maximumDetour: '3 × stop chord + 300 metres' },
    limitation: 'Agency feed contains no shapes.txt. Reconstructed paths do not establish the exact currently operated streets, diversions, bus-only access restrictions or live service. Unresolved legs are not simulated.'
  };
  feed.schema = 2; feed.alignments = alignments; feed.alignmentProvenance = provenance;
  feed.uncertainty = 'Published February 2026 static stop patterns, not live operation. No shapes were supplied. Persistent road alignments are reconstructed from ordered stops and the shipped directed OSM/Overture-derived graph, with source hashes. Exact operational streets and temporary diversions remain unverified. Unresolved legs are not simulated.';
  const blob = gzipSync(Buffer.from(JSON.stringify(feed)), { level: 9 });
  const summary = { patterns: feed.patterns.length, totalLegs, resolvedLegs, unresolvedLegs: totalLegs - resolvedLegs, fullyResolvedPatterns,
    playableStopLegs, resolvedPlayableStopLegs, unresolvedPlayableStopLegs: playableStopLegs - resolvedPlayableStopLegs,
    uniqueAlignments: Object.keys(alignments).length, uniqueResolvedAlignments: Object.values(alignments).filter(a => a.status === 'inferred_legal_road_path').length,
    unresolvedReasons: reasons, joinChecks, maximumJoinGapM: +maximumJoinGapM.toFixed(4), compressedBytes: blob.length,
    executionProbes:executions,executionReplans:replans,executionFailures };
  const coverage = { previousResolvedPlayableLegs:0, retainedResolvedPlayableLegs:0, newlyResolvedPlayableLegs:0,
    newlyUnresolvedPlayableLegs:0, newlyUnresolvedReasons:{} };
  if (previousAlignments) for (const pattern of feed.patterns) {
    const previousIds = previousPatternAlignments.get(pattern.id);
    for (let i = 0; i < pattern.alignmentIds.length; i++) {
      if (!inside(pattern.stops[i]) || !inside(pattern.stops[i+1])) continue;
      const wasResolved = previousAlignments[previousIds?.[i]]?.status === 'inferred_legal_road_path';
      const current = alignments[pattern.alignmentIds[i]], isResolved = current.status === 'inferred_legal_road_path';
      if (wasResolved) coverage.previousResolvedPlayableLegs++;
      if (wasResolved && isResolved) coverage.retainedResolvedPlayableLegs++;
      if (!wasResolved && isResolved) coverage.newlyResolvedPlayableLegs++;
      if (wasResolved && !isResolved) {
        coverage.newlyUnresolvedPlayableLegs++;
        coverage.newlyUnresolvedReasons[current.reason] = (coverage.newlyUnresolvedReasons[current.reason] || 0) + 1;
      }
    }
  }
  const audit = { schema: 1, provenance, summary, coverage, rejectedExecutions, sources, routes, outputSha256: digest(blob) };
  await atomic(auditPath, JSON.stringify(audit, null, 2) + '\n');
  await atomic(output, blob);
  console.log(JSON.stringify({ ...summary, feedSourceSha256: feed.sourceSha256, networkSha256, outputSha256: audit.outputSha256, audit: auditPath }, null, 2));
} finally {
  await rm(temporary, { recursive: true, force: true });
}
