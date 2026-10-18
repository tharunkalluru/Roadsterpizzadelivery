/**
 * v2 whole-network calibration: every level mission is driven on the ground by the reference
 * agent through real physics with mission traffic (MASTER §15). Writes
 * qa/artifacts/calibration/deadlines-v2.json. Long levels (4–5) only run with CALIBRATE_ALL=1.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { WorldPhysics } from '../../src/world/collision';
import { buildLevelCatalog } from '../../src/missions/levels';
import { Session } from '../../src/missions/session';
import { Autopilot } from '../../src/debug/autopilot';
import type { WorldCore, WorldManifest, WorldChunk } from '../../src/world/schema';

const base = 'public/world/hyd-metro/v2/';
const have = existsSync(base + 'manifest.json');
const all = process.env.CALIBRATE_ALL === '1';

describe.skipIf(!have)('v2 network missions (reference agent, ground only)', () => {
  const m = have ? (JSON.parse(readFileSync(base + 'manifest.json', 'utf8')) as WorldManifest) : null;
  const core = have ? (JSON.parse(readFileSync(base + m!.core.file, 'utf8')) as WorldCore) : null;
  const w = have ? new WorldPhysics(core!, m!.chunkSizeM) : null;
  if (w) { w.setKnownChunks(m!.chunks.map((c) => c.id)); for (const c of m!.chunks) w.addChunk(JSON.parse(readFileSync(base + c.file, 'utf8')) as WorldChunk); }
  const missions = have ? buildLevelCatalog(core!, w!) : [];
  const report: any[] = [];

  it('builds missions for every level with growing route lengths', () => {
    for (const lv of [1, 2, 3, 4, 5]) expect(missions.filter((q) => q.level === lv).length, `level ${lv}`).toBeGreaterThan(0);
    const avg = (lv: number) => { const ms = missions.filter((q) => q.level === lv); return ms.reduce((a, q) => a + (q.routeLengthM ?? 0), 0) / ms.length; };
    for (const lv of [2, 3, 5]) expect(avg(lv)).toBeGreaterThan(avg(lv - 1));
  });

  for (const q of missions.filter((x) => all || (x.level ?? 1) <= 2)) {
    it(`${q.id} (L${q.level}) completes on the ground within its deadline`, () => {
      const s = new Session(w!, q, { runId: `cal_${q.id}`, seed: q.seed });
      s.start();
      const ap = new Autopilot(s);
      let guard = 0;
      while (s.phase !== 'ENDED' && guard++ < q.deadlineSeconds * 60 + 600) {
        if (s.phase === 'RECOVERING') { s.completeRecovery(); continue; }
        s.step(ap.input());
      }
      const r = s.results();
      report.push({ id: q.id, level: q.level, from: q.fromArea, to: q.toArea, routeLengthM: q.routeLengthM, deadlineS: q.deadlineSeconds, chargedS: +r.chargedSeconds.toFixed(1), marginPct: +((1 - r.chargedSeconds / q.deadlineSeconds) * 100).toFixed(1), recoveries: r.recoveries, cargo: r.cargo, outcome: r.outcome.reason });
      writeFileSync(`qa/artifacts/calibration/deadlines-v2${all ? '-all' : ''}.json`, JSON.stringify({ method: 'reference agent, real physics, mission traffic seed, no flight', world: m!.worldId + '@v' + m!.version, runs: report }, null, 2));
      expect(r.outcome.success, `${q.id}: ${r.outcome.reason} charged ${r.chargedSeconds.toFixed(1)}s / ${q.deadlineSeconds}s, recoveries ${r.recoveries}`).toBe(true);
    }, 600_000);
  }
});
