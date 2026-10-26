// Production source binding, simulated controller, render colours and NPC stop
// regressions. This suite never changes a running browser's game state.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../game/node_modules/esbuild/lib/main.js';
const root = fileURLToPath(new URL('../', import.meta.url)), out = await mkdtemp(join(tmpdir(), 'roadster-signals-'));
let count = 0;
const test = (name, run) => { run(); count++; console.log(`PASS ${name}`); };
try {
  await build({ stdin: { contents: `export * from './src/world/signals'; export { SignalLights } from './src/world/signal-lights';
    export { Traffic } from './src/game/traffic'; export { RoadGraph } from './src/game/roadgraph'; export { World } from './src/world/world';
    export { staticSolidAt } from './src/game/spatial-safety';
    export { rng, initTemplates } from './src/core/util'; export { buildTile } from './src/world/city';
    export { Scene, Group, BoxGeometry, RingGeometry, BufferGeometry, MeshBasicMaterial, Color, Matrix4, Vector3 } from 'three';`,
    resolveDir: join(root, 'game'), loader: 'ts' }, outfile: join(out, 'signals.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'error' });
  const { resolveSignalSites, signalAspect, SIGNAL_PHASE, SignalLights, Traffic, RoadGraph, World, rng, initTemplates, buildTile, staticSolidAt,
    Scene, Group, BoxGeometry, RingGeometry, BufferGeometry, MeshBasicMaterial, Color, Matrix4, Vector3 } = await import(pathToFileURL(join(out, 'signals.mjs')));
  const road = (id, pts, extra = {}) => ({ id, seg: id, from: id + '-a', to: id + '-b', pts, cls: 'primary', w: 14, lanes: 4, oneway: null, elev: null, name: id, maxspeed: null, ...extra });
  const source = (p = [500, 500], extra = {}) => ({ kind: 'traffic_signals', name: null, id: 'osm:n1', source: 'OpenStreetMap', p, ...extra });
  const arms = (angles = [30, 120, 210, 300]) => angles.map((degrees, i) => { const angle = degrees * Math.PI / 180; return road(`arm-${i}`, [[500 + Math.cos(angle) * 100, 500 + Math.sin(angle) * 100], [500, 500]], { to: 'junction' }); });
  const turnRoads = [road('in', [[-80, 0], [0, 0]], { to: 'j', cls: 'residential', w: 16 }), road('out', [[0, 0], [0, 100]], { from: 'j', cls: 'residential', w: 16 })];
  const fixture = (roads, sources) => {
    const sizes = { car: [1.8, 1.6, 4.5], bus: [2.5, 3.3, 11], auto: [1.36, 1.85, 2.65], bike: [.75, 1.9, 2], truck: [2.5, 3.1, 8.4] };
    const byGroup = Object.fromEntries(Object.entries(sizes).map(([group, size]) => [group, [{ group, size, body: new BufferGeometry(), lights: new BufferGeometry(), decals: [] }]]));
    const sites = resolveSignalSites(roads, sources).sites;
    return Object.assign(Object.create(Traffic.prototype), { cars: [], max: 0, graph: new RoadGraph(roads, sites),
      scene: new Scene(), mats: { vBody: new MeshBasicMaterial(), vLight: new MeshBasicMaterial() }, byGroup,
      r: rng(77), t: 460 - (sites[0]?.offset || 0), plans: 0, stopsByEdge: new Map(), onHorn() {} });
  };
  const tick = (traffic, dt = .05) => traffic.update(dt, 0, 0, { x: 250, y: .55, z: 250, speed: 0, hx: 1, hz: 0 }, []);
  test('only mapped source controls are resolved; nearby geometry cannot invent a signal', () => {
    assert.equal(resolveSignalSites(arms(), []).sites.length, 0);
    assert.equal(resolveSignalSites(arms(), [source(undefined, { synth: 1 })]).sites.length, 0);
    const result = resolveSignalSites(arms(), [source()]);
    assert.equal(result.sites.length, 1); assert.deepEqual(result.sites[0].sourceIds, ['osm:n1']);
    assert.equal(result.sites[0].timing, 'simulated-coordinated'); assert.equal(result.sites[0].placement, 'source-node-model-stopline');
    assert.equal(result.sites[0].approaches.length, 4);
    const graph = new RoadGraph(arms()); graph.nodes.get('junction').signal = true;
    const t = Object.assign(Object.create(Traffic.prototype), { graph, t: 30 });
    assert.equal(t.green(graph.nodes.get('junction'), 1, 0), true, 'a boolean node flag has no source controller');
  });
  test('rotated opposite arms share a phase, perpendicular arms never share green', () => {
    const site = resolveSignalSites(arms([45, 135, 225, 315]), [source()]).sites[0];
    assert.equal(site.phaseCount, 2);
    const byEdge = Object.fromEntries(site.approaches.map(a => [a.edge, a]));
    assert.equal(byEdge['arm-0'].phase, byEdge['arm-2'].phase); assert.equal(byEdge['arm-1'].phase, byEdge['arm-3'].phase);
    assert.notEqual(byEdge['arm-0'].phase, byEdge['arm-1'].phase);
    for (let t = 0; t < SIGNAL_PHASE * site.phaseCount; t += .125) {
      assert.ok(!(signalAspect(site, byEdge['arm-0'].phase, t) === 'green' && signalAspect(site, byEdge['arm-1'].phase, t) === 'green'));
    }
  });
  test('multi-arm plans retain separate skew approaches and deterministic road ordering', () => {
    const roads = arms([0, 62, 126, 180, 242]), a = resolveSignalSites(roads, [source()]).sites[0], b = resolveSignalSites(roads.slice().reverse(), [source()]).sites[0];
    assert.equal(a.phaseCount, 3);
    assert.deepEqual(Object.fromEntries(a.approaches.map(a => [a.id, a.phase])), Object.fromEntries(b.approaches.map(a => [a.id, a.phase])));
  });
  test('each phase has amber then full all-red clearance before another green', () => {
    const site = resolveSignalSites(arms(), [source()]).sites[0];
    for (let phase = 0; phase < site.phaseCount; phase++) {
      const base = phase * SIGNAL_PHASE - site.offset;
      assert.equal(signalAspect(site, phase, base + 17.99), 'green'); assert.equal(signalAspect(site, phase, base + 18), 'amber');
      for (let t = 21; t < 23; t += .1) for (const a of site.approaches) assert.equal(signalAspect(site, a.phase, base + t), 'red');
      assert.equal(signalAspect(site, (phase + 1) % site.phaseCount, base + 23), 'green');
    }
  });
  test('one-way and source-way direction control only legal incoming vehicles', () => {
    const roads = arms(), f = source(undefined, { tags: { direction: 'forward' }, mappedDirections: [{ wayId: 'way/1', nodeRole: 'end', forwardHeading: [-Math.cos(Math.PI / 6), -Math.sin(Math.PI / 6)] }] });
    const site = resolveSignalSites(roads, [f]).sites[0]; assert.equal(site.approaches.length, 1); assert.equal(site.approaches[0].edge, 'arm-0');
    assert.equal(resolveSignalSites(roads, [source(undefined, { tags: { direction: 'forward' } })]).sites.length, 0);
    assert.equal(resolveSignalSites(roads, [source(undefined, { ...f, mappedDirections: [{ ...f.mappedDirections[0], nodeRole: 'start' }] })]).sites.length, 0);
    roads[0].oneway = 'forward';
    const legal = resolveSignalSites(roads, [source()]).sites[0]; assert.equal(legal.approaches.some(a => a.edge === roads[0].id), false);
  });
  test('motorways, flyovers, private signals and disjoint crossing roads cannot acquire ground controls', () => {
    for (const extra of [{ cls: 'motorway' }, { elev: [8, 8] }, { expressway: { controlled: true } }]) {
      assert.equal(resolveSignalSites(arms().map(e => ({ ...e, ...extra })), [source()]).sites.length, 0);
    }
    assert.equal(resolveSignalSites(arms(), [source(undefined, { mappedDirections: [{ wayId: 'way/1', forwardHeading: [1, 0], tags: { bridge: 'yes', layer: '1' } }] })]).sites.length, 0);
    assert.equal(resolveSignalSites(arms(), [source(undefined, { tags: { access: 'private' } })]).sites.length, 0);
    const crossing = [road('horizontal', [[400, 500], [600, 500]]), road('vertical', [[500, 400], [500, 600]], { elev: [8, 8] })];
    const site = resolveSignalSites(crossing, [source()]).sites[0]; assert.equal(site.node, null); assert.ok(site.approaches.every(a => a.edge === 'horizontal'));
  });
  test('an exact low-speed mapped ORR approach resolves without signalling the high-speed mainline', () => {
    const approach = road('orr-ramp', [[400, 500], [600, 500]], { cls: 'motorway_link', oneway: 'backward', expressway: { controlled: true } });
    const mapped = source(undefined, { mappedDirections: [{ wayId: 'way/1203851399', nodeRole: 'interior', forwardHeading: [1, 0],
      backwardHeading: [-1, 0], tags: { highway: 'motorway_link', maxspeed: '20', oneway: 'yes', toll: 'no' } }] });
    const resolved = resolveSignalSites([approach], [mapped]);
    assert.equal(resolved.unresolved.length, 0); assert.equal(resolved.sites.length, 1);
    assert.ok(resolved.sites[0].approaches.every(a => a.edge === 'orr-ramp'));
    const highSpeed = structuredClone(mapped); highSpeed.mappedDirections[0].tags.maxspeed = '100';
    assert.equal(resolveSignalSites([approach], [highSpeed]).sites.length, 0);
    const displaced = { ...approach, pts: [[400, 503], [600, 503]] };
    assert.equal(resolveSignalSites([displaced], [mapped]).sites.length, 0, 'source-specific exception requires <=2m alignment');
  });
  test('source controls bind after tile arrival, clear on unload, and never leak to another grade', () => {
    const roads = arms(), sites = resolveSignalSites(roads, [source()]).sites;
    const graph = new RoadGraph([]); graph.addRoads([roads[0]], sites); graph.addRoads(roads.slice(1));
    assert.equal(graph.nodes.get('junction').signal, true); assert.equal(graph.signalsFor(graph.byId.get(roads[2].id), 1).length, 1);
    const copy = structuredClone(sites); graph.markSignals(copy);
    assert.equal(graph.signalSites.size, 1); assert.equal(graph.signalsFor(graph.byId.get(roads[0].id), 1).length, 1);
    graph.forgetSignals(sites); assert.equal(graph.nodes.get('junction').signal, true, 'another loaded owner retains the controller');
    graph.forgetSignals(copy); assert.equal(graph.nodes.get('junction').signal, false); assert.equal(graph.signalsFor(graph.byId.get(roads[0].id), 1).length, 0);
    const deck = roads.map(e => ({ ...e, elev: [8, 8] })), elevated = new RoadGraph(deck, sites);
    assert.ok(elevated.edges.every(e => elevated.signalsFor(e, 1).length === 0));
  });
  test('a mapped raised signal binds only an aligned native deck and stop paint follows its slope', () => {
    const ground = road('ground', [[400, 500], [600, 500]]), deck = road('deck', [[400, 500], [600, 500]], { elev: [6, 10] });
    const f = source(undefined, { mappedDirections: [{ wayId: 'way/1', forwardHeading: [1, 0], tags: { bridge: 'yes', layer: '1' } }] });
    const site = resolveSignalSites([ground, deck], [f]).sites[0];
    assert.ok(site.approaches.every(a => a.edge === 'deck' && a.y > 6));
    for (const a of site.approaches) assert.ok(Math.abs(a.paint[0][1] - a.paint[3][1]) > .001, 'thin stop paint samples actual edge slope');
    const graph = new RoadGraph([ground, deck], [site]);
    assert.equal(graph.signalsFor(graph.byId.get('ground'), 1).length, 0); assert.equal(graph.signalsFor(graph.byId.get('deck'), 1).length, 1);
    const ambiguous = resolveSignalSites([deck, { ...deck, id: 'higher-deck', elev: [14, 18] }], [f]);
    assert.equal(ambiguous.sites.length, 0); assert.equal(ambiguous.unresolved[0].reason, 'ambiguous-native-deck-level');
  });
  test('per-site offsets are stable across streamed rebuilds and avoid citywide lockstep', () => {
    const a = resolveSignalSites(arms(), [source()]).sites[0], copy = resolveSignalSites(arms().reverse(), [source()]).sites[0];
    assert.equal(a.offset, copy.offset);
    const other = resolveSignalSites([road('another', [[400, 500], [600, 500]])], [source(undefined, { id: 'osm:n2' })]).sites[0];
    assert.notEqual(a.offset, other.offset);
  });
  test('green splits favour the wider higher-class corridor while retaining clearance', () => {
    const roads = [
      road('major-west', [[400, 500], [500, 500]], { to: 'junction', cls: 'primary', w: 22 }),
      road('major-east', [[600, 500], [500, 500]], { to: 'junction', cls: 'primary', w: 22 }),
      road('minor-north', [[500, 400], [500, 500]], { to: 'junction', cls: 'residential', w: 8 }),
      road('minor-south', [[500, 600], [500, 500]], { to: 'junction', cls: 'residential', w: 8 }),
    ];
    const site = resolveSignalSites(roads, [source()]).sites[0];
    const majorPhase = site.approaches.find(a => a.edge === 'major-west').phase;
    const minorPhase = site.approaches.find(a => a.edge === 'minor-north').phase;
    assert.ok(site.phaseGreens[majorPhase] > site.phaseGreens[minorPhase]);
    assert.ok(site.phaseGreens.every(seconds => seconds >= 12 && seconds <= 28));
    const majorEnd = site.phaseGreens.slice(0, majorPhase).reduce((sum, green) => sum + green + 5, 0) + site.phaseGreens[majorPhase];
    assert.equal(signalAspect(site, majorPhase, majorEnd - site.offset), 'amber');
    for (let seconds = majorEnd + 3; seconds < majorEnd + 5; seconds += .1) {
      for (const approach of site.approaches) assert.equal(signalAspect(site, approach.phase, seconds - site.offset), 'red');
    }
  });
  test('divided-junction source nodes share one controller only across an actual short same-level link', () => {
    const roads = [road('west', [[400, 500], [492, 500]], { to: 'j-west' }), road('east', [[508, 500], [600, 500]], { from: 'j-east' }),
      road('crossing-link', [[492, 500], [508, 500]], { from: 'j-west', to: 'j-east' }),
      road('north-a', [[492, 400], [492, 500]], { to: 'j-west', oneway: 'backward' }), road('south-a', [[492, 500], [492, 600]], { from: 'j-west', oneway: 'backward' }),
      road('north-b', [[508, 400], [508, 500]], { to: 'j-east', oneway: 'forward' }), road('south-b', [[508, 500], [508, 600]], { from: 'j-east', oneway: 'forward' })];
    const sources = [source([492, 500]), source([508, 500], { id: 'osm:n2' })], resolved = resolveSignalSites(roads, sources);
    assert.equal(resolved.sites.length, 1); const site = resolved.sites[0];
    assert.deepEqual(site.nodes, ['j-east', 'j-west']); assert.deepEqual(site.sourceIds, ['osm:n1', 'osm:n2']);
    assert.equal(site.approaches.some(a => a.edge === 'crossing-link'), false);
    const graph = new RoadGraph(roads, [site]); assert.equal(graph.nodes.get('j-west').signal, true); assert.equal(graph.nodes.get('j-east').signal, true);
    const unjoined = roads.filter(e => e.id !== 'crossing-link');
    assert.equal(resolveSignalSites(unjoined, sources).sites.length, 2, 'nearby disjoint nodes cannot share a controller');
  });
  test('rendered lenses select exactly the same aspect as the NPC controller at every transition', () => {
    const sites = resolveSignalSites(arms(), [source()]).sites, lights = new SignalLights(sites), color = new Color(), matrix = new Matrix4(), position = new Vector3();
    assert.equal(lights.mesh.count, sites[0].approaches.length * 3);
    for (const t of [0, 17.99, 18, 20.99, 21, 22.99, 23, 41, 44, 46]) {
      lights.update(t);
      sites[0].approaches.forEach((a, i) => {
        const expected = ['red', 'amber', 'green'].indexOf(signalAspect(sites[0], a.phase, t));
        for (let k = 0; k < 3; k++) { lights.mesh.getColorAt(i * 3 + k, color); assert.equal(Math.max(color.r, color.g, color.b) > .1, k === expected); }
        lights.mesh.getMatrixAt(i * 3, matrix); position.setFromMatrixPosition(matrix);
        assert.ok((position.x - a.pole[0]) * a.hx + (position.z - a.pole[2]) * a.hz < 0, 'lit face points back toward incoming traffic');
        const face = new Vector3(0, 0, 1).transformDirection(matrix);
        assert.ok(face.x * a.hx + face.z * a.hz < -.999, 'lens local front agrees with the static housing orientation');
      });
    }
    let geoDisposed = false, materialDisposed = false;
    lights.geometry.addEventListener('dispose', () => geoDisposed = true); lights.material.addEventListener('dispose', () => materialDisposed = true);
    lights.dispose(); assert.equal(geoDisposed && materialDisposed, true);
  });
  test('all vehicle lengths stop with their nose behind a mapped mid-block stop bar and resume on green', () => {
    for (const group of ['car', 'bus', 'auto', 'bike', 'truck']) {
      const roads = [road('straight', [[-120, 0], [200, 0]], { oneway: 'backward', cls: 'residential' })], t = fixture(roads, [source([0, 0])]);
      const edge = t.graph.edges[0], c = t.spawnAt(group, edge, 1, 65, 2.8), control = t.graph.signalsFor(edge, 1)[0];
      t.t = 460 + SIGNAL_PHASE - control.site.offset; c.speed = 12;
      for (let i = 0; i < 200; i++) { tick(t); assert.ok(c.s + c.size[2] / 2 <= control.approach.stopS + .001, `${group} nose crosses red bar`); }
      assert.equal(c.speed, 0); assert.ok(c.s > 95, `${group} approaches bar`);
      t.t = 460 - control.site.offset; for (let i = 0; i < 100; i++) tick(t);
      assert.ok(c.s + c.size[2] / 2 > control.approach.stopS + 10, `${group} resumes through green`);
    }
  });
  test('a car that crossed the bar on green clears a subsequent red without stopping inside', () => {
    const t = fixture(turnRoads, [source([0, 0])]), c = t.spawnAt('bus', t.graph.byId.get('in'), 1, 55, 2.8);
    for (let i = 0; i < 500 && !(c.motion?.progress >= 0); i++) tick(t);
    assert.ok(c.motion?.progress >= 0); t.t = 460 + SIGNAL_PHASE - t.graph.signalsFor(t.graph.byId.get('in'), 1)[0].site.offset;
    for (let i = 0; i < 600 && c.edge.e.id !== 'out'; i++) tick(t);
    assert.equal(c.edge.e.id, 'out'); assert.ok(c.speed > 0);
  });
  test('tile geometry never bakes permanently illuminated RGB bulbs and retains only sourced controls', () => {
    initTemplates({ rbox: new BoxGeometry(1, 1, 1), ring: new RingGeometry(1, 1.35, 12) });
    const zone = { i: 0, j: 0, roads: arms(), nodes: { junction: [500, 500] }, buildings: [], boards: [], furniture: [source(), source([700, 700], { synth: 1 })], areas: [] };
    const tile = buildTile(zone, { lowQ: true });
    assert.equal(tile.signals.length, 1); assert.equal(tile.counts.inferredSignals, 0);
    assert.equal([...tile.obstacles.values()].flat().filter(o => o.r === .12).length, 4, 'all signal poles have physical collision');
    assert.ok(tile.signals[0].approaches.every(a => a.line.length === 2));
    const signalLights = new SignalLights(tile.signals), world = Object.assign(Object.create(World.prototype), { tiles: new Map([['0_0', { signalLights }]]) });
    world.updateSignals(21.5 - tile.signals[0].offset);
    for (let i = 0; i < signalLights.mesh.count; i++) { const color = new Color(); signalLights.mesh.getColorAt(i, color); assert.equal(Math.max(color.r, color.g, color.b) > .1, i % 3 === 0); }
    signalLights.dispose();
  });
  test('raised pole colliders occupy their native height and leave ground below clear', () => {
    const roads = [road('deck', [[400, 500], [600, 500]], { elev: [8, 8] })], f = source(undefined, { mappedDirections: [{ wayId: 'way/1', forwardHeading: [1, 0], tags: { bridge: 'yes' } }] });
    const tile = buildTile({ i: 0, j: 0, roads, nodes: {}, buildings: [], boards: [], furniture: [f], areas: [] }, { lowQ: true });
    const [x, y, z] = tile.signals[0].approaches[0].pole;
    const city = { ...tile, byBuilding: new Map() };
    assert.equal(staticSolidAt(city, { x, y: y + 2, z }, .05), true);
    assert.equal(staticSolidAt(city, { x, y: 2, z }, .05), false, 'signal pole does not grow down through the ground road');
  });
  console.log(`${count} traffic-signal regressions passed`);
} finally { await rm(out, { recursive: true, force: true }); }
