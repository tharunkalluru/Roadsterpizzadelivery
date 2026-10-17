import type { WorldCore, DeliveryLocation } from '../world/schema';
import type { WorldPhysics } from '../world/collision';
import { wrapAngle } from '../world/roadIndex';
import { nextManeuver } from '../world/nav';
import type { MissionDef, MissionTemplate } from './types';

export interface RouteInfo { path: string[]; lengthM: number; turns: number }

/** route between two deliveries from the pickup's staging carriageway to the destination approach */
export function routeBetween(world: WorldPhysics, from: DeliveryLocation, to: DeliveryLocation): RouteInfo | null {
  const start = from.approachEdges[0];
  if (!start) return null;
  const e = world.nav.edges.get(start);
  if (!e) return null;
  const s = world.roads.surface(from.entrance[0], from.entrance[1], { preferRoadId: from.roadId, margin: 30 });
  const along = s ? (e.forward ? s.along : e.lengthM - s.along) : 0;
  const r = world.nav.route(start, to.approachEdges, along);
  if (!r) return null;
  let turns = 0;
  for (let i = 0; i < r.path.length - 1; i++) {
    const m = nextManeuver(world.nav, r.path, i, world.nav.edges.get(r.path[i])!.lengthM - 0.5);
    if (m.distanceM < 1 && m.kind !== 'straight' && m.kind !== 'arrive') turns++;
  }
  return { path: r.path, lengthM: r.lengthM, turns };
}

/**
 * Deadline policy (provisional, see DECISIONS.md): reference pace 8.0 m/s average incl. traffic,
 * +2 s per turn, +5 s per stop, then ×1.4 margin for standard play (tutorial ×1.8), rounded up to
 * 5 s. Each instantiated mission is verified by the reference driving agent through real physics
 * on the actual graph with mission traffic and NO flight (tests/unit/missions-real.test.ts).
 */
export function deadlineFor(lengthM: number, turns: number, stops: number, margin = 1.4): number {
  const est = lengthM / 8.0 + turns * 2 + stops * 5 + 6;
  return Math.ceil((est * margin) / 5) * 5;
}

interface Pair { a: DeliveryLocation; b: DeliveryLocation; r: RouteInfo }

