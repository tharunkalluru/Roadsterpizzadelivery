import { describe, it, expect } from 'vitest';
import { makeFixtureWorld, makeFixtureCore } from './fixture';
import { FlightLedger } from '../../src/player/flightLedger';
import { Player, NO_INPUT, predictAscentTicks, predictTicksToTouchdown, type TickInput, type DynamicWorld } from '../../src/player/player';
import { FLIGHT, flightTicksFor } from '../../src/config/gameplay';
import { FixedClock } from '../../src/core/clock';
import { WorldPhysics } from '../../src/world/collision';
import { TrafficSystem } from '../../src/traffic/traffic';
import { Rng } from '../../src/core/rng';

const AIR = new Set(['TAKEOFF', 'FLYING', 'DESCENDING']);
const inp = (o: Partial<TickInput> = {}): TickInput => ({ ...NO_INPUT, ...o });

function newPlayer(seconds = 25, consumed = 0, world = makeFixtureWorld()) {
  const p = new Player(world, new FlightLedger(seconds, consumed));
  p.place(-3, -50, 0, 'A1');
  return p;
}
function drive(p: Player, n: number, i: Partial<TickInput> = {}) {
  for (let k = 0; k < n; k++) p.step(inp(i));
}
/** steps with metering accounting: counts ticks during which the state was airborne at metering time */
function stepCount(p: Player, i: Partial<TickInput>): boolean {
  const before = p.ledger.consumedTicks;
  p.step(inp(i));
  return p.ledger.consumedTicks - before === 1;
}

describe('F03 allocations and conservation', () => {
  it('20/25/30 s equal 1200/1500/1800 ticks and reject others', () => {
    expect(flightTicksFor(20)).toBe(1200);
    expect(flightTicksFor(25)).toBe(1500);
    expect(flightTicksFor(30)).toBe(1800);
    expect(() => flightTicksFor(4)).toThrow();
    expect(new FlightLedger(25).remainingTicks).toBe(1500);
  });
  it('ledger never exceeds allocation', () => {
    const l = new FlightLedger(20);
    for (let i = 0; i < 2000; i++) l.spendTick();
    expect(l.consumedTicks).toBe(1200);
    expect(l.remainingTicks).toBe(0);
    expect(l.spendTick()).toBe(false);
  });
});

describe('F02/F10 continuous flight limited only by shared budget and affordable landing', () => {
  it('one continuous flight lasts far longer than 4 s and auto-descends while affordable', () => {
    const p = newPlayer();
    drive(p, 60); // reach speed
    p.step(inp({ flyPress: true }));
    expect(p.move).toBe('TAKEOFF');
    let airborneTicks = 1, autoAt = -1, remainingAtAuto = -1, reserveAtAuto = -1;
    for (let k = 0; k < 2000 && p.move !== 'GROUNDED'; k++) {
      const ev = p.step(inp());
      if (AIR.has(p.move) || p.move === 'LANDING_CONFIRM') airborneTicks++;
      for (const e of ev) if (e.type === 'descent' && e.auto) { autoAt = k; remainingAtAuto = p.ledger.remainingTicks; reserveAtAuto = predictTicksToTouchdown(p.altitude, p.vy); }
      expect(ev.some((e) => e.type === 'crash')).toBe(false);
    }
    expect(p.move).toBe('GROUNDED');
    expect(autoAt).toBeGreaterThan(0);
    expect(remainingAtAuto).toBeGreaterThanOrEqual(reserveAtAuto); // reserve affordable from same balance
    expect(p.ledger.consumedTicks).toBeGreaterThan(4 * 60 * 4); // > 16 s in one flight
    expect(p.ledger.consumedTicks).toBeLessThanOrEqual(1500);
    expect(p.ledger.launches).toBe(1);
  });
});

