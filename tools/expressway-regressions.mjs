// Offline ORR geometry, access control and streamed-road regressions against production code.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../game/node_modules/esbuild/lib/main.js';
const root = fileURLToPath(new URL('../', import.meta.url)), temp = await mkdtemp(join(tmpdir(), 'roadster-expressway-'));
let checks = 0;
const test = async (name, fn) => { await fn(); checks++; console.log(`PASS ${name}`); };
const close = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
try {
  await build({ stdin: { contents: "export * from './game/src/world/expressway'; export * from './game/src/world/expressway-signs'; export { buildTile } from './game/src/world/city'; export { supportAt, collideWalls } from './game/src/game/physics'; export { initTemplates } from './game/src/core/util'; export { BoxGeometry, RingGeometry } from './game/node_modules/three/build/three.module.js';", resolveDir: root, loader: 'ts' }, outfile: join(temp, 'test.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'error' });
  const { isORR, isRamp, travelDirection, sharedNode, roadLength, roadPose, expresswayOpening, expresswayPierClear, auxiliaryLane, mappedExits, upstreamPose, drawExpresswaySigns, drawRampChevrons, buildTile, supportAt, collideWalls, initTemplates, BoxGeometry, RingGeometry } = await import(pathToFileURL(join(temp, 'test.mjs')));
  initTemplates({ rbox: new BoxGeometry(1, 1, 1), ring: new RingGeometry(1, 1.35, 12) });
  const road = (id, pts, extra = {}) => ({ id, seg: id, name: 'Outer Ring Road', cls: 'motorway', w: 17.5, lanes: 4, oneway: 'backward', from: `${id}-a`, to: `${id}-b`, pts, elev: null, maxspeed: 100, expressway: { controlled: true, ramp: false, throughLanes: 4, laneWidth: 3.5, shoulders: [2.5, 1], sources: ['fixture'], sourceDate: '2026-10-26', uncertainty: 'Fixture grade' }, ...extra });
  const ramp = (id, pts, extra = {}) => road(id, pts, { name: null, cls: 'motorway_link', w: 7, lanes: 2, expressway: { controlled: false, ramp: true, throughLanes: 2, sources: ['fixture'], sourceDate: '2026-10-26', uncertainty: 'Fixture grade' }, ...extra });
  const zone = (roads, i = 0, j = 0, osm = []) => ({ i, j, roads, nodes: Object.fromEntries(roads.flatMap(e => [[e.from, e.pts[0]], [e.to, e.pts.at(-1)]])), buildings: [], boards: [], furniture: [], areas: [], osm });
  const unique = grid => [...new Set([...grid.values()].flat())];
  const buildZone = (roads, i = 0, j = 0, osm = []) => buildTile(zone(roads, i, j, osm), { lowQ: true });
  await test('ORR and ramps are distinguished without granting service-road access, including denied-heading encoding', () => {
    const a = road('a', [[100, 500], [900, 500]]), b = ramp('b', [[900, 500], [950, 450]], { from: a.to });
    assert.equal(isORR(a), true); assert.equal(isRamp(a), false); assert.equal(isORR(b), false); assert.equal(isRamp(b), true);
    assert.equal(isORR({ ...a, name: 'Service Road', cls: 'service', expressway: undefined }), false);
    assert.equal(travelDirection(a), 1); assert.equal(travelDirection({ ...a, oneway: 'forward' }), -1);
    assert.equal(sharedNode(a, b), a.to); assert.equal(sharedNode(a, { ...b, from: 'unconnected' }), null);
  });
  await test('road pose follows curved alignment, endpoint bounds and continuous grade', () => {
    const a = road('curve', [[100, 100], [400, 100], [400, 500]], { elev: [0, 3, 7] });
    assert.equal(roadLength(a), 700);
    assert.deepEqual(roadPose(a, -2), { x: 100, z: 100, y: 0, hx: 1, hz: 0 });
    assert.deepEqual(roadPose(a, 500), { x: 400, z: 300, y: 5, hx: 0, hz: 1 });
    assert.deepEqual(roadPose(a, 900), { x: 400, z: 500, y: 7, hx: 0, hz: 1 });
  });
  await test('barrier openings require a nearby connected mapped ramp at the same height', () => {
    const a = road('main', [[100, 500], [900, 500]], { elev: [6.8, 6.8] });
    const b = ramp('slip', [[900, 500], [990, 460]], { from: a.to, elev: [6.8, 6.8] });
    assert.equal(expresswayOpening(a, b, 900, 500, 6.8), true);
    assert.equal(expresswayOpening(a, { ...b, from: 'other' }, 900, 500, 6.8), false);
    assert.equal(expresswayOpening(a, { ...b, elev: [0, 0] }, 900, 500, 6.8), false);
    assert.equal(expresswayOpening(a, { ...b, cls: 'service', expressway: undefined }, 900, 500, 6.8), false);
    assert.equal(expresswayOpening(a, b, 400, 500, 6.8), false);
  });
  await test('auxiliary widening tapers within bounds and ignores unconnected ramps', () => {
    const a = road('main', [[100, 500], [210, 500], [320, 500], [430, 500], [540, 500]]);
    const b = ramp('slip', [[540, 500], [650, 430]], { from: a.to });
    assert.deepEqual(auxiliaryLane(a, [{ ...b, from: 'unconnected' }]), [0, 0, 0, 0, 0]);
    const widths = auxiliaryLane(a, [a, b]);
    assert.ok(widths.every(v => v >= 0 && v <= 3.5));
    close(widths[0], 0); close(widths[2], 0); close(widths[3], 1.75); close(widths[4], 3.5);
  });
  await test('exit-marker nearest-road ties select the directed diverge independent of source ordering', () => {
    const incoming = road('incoming', [[100, 500], [900, 500]], { to: 'junction' });
    const outgoing = road('outgoing', [[900, 500], [1500, 500]], { from: 'junction' });
    const slip = ramp('exit-ramp', [[900, 500], [960, 430]], { from: 'junction' });
    const f = [{ id: 'exit-1', k: 'exit', p: [900, 500], t: { ref: '1' } }];
    for (const roads of [[outgoing, incoming, slip], [incoming, outgoing, slip]]) {
      const exits = mappedExits(roads, f);
      assert.equal(exits.length, 1); assert.equal(exits[0].road.id, incoming.id); assert.equal(exits[0].name, 'Kokapet');
    }
    assert.equal(mappedExits([incoming, outgoing, { ...slip, oneway: 'forward' }], f).length, 0, 'entry-only ramp must not receive an exit board');
    assert.equal(mappedExits([incoming, outgoing, slip], [{ ...f[0], t: { ref: '999' } }]).length, 0, 'unknown exits are not invented');
  });
  await test('advance sign placement follows upstream connected carriageways through a bend', () => {
    const prev = road('prev', [[100, 100], [400, 100], [400, 300]], { to: 'join', elev: [0, 3, 5] });
    const last = road('last', [[400, 300], [400, 500]], { from: 'join', to: 'exit', elev: [5, 7] });
    const opposite = road('opposite', [[400, 500], [400, 300]], { from: 'other-a', to: 'other-b' });
    const out = upstreamPose({ road: last, s: 200 }, 400, [opposite, last, prev]);
    assert.equal(out.e, prev); close(out.x, 400); close(out.z, 100); close(out.y, 3); assert.equal(out.dir, 1);
    assert.equal(upstreamPose({ road: last, s: 200 }, 1500, [last, prev]), null);
    const reverse = road('reverse', [[400, 500], [400, 300]], { from: 'exit', to: 'join', oneway: 'forward' });
    const back = upstreamPose({ road: reverse, s: 0 }, 100, [reverse]);
    assert.equal(back.dir, -1); close(back.z, 400);
  });
  await test('gantry signs face approaching traffic, follow road grade and keep posts beyond shoulder and auxiliary lane', () => {
    const incoming = road('approach', [[100, 500], [900, 500]], { to: 'junction', elev: [0, 6.8] });
    const slip = ramp('exit-ramp', [[900, 500], [960, 430]], { from: 'junction', elev: [6.8, 6.8] });
    const signs = [], obstacles = [], boxes = [];
    const context = { B: { st: { box: (...args) => boxes.push(args) } }, inTile: (x, z) => x >= 0 && x < 1000 && z >= 0 && z < 1000,
      sign: (...args) => signs.push(args), obstacle: (...args) => obstacles.push(args) };
    drawExpresswaySigns([incoming, slip], [{ id: 'exit-1', k: 'exit', p: [900, 500], t: { ref: '1' } }], context);
    assert.equal(signs.length, 12); assert.equal(obstacles.length, 6);
    for (const distance of [500, 250, 25]) {
      const id = `orr_exit-1_${distance}`, x = 900 - distance, y = 6.8 * (x - 100) / 800;
      const header = signs.find(s => s[0] === id), name = signs.find(s => s[0] === `${id}_name`), arrow = signs.find(s => s[0] === `${id}_distance`);
      assert.equal(header[1], 'EXIT 1'); assert.equal(name[1], 'KOKAPET'); assert.equal(arrow[1], distance === 25 ? '↖ EXIT' : `↖ ${distance} m`);
      for (const [row, height] of [[header, 8.9], [name, 8.1], [arrow, 7.4]]) {
        close(row[2][0], x - .02); close(row[2][1], y + height); close(row[3][0], -1); close(row[3][2], 0);
      }
      assert.ok(header[2][1] - header[5] / 2 > name[2][1] + name[5] / 2, 'exit number and name have separate readable rows');
      assert.ok(name[2][1] - name[5] / 2 > arrow[2][1] + arrow[5] / 2, 'name and arrow rows must not overlap');
      const posts = obstacles.filter(p => Math.abs(p[0] - x) < 1e-6);
      assert.equal(posts.length, 2); assert.ok(posts.every(p => Math.abs(p[1] - 500) > incoming.w / 2 + .3));
      assert.ok(posts.some(p => Math.abs(p[1] - 500) > incoming.w / 2 + 3.5 + 1));
      for (const post of posts) close(post[3], y + 9.6);
    }
    assert.ok(boxes.every(b => b.slice(0, 6).every(Number.isFinite)));
    signs.length = 0;
    drawExpresswaySigns([incoming, slip], [{ id: 'exit-1', k: 'exit', p: [900, 500], t: { ref: '1' } }], { ...context, inTile: () => false });
    assert.equal(signs.length, 0, 'another source tile must not duplicate the gantries');
  });
  await test('ramp chevrons reverse correctly with mapped traffic direction and remain outside driving width', () => {
    const a = ramp('curve', [[200, 200], [300, 200], [300, 300]], { elev: [1, 2, 3] });
    const draw = edge => {
      const signs = [], boxes = [];
      drawRampChevrons([edge], { B: { st: { box: (...args) => boxes.push(args) } }, inTile: () => true, sign: (...args) => signs.push(args), obstacle: () => {} });
      return { signs, boxes };
    };
    const forward = draw(a), backward = draw({ ...a, oneway: 'forward' });
    assert.equal(forward.signs.length, 1); assert.equal(backward.signs.length, 1);
    assert.match(forward.signs[0][1], /❯/); assert.match(backward.signs[0][1], /❮/);
    for (const { signs, boxes } of [forward, backward]) {
      close(boxes[0][1], 3.1); assert.ok(Math.hypot(boxes[0][0] - 300, boxes[0][2] - 200) > a.w / 2 + 1);
      assert.ok(signs[0][2].every(Number.isFinite)); close(signs[0][2][1], 3.9);
    }
    const f = forward.signs[0][3], b = backward.signs[0][3]; close(f[0], -b[0]); close(f[2], -b[2]);
  });
  await test('a context ORR road renders physical support over five kilometres from its distant owner', () => {
    const pts = Array.from({ length: 121 }, (_, i) => [-6000 + i * 100, 500]);
    const a = road('long', pts, { ctx: 1, elev: pts.map(() => 6.8) });
    const left = buildZone([a], 4), right = buildZone([a], 5);
    for (const [tile, x] of [[left, 4500], [right, 5500]]) {
      const surface = supportAt(tile, x, 500, 6.8, true);
      assert.equal(surface.onRoad, true); close(surface.y, 6.8); assert.equal(surface.s.e.id, a.id);
      assert.ok(tile.buffers.some(b => b.mat === 'road' && b.pos.length > 0));
      assert.ok(unique(tile.walls).length > 0, 'context copies must build collision barriers as well as appearance');
      assert.ok(unique(tile.surfaceGrid).every(s => (s.ax + s.bx) / 2 >= tile.i * 1000 && (s.ax + s.bx) / 2 < (tile.i + 1) * 1000));
    }
    const leftSegments = new Set(unique(left.surfaceGrid).map(s => s.i));
    assert.ok(unique(right.surfaceGrid).every(s => !leftSegments.has(s.i)), 'adjacent tiles must not own duplicate road segments');
  });
  await test('grade-separated crossing preserves both supports and never opens the ORR barrier to the street below', () => {
    const a = road('upper', [[100, 500], [900, 500]], { elev: [6.8, 6.8] });
    const street = road('lower', [[500, 100], [500, 900]], { name: 'Cross street', cls: 'primary', oneway: null, w: 8, lanes: 2, expressway: undefined });
    const built = buildZone([a, street]);
    const upper = supportAt(built, 500, 500, 6.8, true), lower = supportAt(built, 500, 500, 0, true);
    assert.equal(upper.s.e.id, 'upper'); close(upper.y, 6.8); assert.equal(lower.s.e.id, 'lower'); close(lower.y, 0);
    const onDeck = { x: 500, z: 485 }, atGround = { x: 500, z: 485 };
    const stopped = collideWalls(built, { x: 500, z: 500 }, onDeck, 1, 6.9, 8);
    assert.ok(stopped.hit > 0, 'geometric crossing must retain a solid upper barrier');
    const beneath = collideWalls(built, { x: 500, z: 500 }, atGround, 1, .2, 1.3);
    assert.equal(beneath.hit, 0, 'upper barrier must not obstruct vehicles below');
  });
  await test('approach surface supports change continuously without adding a second ground-level ORR', () => {
    const a = road('approach', [[100, 500], [400, 500], [700, 500]], { elev: [0, 3.4, 6.8] });
    const built = buildZone([a]);
    const surfaces = unique(built.surfaceGrid).filter(s => s.e?.id === a.id);
    assert.equal(surfaces.length, 2, 'one surface per source segment, without a duplicate ground road');
    for (let x = 110; x <= 690; x += 10) close(supportAt(built, x, 500, 6.8 * (x - 100) / 600, true).y, 6.8 * (x - 100) / 600, 1e-6);
  });
  await test('bridge pier spacing remains24m after source densification and never doubles at segment boundaries', () => {
    const pts = Array.from({ length: 49 }, (_, i) => [100 + i * 10, 500]);
    const dense = road('dense', pts, { elev: pts.map(() => 6.8) });
    const sparse = road('sparse', [[100, 500], [580, 500]], { elev: [6.8, 6.8] });
    const piers = e => unique(buildZone([e]).obstacles).filter(o => Math.abs(o.r - .8) < 1e-8).sort((a, b) => a.x - b.x);
    const actual = piers(dense), expected = piers(sparse);
    assert.equal(actual.length, 20); assert.equal(actual.length, expected.length);
    for (let i = 0; i < actual.length; i++) {
      close(actual[i].x, 100 + i * 24, 1e-6); close(actual[i].x, expected[i].x, 1e-6); close(actual[i].z, 500);
      if (i) close(actual[i].x - actual[i - 1].x, 24, 1e-6);
    }
  });
  await test('bridge piers avoid the full ground-carriageway width while retaining supports on either side', () => {
    const pts = Array.from({ length: 49 }, (_, i) => [100 + i * 10, 500]);
    const upper = road('upper', pts, { elev: pts.map(() => 6.8) });
    const street = road('lower', [[340, 100], [340, 900]], { name: 'Street below', cls: 'primary', oneway: null, w: 16, lanes: 4, expressway: undefined });
    assert.equal(expresswayPierClear(upper, [upper, street], 340, 500), false);
    assert.equal(expresswayPierClear(upper, [upper, street], 349, 500), false, 'clear the street width plus pier/body margin');
    assert.equal(expresswayPierClear(upper, [upper, street], 350, 500), true);
    assert.equal(expresswayPierClear(upper, [upper, { ...street, elev: [6.8, 6.8] }], 340, 500), true, 'a high road is not a street passing underneath');
    const piers = unique(buildZone([upper, street]).obstacles).filter(o => Math.abs(o.r - .8) < 1e-8);
    assert.ok(piers.length > 0); assert.ok(piers.every(o => Math.abs(o.x - 340) >= street.w / 2 + 1.2));
    assert.ok(piers.some(o => o.x < 320) && piers.some(o => o.x > 360));
  });
  const core = JSON.parse(gunzipSync(await readFile(join(root, 'game/public/city/core.pack.wasm'))));
  const controlled = core.roads.filter(isORR), patched = core.roads.filter(e => e.expressway);
  await test('shipped ORR has four through lanes per carriageway and explicit source/grade uncertainty', () => {
    assert.ok(controlled.length >= 100); assert.ok(patched.length >= 250, 'run the reviewed ORR data patch before this regression');
    for (const e of controlled) {
      assert.equal(e.lanes, 4, `${e.id}: lane count`); close(e.w, 17.5); assert.equal(e.expressway?.controlled, true);
      assert.equal(e.expressway.throughLanes, 4); close(4 * e.expressway.laneWidth + e.expressway.shoulders.reduce((a, b) => a + b), e.w);
      assert.ok(e.oneway, `${e.id}: carriageway direction is required`); assert.ok(e.expressway.sources.length > 0); assert.match(e.expressway.uncertainty, /approximation|not a survey/i);
    }
  });
  await test('shipped expressway grades are finite, bounded and continuous at shared nodes and street boundaries', () => {
    const ends = new Map(); let elevated = 0, ground = 0;
    for (const e of patched) {
      const elev = e.elev || e.pts.map(() => 0);
      assert.equal(elev.length, e.pts.length, `${e.id}: grade points align with XY`);
      assert.ok(elev.every(y => Number.isFinite(y) && y >= 0 && y <= 6.801));
      if (elev.some(y => y > 1.2)) elevated++; else ground++;
      for (let i = 1; i < e.pts.length; i++) {
        const length = Math.hypot(e.pts[i][0] - e.pts[i - 1][0], e.pts[i][1] - e.pts[i - 1][1]);
        if (length > .01) assert.ok(Math.abs(elev[i] - elev[i - 1]) / length <= .041001, `${e.id}: approach grade exceeds4.1%`);
      }
      for (const [node, index] of [[e.from, 0], [e.to, elev.length - 1]]) {
        if (!node) continue;
        const prior = ends.get(node); if (prior !== undefined) close(elev[index], prior, .0011); else ends.set(node, elev[index]);
      }
    }
    assert.ok(elevated > 0 && ground > 0, 'bridges and ground sections both remain represented');
    for (const e of core.roads) if (!e.expressway) for (const [node, index] of [[e.from, 0], [e.to, e.pts.length - 1]]) if (ends.has(node)) close(e.elev?.[index] || 0, ends.get(node), .0011);
  });
  await test('all streamed copies retain the same ORR width, connectivity and grades as the core graph', async () => {
    const roads = new Map(patched.map(e => [e.id, e])); let copies = 0;
    for (const pack of core.packs) {
      const blob = await readFile(join(root, 'game/public/city', pack.file));
      assert.equal(blob.length, pack.bytes, `${pack.file}: manifest size must match actual compressed pack`);
      const data = JSON.parse(gunzipSync(blob));
      for (const tile of Object.values(data.tiles)) for (const e of tile.roads) {
        const canonical = roads.get(e.id); if (!canonical) continue; copies++;
        for (const field of ['w', 'lanes', 'from', 'to', 'pts', 'elev', 'expressway']) assert.deepEqual(e[field], canonical[field], `${e.id}: ${field} disagrees with core graph`);
      }
    }
    assert.ok(copies >= patched.length, 'patched roads must be represented by streamed tile copies');
  });
  console.log(`${checks} expressway regression groups passed (offline production code and shipped data).`);
} finally { await rm(temp, { recursive: true, force: true }); }
