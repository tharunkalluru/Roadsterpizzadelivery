// Independent synthetic execution checks for production Traffic/BusServices.
// Hand-authored roads and published-stop sequences isolate motion, dwell and
// streaming contracts. They are not agency-route or browser-play verification.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../game/node_modules/esbuild/lib/main.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'roadster-bus-execution-'));
const fixtures = [];
let passed = 0;
const failures = [];
const test = (name, run) => {
  try { run(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failures.push({ name, error }); console.error(`FAIL ${name}: ${error.message}`); }
};
try {
  await build({
    stdin: {
      contents: `export { Traffic } from './src/game/traffic'; export { BusServices } from './src/game/bus-services';
        export { RoadGraph } from './src/game/roadgraph'; export { rng } from './src/core/util';
        export { signalAspect } from './src/world/signals';
        export { Scene, BufferGeometry, MeshBasicMaterial } from 'three';`,
      resolveDir: join(root, 'game'), loader: 'ts',
    },
    outfile: join(temporary, 'execution.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'error',
  });
  const { Traffic, BusServices, RoadGraph, rng, signalAspect, Scene, BufferGeometry, MeshBasicMaterial } =
    await import(pathToFileURL(join(temporary, 'execution.mjs')));
  const road = (id, pts, from, to, extra = {}) => ({
    id, seg: id, pts, from, to, cls: 'primary', name: id, w: 22, lanes: 4,
    oneway: null, elev: null, maxspeed: null, ...extra,
  });
  // Keep the declared alignment independent of the reconstruction planner.
  // An edge list alone must never count as successful execution in this suite.
  const feedFor = (roads, stops, legs, number = 'FIXTURE 8A') => {
    const lengthOf = id => {
      const points = roads.find(r => r.id === id).pts;
      return points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]), 0);
    };
    const names = Object.keys(stops), alignmentIds = legs.map((_, i) => `fixture-leg-${i}`);
    const pattern = { id: 'fixture:0', number, direction: '0', from: stops[names[0]][0], to: stops[names.at(-1)][0],
      stops: names, tripId: 'fixture-trip', publishedTrips: 1, alignmentIds };
    const alignments = Object.fromEntries(legs.map((leg, i) => {
      const steps = leg.map(([edge, from = 0, to = lengthOf(edge), dir = 1]) => ({ edge, from, to, dir }));
      return [alignmentIds[i], { status: 'inferred_legal_road_path', fromStop: names[i], toStop: names[i + 1], steps,
        pts: [[stops[names[i]][1], stops[names[i]][2]], [stops[names[i + 1]][1], stops[names[i + 1]][2]]],
        lengthM: steps.reduce((sum, s) => sum + s.to - s.from, 0), maxStopSnapM: 0 }];
    }));
    return { schema: 2, origin: { lat: 0, lon: 0 }, attribution: 'Synthetic execution fixture',
      uncertainty: 'Hand-authored test roads; no claim of a real service', stops, patterns: [pattern], alignments };
  };
  const fixture = (roads, feed, signals = []) => {
    const graph = new RoadGraph(roads, signals), geometry = new BufferGeometry(), material = new MeshBasicMaterial();
    const bus = { group: 'bus', size: [2.5, 3.3, 11], body: geometry, lights: geometry, decals: [] };
    const traffic = Object.assign(Object.create(Traffic.prototype), {
      cars: [], max: 0, graph, city: undefined, scene: new Scene(),
      mats: { vBody: material, vLight: material }, byGroup: { bus: [bus] }, r: rng(77), t: 0,
      plans: 0, stopsByEdge: new Map(), onHorn() {}, services: new BusServices(graph, feed),
    });
    const result = { traffic, graph, feed, geometry, material };
    fixtures.push(result); return result;
  };
  const spawn = (f, edgeId, s, dir = 1) => {
    const edge = f.graph.byId.get(edgeId), run = f.traffic.services.bind(edge, dir, s, 0);
    assert.ok(run, `Fixture must bind on its declared route at ${edgeId}:${s}`);
    const c = f.traffic.spawnAt('bus', edge, dir, s); c.busRun = run; c.speed = c.want = 8;
    return c;
  };
  const tick = (f, c, dt) => f.traffic.update(dt, c.x, c.z,
    { x: c.x + 290, y: .55, z: c.z + 290, speed: 0, hx: 1, hz: 0 }, []);
  const yawBetween = (a, b) => Math.abs(Math.atan2(a.hx * b.hz - a.hz * b.hx, a.hx * b.hx + a.hz * b.hz));
  const execute = (f, c, dt, seconds = 100, observe = () => {}) => {
    const dwells = [], edges = new Set([c.edge.e.id]);
    let maxYaw = 0, maxStep = 0;
    for (let frame = 0; frame < seconds / dt; frame++) {
      const before = { x: c.x, z: c.z, hx: c.hx, hz: c.hz, dwell: c.dwell, target: c.busRun.target,
        position: c.busRun.stopPosition };
      tick(f, c, dt); edges.add(c.edge.e.id);
      maxYaw = Math.max(maxYaw, yawBetween(before, c));
      maxStep = Math.max(maxStep, Math.hypot(c.x - before.x, c.z - before.z));
      if (before.dwell <= 0 && c.dwell > 0) {
        const target = f.graph.pointAt(before.position.edge, before.position.s, before.position.dir, c.lane);
        dwells.push({ index: before.target, id: c.busRun.pattern.stops[before.target],
          distance: Math.hypot(c.x - target.x, c.z - target.z), speed: c.speed, seconds: (frame + 1) * dt });
      }
      observe(before, c, (frame + 1) * dt);
      if (c.busRun.ended && dwells.length) return { dwells, edges, maxYaw, maxStep };
    }
    assert.fail(`Destination not served: edge=${c.edge.e.id}, s=${c.s}, speed=${c.speed}, target=${c.busRun.target}, ended=${c.busRun.ended}`);
  };
  const assertDestination = (c, result, expectedStops) => {
    assert.equal(c.busRun.ended, true, 'service must explicitly end at its final published stop');
    assert.deepEqual(result.dwells.map(s => s.id), expectedStops, 'every expected stop needs an actual distinct dwell in order');
    for (const dwell of result.dwells) {
      assert.ok(dwell.distance < 1.5, `dwell must occur at the destination, not at an edge buffer (${dwell.distance}m)`);
      assert.ok(dwell.speed < .6, 'a passing bus cannot count as a stop dwell');
    }
  };

  test('a bus drives a short split chain into both allotted turns and serves its destination at 30/60Hz', () => {
    for (const dt of [1 / 30, 1 / 60]) for (const direction of [-1, 1]) {
      const roads = [road('in', [[-100, 0], [-8, 0]], 'a', 'b'), road('short-5m', [[-8, 0], [-3, 0]], 'b', 'c'),
        road('short-3m', [[-3, 0], [0, 0]], 'c', 'j'), road('allotted', [[0, 0], [0, direction * 120]], 'j', 'd'),
        road('wrong-branch', [[0, 0], [120, 0]], 'j', 'wrong')];
      const feed = feedFor(roads, { start: ['START', -80, 0], destination: ['DESTINATION', 0, direction * 90] },
        [[['in', 20], ['short-5m'], ['short-3m'], ['allotted', 0, 90]]]);
      const f = fixture(roads, feed), c = spawn(f, 'in', 20), result = execute(f, c, dt);
      assertDestination(c, result, ['destination']);
      assert.equal(c.edge.e.id, 'allotted'); assert.ok(Math.abs(c.z) > 85);
      assert.equal(result.edges.has('wrong-branch'), false, 'route identity cannot choose a convenient random branch');
      assert.ok(result.maxYaw > .002 && result.maxYaw < .08, `turning must be gradual at ${1 / dt}Hz; peak=${result.maxYaw}`);
      assert.ok(result.maxStep <= 8 * dt + .005, 'short source edges cannot cause a positional jump');
      assert.equal(c.busRun.pattern.number, 'FIXTURE 8A');
    }
  });

  test('dense two-degree gentle bends retain progress and still leave room for a subsequent ninety-degree turn', () => {
    // Eighty metres of a radius76m bend, expressed as thirty ordinary source
    // segments. These shallow vertices must not each consume the approach
    // room required by the separate hard junction at the far end.
    const angle = Math.PI / 3, pieces = 30, radius = 80 / angle;
    const arc = Array.from({ length: pieces + 1 }, (_, i) => {
      const theta = angle * i / pieces;
      return [radius * Math.sin(theta), radius * (1 - Math.cos(theta))];
    });
    const end = arc.at(-1), last = arc.at(-2), hardHeading = Math.atan2(end[1] - last[1], end[0] - last[0]) + Math.PI / 2;
    const hx = Math.cos(hardHeading), hz = Math.sin(hardHeading);
    const roads = [road('approach', [[-60, 0], [0, 0]], 'a', 'b'), road('dense-arc', arc, 'b', 'j'),
      road('allotted-exit', [end, [end[0] + hx * 120, end[1] + hz * 120]], 'j', 'd'),
      road('wrong-straight-exit', [end, [end[0] + Math.cos(hardHeading - Math.PI / 2) * 120,
        end[1] + Math.sin(hardHeading - Math.PI / 2) * 120]], 'j', 'wrong')];
    const feed = feedFor(roads, { start: ['START', -45, 0], destination: ['DESTINATION', end[0] + hx * 90, end[1] + hz * 90] },
      [[['approach', 15], ['dense-arc'], ['allotted-exit', 0, 90]]]);
    for (const dt of [1 / 30, 1 / 60]) {
      const f = fixture(roads, feed), c = spawn(f, 'approach', 15);
      let gentleTravelSeconds = 0;
      const result = execute(f, c, dt, 100, (_, current) => {
        if (current.edge.e.id === 'dense-arc' && current.s > 10 && current.s < 60) {
          gentleTravelSeconds += dt;
          assert.ok(Math.abs(Math.hypot(current.x, current.z - radius) - radius) < 5,
            'the bus must follow the curved road rather than shortcut the dense source vertices');
        }
      });
      assertDestination(c, result, ['destination']);
      assert.equal(c.edge.e.id, 'allotted-exit');
      assert.equal(result.edges.has('wrong-straight-exit'), false);
      assert.ok(gentleTravelSeconds > 4, 'the gentle-bend road must actually be driven before the hard turn');
      assert.ok(result.maxYaw > .002 && result.maxYaw < .08, `both bend types need continuous steering; peak=${result.maxYaw}`);
      assert.ok(result.maxStep <= 8 * dt + .005, 'dense vertices cannot cause positional jumps');
    }
  });

  test('a stop just beyond a five-metre source split brakes, dwells and remains stopped after service ends', () => {
    const roads = [road('in', [[0, 0], [100, 0]], 'a', 'b'), road('short', [[100, 0], [105, 0]], 'b', 'c'),
      road('out', [[105, 0], [155, 0]], 'c', 'd')];
    const feed = feedFor(roads, { start: ['START', 70, 0], destination: ['DESTINATION', 113, 0] },
      [[['in', 70], ['short'], ['out', 0, 8]]]);
    for (const dt of [1 / 30, 1 / 60]) for (const start of [70, 97.5, 98.9]) {
      const f = fixture(roads, feed), c = spawn(f, 'in', start), result = execute(f, c, dt, 30);
      assertDestination(c, result, ['destination']); assert.equal(c.edge.e.id, 'out');
      const parked = { x: c.x, z: c.z };
      for (let n = 0; n < 8 / dt; n++) tick(f, c, dt);
      assert.equal(c.busRun.ended, true); assert.ok(c.speed < .001);
      assert.ok(Math.hypot(c.x - parked.x, c.z - parked.z) < .1, 'ended service cannot continue through the stop');
      assert.ok(c.x <= 113.1, 'late braking must not overshoot the published destination');
    }
  });

  test('a downstream red signal holds the whole bus behind the bar, then green releases it to a destination dwell', () => {
    const roads = [road('in', [[0, 0], [100, 0]], 'a', 'j'), road('out', [[100, 0], [100, 120]], 'j', 'b')];
    const feed = feedFor(roads, { start: ['START', 65, 0], destination: ['DESTINATION', 100, 90] },
      [[['in', 65], ['out', 0, 90]]]);
    // A declared controller fixture uses the public graph signal binding, not
    // Traffic's private signal state. Phase 0 starts red for23seconds.
    const site = { id: 'fixture-signal', p: [100, 20], node: null, source: 'OpenStreetMap', sourceIds: ['fixture'],
      timing: 'simulated-coordinated', placement: 'source-node-model-stopline', offset: 23, phaseCount: 2,
      phaseGreens: [18, 18], approaches: [{ id: 'out-forward', edge: 'out', dir: 1, node: null,
        hx: 0, hz: 1, y: 0, stopS: 20, phase: 0, priority: 1, line: [[89, 20], [111, 20]],
        pole: [89, 0, 20], paint: [] }] };
    for (const dt of [1 / 30, 1 / 60]) {
      const f = fixture(roads, feed, [site]), c = spawn(f, 'in', 65);
      let redStoppedSeconds = 0, crossedOnGreen = false;
      const result = execute(f, c, dt, 90, (_, current) => {
        const aspect = signalAspect(site, 0, f.traffic.t);
        const nose = current.z + Math.abs(current.hz) * current.size[2] / 2 + Math.abs(current.hx) * current.size[0] / 2;
        if (f.traffic.t < 23 - dt / 2) {
          assert.equal(aspect, 'red');
          assert.ok(nose <= 20.01, `the bus nose crosses a red stop bar at z=${nose}`);
          if (current.speed < .05 && nose > 18) redStoppedSeconds += dt;
        }
        if (current.z > 20 && aspect === 'green') crossedOnGreen = true;
      });
      assert.ok(redStoppedSeconds > 1, 'fixture must observe an actual red-light stop');
      assert.ok(crossedOnGreen, 'the bus must resume on green, rather than remain stranded at the signal');
      assertDestination(c, result, ['destination']);
    }
  });

  test('unloading an intermediate source edge removes a bus whose current and destination edges remain loaded', () => {
    const roads = [road('in', [[0, 0], [100, 0]], 'a', 'b'), road('short', [[100, 0], [105, 0]], 'b', 'c'),
      road('out', [[105, 0], [200, 0]], 'c', 'd')];
    const feed = feedFor(roads, { start: ['START', 70, 0], destination: ['DESTINATION', 185, 0] },
      [[['in', 70], ['short'], ['out', 0, 80]]]);
    const f = fixture(roads, feed), c = spawn(f, 'in', 98.9);
    tick(f, c, 1 / 30);
    assert.equal(c.edge.e.id, 'in'); assert.ok(c.x < 100, 'the intermediate edge is still ahead of the bus');
    assert.equal(f.traffic.cars.length, 1); assert.ok(f.traffic.scene.children.includes(c.g));
    f.traffic.dropEdges(new Set([f.graph.byId.get('short')]));
    assert.equal(f.traffic.cars.length, 0, 'a bus cannot retain a planned traversal over an unloaded intermediate edge');
    assert.equal(f.traffic.scene.children.includes(c.g), false, 'unloaded buses must also leave the rendered scene');
    assert.ok(f.graph.byId.has('in') && f.graph.byId.has('out'), 'this is not removal of the current or final road');
  });

  test('actual stop dwells retain the route number, destination and stop IDs in published order', () => {
    const roads = [road('corridor', [[0, 0], [240, 0]], 'a', 'b')];
    // Equal display names must not collapse two independently published stops.
    const feed = feedFor(roads, { start: ['START', 20, 0], midway: ['BUS STOP', 90, 0], terminal: ['BUS STOP', 190, 0] },
      [[['corridor', 20, 90]], [['corridor', 90, 190]]], '113I/M');
    const originalPattern = structuredClone(feed.patterns[0]);
    for (const dt of [1 / 30, 1 / 60]) {
      const f = fixture(roads, feed), c = spawn(f, 'corridor', 20);
      let firstDwellSeconds = 0, dwellPosition = null;
      const result = execute(f, c, dt, 90, (before, current) => {
        assert.equal(current.busRun.pattern.number, '113I/M');
        assert.equal(current.busRun.pattern.to, 'BUS STOP');
        if (before.dwell <= 0 && current.dwell > 0 && before.target === 1) dwellPosition = { x: current.x, z: current.z };
        if (current.dwell > 0 && current.busRun.target === 2 && !current.busRun.ended) {
          firstDwellSeconds += dt;
          assert.ok(Math.hypot(current.x - dwellPosition.x, current.z - dwellPosition.z) < .1, 'the intermediate dwell must hold the bus in place');
        }
      });
      assertDestination(c, result, ['midway', 'terminal']);
      assert.ok(firstDwellSeconds >= 3.9, 'a stop cannot be acknowledged and immediately skipped');
      assert.deepEqual(feed.patterns[0], originalPattern, 'execution must not rewrite published route identity or stop order');
    }
  });
  console.log(`Bus execution: ${passed} independent production movement/stop/signal/streaming groups passed.`);
  if (failures.length) throw new AggregateError(failures.map(f => f.error), `${failures.length} bus execution groups failed`);
} finally {
  for (const f of fixtures) { f.traffic.clear(); f.geometry.dispose(); f.material.dispose(); }
  await rm(temporary, { recursive: true, force: true });
}
