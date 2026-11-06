import test from 'node:test';
import assert from 'node:assert/strict';
import { roadNavigationCue, flightNavigationReadout } from '../../src/ui/flight-navigation';
import { advanceRoadRoute, type RoutePoint } from '../../src/game/route-guidance';

const close = (actual: number, expected: number, message = '') =>
  assert.ok(Math.abs(actual - expected) <= 2, `${message}: ${actual} should be within 2 m of ${expected}`);
const notHardTurn = (cue: ReturnType<typeof roadNavigationCue>, message = '') => {
  assert.ok(!/^Turn (left|right|around)$/.test(cue.hint), `${message}: unexpected ${cue.hint} at ${cue.metres} m`);
  assert.ok(Number.isFinite(cue.metres) && cue.metres >= 0, 'distance remains a safe finite value');
  assert.ok(Number.isFinite(cue.bearing), 'bearing remains finite');
};
const rotate = (pts: RoutePoint[], radians: number): RoutePoint[] => pts.map(([x, y, z]) =>
  [x * Math.cos(radians) - z * Math.sin(radians), y, x * Math.sin(radians) + z * Math.cos(radians)]);
const resample = (pts: RoutePoint[], spacing: number): RoutePoint[] => {
  const out: RoutePoint[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) / spacing));
    for (let j = 1; j <= n; j++) out.push(a.map((value, k) => value + (b[k] - value) * j / n) as RoutePoint);
  }
  return out;
};

test('central road directions retain genuine left and right junctions in different world orientations', () => {
  for (const rotation of [0, Math.PI / 2, -.7]) for (const sign of [-1, 1]) {
    const points = rotate([[0, 0, 0], [0, 0, -200], [sign * 100, 0, -200]], rotation);
    const cue = roadNavigationCue(points, 300);
    assert.equal(cue.hint, sign < 0 ? 'Turn left' : 'Turn right');
    close(cue.metres, 200, 'junction distance');
    assert.equal(Math.sign(cue.bearing), sign);
  }
  const right = roadNavigationCue([[0, 0, 0], [0, 0, -200], [100, 0, -200]], 300);
  assert.equal(roadNavigationCue(undefined, 800).hint, 'Follow the map marker');
  const read = flightNavigationReadout({ x: 0, z: 0, yaw: 0, flying: false,
    target: { x: 100, z: 100, kind: 'customer' }, road: right });
  assert.equal(read!.distance, '200 m'); assert.equal(read!.hint, 'Turn right');
});

test('a sub-metre lateral source join 13 m ahead is not a left turn on a straight road', () => {
  const points: RoutePoint[] = [[0, 0, 0], [0, 0, -13], [-.6, 0, -13.3], [0, 0, -14], [0, 0, -200]];
  notHardTurn(roadNavigationCue(points, 200), 'reported straight-road case');
  notHardTurn(roadNavigationCue(rotate(points, 1.1), 200), 'same source join on a rotated road');
});

test('a short initial lane correction cannot set the heading for the rest of the route', () => {
  notHardTurn(roadNavigationCue([[0, 0, 0], [.6, 0, -.3], [.6, 0, -13.3], [.6, 0, -200]], 200));
});

test('a continuous gentle 60-degree road bend is not announced as a junction turn', () => {
  const arc: RoutePoint[] = Array.from({ length: 17 }, (_, i) => {
    const a = i / 16 * Math.PI / 3;
    return [100 * (1 - Math.cos(a)), 0, -100 * Math.sin(a)];
  });
  const last = arc[arc.length - 1];
  arc.push([last[0] + Math.sin(Math.PI / 3) * 100, 0, last[2] - Math.cos(Math.PI / 3) * 100]);
  notHardTurn(roadNavigationCue(arc, 205), 'right bend');
  notHardTurn(roadNavigationCue(arc.map(([x, y, z]) => [-x, y, z]), 205), 'left bend');
});

test('a real out-and-back manoeuvre is a U-turn rather than arbitrary left or right', () => {
  for (const rotation of [0, .6, -Math.PI / 2]) {
    const cue = roadNavigationCue(rotate([[0, 0, 0], [0, 0, -100], [0, 0, -100], [0, 0, 0]], rotation), 200);
    assert.equal(cue.hint, 'Turn around'); close(cue.metres, 100, 'U-turn point');
    assert.ok(Math.abs(cue.bearing) > Math.PI * .8);
  }
});

