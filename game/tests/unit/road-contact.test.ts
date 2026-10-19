import { describe, it, expect } from 'vitest';
import { makeFixtureCore, makeFixtureWorld } from './fixture';
import { WorldPhysics } from '../../src/world/collision';
import { Player, NO_INPUT } from '../../src/player/player';
import { FlightLedger } from '../../src/player/flightLedger';
import { VEHICLE } from '../../src/config/gameplay';

describe('Visible bridge walls have matching physical boundaries', () => {
  it('shares the rendered metro centreline instead of colliding with two phantom decks', () => {
    const core = makeFixtureCore();
    core.metroLines[0].local = [[[0, -200], [0, -700]], [[4, -700], [4, -200]]];
    const w = new WorldPhysics(core);
    expect(w.overheadAt(2, -400, 0).bottom).toBeCloseTo(core.metro.deckHeightM - 2.1);
    expect(w.overheadAt(8, -400, 0).bottom).toBe(Infinity);
    expect(w.contacts(8, -400, 11, 0.5, 0.1).some((q) => q.kind === 'deck')).toBe(false);
  });
  it('resolves overlapping class-default parallel flyover widths in the shared render/physics data', () => {
    const c = makeFixtureCore(), a = c.roads.find((r) => r.id === 'E')!;
    a.oneway = true;
    c.roads.push({ ...a, id: 'E_parallel', fromNode: 'parallel_start', toNode: 'parallel_end', surfaceId: 's_1_E_parallel', points: a.points.map(([x, z]) => [x, z + 6]), status: { ...a.status }, provenance: { ...a.provenance } });
    const w = new WorldPhysics(c);
    expect(a.widthM).toBeCloseTo(5.4);
    expect(w.roads.roads.get('E_parallel')!.widthM).toBeCloseTo(5.4);
    expect(a.provenance.note).toMatch(/not street-survey verified/);
  });
  it('never mistakes a straight bridge continuation for a narrow parallel carriageway', () => {
    const core = makeFixtureCore(), bridge = core.roads.find((r) => r.id === 'E')!;
    bridge.oneway = true;
    core.roads.push({ ...bridge, id: 'bridge_continuation', fromNode: bridge.toNode, toNode: 'bridge_next', points: [[150, -1500], [300, -1500]], pointElevM: [6.5, 6.5], lengthM: 150, status: { ...bridge.status }, provenance: { ...bridge.provenance } });
    new WorldPhysics(core);
    expect(bridge.widthM).toBe(10);
    expect(core.roads.at(-1)!.widthM).toBe(10);
  });
  it('blocks the whole car at a raised parapet while preserving the road beneath and air above', () => {
    const w = makeFixtureWorld();
    expect(w.contacts(0, -1495.5, 6.55, 1, 1).some((c) => c.kind === 'parapet')).toBe(true);
    expect(w.contacts(0, -1495.5, 0, 1, 1).some((c) => c.kind === 'parapet')).toBe(false);
    expect(w.contacts(0, -1495.5, 7.6, 1, 1).some((c) => c.kind === 'parapet')).toBe(false);
  });
  it('keeps a wall down the low end of a ramp, where the old centre constraint had no collision', () => {
    const c = makeFixtureCore(), ramp = c.roads.find((r) => r.id === 'E')!;
    ramp.pointElevM = [0, 3]; ramp.elevationM = 3;
    const w = new WorldPhysics(c);
    expect(w.contacts(-100, -1495.5, 0.55, 1, 1).some((q) => q.kind === 'parapet')).toBe(true);
  });
  it('sweeps both vehicle volumes and cannot tunnel through a parapet in a large movement', () => {
    const p = new Player(makeFixtureWorld(), new FlightLedger(25));
    p.place(0, -1500, 0, 'E'); p.speed = 1000; // deliberately exceeds normal driving to stress the sweep
    const ev = p.step({ ...NO_INPUT, accel: true });
    expect(ev.some((e) => e.type === 'contact' && e.kind === 'parapet')).toBe(true);
    expect(p.z).toBeGreaterThan(-1505 + VEHICLE.circleOffset + VEHICLE.collisionRadius - 0.1);
  });
  it('registers a surveyed median once for both directions of contact', () => {
    const w = makeFixtureWorld();
    w.addRoadBarriers([{ id: 'test_median', points: [[0, -100], [0, -180]], elevation: 0, height: 0.8, width: 0.5 }]);
    expect(w.contacts(-0.5, -140, 0.05, 1, 1).find((q) => q.id.startsWith('test_median'))?.nx).toBeLessThan(0);
    expect(w.contacts(0.5, -140, 0.05, 1, 1).find((q) => q.id.startsWith('test_median'))?.nx).toBeGreaterThan(0);
  });
  it('opens parapets only at connected roads at the same height, preserving the wall elsewhere', () => {
    const core = makeFixtureCore(), bridge = core.roads.find((r) => r.id === 'E')!;
    core.roads.push({ ...bridge, id: 'bridge_branch', fromNode: 'n6', toNode: 'branch_end', points: [[150, -1500], [150, -1488]], pointElevM: [6.5, 6.5], lengthM: 12, widthM: 6, status: { ...bridge.status }, provenance: { ...bridge.provenance } });
    const w = new WorldPhysics(core);
    expect(w.roads.barrierClear('bridge_branch', 147, -1500, 6.5)).toBe(false);
    expect(w.contacts(147, -1500, 6.55, 1, 1).some((q) => q.kind === 'parapet')).toBe(false);
    expect(w.roads.barrierClear('bridge_branch', 147, -1490, 6.5)).toBe(true);
    expect(w.roads.barrierClear('bridge_branch', 147, -1500, 0)).toBe(true);
  });
  it('opens a low flyover fork where the ground exit gradually diverges from the ramp', () => {
    const core = makeFixtureCore(), bridge = core.roads.find((r) => r.id === 'E')!;
    bridge.pointElevM = [0, 6.5];
    const ground = core.roads[0];
    core.roads.push({ ...ground, id: 'fork_ground', fromNode: 'n5', toNode: 'fork_end', points: [[-150, -1500], [150, -1545]], pointElevM: [0, 0], widthM: 4.5, lengthM: 303.36 });
    core.roads.push({ ...ground, id: 'fork_approach', fromNode: 'fork_start', toNode: 'n5', points: [[-250, -1500], [-150, -1500]], pointElevM: [0, 0], widthM: 6, lengthM: 100 });
    core.nodes.find((n) => n.id === 'n5')!.edges = ['E', 'fork_ground', 'fork_approach'];
    const w = new WorldPhysics(core);
    expect(w.roads.barrierClear('E', -120, -1505.15, 0.65)).toBe(false);
    expect(w.contacts(-120, -1504.5, 0.05, 1.05, 1).some((q) => q.kind === 'parapet')).toBe(false);
  });
});

describe('Wheel support climbs the rendered curb', () => {
  it('the carriageway is flat, the footpath is 16 cm higher and the shoulder returns to grade', () => {
    const w = makeFixtureWorld();
    expect(w.roads.groundHeight(-5, -100, 'A1', 0, 0.5)).toBe(0);
    expect(w.roads.groundHeight(-7, -100, 'A1', 0, 0.5)).toBeCloseTo(0.16);
    expect(w.roads.groundHeight(-9, -100, 'A1', 0, 0.5)).toBe(0);
  });
  it('one side on a curb lifts that side of the suspension and slows the climb', () => {
    const p = new Player(makeFixtureWorld(), new FlightLedger(25));
    p.place(-5.8, -100, 0, 'A1'); p.speed = 5;
    p.step({ ...NO_INPUT, accel: true });
    expect(Math.max(...p.wheelHeights)).toBeCloseTo(0.16);
    expect(Math.min(...p.wheelHeights)).toBe(0);
    expect(p.y).toBeGreaterThan(0);
    expect(Math.abs(p.suspensionRoll)).toBeGreaterThan(0);
    expect(p.curbImpact).toBeGreaterThan(0);
    expect(p.speed).toBeLessThan(5 + VEHICLE.accel / 60);
  });
});
