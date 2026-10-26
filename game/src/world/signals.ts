import type { Furniture, RoadEdge, XZ } from './types';

export type SignalAspect = 'red' | 'amber' | 'green';
export interface SignalApproach {
  id: string; edge: string; dir: 1 | -1; node: string | null; hx: number; hz: number; y: number;
  stopS: number; phase: number; priority: number; line: [XZ, XZ]; pole: [number, number, number];
  paint: [number, number, number][];
}
export interface SignalSite {
  id: string; p: XZ; node: string | null; source: 'OpenStreetMap' | 'legacy-map'; sourceIds: string[];
  nodes?: string[];
  timing: 'simulated-coordinated'; placement: 'source-node-model-stopline'; offset: number; phaseCount: number;
  phaseGreens: number[]; approaches: SignalApproach[];
}
export interface SignalResolution { sites: SignalSite[]; unresolved: { id: string; reason: string }[] }

// A game controller plan, not Hyderabad Traffic Police timing data. Every phase
// has a full amber and all-red interval before another approach is released.
export const SIGNAL_GREEN = 18, SIGNAL_AMBER = 3, SIGNAL_ALL_RED = 2;
export const SIGNAL_PHASE = SIGNAL_GREEN + SIGNAL_AMBER + SIGNAL_ALL_RED;
export function signalAspect(site: Pick<SignalSite, 'phaseCount'> & { offset?: number; phaseGreens?: number[] }, phase: number, seconds: number): SignalAspect {
  const count = Math.max(2, site.phaseCount), greens = Array.from({ length: count }, (_, i) => site.phaseGreens?.[i] || SIGNAL_GREEN);
  const spans = greens.map(g => g + SIGNAL_AMBER + SIGNAL_ALL_RED), cycle = spans.reduce((sum, span) => sum + span, 0);
  let t = (((seconds + (site.offset || 0)) % cycle) + cycle) % cycle, current = 0;
  while (current < spans.length - 1 && t >= spans[current]) t -= spans[current++];
  if (phase !== current || t >= greens[current] + SIGNAL_AMBER) return 'red';
  return t < greens[current] ? 'green' : 'amber';
}
function controllerHash(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const ROAD_PRIORITY: Record<string, number> = { motorway: 1.8, motorway_link: 1.35, trunk: 1.55, trunk_link: 1.3, primary: 1.4,
  primary_link: 1.2, secondary: 1.15, secondary_link: 1.05, tertiary: .9, residential: .6, unclassified: .55, service: .35, living_street: .3 };
const approachPriority = (e: RoadEdge) => Math.max(2, e.w) * (ROAD_PRIORITY[e.cls] || .5);
function finaliseController(site: SignalSite) {
  site.phaseCount = groupSignalApproaches(site.approaches);
  const priorities = Array.from({ length: site.phaseCount }, (_, phase) => site.approaches.filter(a => a.phase === phase).reduce((sum, a) => sum + a.priority, 0));
  const max = Math.max(1, ...priorities);
  for (let i = 0; i < priorities.length; i++) if (!priorities[i]) priorities[i] = max * .55; // pedestrian/empty clearance phase
  const total = priorities.reduce((sum, value) => sum + value, 0), budget = SIGNAL_GREEN * site.phaseCount;
  site.phaseGreens = priorities.map(value => Math.round(Math.max(12, Math.min(28, budget * (.5 / site.phaseCount + .5 * value / total))) * 10) / 10);
  const dominant = priorities.indexOf(Math.max(...priorities)), approach = site.approaches.find(a => a.phase === dominant) || site.approaches[0];
  let hx = approach?.hx || 1, hz = approach?.hz || 0;
  if (hx < -.001 || Math.abs(hx) <= .001 && hz < 0) { hx *= -1; hz *= -1; }
  const start = site.phaseGreens.slice(0, dominant).reduce((sum, green) => sum + green + SIGNAL_AMBER + SIGNAL_ALL_RED, 0);
  const cycle = site.phaseGreens.reduce((sum, green) => sum + green + SIGNAL_AMBER + SIGNAL_ALL_RED, 0);
  // H-TRIMS has used synchronized/adaptive control. Exact live plans are not
  // public here, so the game coordinates source-backed controllers along the
  // dominant corridor at45km/h and uses road capacity for green splits. A tiny
  // stable jitter prevents unrelated crossing corridors from changing together.
  const travel = (site.p[0] * hx + site.p[1] * hz) / 12.5, jitter = (controllerHash(site.id) % 301) / 100 - 1.5;
  site.offset = ((start - travel + jitter) % cycle + cycle) % cycle;
}

export function signalRoadAllowed(e: RoadEdge) {
  return !/^(motorway|motorway_link|footway|path|pedestrian|cycleway|steps|track|rail|railway)$/.test(e.cls) && !e.expressway?.controlled;
}
function sourceExpresswayAllowed(f: Furniture, e: RoadEdge, hx: number, hz: number) {
  if (f.source !== 'OpenStreetMap' || !/^motorway(?:_link)?$/.test(e.cls)) return false;
  return !!f.mappedDirections?.some(direction => {
    const tags = direction.tags || {}, speed = Number(String(tags.maxspeed || '').match(/\d+(?:\.\d+)?/)?.[0]);
    return tags.highway === e.cls && Number.isFinite(speed) && speed <= 40 && tags.toll !== 'yes' &&
      Math.abs(direction.forwardHeading[0] * hx + direction.forwardHeading[1] * hz) > .85;
  });
}
const lengthOf = (e: RoadEdge) => e.pts.slice(1).reduce((n, p, i) => n + Math.hypot(p[0] - e.pts[i][0], p[1] - e.pts[i][1]), 0);
const legal = (e: RoadEdge, dir: 1 | -1) => dir === 1 ? e.oneway !== 'forward' : e.oneway !== 'backward';
export function signalRoadPoint(e: RoadEdge, s: number, dir: 1 | -1, lateral = 0) {
  const len = lengthOf(e), distance = dir === 1 ? s : len - s;
  let acc = 0;
  for (let i = 1; i < e.pts.length; i++) {
    const a = e.pts[i - 1], b = e.pts[i], span = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (acc + span < distance && i < e.pts.length - 1) { acc += span; continue; }
    const u = Math.max(0, Math.min(1, (distance - acc) / (span || 1))), hx = (b[0] - a[0]) / (span || 1) * dir, hz = (b[1] - a[1]) / (span || 1) * dir;
    return { x: a[0] + (b[0] - a[0]) * u + hz * lateral, z: a[1] + (b[1] - a[1]) * u - hx * lateral,
      y: (e.elev?.[i - 1] || 0) + ((e.elev?.[i] || 0) - (e.elev?.[i - 1] || 0)) * u, hx, hz };
  }
  return { x: e.pts[0]?.[0] || 0, z: e.pts[0]?.[1] || 0, y: 0, hx: 0, hz: 1 };
}
function projection(e: RoadEdge, p: XZ) {
  let acc = 0, best = { d: Infinity, s: 0, y: 0, hx: 0, hz: 1 };
  for (let i = 1; i < e.pts.length; i++) {
    const a = e.pts[i - 1], b = e.pts[i], dx = b[0] - a[0], dz = b[1] - a[1], span = Math.hypot(dx, dz);
    const u = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (span * span || 1)));
    const d = Math.hypot(p[0] - a[0] - dx * u, p[1] - a[1] - dz * u);
    if (d < best.d) best = { d, s: acc + span * u, y: (e.elev?.[i - 1] || 0) + ((e.elev?.[i] || 0) - (e.elev?.[i - 1] || 0)) * u, hx: dx / (span || 1), hz: dz / (span || 1) };
    acc += span;
  }
  return best;
}
function elevatedSource(f: Furniture) {
  const raised = (tags: Record<string, string>) => tags.bridge === 'yes' || tags.bridge === 'viaduct' || Number(tags.layer || 0) > 0 || Number(tags.level || 0) > 0;
  return raised(f.tags || {}) || !!f.mappedDirections?.length && f.mappedDirections.every(d => raised(d.tags || {}));
}
function headingsFor(f: Furniture): XZ[] | null {
  const direction = f.tags?.['traffic_signals:direction'] || f.tags?.direction;
  if (direction !== 'forward' && direction !== 'backward') return null;
  return (f.mappedDirections || []).flatMap(d => {
    if (direction === 'forward') return d.nodeRole === 'start' || d.tags?.oneway === '-1' ? [] : [d.forwardHeading];
    if (d.nodeRole === 'end' || d.tags?.oneway === 'yes' || d.tags?.oneway === '1') return [];
    return [d.backwardHeading || [-d.forwardHeading[0], -d.forwardHeading[1]] as XZ];
  });
}
export function groupSignalApproaches(approaches: SignalApproach[]) {
  const groups: SignalApproach[] = [];
  // Ordering by physical bearing makes tile builds independent of road arrival
  // order. Opposing arms share a phase; skew and multi-arm junctions get their
  // own phases instead of being forced into world north/south or east/west.
  for (const a of approaches.slice().sort((a, b) => Math.atan2(a.hz, a.hx) - Math.atan2(b.hz, b.hx) || a.id.localeCompare(b.id))) {
    let phase = groups.findIndex(b => Math.abs(a.hx * b.hx + a.hz * b.hz) > .94);
    if (phase < 0) { phase = groups.length; groups.push(a); }
    a.phase = phase;
  }
  return Math.max(2, groups.length);
}

