import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { initTemplates } from '../../src/core/util';
import { RailTrains } from '../../src/game/rail';
import { MovingRailInteraction } from '../../src/game/moving-rail';
import { RailwayFlow, buildRailwayRun, parallelRailwayRuns, projectRailwayRun, railwayPoint, railwaySweepsConflict, sharedRailwayWay, type RailwayTrack } from '../../src/game/railway-flow';
import { railwayNetwork } from '../../src/world/railway-geometry';

function mappedPair(curve = false, raised = false) {
  const tracks = new Map<string, RailwayTrack>();
  for (const [name, side] of [['up', -2.6], ['down', 2.6]] as const) {
    // Source ways deliberately reverse their point ordering at each bridge seam.
    const points: [number, number][] = [];
    for (let x = -1800; x <= 1800; x += 30) {
      const bend = curve ? 100 * Math.sin(x / 700) : 0, slope = curve ? Math.cos(x / 700) / 7 : 0;
      const norm = Math.hypot(1, slope);
      points.push([x - slope / norm * side, bend + side / norm]);
    }
    for (let part = 0; part < 3; part++) {
      const pts = points.slice(part * 40, part * 40 + 41), elev = pts.map(([x]) => raised ? Math.max(0, 6.2 - Math.max(0, Math.abs(x) - 400) * .01) : 0);
      if ((part + (name === 'up' ? 1 : 0)) % 2) { pts.reverse(); elev.reverse(); }
      tracks.set(`${name}:${part}`, { pts, elev, bridge: raised && part === 1 });
    }
  }
  return tracks;
}
function dispose(rail: RailTrains) { Object.values(rail.geos).forEach(g => g.dispose()); rail.mat.dispose(); }

test('mapped parallel tracks receive opposite permanent flows despite reversed way order', () => {
  const tracks = mappedPair(true, true), up = buildRailwayRun(tracks, tracks.get('up:1')!), down = buildRailwayRun(tracks, tracks.get('down:2')!);
  assert.equal(up.ways.length, 3); assert.equal(down.ways.length, 3);
  const parallel = parallelRailwayRuns(up, down); assert.ok(parallel);
  assert.ok(parallel.separation > 5 && parallel.separation < 5.4);
  const flow = new RailwayFlow(), direction = flow.pair(up, down); assert.ok(direction);
  assert.equal(flow.direction(down), -direction * parallel.orientation);
  assert.equal(flow.reserve(up, -direction as 1 | -1), false, 'later opposite entry must be rejected');
  const rebuilt = buildRailwayRun(tracks, tracks.get('up:2')!);
  assert.equal(flow.direction(rebuilt), direction, 'starting on another bridge piece must retain track flow');
  const p = railwayPoint(up, up.len * .5), q = projectRailwayRun(down, p.x, p.z);
  assert.ok(p.y > 6); assert.ok(Math.abs(q.y - p.y) < .05);
});

test('whole-rake interlock catches swept crossings but permits separated tracks and overpasses', () => {
  const body = (id: string, x: number, z: number, hx = 1, hz = 0, y = 0) => ({ id, x, z, y, hx, hz, halfWidth: 1.57, halfLength: 11.25, bottom: y + .2, roof: y + 4.175 });
  assert.equal(railwaySweepsConflict([body('a', -30, 0)], [body('a', 30, 0)], [body('b', 0, -30, 0, 1)], [body('b', 0, 30, 0, 1)]), true);
  assert.equal(railwaySweepsConflict([body('a', -30, 0)], [body('a', 30, 0)], [body('b', 30, 5.2)], [body('b', -30, 5.2)]), false);
  assert.equal(railwaySweepsConflict([body('a', -30, 0)], [body('a', 30, 0)], [body('b', 0, -30, 0, 1, 6.2)], [body('b', 0, 30, 0, 1, 6.2)]), false);
});

