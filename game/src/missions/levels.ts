import type { WorldCore, DeliveryLocation, MetroStation } from '../world/schema';
import type { WorldPhysics } from '../world/collision';
import { routeBetween, deadlineFor, type RouteInfo } from './catalog';
import type { MissionDef, MissionTemplate } from './types';

/**
 * Level-based contracts across the whole metro network (EXPANSION_PLAN §5).
 *   L1 local (0.4–1.5 km, same station area) · L2 neighbouring stations (1.5–4 km) ·
 *   L3 along a line (4–10 km) · L4 cross-line via real interchange roads (4–14 km) ·
 *   L5 long cross-network (12–30 km).
 * Routes are computed on the directed graph only for prefiltered candidate pairs (no all-pairs).
 * Every contract stays completable on the ground; deadlines follow the calibrated formula.
 */
export interface LevelInfo { level: number; title: string; blurb: string }
export const LEVELS: LevelInfo[] = [
  { level: 1, title: 'Neighbourhood', blurb: 'Short deliveries around one station' },
  { level: 2, title: 'Next stop', blurb: 'Between neighbouring stations' },
  { level: 3, title: 'Line runner', blurb: 'Longer runs along one metro line' },
  { level: 4, title: 'Interchange', blurb: 'Cross between metro lines through real junctions' },
  { level: 5, title: 'Across the city', blurb: 'Long cross-network contracts' },
];

function nearestStation(stations: MetroStation[], x: number, z: number): MetroStation | null {
  let best: MetroStation | null = null, bd = Infinity;
  for (const s of stations) { const d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; best = s; } }
  return best;
}

export function buildLevelCatalog(core: WorldCore, world: WorldPhysics, maxPerLevel = 8): MissionDef[] {
  const ds = core.deliveries.filter((d) => d.approachEdges.length && world.nav.inCore(d.approachEdges[0]));
  const area = new Map<string, MetroStation>();
  for (const d of ds) { const st = nearestStation(core.stations, d.entrance[0], d.entrance[1]); if (st) area.set(d.id, st); }
  const lineOf = (d: DeliveryLocation) => area.get(d.id)?.lines ?? [];
  const sharesLine = (a: DeliveryLocation, b: DeliveryLocation) => lineOf(a).some((l) => lineOf(b).includes(l));
  const out: MissionDef[] = [];
  const used = new Set<string>();
  const cache = new Map<string, RouteInfo | null>();
  const route = (a: DeliveryLocation, b: DeliveryLocation) => {
    const k = a.id + '>' + b.id;
    if (!cache.has(k)) cache.set(k, routeBetween(world, a, b));
    return cache.get(k)!;
  };
  // deterministic order
  const sorted = ds.slice().sort((p, q) => p.id.localeCompare(q.id));
  const bands: { level: number; min: number; max: number; straightMin: number; straightMax: number; pred: (a: DeliveryLocation, b: DeliveryLocation) => boolean }[] = [
    { level: 1, min: 400, max: 1500, straightMin: 150, straightMax: 1100, pred: (a, b) => area.get(a.id) === area.get(b.id) },
    { level: 2, min: 1500, max: 4000, straightMin: 900, straightMax: 3200, pred: (a, b) => area.get(a.id) !== area.get(b.id) && sharesLine(a, b) },
    { level: 3, min: 4000, max: 10000, straightMin: 3000, straightMax: 8500, pred: (a, b) => sharesLine(a, b) },
    { level: 4, min: 4000, max: 14000, straightMin: 2500, straightMax: 11000, pred: (a, b) => !sharesLine(a, b) },
    { level: 5, min: 12000, max: 30000, straightMin: 9000, straightMax: 26000, pred: () => true },
  ];
  const templatesFor: Record<number, MissionTemplate[][]> = {
    1: [['MT01'], ['MT03'], ['MT04'], ['MT05'], ['MT01'], ['MT03'], ['MT05'], ['MT04']],
    2: [['MT02'], ['MT07'], ['MT08'], ['MT02'], ['MT05'], ['MT07'], ['MT08'], ['MT02']],
    3: [['MT06'], ['MT09'], ['MT06'], ['MT02'], ['MT06'], ['MT08'], ['MT06'], ['MT02']],
    4: [['MT10'], ['MT06'], ['MT10'], ['MT07'], ['MT10'], ['MT06'], ['MT10'], ['MT08']],
    5: [['MT10'], ['MT12'], ['MT10'], ['MT06'], ['MT10'], ['MT10'], ['MT06'], ['MT10']],
  };
  for (const band of bands) {
    let n = 0;
    // spread over areas: rotate start index per level for variety
    for (let i = 0; i < sorted.length && n < maxPerLevel; i++) {
      const a = sorted[(i * 7 + band.level * 13) % sorted.length];
      const cands = sorted.filter((b) => b !== a && band.pred(a, b)).map((b) => ({ b, d: Math.hypot(b.entrance[0] - a.entrance[0], b.entrance[1] - a.entrance[1]) }))
        .filter((c) => c.d >= band.straightMin && c.d <= band.straightMax).sort((p, q) => p.d - q.d || p.b.id.localeCompare(q.b.id));
      for (const c of cands.slice(0, 6)) {
        const key = `${a.id}>${c.b.id}`;
        if (used.has(key)) continue;
        const r = route(a, c.b);
        if (!r || r.lengthM < band.min || r.lengthM > band.max) continue;
        used.add(key);
        const tpl = templatesFor[band.level][n % 8];
        const fragile = tpl.includes('MT04');
        const flight = band.level >= 5 ? 30 : band.level === 3 && tpl.includes('MT06') ? 20 : 25;
        const from = area.get(a.id)?.name ?? '', to = area.get(c.b.id)?.name ?? '';
        const margin = band.level === 1 ? 1.8 : 1.6;
        out.push({
          id: `l${band.level}_${n + 1}_${a.id.replace(/^d_/, '')}`.slice(0, 64), version: 1, templates: tpl, level: band.level,
          title: `${from === to ? from : `${from} → ${to}`}`,
          brief: `${a.label} to ${c.b.label}. ${(r.lengthM / 1000).toFixed(1)} km on real roads. ${flight} s of flight for the whole delivery.${fragile ? ' Fragile: bumps cost 2.5× cargo.' : ''}`,
          pickupId: a.id, stops: [c.b.id], flightSeconds: flight as 20 | 25 | 30,
          deadlineSeconds: deadlineFor(r.lengthM, r.turns, 1, margin),
          cargo: fragile ? { label: 'Fragile parcel', fragility: 2.5, failThreshold: 40 } : { label: 'Parcel', fragility: 1, failThreshold: 0 },
          traffic: band.level === 1 ? 'normal' : 'busy', seed: 5000 + band.level * 100 + n,
          deadlineBasis: `route ${Math.round(r.lengthM)} m, ${r.turns} turn units; formula ×${margin}; verified by reference agent (ground only)`,
          routeLengthM: Math.round(r.lengthM), fromArea: from, toArea: to,
        });
        n++;
        break;
      }
    }
  }
  return out;
}
