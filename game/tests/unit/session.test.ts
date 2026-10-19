import { describe, it, expect } from 'vitest';
import { makeFixtureWorld, fixtureMission } from './fixture';
import { Session } from '../../src/missions/session';
import { NO_INPUT, type TickInput } from '../../src/player/player';
import { Autopilot } from '../../src/debug/autopilot';
import { MISSION, SIM_HZ } from '../../src/config/gameplay';

function started(over = {}) {
  const s = new Session(makeFixtureWorld(), fixtureMission(over), { runId: 'test', trafficEnabled: false });
  s.start(); return s;
}
function atStop(s: Session) {
  const stop = s.currentStop!, c = s.stagingPose(stop);
  s.player.place(c.x, c.z, stop.facingHeading, stop.roadId);
}
function interact(s: Session) {
  s.step({ ...NO_INPUT, interactPress: true });
  for (let i = 1; i < MISSION.holdTicks && s.phase === 'PLAYING'; i++) s.step(NO_INPUT);
}
function collect(s: Session) { atStop(s); interact(s); expect(s.cargoLoaded).toBe(true); }
function driveJourney(s: Session, limit = 30000) {
  const ap = new Autopilot(s);
  for (let i = 0; i < limit && s.phase !== 'ENDED'; i++) {
    if (s.phase === 'RECOVERING') s.completeRecovery();
    else s.step(ap.input());
  }
}

describe('Explicit pizza collection and handover', () => {
  it('acceptance starts away from the restaurant, unloaded, with a connected pickup route', () => {
    const s = started(), stop = s.delivery(s.mission.pickupId), c = s.stagingPose(stop);
    expect(s.cargoLoaded).toBe(false);
    expect(s.deliveryStage).toBe('PICKUP');
    expect(s.currentStop?.id).toBe(s.mission.pickupId);
    expect(Math.hypot(s.player.x - c.x, s.player.z - c.z)).toBeGreaterThan(20);
    expect(s.route.length).toBeGreaterThan(0);
    expect(s.notices[0].text).toMatch(/Order accepted/);
  });
  it('waiting at pickup cannot collect; an explicit E press collects and changes the route', () => {
    const s = started(); atStop(s);
    for (let i = 0; i < 180; i++) s.step(NO_INPUT);
    expect(s.cargoLoaded).toBe(false);
    expect(s.canInteract).toBe(true);
    expect(s.holdTicks).toBe(0);
    interact(s);
    expect(s.cargoLoaded).toBe(true);
    expect(s.stopIndex).toBe(0);
    expect(s.currentStop?.id).toBe('d_main');
    expect(s.outcome).toBeNull();
  });
  it('a press outside the entrance is discarded, and passing at speed cannot collect', () => {
    const s = started();
    s.step({ ...NO_INPUT, interactPress: true }); atStop(s);
    for (let i = 0; i < 100; i++) s.step(NO_INPUT);
    expect(s.cargoLoaded).toBe(false);
    s.player.speed = 10;
    s.step({ ...NO_INPUT, accel: true, interactPress: true });
    expect(s.holdActive).toBe(false);
  });
  it('the complete approach, collection, customer journey and handover work through real driving', () => {
    const s = started(); driveJourney(s);
    expect(s.outcome).toEqual({ success: true, reason: 'Delivered' });
    expect(s.eventLog.some((e) => e.e.startsWith('collected '))).toBe(true);
    expect(s.eventLog.some((e) => e.e.startsWith('delivered '))).toBe(true);
    expect(s.results().chargedSeconds).toBeLessThan(s.mission.deadlineSeconds);
    expect(s.distanceTravelled).toBeGreaterThan(750);
  });
  it('stopping at the customer never completes without the handover action', () => {
    const s = started(); collect(s); atStop(s);
    for (let i = 0; i < 180; i++) s.step(NO_INPUT);
    expect(s.outcome).toBeNull();
    expect(s.holdHint).toMatch(/HAND OVER/);
    interact(s);
    expect(s.outcome?.success).toBe(true);
  });
  it('accelerating cancels collection and requires another explicit press', () => {
    const s = started(); atStop(s);
    s.step({ ...NO_INPUT, interactPress: true });
    expect(s.holdActive).toBe(true);
    s.step({ ...NO_INPUT, accel: true });
    expect(s.holdActive).toBe(false);
    for (let i = 0; i < 100; i++) s.step(NO_INPUT);
    expect(s.cargoLoaded).toBe(false);
  });
  it('wrong approach and airborne position cannot hand over', () => {
    const s = started(); collect(s); atStop(s);
    s.player.heading = Math.PI;
    for (let i = 0; i < 100; i++) s.step({ ...NO_INPUT, interactPress: true });
    expect(s.outcome).toBeNull(); expect(s.holdHint).toMatch(/Wrong side/);
    atStop(s); s.player.move = 'FLYING'; s.player.y = 4.8;
    s.step({ ...NO_INPUT, interactPress: true });
    expect(s.holdActive).toBe(false);
    expect(s.holdHint).toMatch(/Land on the road/);
  });
});