export function buildCatalog(core: WorldCore, world: WorldPhysics): MissionDef[] {
  const ds = core.deliveries;
  const pairs: Pair[] = [];
  for (const a of ds) for (const b of ds) {
    if (a === b) continue;
    const r = routeBetween(world, a, b);
    if (r && r.lengthM > 50) pairs.push({ a, b, r });
  }
  pairs.sort((p, q) => p.r.lengthM - q.r.lengthM || p.a.id.localeCompare(q.a.id) || p.b.id.localeCompare(q.b.id));
  const used = new Set<string>();
  const key = (p: Pair) => `${p.a.id}>${p.b.id}`;
  const pick = (pred: (p: Pair) => boolean, prefer?: (p: Pair) => number): Pair | null => {
    let c = pairs.filter((p) => pred(p) && !used.has(key(p)));
    if (prefer) c = c.slice().sort((x, y) => prefer(x) - prefer(y));
    const p = c[0] ?? null;
    if (p) used.add(key(p));
    return p;
  };
  const roadClass = (d: DeliveryLocation) => world.roads.roads.get(d.roadId)?.highway ?? '';
  const isMain = (d: DeliveryLocation) => /^(trunk|primary|secondary)/.test(roadClass(d));
  const missions: MissionDef[] = [];
  const mk = (id: string, templates: MissionTemplate[], title: string, brief: string, p: Pair, over: Partial<MissionDef> = {}): MissionDef => {
    const stops = over.stops ?? [p.b.id];
    const margin = over.practice ? 1.9 : templates.includes('MT01') ? 1.7 : 1.4;
    return {
      id, version: 1, templates, title, brief, pickupId: p.a.id, stops, flightSeconds: 25,
      deadlineSeconds: over.deadlineSeconds ?? deadlineFor(p.r.lengthM, p.r.turns, stops.length, margin),
      cargo: { label: 'Parcel', fragility: 1, failThreshold: 0 }, traffic: 'normal', seed: 1000 + missions.length * 17,
      deadlineBasis: `route ${Math.round(p.r.lengthM)} m, ${p.r.turns} turns; formula ×${margin}; verified by reference agent (ground only)`,
      routeLengthM: Math.round(p.r.lengthM), ...over,
    };
  };

  const practice = pick((p) => p.r.lengthM >= 250 && p.r.lengthM <= 800, (p) => Math.abs(p.r.lengthM - 450));
  if (practice) missions.push(mk('practice', ['PRACTICE'], 'Practice run', 'Steer, brake, try a flight and stop at the marked entrance. Practice has its own flight allowance and no score.', practice, { practice: true, traffic: 'light' }));

  const mt01 = pick((p) => p.r.lengthM >= 350 && p.r.lengthM <= 1100, (p) => Math.abs(p.r.lengthM - 650));
  if (mt01) missions.push(mk('mt01_first_parcel', ['MT01'], 'First parcel', `A short real delivery to ${mt01.b.label}. Learn steering, braking and stopping at the entrance.`, mt01, { traffic: 'light' }));

  // prefer pairs whose route runs mostly on main carriageways (long straight-ish flight opportunities)
  const mainShare = (p: Pair) => p.r.path.reduce((a, id) => { const e = world.nav.edges.get(id)!; const r = world.roads.roads.get(e.roadId)!; return a + (/^(trunk|primary|secondary)/.test(r.highway) ? e.lengthM : 0); }, 0) / p.r.lengthM;
  const mt02 = pick((p) => (isMain(p.a) || isMain(p.b) || mainShare(p) > 0.6) && p.r.lengthM >= 700 && p.r.lengthM <= 2000, (p) => -mainShare(p) * 1000 + Math.abs(p.r.lengthM - 1200) * 0.2);
  if (mt02) missions.push(mk('mt02_first_flight', ['MT02', 'MT06'], 'First useful flight', `Queues build on the main road. 25 s of flight for the whole delivery to ${mt02.b.label} — spend it together or in parts.`, mt02, { traffic: 'busy' }));

  const mt03 = pick((p) => Math.abs(wrapAngle(p.b.facingHeading - p.a.facingHeading)) > 2.2 && p.r.lengthM <= 2500 && p.r.lengthM >= 300, (p) => p.r.lengthM);
  if (mt03) missions.push(mk('mt03_correct_approach', ['MT03', 'MT08'], 'Correct approach', `${mt03.b.label} is on the other carriageway. Reach it from the permitted side.`, mt03));

  const mt04 = pick((p) => p.r.lengthM >= 500 && p.r.lengthM <= 1600, (p) => Math.abs(p.r.lengthM - 900));
  if (mt04) missions.push(mk('mt04_fragile', ['MT04'], 'Fragile parcel', `Glassware for ${mt04.b.label}. Bumps and hard landings cost 2.5× cargo; below 40% the delivery fails.`, mt04, { cargo: { label: 'Fragile glassware', fragility: 2.5, failThreshold: 40 } }));

  const mt05 = pick((p) => p.r.lengthM >= 400 && p.r.lengthM <= 2000 && !!p.b.poiId, (p) => Math.abs(p.r.lengthM - 1000));
  if (mt05) missions.push(mk('mt05_busy_frontage', ['MT05'], 'Busy frontage', `Busy traffic outside ${mt05.b.label}. Find the entrance and stop cleanly.`, mt05, { traffic: 'busy' }));

  const mt06 = pick((p) => p.r.lengthM >= 1800 && p.r.lengthM <= 3500, (p) => Math.abs(p.r.lengthM - 2500));
  if (mt06) missions.push(mk('mt06_save_flight', ['MT06'], 'Save flight time', `A longer run with only 20 s of flight. Several stretches tempt you — choose where it matters.`, mt06, { flightSeconds: 20, traffic: 'busy' }));

  // MT07: a genuinely reconnecting alternative exists (edge-disjoint enough, ≤ 1.4× length)
  let mt07: Pair | null = null; let altLen = 0;
  for (const p of pairs) {
    if (used.has(key(p)) || p.r.lengthM < 400 || p.r.lengthM > 2500) continue;
    const alt = alternativeRoute(world, p);
    if (alt && alt.lengthM <= p.r.lengthM * 1.4) { mt07 = p; altLen = alt.lengthM; used.add(key(p)); break; }
  }
  if (mt07) missions.push(mk('mt07_route_choice', ['MT07'], 'Route choice', `Main road or the side-road loop (${Math.round(altLen)} m vs ${Math.round(mt07.r.lengthM)} m)? Both are real connections.`, mt07, { traffic: 'busy', deadlineSeconds: deadlineFor(Math.max(altLen, mt07.r.lengthM), mt07.r.turns + 2, 1, 1.4) }));

  if (mt01) {
    const back = pairs.find((p) => p.a.id === mt01.b.id && p.b.id === mt01.a.id);
    if (back) { used.add(key(back)); missions.push(mk('mt08_return', ['MT08', 'MT03'], 'Return delivery', `Take a return parcel back to ${back.b.label}. The return trip uses its own carriageway and turns.`, back)); }
  }

  // MT09: three stops in corridor order — the most compact window of four consecutive deliveries
  const axis = corridorAxis(core);
  const ordered = ds.slice().sort((p, q) => axis(p) - axis(q));
  let bestWin: { legs: RouteInfo[]; ids: DeliveryLocation[]; len: number } | null = null;
  for (let i = 0; i + 3 < ordered.length; i++) {
    const w = ordered.slice(i, i + 4);
    const legs = [routeBetween(world, w[0], w[1]), routeBetween(world, w[1], w[2]), routeBetween(world, w[2], w[3])];
    if (legs.some((l) => !l)) continue;
    const len = legs.reduce((a, l) => a + l!.lengthM, 0);
    if (!bestWin || len < bestWin.len) bestWin = { legs: legs as RouteInfo[], ids: w, len };
  }
  if (bestWin) {
    const [a, b, c, d] = bestWin.ids; const turns = bestWin.legs.reduce((x, l) => x + l.turns, 0);
    missions.push(mk('mt09_multi_stop', ['MT09'], 'Multiple stops', `Three drops in order: ${b.label}, ${c.label}, ${d.label}. One 25 s flight allowance covers all stops — nothing refills.`, { a, b, r: bestWin.legs[0] }, { stops: [b.id, c.id, d.id], deadlineSeconds: deadlineFor(bestWin.len, turns, 3, 1.45), routeLengthM: Math.round(bestWin.len), deadlineBasis: `route ${Math.round(bestWin.len)} m over 3 stops, ${turns} turns; formula ×1.45; verified by reference agent` }));
  }

  // MT10: full corridor, both ends of the corridor axis
  if (ordered.length >= 2) {
    const a = ordered[ordered.length - 1], b = ordered[0];
    const r = routeBetween(world, a, b);
    if (r) missions.push(mk('mt10_full_corridor', ['MT10'], 'Full corridor', `End-to-end along the Blue Line: ${a.label} to ${b.label} at real scale (${(r.lengthM / 1000).toFixed(1)} km).`, { a, b, r }, { traffic: 'normal', flightSeconds: 30 }));
  }

  if (mt02) missions.push(mk('mt12_fixed_challenge', ['MT12'], 'Fixed challenge', `Versioned challenge with a fixed seed. Same traffic every attempt — beat your local record.`, { ...mt02, r: mt02.r }, { seed: 20261017, traffic: 'busy' }));

  return missions;
}

