// Independent readiness validation of the shipped bus alignments. This uses
// production classes offline and never changes a browser, source pack or game.
// Nonzero exit means a stored resolved path cannot be driven by the NPC bus.
import { build } from '../game/node_modules/esbuild/lib/main.js';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'roadster-bus-readiness-'));
const decode = async path => JSON.parse(gunzipSync(await readFile(path)));
const feedArgument = process.argv.indexOf('--feed');
const digest = value => createHash('sha256').update(value).digest('hex');
try {
  await build({ stdin: { contents: `export { RoadGraph } from './src/game/roadgraph';
    export { BusServices } from './src/game/bus-services'; export { Traffic } from './src/game/traffic'; export { busLane } from './src/game/bus-path';
    export { rng } from './src/core/util'; export { Scene, BufferGeometry, MeshBasicMaterial } from 'three';`,
    resolveDir: join(root, 'game'), loader: 'ts' }, outfile: join(temporary, 'bundle.mjs'), bundle: true,
    platform: 'node', format: 'esm', logLevel: 'error' });
  const { RoadGraph, BusServices, Traffic, busLane, rng, Scene, BufferGeometry, MeshBasicMaterial } = await import(pathToFileURL(join(temporary, 'bundle.mjs')));
  const core = await decode(join(root, 'game/public/city/core.pack.wasm'));
  const feed = await decode(feedArgument >= 0 ? process.argv[feedArgument + 1] : join(root, 'game/public/transit/tgsrtc.pack.wasm'));
  const roads = new Map();
  const keep = edge => { if (edge.w >= 6 && edge.cls !== 'service' && !edge.ctx && !roads.has(edge.id)) roads.set(edge.id, edge); };
  for (const edge of core.roads) keep(edge);
  for (const pack of [...core.packs].sort((a, b) => a.file.localeCompare(b.file))) {
    const data = await decode(join(root, 'game/public/city', pack.file));
    for (const tile of Object.values(data.tiles)) for (const edge of tile.roads) keep(edge);
  }
  const graph = new RoadGraph([...roads.values()]);
  let joins = 0, illegalOrGapJoins = 0, rejectedTurns = 0, missingExecutionProofs = 0;
  const staleExecutionSources = [];
  for (const source of feed.alignmentProvenance?.executionAdmission?.sourceFiles || []) {
    if (digest(await readFile(join(root,source.file))) !== source.sha256) staleExecutionSources.push(source.file);
  }
  const affected = new Set(), examples = [];
  for (const [id, alignment] of Object.entries(feed.alignments)) {
    if (alignment.status !== 'inferred_legal_road_path') continue;
    if (alignment.execution?.status !== 'destination_dwell_verified' || alignment.execution.pathSha256 !== digest(JSON.stringify(alignment.steps))) missingExecutionProofs++;
    for (let i = 1; i < alignment.steps.length; i++) {
      const previous = alignment.steps[i - 1], current = alignment.steps[i];
      const before = graph.byId.get(previous.edge), after = graph.byId.get(current.edge);
      if (!before || !after) { illegalOrGapJoins++; continue; }
      const a = graph.pointAt(before, previous.to, previous.dir), b = graph.pointAt(after, current.from, current.dir);
      joins++;
      if ((previous.dir === 1 ? before.to : before.from) !== (current.dir === 1 ? after.from : after.to)
          || Math.hypot(a.x - b.x, a.z - b.z) > .01
          || after.e.oneway === (current.dir === 1 ? 'forward' : 'backward')) illegalOrGapJoins++;
      const radians = Math.acos(Math.max(-1, Math.min(1, a.hx * b.hx + a.hz * b.hz)));
      // Production Traffic.prepare applies this threshold to assigned buses,
      // while its special U-turn motion explicitly excludes a bound busRun.
      if (radians > Math.PI * .88 || (before === after && previous.dir !== current.dir)) {
        rejectedTurns++; affected.add(id);
        if (examples.length < 8) examples.push({ alignment: id, step: i, from: previous.edge, to: current.edge, degrees: +(radians * 180 / Math.PI).toFixed(3) });
      }
    }
  }
  const affectedPatterns = feed.patterns.filter(pattern => pattern.alignmentIds.some(id => affected.has(id)));
  // Reproduce the first failing shipped leg through production Traffic. The
  // fixed seed and obstacle-free scene isolate the steering/path incompatibility.
  const alignmentId = '754b5b9e50b5f96cc704', alignment = feed.alignments[alignmentId];
  let reproduction = { status: 'not_present' };
  if (alignment?.status === 'inferred_legal_road_path') {
    const pattern = feed.patterns.find(p => p.alignmentIds.includes(alignmentId)), index = pattern.alignmentIds.indexOf(alignmentId);
    const minimal = { ...feed, patterns: [{ ...pattern, stops: pattern.stops.slice(index, index + 2), alignmentIds: [alignmentId] }] };
    const localRoads = alignment.steps.map(step => roads.get(step.edge)).filter((edge, i, list) => list.findIndex(item => item.id === edge.id) === i);
    const localGraph = new RoadGraph(localRoads), services = new BusServices(localGraph, minimal);
    const first = alignment.steps[0], edge = localGraph.byId.get(first.edge), startS = first.from;
    const location = localGraph.pointAt(edge, startS, first.dir), run = services.bind(edge, first.dir, startS, 0);
    if (!run) reproduction = { status: 'rejected_at_bind', alignmentId };
    else {
      const geometry = new BufferGeometry(), material = new MeshBasicMaterial();
      const bus = { group: 'bus', size: [2.5, 3.3, 11], body: geometry, lights: geometry, decals: [] };
      const traffic = Object.assign(Object.create(Traffic.prototype), { cars: [], max: 0, graph: localGraph, city: undefined,
        scene: new Scene(), mats: { vBody: material, vLight: material }, byGroup: { bus: [bus] }, r: rng(77), t: 0,
        plans: 0, stopsByEdge: new Map(), onHorn() {}, services });
      const car = traffic.spawnAt('bus', edge, first.dir, startS, busLane(edge)); car.busRun = run;
      let dwelled = false, seconds = 0;
      const deadline = Math.min(600, Math.max(60, alignment.lengthM / 3 + alignment.steps.length * 3 + 30));
      for (let frame = 0; frame < deadline * 60; frame++) {
        traffic.update(1 / 60, car.x, car.z, { x: car.x + 290, y: .55, z: car.z + 290, speed: 0, hx: 1, hz: 0 }, []);
        dwelled ||= car.dwell > 0;
        seconds = (frame + 1) / 60;
        if (dwelled && run.ended) break;
      }
      const servedDestination = dwelled && run.ended;
      reproduction = { status: servedDestination ? 'PASS_destination_served' : 'FAIL_destination_not_served', alignmentId, pattern: pattern.id, route: pattern.number,
        fromStop: feed.stops[pattern.stops[index]][0], toStop: feed.stops[pattern.stops[index + 1]][0], seconds,
        initialEdge: first.edge, firstDirection: first.dir, assignedNext: alignment.steps[1], edgeLengthM: edge.len,
        finalEdge: car.edge.e.id, finalDirection: car.dir, finalSM: car.s, finalSpeed: car.speed, dwelled, serviceEnded: run.ended,
        runStep: run.step, motion: car.motion && {kind:car.motion.kind,progress:car.motion.progress,startS:car.motion.startS,endS:car.motion.endS,length:car.motion.curve.length,endEdge:car.motion.edge.e.id} };
      traffic.clear(); geometry.dispose(); material.dispose();
    }
  }
  const ready = rejectedTurns === 0 && illegalOrGapJoins === 0 && missingExecutionProofs === 0 && staleExecutionSources.length === 0
    && feed.alignmentProvenance?.executionAdmission?.sourceFiles?.length === 4 && reproduction.status === 'PASS_destination_served';
  console.log(JSON.stringify({ ready, method: 'Offline production Traffic and complete shipped directed network; no browser state changes',
    roadEdges: graph.edges.length, resolvedUniqueAlignments: Object.values(feed.alignments).filter(a => a.status === 'inferred_legal_road_path').length,
    joins, illegalOrGapJoins, npcRejectedTurns: rejectedTurns, missingExecutionProofs, staleExecutionSources, affectedUniqueAlignments: affected.size,
    affectedPatterns: affectedPatterns.length, affectedRouteNumbers: new Set(affectedPatterns.map(p => p.number)).size,
    examples, reproduction }, null, 2));
  if (!ready) process.exitCode = 1;
} finally { await rm(temporary, { recursive: true, force: true }); }
