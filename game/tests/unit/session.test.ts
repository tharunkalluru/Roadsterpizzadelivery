import { describe, it, expect } from 'vitest';
import { makeFixtureWorld, fixtureMission } from './fixture';
import { Session } from '../../src/missions/session';
import { NO_INPUT, type TickInput } from '../../src/player/player';
import { MISSION, SIM_HZ } from '../../src/config/gameplay';

const inp = (o: Partial<TickInput> = {}): TickInput => ({ ...NO_INPUT, ...o });

function started(over = {}, world = makeFixtureWorld()) {
  const s = new Session(world, fixtureMission(over), { runId: 'test', trafficEnabled: false });
  s.start();
  return s;
}

const brakeDist = (s: Session) => (s.player.speed * s.player.speed) / (2 * 9) + 1.0;

/** simple reference driver: cruise along the route, brake to stop inside the stop polygon */
function driveToStop(s: Session, maxTicks = 20000, extra: (s: Session) => Partial<TickInput> = () => ({})) {
  for (let k = 0; k < maxTicks && s.phase === 'PLAYING'; k++) {
    const stop = s.currentStop!;
    const c = s.stagingPose(stop);
    const d = Math.hypot(s.player.x - c.x, s.player.z - c.z);
    s.step(inp({ brake: d < brakeDist(s), ...extra(s) }));
  }
}

describe('M01/M03 deliver: deliberate low-speed stop starts the hold; success', () => {
  it('drives the fixture route and delivers', () => {
    const s = started();
    driveToStop(s);
    expect(s.outcome).toEqual({ success: true, reason: 'Delivered' });
    const r = s.results();
    expect(r.chargedSeconds).toBeLessThanOrEqual(r.deadlineSeconds);
    expect(r.flightUsedSeconds).toBe(0);
  });
  it('passing through the stop polygon at speed does not capture the car', () => {
    const s = started();
    let maxHold = 0;
    for (let k = 0; k < 6000 && s.player.z > -900; k++) { s.step(inp()); maxHold = Math.max(maxHold, s.holdTicks); }
    expect(s.outcome).toBeNull();
    expect(maxHold).toBe(0);
    expect(s.player.speed).toBeGreaterThan(10);
  });
  it('cancelling the hold restores normal control', () => {
    const s = started();
    for (let k = 0; k < 20000 && !s.holdActive && s.phase === 'PLAYING'; k++) {
      const c = s.stagingPose(s.currentStop!); const d = Math.hypot(s.player.x - c.x, s.player.z - c.z);
      s.step(inp({ brake: d < brakeDist(s) }));
    }
    expect(s.holdActive).toBe(true);
    s.step(inp({ boost: true }));
    expect(s.holdActive).toBe(false);
    for (let k = 0; k < 120; k++) s.step(inp());
    expect(s.outcome).toBeNull();
    expect(s.player.speed).toBeGreaterThan(2);
  });
});

describe('M02 wrong side / airborne do not complete', () => {
  it('stopping in the polygon facing the wrong direction does not deliver', () => {
    const s = started();
    s.player.place(-3.5, -800, Math.PI, 'A1'); // inside polygon but heading south
    for (let k = 0; k < 300; k++) s.step(inp({ brake: true }));
    expect(s.outcome).toBeNull();
    expect(s.holdHint).toMatch(/Wrong side/);
  });
  it('hovering above the polygon does not deliver', () => {
    const s = started();
    s.player.place(-3.5, -760, 0, 'A1');
    for (let k = 0; k < 40; k++) s.step(inp());
    s.step(inp({ flyPress: true }));
    for (let k = 0; k < 600 && s.phase === 'PLAYING'; k++) s.step(inp({ brake: s.player.z < -790 }));
    expect(s.outcome).toBeNull();
    expect(s.player.isAirborne).toBe(true);
  });
});