/** penalise the best path's edges to find a genuinely different reconnecting route */
export function alternativeRoute(world: WorldPhysics, p: Pair): { path: string[]; lengthM: number } | null {
  const nav = world.nav;
  const banned = new Set(p.r.path.slice(1, -1));
  if (!banned.size) return null;
  // temporarily remove middle edges' roads in both directions
  const saved = new Map<string, string[]>();
  for (const e of nav.edges.values()) {
    const f = e.next.filter((n) => !banned.has(n));
    if (f.length !== e.next.length) { saved.set(e.id, e.next); e.next = f; }
  }
  const alt = nav.route(p.r.path[0], [p.r.path[p.r.path.length - 1]], 0);
  for (const [id, n] of saved) nav.edges.get(id)!.next = n;
  if (!alt) return null;
  const overlap = alt.path.filter((x) => banned.has(x)).length;
  return overlap === 0 ? alt : null;
}

function corridorAxis(core: WorldCore): (d: DeliveryLocation) => number {
  const find = (re: RegExp) => core.stations.find((s) => re.test(s.name));
  const u = find(/uppal/i), t = find(/tarnaka/i);
  const ax = u && t ? t.x - u.x : -1, az = u && t ? t.z - u.z : -1;
  const ox = u?.x ?? 0, oz = u?.z ?? 0;
  return (d) => (d.entrance[0] - ox) * ax + (d.entrance[1] - oz) * az;
}
