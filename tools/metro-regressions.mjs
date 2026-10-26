// Production metro geometry and simulation regressions; no browser state or WebGL is needed.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../game/node_modules/esbuild/lib/main.js';
const root = fileURLToPath(new URL('../', import.meta.url)), temp = await mkdtemp(join(tmpdir(), 'roadster-metro-'));
let count = 0;
const test = async (label, run) => { await run(); count++; console.log(`PASS ${label}`); };
try {
  await build({ stdin: { contents: "export { MetroTrains, METRO_TRAIN_LENGTH, METRO_HEADWAY_GAP } from './game/src/game/metro'; export * from './game/src/world/metro-geometry'; export { buildTile } from './game/src/world/city'; export { initTemplates } from './game/src/core/util'; export { BoxGeometry, RingGeometry, MeshBasicMaterial } from './game/node_modules/three/build/three.module.js';", resolveDir: root, loader: 'ts' }, outfile: join(temp, 'test.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'error' });
  const { MetroTrains, METRO_TRAIN_LENGTH, METRO_HEADWAY_GAP, metroCorridors, metroPath, sampleMetroPath, projectMetroPath, buildTile, initTemplates, BoxGeometry, RingGeometry, MeshBasicMaterial } = await import(pathToFileURL(join(temp, 'test.mjs')));
  initTemplates({ rbox: new BoxGeometry(1, 1, 1), ring: new RingGeometry(1, 1.35, 12) });
  const mats = { body: new MeshBasicMaterial(), lights: new MeshBasicMaterial() };
  const straight = [{ id: 'red', color: '#ff0000', pts: [[100, 100], [900, 100]] }];
  const fixture = (lines = straight, stations = []) => new MetroTrains({ lines, stations, deckHeight: 11 }, mats);
  const tick = (metro, seconds, x = 1e6, z = 1e6) => { for (let s = 0; s < seconds - 1e-7; s += .05) metro.update(.05, x, z); };
  const core = JSON.parse(gunzipSync(await readFile(join(root, 'game/public/city/core.pack.wasm'))));
  await test('six Hyderabad input tracks become three corridors with exactly one fixed run each way', () => {
    const original = JSON.stringify(core.metro.lines), corridors = metroCorridors(core.metro.lines), metro = fixture(core.metro.lines, core.metro.stations);
    assert.equal(core.metro.lines.length, 6); assert.equal(corridors.length, 3);
    assert.deepEqual(corridors.map((c) => c.lineId).sort(), ['blue', 'green', 'red']);
    assert.ok(corridors.every((c) => c.sourceParts === 2 && c.tracks.length === 2));
    assert.equal(metro.runs.length, 6);
    for (const corridor of corridors) {
      const pair = metro.runs.filter((run) => run.corridor === corridor);
      assert.deepEqual(pair.map((run) => run.dir), [1, -1]);
      assert.equal(pair[0].path, corridor.tracks[0].path); assert.equal(pair[1].path, corridor.tracks[1].path);
    }
    assert.equal(JSON.stringify(core.metro.lines), original, 'normalization must not rewrite source evidence');
  });
  await test('opposite input direction does not create extra tracks and separate branches are retained', () => {
    const a = { id: 'x', pts: [[100, 98], [900, 98]] }, b = { id: 'x', pts: [[900, 102], [100, 102]] };
    const c = metroCorridors([a, b])[0];
    assert.equal(c.sourceParts, 2); assert.deepEqual(c.center.pts[0], [100, 100]); assert.deepEqual(c.center.pts.at(-1), [900, 100]);
    assert.equal(metroCorridors([{ ...a, pts: a.pts.slice().reverse() }, { ...b, pts: b.pts.slice().reverse() }]).length, 1);
    const separate = metroCorridors([a, { id: 'x', pts: [[1200, 98], [2000, 98]] }, { id: 'other', pts: b.pts }]);
    assert.equal(separate.length, 3, 'same ID alone cannot merge disjoint paths or other lines');
  });
  await test('degenerate points are sanitized and track position and heading remain finite through bends', () => {
    const path = metroPath([[NaN, 2], [0, 0], [0, 0], [100, 0], [100, 100]]);
    assert.equal(path.pts.length, 3); assert.equal(path.len, 200);
    const before = sampleMetroPath(path, 99.95), after = sampleMetroPath(path, 100.05);
    const dot = before.hx * after.hx + before.hz * after.hz;
    assert.ok(dot > .999, 'heading uses a shared local chord instead of a ninety-degree snap');
    for (const s of [-100, 0, 100, 200, 300]) assert.ok(Object.values(sampleMetroPath(path, s)).every(Number.isFinite));
    assert.equal(projectMetroPath(path, [75, 5]).s, 75);
  });
  await test('opposite tracks move in opposite world directions without additional per-train lateral offsets', () => {
    const metro = fixture(), starts = metro.trains.map((train) => ({ train, run: train.run, s: train.s, p: metro.at(train.run, train.s) }));
    tick(metro, 2);
    for (const start of starts) {
      assert.equal(start.train.run, start.run);
      assert.ok((start.train.s - start.s) * start.run.dir > 0);
      const p = metro.at(start.run, start.train.s);
      assert.ok((p.x - start.p.x) * start.run.dir > 0);
      assert.ok(Math.abs(Math.abs(p.z - 100) - 1.95) < 1e-8);
    }
    assert.equal(new Set(metro.trains.map((train) => train.run.track.id)).size, 2);
  });
  await test('a follower brakes behind a stopped platform train without overlap or overtaking', () => {
    const metro = fixture(), lead = metro.trains.find((train) => train.run.dir === 1), run = lead.run;
    run.stops = [run.min, 350, run.max];
    Object.assign(lead, { s: 330, next: 350, v: 12, dwell: 0, terminal: false });
    const second = { ...lead, s: 220, v: 22, mesh: null }, third = { ...lead, s: 110, v: 22, mesh: null };
    metro.trains = [third, lead, second]; let queued = false;
    for (let i = 0; i < 1200; i++) {
      metro.update(.05, 1e6, 1e6);
      assert.ok(lead.s - second.s >= METRO_TRAIN_LENGTH + METRO_HEADWAY_GAP - 1e-7);
      assert.ok(second.s - third.s >= METRO_TRAIN_LENGTH + METRO_HEADWAY_GAP - 1e-7);
      if (lead.dwell > 0 && second.v < .01) queued = true;
    }
    assert.equal(queued, true); assert.ok(lead.s > 350); assert.ok(second.s > 350, 'the queue resumes after the platform clears');
  });
  await test('station matching respects line identity and aligns the train centre with its platform', () => {
    const lines = [...straight, { id: 'blue', pts: [[100, 120], [900, 120]] }];
    const metro = fixture(lines, [{ p: [500, 120], lines: ['blue'] }]);
    for (const run of metro.runs.filter((run) => run.corridor.lineId === 'red')) assert.equal(run.stops.length, 2);
    for (const run of metro.runs.filter((run) => run.corridor.lineId === 'blue')) {
      assert.equal(run.stops.length, 3);
      const target = run.stops[1], center = metro.at(run, target - run.dir * METRO_TRAIN_LENGTH / 2);
      assert.ok(Math.abs(center.x - 500) < 1e-8);
    }
  });
  await test('station arrival tolerance cannot consume the safety headway behind a stopped train', () => {
    const metro = fixture(), lead = metro.trains.find((train) => train.run.dir === 1), run = lead.run;
    Object.assign(lead, { s: 350 + METRO_TRAIN_LENGTH + METRO_HEADWAY_GAP - .05, v: 0, dwell: 50, terminal: false });
    const following = { ...lead, s: 349.9, next: 350, v: 1, dwell: 0, mesh: null };
    metro.trains = [lead, following];
    metro.update(.05, 1e6, 1e6);
    assert.ok(lead.s - following.s >= METRO_TRAIN_LENGTH + METRO_HEADWAY_GAP - 1e-8);
    assert.ok(following.s < 350, 'blocked platform arrival must wait for the full stopping point to clear');
  });
  await test('an intermediate station dwells before departure and never changes its track direction', () => {
    const metro = fixture(straight, [{ p: [500, 100], lines: ['red'] }]);
    const train = metro.trains.find((train) => train.run.dir === 1), run = train.run, stop = run.stops[1];
    metro.trains = [train]; Object.assign(train, { s: stop - .05, v: 1, next: stop, dwell: 0 });
    metro.update(.05, 1e6, 1e6); assert.equal(train.s, stop); assert.equal(train.v, 0);
    tick(metro, 17); assert.equal(train.s, stop); assert.equal(train.run, run); assert.ok(train.dwell > 0);
    tick(metro, 3); assert.ok(train.s > stop); assert.equal(train.run, run);
  });
  await test('a visible terminal train waits without jumping rails or reversing across passengers', () => {
    const metro = fixture(), train = metro.trains.find((train) => train.run.dir === 1), run = train.run;
    metro.trains = [train]; Object.assign(train, { s: run.max, v: 0, next: run.max, dwell: 0 });
    const point = metro.at(run, train.s - METRO_TRAIN_LENGTH / 2);
    tick(metro, 25, point.x, point.z);
    assert.equal(train.run, run); assert.equal(train.s, run.max); assert.equal(train.v, 0); assert.equal(train.terminal, true); assert.ok(train.mesh);
    metro.update(.05, 1e6, 1e6);
    assert.equal(train.run, run.peer); assert.equal(train.run.dir, -1); assert.equal(train.terminal, false); assert.equal(train.mesh, null);
  });
  await test('terminal re-entry waits for free space on the outgoing track', () => {
    const metro = fixture(), incoming = metro.trains.find((train) => train.run.dir === 1), outgoing = metro.trains.find((train) => train.run.dir === -1), oldRun = incoming.run;
    Object.assign(incoming, { s: oldRun.max, v: 0, next: oldRun.max, terminal: true, dwell: 0 });
    Object.assign(outgoing, { s: outgoing.run.max - 10, v: 0, dwell: 50 });
    metro.update(.05, 1e6, 1e6); assert.equal(incoming.run, oldRun);
    outgoing.s = outgoing.run.max - 200; metro.update(.05, 1e6, 1e6);
    assert.equal(incoming.run, oldRun.peer);
    assert.ok(incoming.s - outgoing.s >= METRO_TRAIN_LENGTH + METRO_HEADWAY_GAP);
  });
  await test('culling reuses train meshes without deleting service or changing track assignments', () => {
    const metro = fixture(), assignments = metro.trains.map((train) => train.run);
    metro.update(.05, 500, 100); const meshes = new Set(metro.trains.map((train) => train.mesh));
    assert.equal(meshes.size, 2); assert.ok(metro.trains.every((train) => train.mesh.children.length === 3));
    const before = metro.trains.map((train) => train.s);
    metro.update(.05, 1e6, 1e6); assert.equal(metro.pool.length, 2); assert.equal(metro.group.children.length, 0);
    metro.update(.05, 500, 100); assert.ok(metro.trains.every((train, i) => meshes.has(train.mesh) && train.run === assignments[i] && train.s !== before[i]));
    assert.equal(metro.pool.length, 0);
    for (const train of metro.trains) for (const coach of train.mesh.children) {
      const forward = [-Math.sin(coach.rotation.y), -Math.cos(coach.rotation.y)];
      const p = metro.at(train.run, train.s);
      assert.ok(forward[0] * p.hx * train.run.dir + forward[1] * p.hz * train.run.dir > .999);
      assert.ok([...coach.position.toArray(), ...coach.rotation.toArray().slice(0, 3)].every(Number.isFinite));
    }
  });
  await test('three coach bodies sample different points of a bend while staying on the shared rail path', () => {
    const metro = fixture([{ id: 'curve', pts: [[100, 100], [500, 100], [500, 700]] }]);
    const train = metro.trains.find((train) => train.run.dir === 1); metro.trains = [train];
    const corner = projectMetroPath(train.run.path, [500, 100]).s;
    Object.assign(train, { s: corner + 30, v: 0, next: corner + 100, dwell: 1 });
    metro.update(.05, 500, 100);
    const positions = train.mesh.children.map((coach) => [coach.position.x + train.mesh.position.x, coach.position.z + train.mesh.position.z]);
    assert.equal(new Set(positions.map((p) => p.join(','))).size, 3);
    for (const p of positions) assert.ok(projectMetroPath(train.run.path, p).d < 1e-7);
    assert.ok(Math.abs(train.mesh.children[0].rotation.y - train.mesh.children[2].rotation.y) > .1);
  });
  await test('one centreline and a paired source track set produce one identical rendered deck and rail set', () => {
    const zone = { i: 0, j: 0, roads: [], nodes: {}, buildings: [], boards: [], furniture: [], areas: [] };
    const common = { stations: [], pillars: [], deckHeight: 11 };
    const one = buildTile(zone, { lowQ: true, metro: { ...common, lines: straight } });
    const paired = buildTile(zone, { lowQ: true, metro: { ...common, lines: [{ id: 'red', pts: [[100, 98.05], [900, 98.05]] }, { id: 'red', pts: [[900, 101.95], [100, 101.95]] }] } });
    assert.equal(paired.counts.verts, one.counts.verts);
    assert.deepEqual(paired.walls, one.walls); assert.deepEqual(paired.surfaceGrid, one.surfaceGrid);
    assert.equal(paired.buffers.length, one.buffers.length);
    for (let i = 0; i < one.buffers.length; i++) assert.deepEqual(paired.buffers[i].pos, one.buffers[i].pos);
  });
  console.log(`${count} metro regression groups passed (offline production code).`);
} finally { await rm(temp, { recursive: true, force: true }); }
await import('./metro-clearance-regressions.mjs');