describe('F04/F11 split flights share one balance; early landing keeps remainder', () => {
  it('two flights: consumed equals metered ticks exactly, no activation tax', () => {
    const p = newPlayer();
    drive(p, 60);
    let metered = 0;
    if (stepCount(p, { flyPress: true })) metered++;
    for (let k = 0; k < 180; k++) if (stepCount(p, {})) metered++;
    // a held press is not a fresh press: nothing changes
    if (stepCount(p, {})) metered++;
    expect(p.move).toBe('FLYING');
    if (stepCount(p, { flyPress: true })) metered++; // fresh press → Land
    expect(p.move).toBe('DESCENDING');
    // repeated presses during descent do not reset/alter the ledger
    for (let k = 0; k < 400 && p.move !== 'GROUNDED'; k++) if (stepCount(p, { flyPress: k % 7 === 0 })) metered++;
    expect(p.move).toBe('GROUNDED');
    const afterFirst = p.ledger.consumedTicks;
    expect(afterFirst).toBe(metered);
    expect(p.ledger.remainingTicks).toBe(1500 - afterFirst);
    drive(p, 30); // ground: no refill
    expect(p.ledger.consumedTicks).toBe(afterFirst);
    if (stepCount(p, { flyPress: true })) metered++;
    expect(p.ledger.launches).toBe(2);
    for (let k = 0; k < 120; k++) if (stepCount(p, {})) metered++;
    if (stepCount(p, { flyPress: true })) metered++;
    for (let k = 0; k < 400 && p.move !== 'GROUNDED'; k++) if (stepCount(p, {})) metered++;
    expect(p.ledger.consumedTicks).toBe(metered);
    expect(p.ledger.remainingTicks).toBe(1500 - metered);
    expect(p.ledger.remainingTicks).toBeGreaterThan(0);
  });
});

describe('F05 hover is metered one-for-one', () => {
  it('five seconds of hover consumes exactly 300 ticks', () => {
    const p = newPlayer();
    drive(p, 60);
    p.step(inp({ flyPress: true }));
    for (let k = 0; k < 400 && (p.speed > 0 || p.move !== 'FLYING'); k++) p.step(inp({ brake: true }));
    expect(p.move).toBe('FLYING');
    expect(p.speed).toBe(0);
    const c0 = p.ledger.consumedTicks;
    for (let k = 0; k < 300; k++) p.step(inp({ brake: true, steer: k % 2 ? 0.5 : -0.5 }));
    expect(p.ledger.consumedTicks - c0).toBe(300);
  });
});

describe('F06 denied launch and post-activation abort', () => {
  it('low clearance under a bridge denies with a reason, spends nothing, never queues', () => {
    const p = newPlayer();
    p.place(-3, -1500, 0, 'A2');
    drive(p, 20);
    const ev = p.step(inp({ flyPress: true }));
    expect(ev).toContainEqual({ type: 'launch_denied', reason: 'Low clearance' });
    expect(p.ledger.consumedTicks).toBe(0);
    // drive out from under the bridge; the old press must not fire later
    for (let k = 0; k < 300; k++) p.step(inp());
    expect(p.move).toBe('GROUNDED');
    expect(p.ledger.launches).toBe(0);
  });
  it('a new obstruction after activation aborts takeoff, preserving consumed ticks', () => {
    const world = makeFixtureWorld();
    const p = newPlayer(25, 0, world);
    p.place(-3, -900, 0, 'A1');
    drive(p, 20);
    p.step(inp({ flyPress: true }));
    expect(p.move).toBe('TAKEOFF');
    const spent = p.ledger.consumedTicks;
    expect(spent).toBe(1);
    // inject an obstruction directly above (e.g. a structure the forecast could not know)
    const orig = world.overheadAt.bind(world);
    world.overheadAt = (x, z, fromY) => ({ bottom: fromY + 3, id: 'injected', kind: 'deck' });
    const ev = p.step(inp());
    world.overheadAt = orig;
    expect(ev.some((e) => e.type === 'takeoff_abort')).toBe(true);
    expect(p.ledger.consumedTicks).toBe(spent + 1); // that tick was metered; nothing refunded
    expect(ev.some((e) => e.type === 'crash')).toBe(false); // no extra crash penalty
    drive(p, 30);
    expect(p.move).toBe('GROUNDED');
    expect(p.ledger.consumedTicks).toBe(spent + 1);
  });
});