export function resolveSignalSites(roads: RoadEdge[], furniture: Furniture[]): SignalResolution {
  // Ordinary roads use the city road-class filter. Two mapped ORR approaches are
  // explicitly tagged as low-speed, non-tolled signal approaches in the source
  // data; those may bind only to a nearly coincident, aligned motorway edge.
  // This does not grant generic permission to put lights on the 100 km/h mainline.
  const eligible = [...new Map(roads.filter(e => e.pts.length > 1 &&
    !/^(footway|path|pedestrian|cycleway|steps|track|rail|railway)$/.test(e.cls)).map(e => [e.id, e])).values()];
  const lengths = new Map(eligible.map(e => [e, lengthOf(e)]));
  const nodes = new Map<string, { p: XZ; roads: { e: RoadEdge; end: 0 | 1 }[] }>();
  for (const e of eligible) for (const end of [0, 1] as const) {
    const id = end ? e.to : e.from, i = end ? e.pts.length - 1 : 0;
    if (!id || Math.abs(e.elev?.[i] || 0) > 1.5) continue;
    const n = nodes.get(id) || { p: e.pts[i], roads: [] }; n.roads.push({ e, end }); nodes.set(id, n);
  }
  const sites = new Map<string, SignalSite>(), unresolved: SignalResolution['unresolved'] = [];
  for (const f of furniture.filter(f => f.kind === 'traffic_signals')) {
    const sourceId = f.id || `legacy:${f.p[0]},${f.p[1]}`;
    const reject = (reason: string) => unresolved.push({ id: sourceId, reason });
    if (f.synth) { reject('synthetic-source'); continue; }
    if (f.tags?.access === 'private' || f.tags?.traffic_signals === 'off' || f.tags?.traffic_signals === 'disused' || f.tags?.['traffic_signals:operating_times'] === 'off') { reject('inactive-or-private'); continue; }
    const elevated = elevatedSource(f);
    const headings = headingsFor(f);
    if (headings && !headings.length) { reject('direction-without-source-way-orientation'); continue; }
    const matches = eligible.map(e => ({ e, ...projection(e, f.p) })).filter(m => m.d <= 14 &&
      (signalRoadAllowed(m.e) || m.d <= 2 && sourceExpresswayAllowed(f, m.e, m.hx, m.hz)) &&
      (elevated ? m.y > 1.5 : Math.abs(m.y) <= 1.5) &&
      (!elevated || f.mappedDirections?.some(h => Math.abs(h.forwardHeading[0] * m.hx + h.forwardHeading[1] * m.hz) > .85)) &&
      (!headings || headings.some(h => Math.abs(h[0] * m.hx + h[1] * m.hz) > .8))).sort((a, b) => a.d - b.d || a.e.id.localeCompare(b.e.id));
    if (!matches.length) { reject(elevated ? 'elevated-source-without-matching-native-deck' : 'no-matching-ground-road-within-14m'); continue; }
    const best = matches[0], len = lengths.get(best.e)!;
    if (elevated && matches.some(m => m.d <= best.d + 2 && Math.abs(m.y - best.y) > 1.5)) { reject('ambiguous-native-deck-level'); continue; }
    const endpoints = [{ id: best.e.from, left: best.s }, { id: best.e.to, left: len - best.s }]
      .filter(c => c.id && c.left <= 35 && (nodes.get(c.id)?.roads.length || 0) >= 3).sort((a, b) => a.left - b.left);
    const node = elevated ? null : endpoints[0]?.id || null, junction = node ? nodes.get(node)! : null;
    // Nearby points alone never connect roads: junction arms must share the
    // actual same-level road node. A source away from a junction remains an
    // explicit mid-block stop on its matched road.
    const siteId = node ? `signal:${node}` : `signal:${sourceId}`;
    let site = sites.get(siteId);
    if (!site) { site = { id: siteId, p: junction?.p || f.p, node, source: f.source === 'OpenStreetMap' || f.id?.startsWith('osm:') ? 'OpenStreetMap' : 'legacy-map', sourceIds: [], timing: 'simulated-coordinated', placement: 'source-node-model-stopline', offset: 0, phaseCount: 2, phaseGreens: [SIGNAL_GREEN, SIGNAL_GREEN], approaches: [] }; sites.set(siteId, site); }
    site.sourceIds.push(sourceId);
    const candidates = junction ? junction.roads.map(({ e, end }) => ({ e, dir: (end ? 1 : -1) as 1 | -1,
      stop: Math.max(0, lengths.get(e)! - Math.min(lengths.get(e)! * .4, Math.max(5, ...junction.roads.filter(r => r.e !== e).map(r => r.e.w / 2 + 1.8)))) })) :
      ([1, -1] as const).map(dir => ({ e: best.e, dir, stop: Math.max(0, Math.min(len, dir === 1 ? best.s - 2 : len - best.s - 2)) }));
    for (const { e, dir, stop } of candidates) {
      if (!legal(e, dir)) continue;
      const point = signalRoadPoint(e, stop, dir), inbound = signalRoadPoint(e, lengths.get(e)! - .01, dir);
      if (headings && !headings.some(h => h[0] * inbound.hx + h[1] * inbound.hz > .8)) continue;
      const id = `${e.id}:${dir}`;
      if (site.approaches.some(a => a.id === id)) continue;
      const near = e.oneway ? -e.w / 2 + .35 : .35, far = e.w / 2 - .35;
      const a = signalRoadPoint(e, stop, dir, near), b = signalRoadPoint(e, stop, dir, far), pole = signalRoadPoint(e, stop + 1.2, dir, e.w / 2 + 1.2);
      const paint = [[-.19, near], [-.19, far], [.19, far], [.19, near]].map(([along, lateral]) => {
        const p = signalRoadPoint(e, stop + along, dir, lateral); return [p.x, p.y, p.z] as [number, number, number];
      });
      site.approaches.push({ id, edge: e.id, dir, node, hx: point.hx, hz: point.hz, y: point.y, stopS: stop, phase: 0, priority: approachPriority(e),
        line: [[a.x, a.z], [b.x, b.z]], pole: [pole.x, pole.y, pole.z], paint });
    }
    if (!site.approaches.length) { sites.delete(siteId); reject('no-legal-incoming-approach'); }
  }
  // Divided carriageways can have one source-backed road node per side of the
  // same crossing. Merge only short, actually connected, same-level nodes with
  // their own mapped evidence; spatial proximity alone never joins controllers.
  const byNode = new Map([...sites.values()].filter(s => s.node).map(s => [s.node!, s]));
  const parent = new Map([...byNode.keys()].map(id => [id, id]));
  const find = (id: string): string => parent.get(id) === id ? id : find(parent.get(id)!);
  for (const e of eligible) {
    if (!e.from || !e.to || !byNode.has(e.from) || !byNode.has(e.to) || lengths.get(e)! > 30 || Math.abs((e.elev?.[0] || 0) - (e.elev?.[e.pts.length - 1] || 0)) > .75) continue;
    const a = find(e.from), b = find(e.to); if (a !== b) parent.set(a < b ? b : a, a < b ? a : b);
  }
  const clusters = new Map<string, SignalSite[]>();
  for (const [node, site] of byNode) { const id = find(node), group = clusters.get(id) || []; group.push(site); clusters.set(id, group); }
  for (const group of clusters.values()) {
    if (group.length < 2) continue;
    const ids = group.map(s => s.node!).sort(), idSet = new Set(ids), id = `signal:${ids.join('+')}`;
    const approaches = [...new Map(group.flatMap(s => s.approaches).filter(a => {
      const e = eligible.find(e => e.id === a.edge)!; return !e.from || !e.to || !(idSet.has(e.from) && idSet.has(e.to));
    }).map(a => [a.id, a])).values()];
    for (const site of group) sites.delete(site.id);
    if (approaches.length) sites.set(id, { ...group[0], id, node: null, nodes: ids,
      p: [group.reduce((sum, s) => sum + s.p[0], 0) / group.length, group.reduce((sum, s) => sum + s.p[1], 0) / group.length],
      sourceIds: [...new Set(group.flatMap(s => s.sourceIds))], offset: 0, approaches });
  }
  for (const site of sites.values()) { finaliseController(site); site.sourceIds.sort(); }
  return { sites: [...sites.values()].sort((a, b) => a.id.localeCompare(b.id)), unresolved };
}