describe('F24/M05 same-tick ordering', () => {
  it('success on the deadline tick succeeds; one tick later fails', () => {
    // first measure when the hold completes with a generous deadline
    const a = started();
    driveToStop(a);
    const doneTick = a.chargedTicks;
    const exact = started({ deadlineSeconds: doneTick / SIM_HZ });
    driveToStop(exact);
    expect(exact.outcome?.success).toBe(true);
    const late = started({ deadlineSeconds: (doneTick - 1) / SIM_HZ });
    driveToStop(late);
    expect(late.outcome?.success).toBe(false);
    expect(late.outcome && !late.outcome.success && late.outcome.code).toBe('deadline');
  });
  it('cargo failure on the completing tick takes precedence over success', () => {
    const s = started({ cargo: { label: 'x', fragility: 1, failThreshold: 99 } });
    for (let k = 0; k < 20000 && s.phase === 'PLAYING' && s.holdTicks < MISSION.holdTicks - 1; k++) {
      const c = s.stagingPose(s.currentStop!); const d = Math.hypot(s.player.x - c.x, s.player.z - c.z);
      s.step(inp({ brake: d < brakeDist(s) }));
    }
    expect(s.holdTicks).toBe(MISSION.holdTicks - 1);
    s.player.dyn = { contacts: (_x, _z, _y, _h, _r, out) => { out.push({ id: 'bump_x', kind: 'vehicle', nx: 1, nz: 0, depth: 0.01 }); return out; }, occupancy: () => 0 };
    s.step(inp({ brake: true }));
    expect(s.outcome).toEqual({ success: false, reason: 'Cargo damaged beyond delivery', code: 'cargo' });
  });
  it('a moving pedestrian contact is critical and blocks completion (recovery instead)', () => {
    const s = started();
    for (let k = 0; k < 600; k++) s.step(inp());
    s.player.dyn = { contacts: (_x, _z, _y, _h, _r, out) => { out.push({ id: 'ped_x', kind: 'pedestrian', nx: 1, nz: 0, depth: 0.1 }); return out; }, occupancy: () => 0 };
    s.step(inp());
    expect(s.phase).toBe('RECOVERING');
    expect(s.outcome).toBeNull();
  });
});

describe('F19/F20/F23 recovery, retry, bounded cargo', () => {
  it('recovery preserves consumed ticks, adds one penalty, returns to a reached anchor', () => {
    const s = started();
    for (let k = 0; k < 400; k++) s.step(inp());
    s.step(inp({ flyPress: true }));
    for (let k = 0; k < 120; k++) s.step(inp());
    const consumed = s.player.ledger.consumedTicks;
    const maxZ = Math.min(...s.anchors.map((a) => a.z));
    const elapsed = s.elapsedTicks;
    s.requestManualRecovery();
    expect(s.phase).toBe('RECOVERING');
    for (let k = 0; k < 100; k++) s.step(inp()); // frozen
    expect(s.elapsedTicks).toBe(elapsed);
    s.completeRecovery();
    s.completeRecovery(); // applied once only
    expect(s.player.ledger.consumedTicks).toBe(consumed);
    expect(s.penaltyTicks).toBe(MISSION.recoveryPenaltyTicks);
    expect(s.recoveries).toBe(1);
    expect(s.player.move).toBe('GROUNDED');
    expect(s.player.z).toBeGreaterThanOrEqual(maxZ - 0.01); // no forward progress gain (north = -z)
  });
  it('full retry resets fuel and progress together', () => {
    const s = started();
    for (let k = 0; k < 300; k++) s.step(inp());
    s.step(inp({ flyPress: true }));
    for (let k = 0; k < 200; k++) s.step(inp());
    expect(s.player.ledger.consumedTicks).toBeGreaterThan(0);
    const retry = new Session(s.world, s.mission, { trafficEnabled: false });
    expect(retry.runId).not.toBe(s.runId);
    expect(retry.player.ledger.consumedTicks).toBe(0);
    expect(retry.elapsedTicks).toBe(0);
    expect(retry.stopIndex).toBe(0);
  });
  it('sustained contact produces one bounded event, not per-frame damage', () => {
    const s = started();
    s.player.dyn = { contacts: (_x, _z, _y, _h, _r, out) => { out.push({ id: 'wall', kind: 'building', nx: 0, nz: 1, depth: 0.01 }); return out; }, occupancy: () => 0 };
    for (let k = 0; k < 40; k++) s.step(inp({ brake: true }));
    expect(s.cargo).toBeGreaterThanOrEqual(98);
  });
});