test('a turnout cannot redirect a branch rake onto the main running track', () => {
  const tracks = new Map<string, RailwayTrack>([
    ['main-left', { pts: [[-1000, 0], [0, 0]] }],
    ['main-right', { pts: [[0, 0], [1000, 0]] }],
    ['branch', { pts: [[-800, -300], [0, 0]] }],
  ]);
  const main = buildRailwayRun(tracks, tracks.get('main-left')!), branch = buildRailwayRun(tracks, tracks.get('branch')!);
  assert.deepEqual(main.ways.map(w => w.id), ['main-left', 'main-right']);
  assert.deepEqual(branch.ways.map(w => w.id), ['branch']);
  assert.equal(sharedRailwayWay(main, branch), false);
});

test('the real railway source already has physical track pairs; loops do not create invented companions', () => {
  const tracks = new Map(railwayNetwork().profiles.filter(r => !r.service).map(r => [r.id, r]));
  assert.equal(tracks.size, 463);
  const used = new Set<string>(), runs = [];
  for (const [id, track] of tracks) {
    if (used.has(id)) continue;
    const run = buildRailwayRun(tracks, track); run.ways.forEach(w => used.add(w.id));
    if (run.len > 700) runs.push(run);
  }
  // The former greedy chaining reported 34/36 paired long runs because a
  // branch could steal a main way. Mutual continuation yields 29/32 stable
  // routes; these three extras are loops/merges beside existing paired lines.
  assert.equal(runs.length, 32);
  const unpaired = runs.filter(a => !runs.some(b => b !== a && parallelRailwayRuns(a, b)));
  assert.equal(unpaired.length, 3);
  assert.deepEqual(unpaired.map(r => r.ways[0].id).sort(), ['w1027717157', 'w27951654', 'w826136277']);
  for (const run of runs) for (const way of run.ways) {
    const rebuilt = buildRailwayRun(tracks, tracks.get(way.id)!);
    assert.deepEqual(rebuilt.ways, run.ways, `source ordering changed the fixed track containing ${way.id}`);
  }
});

test('actual source station and bridge approaches use both mapped tracks without coach intersections', () => {
  initTemplates();
  const tracks = new Map(railwayNetwork().profiles.filter(r => !r.service).map(r => [r.id, r]));
  for (const [x, z] of [[2000, -3500], [-3000, 1500], [5000, -5000], [-28000, -6000]]) {
    const rail = new RailTrains(new THREE.MeshBasicMaterial()); let both = 0;
    try {
      for (let tick = 0; tick < 1000; tick++) {
        rail.update(.1, x, z, tracks);
        if (rail.trains.length !== 2) continue;
        both++;
        const [a, b] = rail.trains, parallel = parallelRailwayRuns(a.run, b.run);
        assert.ok(parallel, `two active tracks near ${x},${z} must form a physical parallel pair`);
        assert.equal(a.dir * b.dir * parallel.orientation, -1, 'paired tracks must have opposite physical flow');
        const aa = rail.bodies.filter(body => body.id.startsWith(a.id + ':')), bb = rail.bodies.filter(body => body.id.startsWith(b.id + ':'));
        assert.equal(railwaySweepsConflict(aa, aa, bb, bb), false, `actual source rakes overlap near ${x},${z} at tick ${tick}`);
      }
      assert.ok(both > 700, 'keep both rakes active long enough to pass');
    } finally { dispose(rail); }
  }
});

