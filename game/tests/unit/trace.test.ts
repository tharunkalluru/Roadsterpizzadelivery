/** Dev tool: TRACE_MISSION=<id> npx vitest run tests/unit/trace.test.ts --silent=false — logs the reference agent's run. */
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { WorldPhysics } from '../../src/world/collision';
import { buildLevelCatalog } from '../../src/missions/levels';
import { Session } from '../../src/missions/session';
import { Autopilot } from '../../src/debug/autopilot';

const id = process.env.TRACE_MISSION;
it.skipIf(!id)('trace', () => {
  (globalThis as any).__TRACE = true;
  const base = 'public/world/hyd-metro/v2/';
  const m0 = JSON.parse(readFileSync(base + 'manifest.json', 'utf8'));
  const core = JSON.parse(readFileSync(base + m0.core.file, 'utf8'));
  const w = new WorldPhysics(core, m0.chunkSizeM); w.setKnownChunks(m0.chunks.map((c: any) => c.id));
  for (const c of m0.chunks) w.addChunk(JSON.parse(readFileSync(base + c.file, 'utf8')));
  const m = buildLevelCatalog(core, w).find((q) => q.id === id)!;
  const s = new Session(w, m, { runId: 'trace', seed: m.seed }); s.start();
  const ap = new Autopilot(s); let t = 0, lastE = '';
  const every = +(process.env.TRACE_EVERY ?? 300);
  console.log('mission', m.id, m.routeLengthM, m.deadlineSeconds, 'stops', m.stops);
  while (s.phase !== 'ENDED' && t++ < 60 * (m.deadlineSeconds + 10)) {
    const p: any = s.player;
    if (s.phase === 'RECOVERING') { console.log('RECOVER', (t / 60).toFixed(1), p.x.toFixed(0), p.z.toFixed(0), p.surface?.roadId); s.completeRecovery(); continue; }
    const i = ap.input(); s.step(i);
    const ce = s.route[s.routeIdx];
    if (ce !== lastE) { lastE = ce; console.log(' edge', (t / 60).toFixed(1), s.route.slice(s.routeIdx, s.routeIdx + 3).join('>'), p.x.toFixed(0), p.z.toFixed(0), p.y.toFixed(1), p.surface?.roadId, s.routeRemainingM().toFixed(0)); }
    if (t % every === 0) console.log((t / 60).toFixed(1), p.x.toFixed(1), p.z.toFixed(1), p.y.toFixed(1), p.speed.toFixed(1), p.surface?.roadId, i.steer.toFixed(2), i.accel, i.brake, s.routeRemainingM().toFixed(0), s.encounters.length, ap.why);
    if (t % every === 0 && Math.abs(p.speed) < 0.3) for (const a of s.traffic.actors as any[]) { const d = Math.hypot(a.x - p.x, a.z - p.z); if (d < 15 && a.speed < 0.1) { const nav = (s.world as any).nav; const e = nav.edges.get(a.edge); console.log('      at', JSON.stringify(a.dbg), a.along.toFixed(1), '/', e.lengthM.toFixed(1), 'next', e.next.join(' '), 'q', a.holdUntil, a.waitTicks); for (const b of s.traffic.actors as any[]) if (b !== a && (b.edge === a.edge && b.along > a.along || e.next.includes(b.edge))) console.log('        lead?', b.id, b.kind, b.edge, b.along.toFixed(1), b.speed.toFixed(1), b.state, b.lateral.toFixed(1), a.lateral.toFixed(1)); }
        if (d < 15) console.log('    actor', a.id ?? '', a.kind ?? '', d.toFixed(1), (a.heading - p.heading).toFixed(2), a.speed.toFixed(1), a.state ?? a.mode ?? '', a.edge ?? a.edgeId ?? a.roadId ?? ''); }
    if (t % every === 0 && ap.why.startsWith('ped')) { const q: any = s.traffic.peds.find((z: any) => 'ped ' + z.id === ap.why); const hit = s.world.roads.surface(q.x, q.z, { margin: 0.3 }); console.log('    blocker', q.state, q.edge, q.side, q.along.toFixed(1), q.crossT.toFixed(2), 'surface', hit?.roadId, hit?.dist.toFixed(1), hit?.halfWidth); }
    if (t % every === 0 && Math.abs(p.speed) < 0.3) for (const a of s.traffic.peds as any[]) { const d = Math.hypot(a.x - p.x, a.z - p.z); if (d < 10) { const fx = -Math.sin(p.heading), fz = -Math.cos(p.heading); const dx = a.x - p.x, dz = a.z - p.z; console.log('    ped', d.toFixed(1), a.state, a.edge, 'ahead', (dx * fx + dz * fz).toFixed(1), 'side', (dx * -fz + dz * fx).toFixed(1), 'crossT', a.crossT.toFixed(2), a.stateTicks); } }
  }
  console.log(JSON.stringify(s.results().outcome));
}, 600000);