describe('F12 intermediate stops never refill; M13 multi-stop survives checkpoint', () => {
  it('multi-stop contract shares one allocation across stops and restores from checkpoint', () => {
    const s = started({ stops: ['d_main', 'd_side'], deadlineSeconds: 600 });
    // fly a bit before the first stop
    for (let k = 0; k < 200; k++) s.step(inp());
    s.step(inp({ flyPress: true }));
    for (let k = 0; k < 100; k++) s.step(inp());
    s.step(inp({ flyPress: true }));
    for (let k = 0; k < 400 && s.player.move !== 'GROUNDED'; k++) s.step(inp());
    const consumed = s.player.ledger.consumedTicks;
    driveToStop(s, 20000, () => ({}));
    // stop 1 delivered or still driving to stop 2
    for (let k = 0; k < 20000 && s.stopIndex < 1 && s.phase === 'PLAYING'; k++) s.step(inp());
    expect(s.stopIndex).toBe(1);
    expect(s.player.ledger.consumedTicks).toBe(consumed);
    const cp = JSON.parse(JSON.stringify(s.checkpoint()));
    const r = Session.fromCheckpoint(s.world, s.mission, cp);
    expect(r.stopIndex).toBe(1);
    expect(r.player.ledger.consumedTicks).toBe(consumed);
    expect(r.elapsedTicks).toBe(s.elapsedTicks);
    expect(r.cargo).toBe(s.cargo);
    expect(r.resumed).toBe(true);
  });
  it('restoring an airborne checkpoint uses the documented ground-recovery path, keeps consumed ticks', () => {
    const s = started();
    for (let k = 0; k < 300; k++) s.step(inp());
    s.step(inp({ flyPress: true }));
    for (let k = 0; k < 150; k++) s.step(inp());
    const cp = JSON.parse(JSON.stringify(s.checkpoint()));
    const r = Session.fromCheckpoint(s.world, s.mission, cp);
    expect(r.player.isAirborne).toBe(false);
    expect(r.player.ledger.consumedTicks).toBe(s.player.ledger.consumedTicks);
    expect(r.penaltyTicks).toBe(s.penaltyTicks); // technical restore: no crash penalty
  });
  it('incompatible checkpoints are rejected explicitly', () => {
    const s = started();
    const cp = s.checkpoint();
    expect(() => Session.fromCheckpoint(s.world, { ...s.mission, version: 99 }, cp)).toThrow(/Incompatible/);
  });
});

describe('G02/G03/M04 routing on the directed graph', () => {
  it('return route does not reverse a one-way road', () => {
    const w = makeFixtureWorld();
    const out = w.nav.route('B:f', ['D:f'])!;
    expect(out.path).toContain('C:f');
    const back = w.nav.route('D:b', ['A1:b'])!;
    expect(back.path).not.toContain('C:b');
    expect(back.path).toEqual(['D:b', 'D:f', 'A2:b', 'A1:b']); // dead-end turnaround, then real roads
    for (let i = 0; i < back.path.length - 1; i++) expect(w.nav.edges.get(back.path[i])!.next).toContain(back.path[i + 1]);
  });
  it('a missed turn reroutes through real connections', () => {
    const s = started({ stops: ['d_side'], deadlineSeconds: 600 });
    // drive straight past the junction to the side road (missed right turn)
    for (let k = 0; k < 6000 && s.player.z > -1100; k++) s.step(inp());
    const r = s.route;
    expect(r.length).toBeGreaterThan(0);
    for (let i = 0; i < r.length - 1; i++) expect(s.world.nav.edges.get(r[i])!.next).toContain(r[i + 1]);
    expect(r[r.length - 1]).toBe('B:f');
  });
});

describe('M06 HUD/results agree', () => {
  it('charged = active + penalties; flight used + left = allocation', () => {
    const s = started();
    for (let k = 0; k < 300; k++) s.step(inp());
    s.requestManualRecovery(); s.completeRecovery();
    driveToStop(s);
    const r = s.results();
    expect(r.chargedSeconds).toBeCloseTo(r.activeSeconds + r.penaltySeconds, 9);
    expect(r.flightUsedSeconds + r.flightLeftSeconds).toBeCloseTo(r.flightInitialSeconds, 9);
    expect(r.penalties.filter((p) => p.seconds > 0).length).toBe(1);
  });
});
