// Published route identity, directed stop order and actual NPC movement.
// These are offline fixtures, not a claim of live TGSRTC or browser coverage.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { build } from '../game/node_modules/esbuild/lib/main.js';
const root = fileURLToPath(new URL('../', import.meta.url)), out = await mkdtemp(join(tmpdir(), 'roadster-buses-'));
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('PASS ' + name); };
const oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
try {
  await build({ stdin: { contents: `export * from './src/game/bus-services'; export * from './src/game/bus-path'; export { Traffic } from './src/game/traffic'; export { RoadGraph } from './src/game/roadgraph'; export { rng, initTemplates } from './src/core/util'; export { auto, busRouteBoards } from './src/world/traffic_models'; export * from './src/world/auto-quotes'; export { Scene, BufferGeometry, MeshBasicMaterial, BoxGeometry } from 'three';`, resolveDir: join(root, 'game'), loader: 'ts' }, outfile: join(out, 'buses.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'error' });
  const { BusServices, Traffic, RoadGraph, busRoundedCorner, busTurnPossible, rng, Scene, BufferGeometry, MeshBasicMaterial, BoxGeometry, initTemplates, auto, busRouteBoards, AUTO_QUOTES } = await import(pathToFileURL(join(out, 'buses.mjs')));
  const road = (id, pts, from, to, extra = {}) => ({ id, seg: id, pts, from, to, cls: 'primary', name: id, w: 18, lanes: 4, oneway: null, elev: null, maxspeed: null, ...extra });
  const roads = [road('approach', [[0, 0], [100, 0]], 'a', 'j'), road('allotted', [[100, 0], [100, 120]], 'j', 'b'), road('wrong-turn', [[100, 0], [220, 0]], 'j', 'c')];
  const feed = { schema: 1, origin: { lat: 0, lon: 0 }, attribution: 'Contains data provided by TGSRTC', uncertainty: 'fixture', stops: { a: ['START', 5, -3], b: ['MIDWAY', 75, -3], c: ['DESTINATION', 103, 100] }, patterns: [{ id: '8A:0', number: '8A', direction: '0', from: 'START', to: 'DESTINATION', stops: ['a', 'b', 'c'], tripId: 'fixture', publishedTrips: 10 }] };
  const awaitedFeed = await readFile(join(root, 'game/public/transit/tgsrtc.pack.wasm'));
  const publishedFeed = JSON.parse(gunzipSync(awaitedFeed));
  test('source feed keeps published identities, stop coordinates, direction and attribution', () => {
    const data = publishedFeed;
    assert.equal(data.sourceRouteCount, 1031); assert.equal(data.patterns.length, 1511);
    assert.equal(data.attribution, 'Contains data provided by TGSRTC');
    assert.equal(data.feed.feed_version, '20260201'); assert.ok(data.uncertainty.includes('No shapes'));
    for (const p of data.patterns) {
      assert.equal(p.tripName.split('-')[0].trim().toUpperCase(), p.number.toUpperCase());
      assert.ok(p.stops.length >= 3); assert.equal(data.stops[p.stops[0]][0], p.from); assert.equal(data.stops[p.stops.at(-1)][0], p.to);
      for (const s of p.stops) assert.ok(Number.isFinite(data.stops[s][1] + data.stops[s][2]));
    }
  });
  test('every published stop leg has a persistent alignment or an explicit unresolved reason', () => {
    const data = publishedFeed;
    assert.equal(data.schema, 2);
    assert.equal(data.alignmentProvenance.status, 'inferred_legal_road_paths_not_agency_shapes');
    assert.match(data.alignmentProvenance.feedSourceSha256, /^[a-f0-9]{64}$/);
    assert.match(data.alignmentProvenance.networkSha256, /^[a-f0-9]{64}$/);
    let resolved = 0, unresolved = 0;
    for (const pattern of data.patterns) {
      assert.equal(pattern.alignmentIds.length, pattern.stops.length - 1);
      for (const [i, id] of pattern.alignmentIds.entries()) {
        const alignment = data.alignments[id]; assert.ok(alignment);
        assert.equal(alignment.fromStop, pattern.stops[i]); assert.equal(alignment.toStop, pattern.stops[i + 1]);
        if (alignment.status === 'inferred_legal_road_path') {
          resolved++; assert.ok(alignment.steps.length && alignment.pts.length >= 2); assert.ok(alignment.maxStopSnapM <= 100.1);
          for (const step of alignment.steps) { assert.ok(step.edge); assert.ok(step.dir === 1 || step.dir === -1); assert.ok(step.from >= 0 && step.to >= step.from); }
        } else { unresolved++; assert.equal(alignment.status, 'unresolved'); assert.ok(alignment.reason); assert.equal(alignment.steps, undefined); }
      }
    }
    assert.equal(resolved + unresolved, 39070); assert.ok(resolved > 30000); assert.ok(unresolved > 0);
  });
  const persistedFeed = (graph, source = feed) => {
    const builder = new BusServices(graph, source), alignments = {}, patterns = source.patterns.map(pattern => {
      const alignmentIds = pattern.stops.slice(1).map((_, i) => { const id = `${pattern.id}:${i}`; alignments[id] = builder.reconstruct(pattern, i); return id; });
      return { ...pattern, alignmentIds };
    });
    return { ...source, schema: 2, patterns, alignments };
  };
  test('incoming directed road state excludes immediate reversals and rejects unsupported bus turns', () => {
    const graph = new RoadGraph(roads), approach = graph.byId.get('approach'), allotted = graph.byId.get('allotted');
    assert.equal(busTurnPossible(graph, approach, 1, approach, -1), false);
    assert.equal(busTurnPossible(graph, approach, 1, allotted, 1), true);
    const alignment = new BusServices(graph, feed).reconstruct(feed.patterns[0], 1);
    assert.equal(alignment.status, 'inferred_legal_road_path');
    for(let i=1;i<alignment.steps.length;i++) {
      const a=alignment.steps[i-1],b=alignment.steps[i];
      assert.ok(busTurnPossible(graph,graph.byId.get(a.edge),a.dir,graph.byId.get(b.edge),b.dir));
    }
  });
  test('almost parallel source splits cannot create a distant loop during a bus lane-width change', () => {
    const a={x:0,y:0,z:2.8,hx:1,hz:0},angle=.002,b={x:19,y:0,z:2.25,hx:Math.cos(angle),hz:Math.sin(angle)};
    const curve=busRoundedCorner(a,b);
    assert.ok(curve.length<20);assert.ok(curve.minRadius>6.5);
    for(let s=0;s<curve.length;s+=.5){const p=curve.sample(s);assert.ok(p.x>=-.001&&p.x<=19.001);assert.ok(p.z>=2&&p.z<=3);}
  });
  test('arterial preference cannot discard a shorter legal path inside the published stop detour bound', () => {
    const alternatives = [road('source',[[0,0],[100,0]],'a','j'),road('destination',[[200,0],[300,0]],'k','b'),
      road('overlong-arterial',[[100,0],[100,410],[200,410],[200,0]],'j','k'),
      road('legal-local',[[100,0],[100,-200],[200,-200],[200,0]],'j','k',{cls:'residential',w:6,lanes:2})];
    const graph = new RoadGraph(alternatives), sample = { ...feed, stops:{ a:['START',50,-1],b:['MIDWAY',250,-1],c:['END',280,-1] } };
    const alignment = new BusServices(graph,sample).reconstruct(sample.patterns[0],0);
    assert.equal(alignment.status,'inferred_legal_road_path');
    assert.ok(alignment.steps.some(step=>step.edge==='legal-local'));
    assert.ok(alignment.lengthM<=900,'the rejected arterial cannot mask the bounded legal alternative');
  });
  test('ambient buses never bind immediately before a physical turn without their approach room', () => {
    const graph=new RoadGraph(roads),shaped=persistedFeed(graph),services=new BusServices(graph,shaped),edge=graph.byId.get('approach');
    assert.ok(services.bind(edge,1,30));assert.equal(services.bind(edge,1,94),null);
  });
  test('persisted bus paths reject nearby parallel streets and retain the published identity', () => {
    const parallel = road('parallel', [[0, 8], [100, 8]], 'other-a', 'other-j'), graph = new RoadGraph([...roads, parallel]);
    const shaped = persistedFeed(graph), services = new BusServices(graph, shaped), approach = graph.byId.get('approach');
    const run = services.bind(approach, 1, 30); assert.ok(run); assert.equal(run.pattern.number, '8A');
    assert.equal(services.bind(graph.byId.get('parallel'), 1, 30), null, 'a route board cannot be attached to a parallel street outside its stored edge sequence');
    services.served(run, approach, 1, 75); assert.equal(services.next(run, approach, 1, 75).edge.e.id, 'allotted');
    assert.equal(services.bind(graph.byId.get('allotted'), 1, 60)?.pattern.number, '8A', 'binding follows a stored bend instead of only the straight stop chord');
  });
  test('unloaded or changed aligned roads never fall back to a competing legal road', () => {
    const alternate = road('alternate', [[100, 0], [110, 70], [100, 120]], 'j', 'b'), graph = new RoadGraph([roads[0]]); graph.addRoads([roads[1]]);
    const shaped = persistedFeed(graph); graph.addRoads([alternate]);
    const services = new BusServices(graph, shaped), approach = graph.byId.get('approach');
    const run = services.bind(approach, 1, 30); assert.ok(run); services.served(run, approach, 1, 75); assert.equal(run.ended, false);
    graph.removeRoads(['allotted']); assert.equal(services.next(run, approach, 1, 75), null);
    const fresh = services.bind(approach, 1, 30); assert.ok(fresh); services.served(fresh, approach, 1, 75); assert.equal(fresh.ended, true);
    assert.equal(services.bind(graph.byId.get('alternate'), 1, 50), null);
  });
  test('unresolved stored legs never silently use the legacy inferred corridor', () => {
    const graph = new RoadGraph(roads), shaped = persistedFeed(graph);
    for (const alignment of Object.values(shaped.alignments)) { alignment.status = 'unresolved'; alignment.reason = 'fixture_missing_source_alignment'; delete alignment.steps; delete alignment.pts; }
    assert.equal(new BusServices(graph, shaped).bind(graph.byId.get('approach'), 1, 30), null);
  });
  test('a bound service stops in published order then chooses its allotted branch', () => {
    const graph = new RoadGraph(roads), services = new BusServices(graph, feed), edge = graph.byId.get('approach');
    const run = services.bind(edge, 1, 30, .1); assert.ok(run); assert.equal(run.pattern.number, '8A');
    assert.equal(run.target, 1); assert.equal(run.stopPosition.edge, edge); assert.equal(services.next(run, edge, 1), null);
    services.served(run, edge, 1, 75); assert.equal(run.target, 2);
    assert.equal(services.next(run, edge, 1).edge.e.id, 'allotted');
    services.served(run, graph.byId.get('allotted'), 1, 100); assert.equal(run.ended, true);
  });
  test('unmatched roads and an opposite heading never acquire a fictional service', () => {
    const graph = new RoadGraph(roads), services = new BusServices(graph, feed);
    assert.equal(services.bind(graph.byId.get('approach'), -1, 40), null);
    assert.equal(services.bind(graph.byId.get('wrong-turn'), 1, 110), null);
    const disconnected = new RoadGraph([roads[0], road('allotted', [[100, 0], [100, 120]], 'different-junction', 'b')]);
    const service = new BusServices(disconnected, feed), run = service.bind(disconnected.byId.get('approach'), 1, 30);
    assert.ok(run); service.served(run, disconnected.byId.get('approach'), 1, 75);
    assert.equal(run.ended, true, 'a disconnected next leg stops, never takes a random road');
  });
  test('the actual NPC bus dwells and follows its service despite a competing straight road', () => {
    const graph = new RoadGraph(roads), geo = new BufferGeometry(), material = new MeshBasicMaterial();
    const bus = { group: 'bus', size: [2.5, 3.3, 11], body: geo, lights: geo, decals: [] };
    const traffic = Object.assign(Object.create(Traffic.prototype), { cars: [], max: 0, graph, city: undefined, scene: new Scene(), mats: { vBody: material, vLight: material }, byGroup: { bus: [bus] }, r: rng(77), t: 0, phaseLen: 22, plans: 0, stopsByEdge: new Map(), onHorn() {} });
    traffic.setBusFeed(feed);
    const c = traffic.spawnAt('bus', graph.byId.get('approach'), 1, 35, 2.8);
    c.busRun = traffic.services.bind(c.edge, c.dir, c.s); assert.ok(c.busRun);
    let dwelled = false;
    for (let n = 0; n < 6000 && !(c.edge.e.id === 'allotted' && c.s > 45); n++) {
      traffic.update(1 / 60, 100, 0, { x: 290, y: .55, z: 290, speed: 0, hx: 1, hz: 0 }, []);
      dwelled ||= c.dwell > 0;
      assert.notEqual(c.edge.e.id, 'wrong-turn');
    }
    assert.ok(dwelled); assert.equal(c.edge.e.id, 'allotted'); assert.ok(c.s > 45);
  });
  test('a stop near the junction is served before its bus advances to the allotted next leg', () => {
    const near = { ...feed, stops: { ...feed.stops, b: ['MIDWAY', 95, -3] } }, graph = new RoadGraph(roads), geo = new BufferGeometry(), material = new MeshBasicMaterial();
    const bus = { group: 'bus', size: [2.5, 3.3, 11], body: geo, lights: geo, decals: [] };
    const traffic = Object.assign(Object.create(Traffic.prototype), { cars: [], max: 0, graph, city: undefined, scene: new Scene(), mats: { vBody: material, vLight: material }, byGroup: { bus: [bus] }, r: rng(77), t: 0, phaseLen: 22, plans: 0, stopsByEdge: new Map(), onHorn() {} });
    traffic.setBusFeed(near);
    const c = traffic.spawnAt('bus', graph.byId.get('approach'), 1, 35, 2.8); c.busRun = traffic.services.bind(c.edge, c.dir, c.s); assert.ok(c.busRun);
    let dwelled = false;
    for (let n = 0; n < 7200 && !(c.edge.e.id === 'allotted' && c.s > 45); n++) {
      traffic.update(1 / 60, 100, 0, { x: 290, y: .55, z: 290, speed: 0, hx: 1, hz: 0 }, []);
      dwelled ||= c.dwell > 0;
      assert.notEqual(c.edge.e.id, 'wrong-turn');
    }
    assert.ok(dwelled, 'generic edge-end buffer cannot strand the bus before its published stop');
    assert.equal(c.edge.e.id, 'allotted'); assert.ok(c.s > 45);
  });
  test('streamed roads invalidate negative stop/path caches and stale edges never authorize a bus turn', () => {
    const exit = road('allotted', [[150, 0], [150, 120]], 'x', 'b'), connector = road('connector', [[100, 0], [150, 0]], 'j', 'x');
    const streamedFeed = { ...feed, stops: { ...feed.stops, c: ['DESTINATION', 153, 100] } };
    for (const present of [false, true]) {
      const graph = new RoadGraph([roads[0]]); if (present) graph.addRoads([exit]);
      const services = new BusServices(graph, streamedFeed), approach = graph.byId.get('approach');
      const first = services.bind(approach, 1, 30); assert.ok(first); services.served(first, approach, 1, 75);
      assert.equal(first.ended, true, 'unloaded/disconnected next leg never becomes a random service');
      graph.addRoads(present ? [connector] : [exit, connector]);
      const run = services.bind(approach, 1, 30); assert.ok(run); services.served(run, approach, 1, 75);
      assert.equal(run.ended, false); const old = services.next(run, approach, 1, 75); assert.equal(old.edge.e.id, 'connector');
      graph.removeRoads(['connector', 'allotted']); assert.equal(services.next(run, approach, 1, 75), null);
      graph.addRoads([exit, connector]); const fresh = services.next(run, approach, 1, 75);
      assert.ok(fresh && fresh.edge !== old.edge); assert.equal(fresh.edge, graph.byId.get('connector'));
    }
  });
  test('an edge that leaves and returns to a stop corridor cannot create a spurious bus detour', () => {
    const exit = road('allotted', [[150, 0], [150, 120]], 'x', 'b'), detour = road('detour', [[100, 0], [100, 1000], [150, 0]], 'j', 'x');
    const graph = new RoadGraph([roads[0], detour, exit]), services = new BusServices(graph, { ...feed, stops: { ...feed.stops, c: ['DESTINATION', 153, 100] } });
    const approach = graph.byId.get('approach'), run = services.bind(approach, 1, 30); assert.ok(run);
    services.served(run, approach, 1, 75); assert.equal(run.ended, true, 'nearby endpoints cannot hide a kilometre-long off-corridor loop');
  });
  const actualCore = JSON.parse(gunzipSync(await readFile(join(root, 'game/public/city/core.pack.wasm'))));
  test('a bounded actual-feed/core-network sample binds only legal continuous published-stop paths', () => {
    const graph = new RoadGraph(actualCore.roads), started = performance.now(), services = new BusServices(graph, publishedFeed), constructorMs = performance.now() - started;
    const dist = (x, z, a, b) => {
      const dx = b[1] - a[1], dz = b[2] - a[2], ll = dx * dx + dz * dz || 1, u = Math.max(0, Math.min(1, ((x - a[1]) * dx + (z - a[2]) * dz) / ll));
      return Math.hypot(x - a[1] - dx * u, z - a[2] - dz * u);
    };
    let probes = 0, eligible = 0, bound = 0, joins = 0, maxJoinGap = 0; const bindStart = performance.now();
    for (let sample = 0; sample < 32; sample++) {
      const pattern = publishedFeed.patterns[Math.floor(sample * publishedFeed.patterns.length / 32)], legs = [];
      for (let i = 0; i < pattern.stops.length - 1; i++) {
        const a = publishedFeed.stops[pattern.stops[i]], b = publishedFeed.stops[pattern.stops[i + 1]], x = (a[1] + b[1]) / 2, z = (a[2] + b[2]) / 2, length = Math.hypot(b[1] - a[1], b[2] - a[2]);
        if (length >= 12 && length <= 7000 && x >= actualCore.bounds.minX && x <= actualCore.bounds.maxX && z >= actualCore.bounds.minZ && z <= actualCore.bounds.maxZ) legs.push({ a, b, x, z, length });
      }
      if (!legs.length) continue; probes++;
      const leg = legs[Math.floor(legs.length / 2)]; let candidate = null;
      for (const edge of graph.nearestEdges(leg.x, leg.z, 2)) {
        if (edge.e.w < 6 || edge.e.cls === 'service') continue;
        for (let i = 0; i < edge.e.pts.length - 1; i++) {
          const a = edge.e.pts[i], b = edge.e.pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], ll = dx * dx + dz * dz || 1, u = Math.max(0, Math.min(1, ((leg.x - a[0]) * dx + (leg.z - a[1]) * dz) / ll));
          const at = edge.cum[i] + (edge.cum[i + 1] - edge.cum[i]) * u;
          for (const dir of [1, -1]) {
            if (edge.e.oneway === (dir === 1 ? 'forward' : 'backward')) continue;
            const p = graph.pointAt(edge, dir === 1 ? at : edge.len - at, dir), d = Math.hypot(p.x - leg.x, p.z - leg.z), dot = ((leg.b[1] - leg.a[1]) * p.hx + (leg.b[2] - leg.a[2]) * p.hz) / leg.length;
            if (d <= 90 && dot > .15 && (!candidate || d < candidate.d)) candidate = { edge, dir, s: dir === 1 ? at : edge.len - at, d };
          }
        }
      }
      if (!candidate) continue; eligible++;
      const run = services.bind(candidate.edge, candidate.dir, candidate.s, .125); if (!run) continue; bound++;
      assert.ok(publishedFeed.patterns.includes(run.pattern)); assert.equal(run.path[0].edge, candidate.edge);
      const a = publishedFeed.stops[run.pattern.stops[run.target - 1]], b = publishedFeed.stops[run.pattern.stops[run.target]];
      for (let i = 0; i < run.path.length; i++) {
        const step = run.path[i]; assert.equal(graph.byId.get(step.edge.e.id), step.edge);
        assert.notEqual(step.edge.e.oneway, step.dir === 1 ? 'forward' : 'backward');
        const from = i === 0 ? candidate.s : 0, to = i === run.path.length - 1 ? run.stopPosition.s : step.edge.len;
        const lo = step.dir === 1 ? from : step.edge.len - to, hi = step.dir === 1 ? to : step.edge.len - from;
        for (let k = 0; k < step.edge.e.pts.length; k++) if (step.edge.cum[k] > lo && step.edge.cum[k] < hi) assert.ok(dist(...step.edge.e.pts[k], a, b) <= 550.001);
        if (!i) continue;
        const prev = run.path[i - 1], p = graph.pointAt(prev.edge, prev.edge.len, prev.dir), q = graph.pointAt(step.edge, 0, step.dir);
        assert.equal(prev.dir === 1 ? prev.edge.to : prev.edge.from, step.dir === 1 ? step.edge.from : step.edge.to);
        maxJoinGap = Math.max(maxJoinGap, Math.hypot(p.x - q.x, p.z - q.z)); joins++;
      }
    }
    const stats = { probes, eligible, bound, boundRatioOfEligible: eligible ? +(bound / eligible).toFixed(3) : 0, joins, maxJoinGap: +maxJoinGap.toFixed(3), constructorMs: +constructorMs.toFixed(2), probeAndBindMs: +(performance.now() - bindStart).toFixed(2), retainedUniqueRouteIds: new Set(publishedFeed.patterns.map(p => p.id.slice(0, p.id.lastIndexOf(':')))).size, retainedPatterns: publishedFeed.patterns.length, sourceRouteIds: publishedFeed.sourceRouteCount };
    console.log(JSON.stringify(stats)); assert.ok(probes >= 16 && eligible > 0 && bound > 0); assert.ok(maxJoinGap < 2, 'bound paths join actual mapped road endpoints');
  });
  initTemplates({ rbox: new BoxGeometry(1,1,1) });
  const canvases = [];
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement(tag) {
    assert.equal(tag, 'canvas'); const texts = [], ctx = { font: '', fillRect() {}, strokeRect() {}, fillText(t) { texts.push(t); }, measureText(t) { return { width: t.length * 20 }; } };
    const canvas = { width: 0, height: 0, texts, getContext: () => ctx }; canvases.push(canvas); return canvas;
  } } });
  test('front and rear bus boards carry one matching route identity and face both approaches', () => {
    const decals = busRouteBoards('8A', 'Chandrayangutta'); assert.equal(decals.length, 2);
    assert.equal(decals[0].mat, decals[1].mat); assert.deepEqual(canvases.at(-1).texts, ['8A', 'CHANDRAYANGUTTA']);
    for (const [i, decal] of decals.entries()) {
      decal.geo.computeBoundingBox(); const box = decal.geo.boundingBox;
      assert.ok(Math.abs(box.min.z - (i ? 5.56 : -5.56)) < .001);
      assert.equal(Math.sign(decal.geo.attributes.normal.getZ(0)), i ? 1 : -1);
    }
  });
  test('ten auto variants each have exactly one Telugu quote panel and retain the rear plate', () => {
    assert.equal(AUTO_QUOTES.length, 10); assert.equal(new Set(AUTO_QUOTES.map(q => q.id)).size, 10);
    for (let i = 0; i < 10; i++) {
      const m = auto(rng(23 + i), i); assert.equal(m.quoteId, AUTO_QUOTES[i].id); assert.equal(m.decals.length, 2);
      assert.deepEqual(canvases.at(-1).texts, [...AUTO_QUOTES[i].lines]);
      assert.ok(AUTO_QUOTES[i].lines.join('').match(/[ఀ-౿]/)); assert.ok(AUTO_QUOTES[i].source.startsWith('https://'));
    }
  });
  console.log(`${passed} bus/service/street-text regression groups passed.`);
} finally {
  if (oldDocument) Object.defineProperty(globalThis, 'document', oldDocument); else delete globalThis.document;
  await rm(out, { recursive: true, force: true });
}
await import('./bus-execution-regressions.mjs');
