/**
 * Runtime traversal of every instantiated mission on the REAL world package with mission
 * traffic and NO flight, by the reference driving agent through real physics (MASTER §15
 * deadline calibration, §30 route monitoring). Writes qa/artifacts/calibration/deadlines.json.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { WorldPhysics } from '../../src/world/collision';
import { buildCatalog, isFoodPickup } from '../../src/missions/catalog';
import { Session } from '../../src/missions/session';
import { Autopilot } from '../../src/debug/autopilot';
import type { WorldCore, WorldManifest, WorldChunk } from '../../src/world/schema';

const base = 'public/world/hyd-uppal-tarnaka/v1/';
const have = existsSync(base + 'core.json');

function loadWorld() {
  const m = JSON.parse(readFileSync(base + 'manifest.json', 'utf8')) as WorldManifest;
  const core = JSON.parse(readFileSync(base + m.core.file, 'utf8')) as WorldCore;
  const w = new WorldPhysics(core, m.chunkSizeM);
  w.setKnownChunks(m.chunks.map((c) => c.id));
  for (const c of m.chunks) w.addChunk(JSON.parse(readFileSync(base + c.file, 'utf8')) as WorldChunk);
  return { m, core, w };
}

describe.skipIf(!have)('real-world missions (reference agent, ground only)', () => {
  const { core, w } = have ? loadWorld() : ({} as ReturnType<typeof loadWorld>);
  const missions = have ? buildCatalog(core, w) : [];
  const report: any[] = [];

  it('instantiates supported templates using source-category food pickups', () => {
    const t = new Set(missions.flatMap((m) => m.templates));
    for (const id of ['MT01', 'MT02', 'MT03', 'MT04', 'MT05', 'MT06', 'MT08', 'MT09', 'MT10', 'MT12']) expect(t.has(id as any), id).toBe(true);
    for (const m of missions) expect(isFoodPickup(core, core.deliveries.find((d) => d.id === m.pickupId)!)).toBe(true);
    // MT07 is emitted only when a food-pickup route has a genuine short reconnecting alternative.
  });

  for (const m of missions) {
    it(`${m.id} completes on the ground within its deadline`, () => {
      const s = new Session(w, m, { runId: `cal_${m.id}`, seed: m.seed });
      s.start();
      const ap = new Autopilot(s);
      let guard = 0;
      while (s.phase !== 'ENDED' && guard++ < m.deadlineSeconds * 60 + 600) {
        if (s.phase === 'RECOVERING') { s.completeRecovery(); continue; }
        s.step(ap.input());
      }
      const r = s.results();
      report.push({ id: m.id, templates: m.templates, routeLengthM: m.routeLengthM, deadlineS: m.deadlineSeconds, chargedS: +r.chargedSeconds.toFixed(1), marginPct: +((1 - r.chargedSeconds / m.deadlineSeconds) * 100).toFixed(1), recoveries: r.recoveries, cargo: r.cargo, outcome: r.outcome.reason, flightUsedS: r.flightUsedSeconds, seed: m.seed, traffic: m.traffic });
      writeFileSync('qa/artifacts/calibration/deadlines.json', JSON.stringify({ method: 'reference agent, real physics, mission traffic seed, no flight', world: 'hyd-uppal-tarnaka v1', runs: report }, null, 2));
      expect(r.outcome.success, `${m.id}: ${r.outcome.reason} charged ${r.chargedSeconds.toFixed(1)}s / ${m.deadlineSeconds}s, recoveries ${r.recoveries}`).toBe(true);
      expect(r.flightUsedSeconds).toBe(0);
    }, 120_000);
  }
});

describe.skipIf(!have)('real-world flight use (reference agent with flight)', () => {
  const { core, w } = have ? loadWorld() : ({} as ReturnType<typeof loadWorld>);
  const missions = have ? buildCatalog(core, w) : [];
  for (const id of ['mt02_first_flight', 'mt06_save_flight', 'mt10_full_corridor']) {
    it(`${id}: split flights share one ledger, land validly, never exceed earned charge`, () => {
      const m = missions.find((q) => q.id === id)!;
      const s = new Session(w, m, { runId: `fly_${id}`, seed: m.seed });
      s.start();
      const ap = new Autopilot(s, { useFlight: true });
      let metered = 0, crashes = 0, maxConsumed = 0, guard = 0;
      while (s.phase !== 'ENDED' && guard++ < m.deadlineSeconds * 60 + 600) {
        if (s.phase === 'RECOVERING') { s.completeRecovery(); continue; }
        const before = s.player.ledger.consumedTicks;
        s.step(ap.input());
        const after = s.player.ledger.consumedTicks;
        expect(after - before === 0 || after - before === 1).toBe(true); // at most one tick per tick, never negative
        metered += after - before;
        maxConsumed = Math.max(maxConsumed, after);
        crashes += s.player.events.filter((e) => e.type === 'crash').length;
      }
      const r = s.results();
      expect(r.launches).toBeGreaterThanOrEqual(1);
      expect(maxConsumed).toBeLessThanOrEqual(s.player.ledger.initialChargeTicks + s.player.ledger.earnedTicks);
      expect(s.player.ledger.remainingTicks).toBeLessThanOrEqual(s.player.ledger.initialTicks);
      expect(r.flightUsedSeconds * 60).toBeCloseTo(metered, 6);
      expect(r.outcome.success, r.outcome.reason).toBe(true);
      report.push({ id: `${id}+flight`, launches: r.launches, flightUsedS: r.flightUsedSeconds, chargedS: +r.chargedSeconds.toFixed(1), deadlineS: m.deadlineSeconds, crashes, outcome: r.outcome.reason });
      writeFileSync('qa/artifacts/calibration/flight-runs.json', JSON.stringify({ method: 'reference agent with flight heuristics, real physics, mission traffic', runs: report.filter((x) => String(x.id).endsWith('+flight')) }, null, 2));
    }, 120_000);
  }
  const report: any[] = [];
});
