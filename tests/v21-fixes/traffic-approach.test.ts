import test from 'node:test';
import assert from 'node:assert/strict';
import { RoadGraph } from '../../src/game/roadgraph';
import { busTurn } from '../../src/game/bus-path';
import { Traffic } from '../../src/game/traffic';
import { trafficApproachRoom } from '../../src/game/traffic-approach';
import type { RoadEdge, XZ } from '../../src/world/types';

function edge(id: string, pts: XZ[], from: string, to: string): RoadEdge {
  return { id, seg: id, name: null, cls: 'primary', pts, from, to, elev: null, w: 7, lanes: 2, oneway: 'backward', maxspeed: 40,
    joinedPavement: { sourceWidth: 9.4, originalWidth: 9.4, intervals: [[0, 100]], taper: 30, release: 'test' } };
}
function fixture(dense: boolean) {
  const angle = .17, point = (s: number): XZ => [Math.cos(angle) * s, Math.sin(angle) * s];
  const before = edge('approach-in', dense ? [[-40, 0], [-30, 0], [-20, 0], [-10, 0], [-1.36, 0], [0, 0]] : [[-40, 0], [0, 0]], 'start', 'join');
  const after = edge('approach-out', dense ? [point(0), point(.141), point(1.7), point(10), point(20), point(40)] : [point(0), point(40)], 'join', 'finish');
  const graph = new RoadGraph([before, after]);
  return { graph, before: graph.byId.get(before.id)!, after: graph.byId.get(after.id)! };
}

test('physical approach room is invariant to redundant road grade samples for both directions and ends', () => {
  const a = fixture(false), b = fixture(true);
  for (const dir of [1, -1] as const) for (const end of [false, true]) {
    assert.equal(trafficApproachRoom(a.before, dir, end), 40);
    assert.equal(trafficApproachRoom(b.before, dir, end), 40);
    assert.equal((Traffic.prototype as any).segmentRoom.call({}, b.before, dir, end), 40);
  }
});

test('a legal bus join no longer disappears when a long approach has a fourteen-centimetre first sample', () => {
  const a = fixture(false), b = fixture(true);
  const coarse = busTurn(a.graph, a.before, 1, a.after, 1), dense = busTurn(b.graph, b.before, 1, b.after, 1);
  assert.ok(coarse); assert.ok(dense);
  assert.ok(dense.curve.minRadius >= 6.5);
  assert.ok(Math.abs(coarse.startS - dense.startS) < 1e-9);
  assert.ok(Math.abs(coarse.endS - dense.endS) < 1e-9);
  for (let i = 0; i <= 40; i++) {
    const p = coarse.curve.at(i / 40), q = dense.curve.at(i / 40);
    for (const key of ['x', 'y', 'z', 'hx', 'hz'] as const) assert.ok(Math.abs(p[key] - q[key]) < 1e-9, key);
  }
});

test('approach aggregation stops at real bends and never consumes the earlier road behind them', () => {
  const road = edge('bend', [[0, 0], [30, 0], [30, 10]], 'a', 'b'), graph = new RoadGraph([road]), e = graph.byId.get(road.id)!;
  assert.equal(trafficApproachRoom(e, 1, true), 10);
  assert.equal(trafficApproachRoom(e, 1, false), 30);
  assert.equal(trafficApproachRoom(e, -1, false), 10);
  assert.equal(trafficApproachRoom(e, -1, true), 30);
});

test('zero-length duplicate samples and very long straight roads do not create unbounded work or room', () => {
  const road = edge('duplicates', [[0, 0], [0, 0], [200, 0], [200, 0]], 'a', 'b'), graph = new RoadGraph([road]), e = graph.byId.get(road.id)!;
  assert.equal(trafficApproachRoom(e, 1, true), 60);
  assert.equal(trafficApproachRoom(e, 1, false), 60);
  for (let i = 0; i < 100; i++) assert.equal(trafficApproachRoom(e, 1, true), 60);
});

test('endpoint coordinate rounding does not turn a gentle continuation into a fourteen-centimetre approach', () => {
  const incoming = edge('rounding-in', [[3580, -2344], [3609.1, -2322.6]], 'a', 'join');
  const outgoing = edge('rounding-out', [[3609.1, -2322.6], [3609.2, -2322.5], [3619.1, -2315.2], [3639.1, -2300.4]], 'join', 'b');
  const graph = new RoadGraph([incoming, outgoing]), before = graph.byId.get(incoming.id)!, after = graph.byId.get(outgoing.id)!;
  assert.ok(trafficApproachRoom(after, 1, false) > 30);
  const turn = busTurn(graph, before, 1, after, 1); assert.ok(turn);
  assert.ok(turn.curve.minRadius >= 6.5);
  const sharp = edge('tiny-sharp', [[0, 0], [.1, 0], [.1, 20]], 'x', 'y'), e = new RoadGraph([sharp]).byId.get(sharp.id)!;
  assert.equal(trafficApproachRoom(e, 1, false), .1, 'a real ninety-degree bend is not erased');
});

test('conservative one-way through-lane capacity does not erase bidirectional or controlled expressway lanes', () => {
  const road = edge('one-lane-policy', [[0, 0], [40, 0]], 'a', 'b');
  road.w = 6.5; road.joinedPavement!.usableLanes = 1;
  const pick = (e: RoadEdge, value = .99) => {
    const g = new RoadGraph([e]).byId.get(e.id)!;
    return Traffic.prototype.pickLane.call({ r: () => value, laneRange: Traffic.prototype.laneRange }, g, 2, 'car');
  };
  assert.equal(pick(road), 0, 'a one-way single through lane is centred');
  assert.ok(pick({ ...road, oneway: null }) > 0, 'opposite traffic retains its own side');
  const highway: RoadEdge = { ...road, w: 20, cls: 'motorway', expressway: { controlled: true, ramp: false, throughLanes: 4, laneWidth: 3.5, shoulders: [2, 2], sources: ['test'], sourceDate: 'test', uncertainty: 'unit control' } };
  assert.equal(new Set([0, .27, .55, .99].map(value => pick(highway, value))).size, 4, 'controlled source lanes retain priority');
});
