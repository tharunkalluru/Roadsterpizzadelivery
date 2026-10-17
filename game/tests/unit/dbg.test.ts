import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { WorldPhysics } from '../../src/world/collision';
import { buildCatalog } from '../../src/missions/catalog';
import { Session } from '../../src/missions/session';
import { Autopilot } from '../../src/debug/autopilot';
it('dbg', () => {
  const base = 'public/world/hyd-uppal-tarnaka/v1/';
  const m = JSON.parse(readFileSync(base + 'manifest.json', 'utf8'));
  const core = JSON.parse(readFileSync(base + m.core.file, 'utf8'));
  const w = new WorldPhysics(core, m.chunkSizeM); w.setKnownChunks(m.chunks.map((c: any) => c.id));
  for (const c of m.chunks) w.addChunk(JSON.parse(readFileSync(base + c.file, 'utf8')));
  const ms = buildCatalog(core, w);
  for (const mm of ms.slice(1, 4)) {
    const s = new Session(w, mm, { seed: mm.seed }); s.start(); const ap = new Autopilot(s);
    const kinds: Record<string, number> = {};
    for (let k = 0; k < 4000 && s.phase !== 'ENDED'; k++) {
      if (s.phase === 'RECOVERING') { s.completeRecovery(); continue; }
      s.step(ap.input());
      for (const e of s.player.events) if (e.type === 'contact') { const r = s.player.surface; kinds[e.kind] = (kinds[e.kind] ?? 0) + 1; if (kinds[e.kind] < 4) console.log(mm.id, k, e.kind, e.id, e.severity, e.closing.toFixed(1), 'lat', r?.lateral.toFixed(1), 'hw', r?.halfWidth, r?.road.highway, r?.dist.toFixed(1)); }
    }
    console.log(mm.id, kinds, s.outcome);
  }
});
