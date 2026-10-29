import test from 'node:test';
import assert from 'node:assert/strict';
import { verifiedRailPassages } from '../../src/delivery/rail-passages';
import type { RailwayRun } from '../../src/game/railway-flow';
import type { RoadEdge } from '../../src/world/types';

const run: RailwayRun = { pts: [[0, .11, 0], [500, .11, 0], [1000, .11, 0]], cum: [0, 500, 1000], len: 1000, ways: [{ id: 'mapped-rail', dir: 1 }] };
const road = (id: string, x: number, elevation: number): RoadEdge => ({ id, seg: id, name: 'Existing bridge', cls: 'primary', w: 12, lanes: 2,
  oneway: null, from: 'a', to: 'b', pts: [[x, -40], [x, 40]], elev: [elevation, elevation], maxspeed: 30 });

test('passage discovery retains the exact mapped intersection, soffit and finite rail distance', () => {
  const roads = [road('mapped-overbridge', 250, 8)];
  const before = JSON.stringify(roads), result = verifiedRailPassages(run, roads);
  assert.equal(result.length, 1); assert.equal(result[0].x, 250); assert.equal(result[0].z, 0);
  assert.equal(result[0].s, 250); assert.equal(result[0].ceiling, 7.1);
  assert.ok(result[0].radius > 6 && result[0].radius < 20);
  assert.equal(JSON.stringify(roads), before, 'discovery never fabricates or edits bridge geometry');
});

test('at-grade roads, road underpasses, too-low decks and noncrossing spans never impose a train gate', () => {
  const aside = road('aside', 250, 8); aside.pts = [[250, 20], [250, 100]];
  const parallel = road('parallel', 250, 8); parallel.pts = [[100, 2], [800, 2]];
  const end = road('run-end', 995, 8);
  assert.deepEqual(verifiedRailPassages(run, [road('at-grade', 200, 0), road('underpass', 200, -7), road('low', 200, 6), aside, parallel, end]), []);
});

test('a bridge at a sampled railway vertex is deduplicated and checks the selected coach roof', () => {
  assert.equal(verifiedRailPassages(run, [road('vertex', 500, 8)]).length, 1);
  assert.equal(verifiedRailPassages(run, [road('tight', 250, 7)], 4.175).length, 0);
  assert.equal(verifiedRailPassages(run, [road('locomotive-clear', 250, 7)], 3.9).length, 1);
});

test('bounded discovery excludes crossings outside the forward window even on a long sampled segment', () => {
  const result = verifiedRailPassages(run, [road('behind', 250, 8), road('ahead', 400, 8)], 4.175, { min: 300, max: 450 });
  assert.deepEqual(result.map(passage => passage.id), ['ahead:1']);
});