describe('F07 partial fuel launch eligibility', () => {
  it('allows a launch exactly when ascent + landing + margin is affordable', () => {
    const need = predictAscentTicks() + predictTicksToTouchdown(FLIGHT.minFlightAltitude, FLIGHT.maxClimbRate) + FLIGHT.uncertaintyMarginTicks;
    const poor = newPlayer(25, 1500 - (need - 1));
    drive(poor, 30);
    expect(poor.evaluateLaunch()).toEqual({ ok: false, reason: 'Not enough flight time to launch here' });
    const ok = newPlayer(25, 1500 - need);
    drive(ok, 30);
    const r = ok.evaluateLaunch();
    expect(r.ok).toBe(true);
    ok.step(inp({ flyPress: true }));
    for (let k = 0; k < 600 && ok.move !== 'GROUNDED'; k++) {
      const ev = ok.step(inp());
      expect(ev.some((e) => e.type === 'crash' || e.type === 'exhausted_unsupported')).toBe(false);
    }
    expect(ok.move).toBe('GROUNDED');
    expect(ok.ledger.remainingTicks).toBeGreaterThanOrEqual(0);
  });
  it('an empty budget explains "Flight power used"', () => {
    const p = newPlayer(25, 1500);
    drive(p, 20);
    expect(p.evaluateLaunch()).toEqual({ ok: false, reason: 'Flight power used' });
  });
});

describe('F08 whole-car clearance catches what a centre ray misses', () => {
  it('thin overhead structure beside the centreline denies launch', () => {
    const core = makeFixtureCore();
    // thin gantry 0.8 m from car centre (car at x=-3, half width 1.0)
    core.roads.push({ ...core.roads[5], id: 'G', surfaceId: 's_1_G', widthM: 0.1, points: [[-2.0, -850], [-2.0, -852]], pointElevM: [5, 5], elevationM: 5, fromNode: 'n5', toNode: 'n6' });
    const world = new WorldPhysics(core);
    const centreOnly = world.overheadAt(-3, -851, 0);
    expect(centreOnly.bottom).toBe(Infinity); // a centre ray would miss it
    const p = new Player(world, new FlightLedger(25));
    p.place(-3, -851, 0, 'A1');
    drive(p, 20, { brake: true });
    expect(p.evaluateLaunch()).toEqual({ ok: false, reason: 'Low clearance' });
  });
  it('a thin structure is hit in flight at maximum speed (no tunnelling)', () => {
    const core = makeFixtureCore();
    core.roads.push({ ...core.roads[5], id: 'G', surfaceId: 's_1_G', widthM: 0.2, points: [[-12, -1200], [12, -1200]], pointElevM: [7.5, 7.5], elevationM: 7.5, fromNode: 'n5', toNode: 'n6' });
    const world = new WorldPhysics(core);
    const p = new Player(world, new FlightLedger(30));
    p.place(-3, -1100, 0, 'A2');
    drive(p, 10);
    p.step(inp({ flyPress: true }));
    let crashed = false;
    for (let k = 0; k < 900 && !crashed; k++) {
      const ev = p.step(inp({ boost: true }));
      crashed = ev.some((e) => e.type === 'crash' || e.type === 'contact');
      if (p.z < -1210) break;
    }
    // either the altitude assist ducked below the 6.3 m underside, or the volume was hit — never passed through
    const passedThrough = p.z < -1205 && p.y > 6.3 - FLIGHT.carHeight && p.y < 7.5;
    expect(passedThrough).toBe(false);
  });
});

