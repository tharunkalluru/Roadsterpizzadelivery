import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RailTrains } from '../../src/game/rail';
import { initTemplates } from '../../src/core/util';
import { railwayNetwork } from '../../src/world/railway-geometry';
import { buildRailwayRun, type RailwayTrack } from '../../src/game/railway-flow';

const pair = () => new Map<string, RailwayTrack>([
  ['up:a', { pts: [[-1800, -2.6], [0, -2.6]] }], ['up:b', { pts: [[0, -2.6], [1800, -2.6]] }],
  ['down:a', { pts: [[0, 2.6], [-1800, 2.6]] }], ['down:b', { pts: [[1800, 2.6], [0, 2.6]] }],
]);
const dispose = (r: RailTrains) => { Object.values(r.geos).forEach(g => g.dispose()); r.mat.dispose(); };
const clear = (r: RailTrains) => { r.group.clear(); r.trains.length = 0; };

test('actual railway spawns reuse exact canonical runs while recomputing player placement and active-way occupancy', () => {
  initTemplates(); const rail = new RailTrains(new THREE.MeshBasicMaterial()), tracks = pair();
  const original = rail.buildRun.bind(rail); let joins = 0;
  rail.buildRun = (...args) => { joins++; return original(...args); };
  try {
    rail.t = 6.1; rail.update(0, -500, 0, tracks); assert.equal(rail.trains.length, 1); assert.equal(joins, 2);
    const firstRun = rail.trains[0].run, firstS = rail.trains[0].s;
    rail.t = 6.1; rail.update(0, -500, 0, new Map(tracks));
    assert.equal(joins, 2, 'a fresh Map with the same key/object entries reuses the joined routes');
    assert.equal(rail.trains.length, 2); assert.notEqual(rail.trains[1].run, firstRun, 'active occupancy selects the companion track');
    clear(rail); rail.t = 6.1; rail.update(0, 500, 0, tracks);
    assert.equal(joins, 2); assert.equal(rail.trains[0].run, firstRun);
    assert.ok(Math.abs(rail.trains[0].s - firstS - 1000) < .00001, 'spawn distance is recalculated at the new player position');
  } finally { dispose(rail); }
});

test('same-size way replacement and key changes invalidate canonical geometry before spawning', () => {
  initTemplates(); const rail = new RailTrains(new THREE.MeshBasicMaterial()), tracks = pair();
  const original = rail.buildRun.bind(rail); let joins = 0;
  rail.buildRun = (...args) => { joins++; return original(...args); };
  try {
    rail.t = 6.1; rail.update(0, 0, 0, tracks); const firstRun = rail.trains[0].run, initial = joins; clear(rail);
    const replacement = { ...tracks.get('up:b')!, pts: [[0, -2.6], [1800, -2.6]] as [number, number][], elev: [0, 2] };
    tracks.set('up:b', replacement); rail.t = 6.1; rail.update(0, 0, 0, tracks);
    assert.ok(joins > initial); assert.notEqual(rail.trains[0].run, firstRun);
    const updated = (rail as any).canonicalRuns.find(run => run.ways.some(w => w.id === 'up:b'));
    assert.deepEqual(updated, buildRailwayRun(tracks, tracks.get('up:a')!), 'cached geometry contains the new height profile even if another nearby track is selected');
    assert.deepEqual(rail.trains[0].run, buildRailwayRun(tracks, tracks.get(rail.trains[0].run.ways[0].id)!));
    const afterReplace = joins; clear(rail);
    const old = tracks.get('up:b')!; tracks.delete('up:b'); tracks.set('up:renamed', old);
    rail.t = 6.1; rail.update(0, 0, 0, tracks); assert.ok(joins > afterReplace);
    assert.ok((rail as any).canonicalRuns.some(run => run.ways.some(w => w.id === 'up:renamed')));
    assert.ok((rail as any).canonicalRuns.every(run => run.ways.every(w => w.id !== 'up:b')));
  } finally { dispose(rail); }
});

test('actual source repeated-spawn benchmark removes route joins after the cold spawn without bypassing spawn checks', t => {
  initTemplates(); const rail = new RailTrains(new THREE.MeshBasicMaterial());
  const tracks = new Map(railwayNetwork().profiles.filter(r => !r.service && r.bounds[0] < 4100 && r.bounds[1] > -100 && r.bounds[2] < -1400 && r.bounds[3] > -5600).map(r => [r.id, r]));
  const original = rail.buildRun.bind(rail); let joins = 0, joinMs = 0;
  rail.buildRun = (...args) => { joins++; const start = performance.now(); const value = original(...args); joinMs += performance.now() - start; return value; };
  try {
    const coldStart = performance.now(); rail.t = 6.1; rail.update(0, 2000, -3500, tracks); const coldMs = performance.now() - coldStart, coldJoins = joins, coldJoinMs = joinMs;
    assert.ok(coldJoins > 0); const warmMs: number[] = [];
    for (let i = 0; i < 20; i++) {
      clear(rail); rail.t = 6.1; const start = performance.now(); rail.update(0, 2000 + i * 2, -3500, tracks); warmMs.push(performance.now() - start);
      assert.equal(rail.trains.length, 1, 'each sample performs a real spawn, not a cached early return');
    }
    assert.equal(joins, coldJoins, 'twenty real spawns perform zero additional route joins'); assert.equal(joinMs, coldJoinMs);
    const reusedJoins = joins, refreshedMs: number[] = [];
    for (let i = 0; i < 20; i++) {
      clear(rail); rail.t = 6.1;
      const changed = new Map([...tracks].map(([id, track]) => [id, { ...track }]));
      const start = performance.now(); rail.update(0, 2000 + i * 2, -3500, changed); refreshedMs.push(performance.now() - start);
      assert.equal(rail.trains.length, 1);
    }
    assert.equal(joins - reusedJoins, coldJoins * 20, 'changed input still repeats all required joins');
    warmMs.sort((a, b) => a - b); refreshedMs.sort((a, b) => a - b);
    t.diagnostic(JSON.stringify({ scope: 'isolated Node CPU; not phone FPS', sourceWays: tracks.size, coldMs, coldJoins, coldJoinMs,
      warmSpawnP50Ms: warmMs[10], warmSpawnP95Ms: warmMs[19], warmAdditionalJoins: reusedJoins - coldJoins,
      invalidatedSpawnP50Ms: refreshedMs[10], invalidatedSpawnP95Ms: refreshedMs[19], invalidatedAdditionalJoins: joins - reusedJoins }));
  } finally { dispose(rail); }
});