test('opposing railway rakes pass on the two visible curved bridge tracks without overlaps', () => {
  initTemplates();
  const rail = new RailTrains(new THREE.MeshBasicMaterial()), tracks = mappedPair(true, true);
  const visited = new Set<string>(); let both = 0, passed = false, signs: number[] = [];
  try {
    for (let tick = 0; tick < 3600; tick++) {
      rail.update(1 / 30, 0, 0, tracks);
      rail.trains.forEach(t => visited.add(t.id));
      if (rail.trains.length === 2) {
        both++;
        const [a, b] = rail.trains;
        assert.equal(sharedRailwayWay(a.run, b.run), false, 'two active rakes must not reserve a shared mapped way');
        const ap = railwayPoint(a.run, a.s), bp = railwayPoint(b.run, b.s);
        assert.ok((ap.hx * a.dir) * (bp.hx * b.dir) + (ap.hz * a.dir) * (bp.hz * b.dir) < -.9);
        const current = rail.bodies.filter(s => s.id.startsWith(a.id + ':')), other = rail.bodies.filter(s => s.id.startsWith(b.id + ':'));
        assert.equal(railwaySweepsConflict(current, current, other, other), false, `visible coach overlap at tick ${tick}`);
        const difference = ap.x - bp.x;
        if (signs.length && difference * signs[0] < 0) passed = true;
        signs.push(difference);
      }
    }
    assert.ok(both > 300, 'must exercise simultaneous passing rather than remove the second train');
    assert.ok(passed, 'the opposing rakes must actually pass each other');
    assert.ok(visited.size >= 2);
  } finally { dispose(rail); }
});

test('a second rake cannot spawn into a reserved single track', () => {
  initTemplates();
  const rail = new RailTrains(new THREE.MeshBasicMaterial()), tracks = new Map<string, RailwayTrack>([
    ['single', { pts: [[-2000, 0], [2000, 0]], elev: [0, 0] }],
  ]);
  try {
    let seen = false;
    for (let tick = 0; tick < 800; tick++) {
      rail.update(.1, 0, 0, tracks);
      assert.ok(rail.trains.length <= 1, 'shared-way headway reservation must block another rake');
      seen ||= rail.trains.length > 0;
    }
    assert.ok(seen, 'the guard must not remove railway service entirely');
  } finally { dispose(rail); }
});

test('crossing railway rakes yield with their whole coaches and then both continue', () => {
  const rail = new RailTrains(new THREE.MeshBasicMaterial()), tracks = new Map<string, RailwayTrack>([
    ['east', { pts: [[-1000, 0], [1000, 0]] }],
    ['north', { pts: [[0, -1000], [0, 1000]] }],
  ]);
  const make = (id: string) => ({ id, run: buildRailwayRun(tracks, tracks.get(id)!), s: 850, dir: 1 as const, v: 15,
    cars: [new THREE.Mesh(), new THREE.Mesh(), new THREE.Mesh()] });
  const a = make('east'), b = make('north'); rail.trains.push(a, b);
  try {
    for (let tick = 0; tick < 450; tick++) {
      rail.update(.1, 0, 0, new Map());
      const aa = rail.bodies.filter(body => body.id.startsWith(a.id + ':')), bb = rail.bodies.filter(body => body.id.startsWith(b.id + ':'));
      assert.equal(railwaySweepsConflict(aa, aa, bb, bb), false, `crossing coaches overlap at tick ${tick}`);
    }
    assert.ok(a.s > 1300 && b.s > 1300, 'priority must release both trains after the crossing clears');
  } finally { dispose(rail); }
});

test('railway roof support carries the player with the same rendered coach after flow changes', () => {
  initTemplates();
  const rail = new RailTrains(new THREE.MeshBasicMaterial()), tracks = mappedPair(false, true);
  try {
    rail.update(6.1, 0, 0, tracks);
    const coach = rail.bodies.find(b => b.id.endsWith(':2')); assert.ok(coach);
    const player = { pos: { x: coach.x, y: coach.roof + .55, z: coach.z }, yaw: 0, speed: 0, vy: 0, flying: false, descending: false };
    const interaction = new MovingRailInteraction();
    interaction.beforePlayer(player, rail.bodies, false, 1 / 30);
    assert.equal(interaction.afterPlayer(player, 1 / 30).carried, true);
    const oldX = player.pos.x;
    rail.update(1 / 30, 0, 0, tracks);
    interaction.beforePlayer(player, rail.bodies, false, 1 / 30);
    assert.equal(interaction.afterPlayer(player, 1 / 30).carried, true);
    assert.ok(Math.abs(player.pos.x - oldX) > .3);
    const rendered = rail.trains[0].cars[2];
    assert.ok(Math.abs(player.pos.x - rendered.position.x) < .001);
  } finally { dispose(rail); }
});