describe('F09 surface identity at overlapping coordinates', () => {
  it('lower road vs overpass vs roof', () => {
    const w = makeFixtureWorld();
    const low = w.roads.surface(0, -1500, { maxY: 0.3 });
    expect(low?.roadId).toBe('A2');
    expect(low?.level).toBe(0);
    const high = w.roads.surface(0, -1500, { maxY: 6.8, preferLevel: 1 });
    expect(high?.roadId).toBe('E');
    expect(high?.elevation).toBeCloseTo(6.5);
    expect(w.overheadAt(0, -1500, 0).kind).toBe('bridge');
    expect(w.overheadAt(0, -1500, 6.5).bottom).toBe(Infinity);
  });
  it('vehicle roof is not ground: descending onto a vehicle is a crash, not a landing', () => {
    const w = makeFixtureWorld();
    const traffic = new TrafficSystem(w, new Rng(1));
    traffic.actors.push({ id: 1, kind: 'bus', edge: 'A1:f', along: 400, speed: 0, lateral: -3, laneLateral: -3, vmax: 0, length: 11.5, width: 2.6, height: 3.2, state: 'drive', stateTicks: 0, waitTicks: 0, braking: true, x: -3, z: -400, y: 0, heading: 0, px: -3, pz: -400, py: 0, pheading: 0 });
    const p = new Player(w, new FlightLedger(25), traffic);
    p.place(-3, -400, 0, 'A1');
    p.move = 'DESCENDING'; p.y = 5; p.vy = -3.2;
    let crash = false;
    for (let k = 0; k < 200 && !crash; k++) crash = p.step(inp({ brake: true })).some((e) => e.type === 'crash');
    expect(crash).toBe(true);
  });
});

describe('F12 ground driving never refills', () => {
  it('30 s of driving leaves remaining unchanged', () => {
    const p = newPlayer(25, 700);
    drive(p, 1800);
    expect(p.ledger.remainingTicks).toBe(800);
  });
});

describe('F13 moving obstruction updates forecast without bonus fuel', () => {
  it('forecast becomes uncertain/blocked; ledger unaffected', () => {
    let occ = 0;
    const dyn: DynamicWorld = { contacts: (_x, _z, _y, _h, _r, o) => o, occupancy: () => occ };
    const p = new Player(makeFixtureWorld(), new FlightLedger(25), dyn);
    p.place(-3, -50, 0, 'A1');
    drive(p, 60);
    p.step(inp({ flyPress: true }));
    drive(p, 120);
    expect(p.forecast.state).toBe('clear');
    occ = 0.5; p.step(inp());
    expect(p.forecast.state).toBe('uncertain');
    occ = 1; const c = p.ledger.consumedTicks; p.step(inp());
    expect(p.forecast.state).toBe('blocked');
    expect(p.ledger.consumedTicks).toBe(c + 1);
    const ev = p.step(inp({ flyPress: true }));
    expect(ev.some((e) => e.type === 'land_denied')).toBe(true); // explicit, current plan retained
    expect(p.move).toBe('FLYING');
  });
});

describe('F14 invalid landing surfaces rejected, connected branches allowed', () => {
  it('touching down off the carriageway invokes recovery', () => {
    const p = newPlayer();
    p.place(-3, -300, 0, 'A1');
    p.move = 'DESCENDING'; p.x = -8.5; p.y = 0.4; p.vy = -2; p.speed = 0;
    let crash = '';
    for (let k = 0; k < 30 && !crash; k++) for (const e of p.step(inp())) if (e.type === 'crash') crash = e.reason;
    expect(crash).toBe('Invalid landing surface');
  });
  it('flying onto a connected side road and landing there is valid', () => {
    const p = newPlayer();
    p.place(-3, -820, 0, 'A1');
    drive(p, 240);
    p.step(inp({ flyPress: true }));
    // turn right toward road B (east) near the junction
    for (let k = 0; k < 1800 && p.move !== 'GROUNDED'; k++) {
      const onB = p.x > 30;
      const ev = p.step(inp({ steer: !onB && p.z < -990 && p.heading > -Math.PI / 2 ? 1 : 0, flyPress: onB && p.move === 'FLYING' }));
      expect(ev.some((e) => e.type === 'crash')).toBe(false);
    }
    expect(p.move).toBe('GROUNDED');
    expect(p.roadId).toBe('B');
  });
});