describe('Mission clocks, cargo and critical contacts', () => {
  it('handover on the deadline tick succeeds; one tick late fails', () => {
    const measured = started(); collect(measured); atStop(measured); interact(measured);
    const done = measured.chargedTicks;
    for (const [deadline, success] of [[done, true], [done - 1, false]] as const) {
      const s = started({ deadlineSeconds: deadline / SIM_HZ }); collect(s); atStop(s); interact(s);
      expect(s.outcome?.success).toBe(success);
    }
  });
  it('pizza takes no damage before pickup, but cargo failure overrides a completing handover', () => {
    const s = started({ cargo: { label: 'Pizza', fragility: 1, failThreshold: 99 } });
    s.player.dyn = { contacts: (_x, _z, _y, _h, _r, out) => { out.push({ id: 'prepickup', kind: 'vehicle', nx: 1, nz: 0, depth: 0.01 }); return out; }, occupancy: () => 0 };
    s.step(NO_INPUT); expect(s.cargo).toBe(100);
    s.player.dyn = s.traffic; collect(s); atStop(s);
    s.step({ ...NO_INPUT, interactPress: true });
    for (let i = 1; i < MISSION.holdTicks - 1; i++) s.step(NO_INPUT);
    s.player.dyn = { contacts: (_x, _z, _y, _h, _r, out) => { out.push({ id: 'loadedbump', kind: 'vehicle', nx: 1, nz: 0, depth: 0.01 }); return out; }, occupancy: () => 0 };
    s.step(NO_INPUT);
    expect(s.outcome).toEqual({ success: false, reason: 'Cargo damaged beyond delivery', code: 'cargo' });
  });
  it('recovery freezes simulation and preserves cumulative charge; it cannot advance to pickup', () => {
    const s = started(); const start = { x: s.player.x, z: s.player.z }, ledger = s.player.ledger.snapshot();
    s.requestManualRecovery(); const elapsed = s.elapsedTicks;
    for (let i = 0; i < 100; i++) s.step(NO_INPUT);
    expect(s.elapsedTicks).toBe(elapsed);
    s.completeRecovery(); s.completeRecovery();
    expect(s.player.ledger.snapshot()).toEqual(ledger);
    expect(s.penaltyTicks).toBe(MISSION.recoveryPenaltyTicks);
    expect(s.recoveries).toBe(1);
    expect(s.player.x).toBe(start.x); expect(s.player.z).toBe(start.z);
    expect(s.cargoLoaded).toBe(false);
  });
  it('results reconcile active time, penalties, initial charge, earned charge and spending', () => {
    const s = started(); driveJourney(s);
    const r = s.results();
    expect(r.chargedSeconds).toBeCloseTo(r.activeSeconds + r.penaltySeconds, 9);
    expect(r.flightUsedSeconds + r.flightLeftSeconds).toBeCloseTo(r.flightInitialSeconds + (r.flightEarnedSeconds ?? 0), 9);
    expect(r.flightInitialSeconds).toBe(2.5);
    expect(r.flightEarnedSeconds).toBeGreaterThan(0);
  });
});

describe('Checkpoints preserve both halves of a delivery', () => {
  it('a pre-pickup checkpoint cannot silently load a pizza', () => {
    const s = started(); const r = Session.fromCheckpoint(s.world, s.mission, JSON.parse(JSON.stringify(s.checkpoint())));
    expect(r.cargoLoaded).toBe(false); expect(r.currentStop?.id).toBe(s.mission.pickupId);
  });
  it('post-pickup and multi-drop progress, earned charge and seeded traffic survive restore', () => {
    const s = started({ stops: ['d_main', 'd_side'], deadlineSeconds: 600 }); collect(s); atStop(s); interact(s);
    expect(s.stopIndex).toBe(1);
    for (let i = 0; i < 120; i++) s.step({ ...NO_INPUT, accel: true });
    const r = Session.fromCheckpoint(s.world, s.mission, JSON.parse(JSON.stringify(s.checkpoint())));
    expect(r.stopIndex).toBe(1); expect(r.cargoLoaded).toBe(true); expect(r.currentStop?.id).toBe('d_side');
    expect(r.player.ledger.snapshot()).toEqual(s.player.ledger.snapshot());
    expect(r.elapsedTicks).toBe(s.elapsedTicks);
    expect(r.nextEncounterTick).toBe(s.nextEncounterTick);
  });
  it('rejects forged charge, missing collection, mismatched versions and negative accounting', () => {
    const s = started(); collect(s);
    const cp = s.checkpoint();
    expect(() => Session.fromCheckpoint(s.world, { ...s.mission, version: 99 }, cp)).toThrow(/Incompatible/);
    for (const change of [(q: typeof cp) => { q.player.ledger.earned = 100000; }, (q: typeof cp) => { q.player.ledger.consumed = -1; }, (q: typeof cp) => { q.stopIndex = 1; q.cargoLoaded = false; }]) {
      const bad = JSON.parse(JSON.stringify(cp)); change(bad);
      expect(() => Session.fromCheckpoint(s.world, s.mission, bad)).toThrow(/Incompatible/);
    }
  });
  it('an airborne restore returns to a reached ground anchor without granting charge', () => {
    const s = started();
    for (let i = 0; i < 60; i++) s.step(NO_INPUT);
    s.step({ ...NO_INPUT, flyPress: true });
    for (let i = 0; i < 25; i++) s.step(NO_INPUT);
    expect(s.player.isAirborne).toBe(true);
    const r = Session.fromCheckpoint(s.world, s.mission, JSON.parse(JSON.stringify(s.checkpoint())));
    expect(r.player.isAirborne).toBe(false);
    expect(r.player.ledger.snapshot()).toEqual(s.player.ledger.snapshot());
  });
});

describe('Directed routing remains valid across pickup and delivery', () => {
  it('a missed delivery turn reroutes through real connected roads', () => {
    const s = started({ stops: ['d_side'], deadlineSeconds: 600 }); collect(s);
    for (let i = 0; i < 6000 && s.player.z > -1100; i++) s.step({ ...NO_INPUT, accel: true });
    expect(s.route.at(-1)).toBe('B:f');
    for (let i = 0; i < s.route.length - 1; i++) expect(s.world.nav.edges.get(s.route[i])!.next).toContain(s.route[i + 1]);
  });
  it('return routes respect the one-way side road', () => {
    const s = started();
    expect(s.world.nav.route('D:b', ['A1:b'])!.path).not.toContain('C:b');
  });
});
