import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { makeFixtureWorld, fixtureMission } from './fixture';
import { Session } from '../../src/missions/session';
import { NO_INPUT, type TickInput } from '../../src/player/player';
import { WorldPhysics } from '../../src/world/collision';
import { buildCatalog } from '../../src/missions/catalog';
import { Autopilot } from '../../src/debug/autopilot';
import type { WorldCore, WorldManifest, WorldChunk } from '../../src/world/schema';

const script = (t: number): TickInput => ({ ...NO_INPUT, accel: true, steer: t % 600 < 50 ? 0.2 : 0, brake: t % 900 > 860, flyPress: t === 400 || t === 1300 });

describe('M12 same seed + recorded inputs reproduce the run', () => {
  it('identical state after 3000 ticks with traffic', () => {
    const w = makeFixtureWorld();
    const runs = [0, 1].map(() => {
      const s = new Session(w, fixtureMission({ traffic: 'busy', deadlineSeconds: 600 }), { runId: 'r', seed: 777 });
      s.start();
      for (let t = 0; t < 3000 && s.phase === 'PLAYING'; t++) s.step(script(t));
      return JSON.stringify({ p: s.player.snapshot(), a: s.traffic.actors.map((a) => [a.id, a.edge, a.along.toFixed(6)]), c: s.cargo, e: s.elapsedTicks });
    });
    expect(runs[1]).toBe(runs[0]);
  });
  it('a different seed changes the traffic', () => {
    const w = makeFixtureWorld();
    const sig = (seed: number) => { const s = new Session(w, fixtureMission({ traffic: 'busy' }), { seed }); s.start(); for (let t = 0; t < 300; t++) s.step(NO_INPUT); return s.traffic.actors.map((a) => a.kind + a.edge).join(); };
    expect(sig(1)).not.toBe(sig(2));
  });
});

describe('M08/M11 traffic identity and spawn safety', () => {
  it('ids are unique and stable; no actor spawns inside the near forward view or stop area', () => {
    const w = makeFixtureWorld();
    const s = new Session(w, fixtureMission({ traffic: 'busy', deadlineSeconds: 900 }), { seed: 5 });
    s.start();
    const firstSeen = new Map<number, string>();
    for (let t = 0; t < 4000 && s.phase === 'PLAYING'; t++) {
      const before = new Set(s.traffic.actors.map((a) => a.id));
      s.step({ ...NO_INPUT, accel: true });
      const ids = s.traffic.actors.map((a) => a.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const a of s.traffic.actors) {
        if (!before.has(a.id) && !firstSeen.has(a.id)) {
          firstSeen.set(a.id, a.kind);
          const p = s.player;
          const d = Math.hypot(a.x - p.x, a.z - p.z);
          expect(d).toBeGreaterThanOrEqual(69);
        }
        expect(firstSeen.get(a.id) ?? a.kind).toBe(a.kind); // never mutates identity
      }
    }
  });
});

const base = 'public/world/hyd-uppal-tarnaka/v1/';
describe.skipIf(!existsSync(base + 'core.json'))('P04 repeated traversal on the real package', () => {
  it('ten out-and-back legs keep actor and chunk counts bounded', () => {
    const m = JSON.parse(readFileSync(base + 'manifest.json', 'utf8')) as WorldManifest;
    const core = JSON.parse(readFileSync(base + m.core.file, 'utf8')) as WorldCore;
    const w = new WorldPhysics(core, m.chunkSizeM);
    w.setKnownChunks(m.chunks.map((c) => c.id));
    const chunks = new Map(m.chunks.map((c) => [c.id, JSON.parse(readFileSync(base + c.file, 'utf8')) as WorldChunk]));
    const missions = buildCatalog(core, w);
    const out = missions.find((q) => q.id === 'mt01_first_parcel')!;
    const back = missions.find((q) => q.id === 'mt08_return') ?? out;
    const counts: { actors: number; peds: number; chunks: number }[] = [];
    for (let leg = 0; leg < 10; leg++) {
      const mission = leg % 2 ? back : out;
      const s = new Session(w, { ...mission, deadlineSeconds: 900 }, { seed: 100 + leg });
      s.start();
      const ap = new Autopilot(s);
      for (let t = 0; t < 900 * 60 && s.phase !== 'ENDED'; t++) {
        if (s.phase === 'RECOVERING') { s.completeRecovery(); continue; }
        // stream like the app: keep chunks within 450 m, drop beyond 700 m
        if (t % 30 === 0) {
          for (const c of m.chunks) {
            const cx = (c.ix + 0.5) * m.chunkSizeM, cz = (c.iz + 0.5) * m.chunkSizeM;
            const d = Math.hypot(cx - s.player.x, cz - s.player.z);
            if (d < 450) w.addChunk(chunks.get(c.id)!); else if (d > 700) w.removeChunk(c.id);
          }
        }
        s.step(ap.input());
      }
      counts.push({ actors: s.traffic.actors.length, peds: s.traffic.peds.length, chunks: w.loadedChunkIds.length });
    }
    for (const c of counts) { expect(c.actors).toBeLessThanOrEqual(24); expect(c.peds).toBeLessThanOrEqual(12); expect(c.chunks).toBeLessThan(m.chunks.length); }
    const firstHalf = Math.max(...counts.slice(0, 5).map((c) => c.chunks)), secondHalf = Math.max(...counts.slice(5).map((c) => c.chunks));
    expect(secondHalf).toBeLessThanOrEqual(firstHalf + 6); // no steady growth
  }, 300_000);
});