describe('F15/F16 final-tick touchdown and exhaustion', () => {
  function descentTicks(): number {
    const p = newPlayer();
    p.place(-3, -300, 0, 'A1');
    p.move = 'DESCENDING'; p.y = 3; p.vy = 0; p.speed = 5;
    let n = 0;
    while (p.move === 'DESCENDING' && n < 1000) { p.step(inp()); n++; }
    return n;
  }
  it('valid touchdown on the final resource tick completes confirmation without fuel', () => {
    const n = descentTicks();
    const p = newPlayer(25, 1500 - n);
    p.place(-3, -300, 0, 'A1');
    p.move = 'DESCENDING'; p.y = 3; p.vy = 0; p.speed = 5;
    const evs: string[] = [];
    for (let k = 0; k < n + 40; k++) for (const e of p.step(inp())) evs.push(e.type);
    expect(p.ledger.remainingTicks).toBe(0);
    expect(evs).toContain('touchdown');
    expect(evs).toContain('landed');
    expect(evs).not.toContain('crash');
    expect(p.move).toBe('GROUNDED');
  });
  it('zero resource while unsupported fails without free glide', () => {
    const n = descentTicks();
    const p = newPlayer(25, 1500 - (n - 5));
    p.place(-3, -300, 0, 'A1');
    p.move = 'DESCENDING'; p.y = 3; p.vy = 0; p.speed = 5;
    const evs: string[] = [];
    for (let k = 0; k < n + 5; k++) for (const e of p.step(inp())) evs.push(e.type);
    expect(evs).toContain('exhausted_unsupported');
    expect(evs).toContain('crash');
    expect(p.ledger.consumedTicks).toBe(1500);
  });
  it('exhaustion while still supported in TAKEOFF terminates via abort', () => {
    const p = newPlayer(25, 1500);
    drive(p, 10);
    p.move = 'TAKEOFF'; // forced state for the boundary (launch would be denied normally)
    const ev = p.step(inp());
    expect(ev.some((e) => e.type === 'takeoff_abort')).toBe(true);
    expect(p.move).not.toBe('TAKEOFF');
  });
});

describe('F17 losing support during confirmation', () => {
  it('resumes metering in the same transaction; no refund or duplicate', () => {
    const p = newPlayer();
    drive(p, 60);
    p.step(inp({ flyPress: true }));
    drive(p, 90);
    p.step(inp({ flyPress: true }));
    for (let k = 0; k < 400 && p.move !== 'LANDING_CONFIRM'; k++) p.step(inp());
    expect(p.move).toBe('LANDING_CONFIRM');
    const tx = p.ledger.transaction;
    const c = p.ledger.consumedTicks;
    p.step(inp()); // supported confirm tick: free
    expect(p.ledger.consumedTicks).toBe(c);
    p.y += 0.5; // bump loses support
    const ev = p.step(inp());
    expect(ev.some((e) => e.type === 'support_lost')).toBe(true);
    expect(p.ledger.consumedTicks).toBe(c + 1);
    expect(p.ledger.transaction).toBe(tx);
    for (let k = 0; k < 200 && p.move !== 'GROUNDED'; k++) p.step(inp());
    expect(p.move).toBe('GROUNDED');
    expect(p.ledger.consumedTicks).toBeGreaterThan(c);
  });
});

describe('F01 frame-rate independence', () => {
  it('30/60/120 fps produce identical simulation and fuel use', () => {
    const results: { x: number; z: number; consumed: number }[] = [];
    for (const fps of [30, 60, 120]) {
      const p = newPlayer();
      const clock = new FixedClock(16);
      let tick = 0;
      for (let f = 0; f < fps * 12; f++) {
        const { ticks } = clock.advance(1 / fps);
        for (let t = 0; t < ticks; t++) {
          // input as a function of simulation time only
          const sec = tick / 60;
          p.step(inp({ steer: sec > 5 && sec < 6 ? 0.3 : 0, flyPress: tick === 120 || tick === 480, brake: sec > 8 && sec < 8.5 }));
          tick++;
        }
      }
      results.push({ x: p.x, z: p.z, consumed: p.ledger.consumedTicks });
    }
    expect(results[1].consumed).toBe(results[0].consumed);
    expect(results[2].consumed).toBe(results[0].consumed);
    expect(results[1].x).toBeCloseTo(results[0].x, 6);
    expect(results[2].z).toBeCloseTo(results[0].z, 6);
  });
  it('a severe stall requests a technical pause instead of a giant step', () => {
    const c = new FixedClock();
    expect(c.advance(3.0)).toEqual({ ticks: 0, alpha: 0, stalled: true });
  });
});