test('a turn is consumed by actual route progress and never announced again after passing it', () => {
  const route = { pts: [[0, 0, 0], [0, 0, -100], [100, 0, -100]] as RoutePoint[], len: 200 };
  const before = advanceRoadRoute(route, { x: 0, y: 0, z: -70 }, 80)!.route;
  const cue = roadNavigationCue(before.pts, before.len);
  assert.equal(cue.hint, 'Turn right'); close(cue.metres, 30, 'remaining distance to junction');
  const after = advanceRoadRoute(route, { x: 15, y: 0, z: -100 }, 120)!.route;
  notHardTurn(roadNavigationCue(after.pts, after.len), 'already passed junction');
});

test('duplicate and vertical-only points do not create or hide a genuine turn', () => {
  const points: RoutePoint[] = [[0, 0, 0], [0, 0, 0], [0, 3, 0], [0, 3, -200], [0, 3, -200], [100, 3, -200]];
  const cue = roadNavigationCue(points, 300);
  assert.equal(cue.hint, 'Turn right'); close(cue.metres, 200);
  notHardTurn(roadNavigationCue([[0, 0, 0], [0, 4, 0], [0, 8, 0]], 20), 'vertical-only data');
});

test('malformed or unavailable geometry never produces NaN distance, angle or a fabricated turn', () => {
  for (const points of [undefined, [], [[NaN, 0, 0], [Infinity, 0, -100]],
    [[0, 0, 0], [NaN, 0, -50], [0, 0, -100]]] as (RoutePoint[] | undefined)[]) {
    for (const remaining of [200, NaN, Infinity, -10]) notHardTurn(roadNavigationCue(points, remaining));
  }
});

test('turn detection is based on metres, not a 220-point sampling limit', () => {
  const sparse: RoutePoint[] = [[0, 0, 0], [0, 0, -450], [120, 0, -450]];
  for (const spacing of [Infinity, 1.5, .25]) {
    const points = spacing === Infinity ? sparse : resample(sparse, spacing);
    assert.ok(spacing === Infinity || points.length > 220);
    const cue = roadNavigationCue(points, 570);
    assert.equal(cue.hint, 'Turn right', `${spacing} m sampling`);
    close(cue.metres, 450, `${spacing} m sampling distance`);
  }
});

test('the rendered four-metre corner fillet retains its turn through grades and reversed traversal', () => {
  // The production ribbon trims up to four metres from each incident road
  // and samples a quadratic around the actual junction. Its small chords
  // must not hide the real corner or turn it into several instructions.
  const points: RoutePoint[] = [[0, 0, 0], [0, 1.96, -196]];
  for (let i = 1; i <= 12; i++) {
    const t = i / 12;
    points.push([4 * t * t, 1.96 + .04 * t, -196 - 8 * t + 4 * t * t]);
  }
  points.push([100, 3, -200]);
  const forward = roadNavigationCue(points, 300);
  assert.equal(forward.hint, 'Turn right');
  assert.ok(forward.metres >= 196 && forward.metres <= 204, 'cue lies inside the rendered forward turn');
  const reverse = roadNavigationCue([...points].reverse(), 300);
  assert.equal(reverse.hint, 'Turn left');
  assert.ok(reverse.metres >= 96 && reverse.metres <= 104, 'cue lies inside the rendered reverse turn');
  const paired = roadNavigationCue([[0, 0, 0], [0, 0, -100], [4, 0, -104], [100, 0, -104]], 200);
  assert.equal(paired.hint, 'Turn right'); close(paired.metres, 100, 'small same-direction fillet');
});

test('a nearby U-turn retains its actual junction distance instead of pointing back immediately', () => {
  const cue = roadNavigationCue([[0, 0, 0], [0, 0, -6], [0, 0, 30]], 42, { yaw: 0 });
  assert.equal(cue.hint, 'Turn around'); close(cue.metres, 6);
  const wrongWay = roadNavigationCue([[0, 0, 0], [0, 0, -100]], 100, { yaw: Math.PI });
  assert.equal(wrongWay.hint, 'Turn around'); assert.equal(wrongWay.metres, 0);
});