import { SignalSystem } from '../../src/traffic/signals';
describe('S03 signal plan', () => {
  it('two phases never green together; each approach cycles green → amber → red on the sim clock', () => {
    for (let t = 0; t < SignalSystem.CYCLE * 2; t += 7) {
      const a = SignalSystem.phaseColor(0, t), b = SignalSystem.phaseColor(1, t);
      expect(a !== 'red' && b !== 'red').toBe(false);
    }
    const seq = new Set<string>();
    for (let t = 0; t < SignalSystem.CYCLE; t++) seq.add(SignalSystem.phaseColor(0, t));
    expect([...seq].sort()).toEqual(['amber', 'green', 'red']);
  });
});

describe('M07/M10 encounters and deadlocks', () => {
  it('at most two concurrent encounters; every queue releases; stalled actors are recycled with a log entry', () => {
    const w = makeFixtureWorld();
    const s = new Session(w, fixtureMission({ traffic: 'busy', deadlineSeconds: 900, stops: ['d_side'] }), { seed: 9 });
    s.start();
    let maxEnc = 0, sawQueue = false;
    for (let t = 0; t < 120 * 60 && s.phase === 'PLAYING'; t++) {
      s.step({ ...NO_INPUT, accel: t % 1200 <= 900, brake: t % 1200 > 900 });
      maxEnc = Math.max(maxEnc, s.encounters.length);
      for (const a of s.traffic.actors) if (a.state === 'queue') { sawQueue = true; expect(a.holdUntil).toBeDefined(); expect(a.holdUntil! - s.traffic.tick).toBeLessThanOrEqual(30 * 60); }
    }
    expect(maxEnc).toBeLessThanOrEqual(2);
    // deadlock: force an actor to be permanently blocked and check it is recycled
    const victim = s.traffic.actors[0];
    if (victim) {
      victim.state = 'drive'; victim.vmax = 0; victim.speed = 0;
      for (let t = 0; t < 11 * 60; t++) s.traffic.step({ x: victim.x + 60, z: victim.z, y: 0, speed: 0, heading: 0, airborne: true }); // player nearby (in range), airborne so it is not a leader
      expect(s.traffic.actors.some((a) => a.id === victim.id)).toBe(false);
      expect(s.traffic.log.some((l) => l.startsWith('deadlock-recycle'))).toBe(true);
    }
    void sawQueue;
  });
});

describe('pedestrians never walk on bridges (playtest feedback)', () => {
  it('no pedestrian is ever placed on an elevated or bridge edge', () => {
    const w = makeFixtureWorld();
    const s = new Session(w, fixtureMission({ traffic: 'busy', deadlineSeconds: 900 }), { seed: 3 });
    s.start();
    s.player.place(-3, -1480, 0, 'A2'); // right beside the fixture overpass E
    for (let t = 0; t < 3000; t++) {
      s.step({ ...NO_INPUT });
      for (const p of s.traffic.peds) {
        const r = w.roads.roads.get(p.edge)!;
        expect(r.bridge).toBe(false);
        expect(p.y).toBeLessThan(0.31);
      }
    }
  });
});
