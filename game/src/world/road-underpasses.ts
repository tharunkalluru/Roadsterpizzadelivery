import type { RoadEdge, XZ } from './types';
import type { RoadGradePatch } from './road-grades';

// Completed facilities, not proposed schemes or an inference from an arbitrary
// same-level crossing. IDs match the retained core pack; the named street and
// transverse geometry must still match before a profile is changed.
export interface RoadUnderpassSite {
  id: string; name: string; lowerIds: readonly string[]; upperIds: readonly string[];
  sourceURL: string; opened: string;
}
const budget = 'https://ghmc.gov.in/Budget/Budget-2020-21.pdf';
export const ROAD_UNDERPASS_SITES: readonly RoadUnderpassSite[] = [
  { id: 'ayyappa-society', name: 'Ayyappa Society Underpass', lowerIds: ['e7f77490-046_0'],
    upperIds: ['124343b1-220_0', '41929414-ef1_0'], sourceURL: budget, opened: '2018-01-03' },
  { id: 'mindspace', name: 'Mindspace Underpass', lowerIds: ['58b1b917-f10_0', 'a3d55b32-008_0'],
    upperIds: ['e18474d8-ebc_0', '63f08eac-e92_0', '2bfed56a-063_0'], sourceURL: budget, opened: '2018-04-28' },
  { id: 'chintalkunta', name: 'Chintalkunta Underpass', lowerIds: ['699b4800-f7f_0'],
    upperIds: ['c48c1a1c-9dd_0', 'b2d99b4d-b39_0'], sourceURL: budget, opened: '2018-05-01' },
];
export const ROAD_UNDERPASS_DEPTH = 6.4, ROAD_UNDERPASS_MAX_GRADE = .065;
const SAMPLE = 2, EASE = 20;
interface UnderpassProfile {
  site: string; roadId: string; upperIds: string[]; length: number;
  lowerStart: number; lowerEnd: number; depth: number; maxGrade: number;
  minimumSurfaceSeparation: number;
}
export interface RoadUnderpassReport {
  sites: number; changedRoads: number; profiles: UnderpassProfile[];
  unresolved: { site: string; roadId?: string; reason: string }[]; uncertainty: string;
}
export interface RoadUnderpassResult { roads: RoadEdge[]; changes: RoadGradePatch[]; report: RoadUnderpassReport }
const cached = new WeakMap<RoadEdge[], RoadUnderpassResult>();
const height = (e: RoadEdge, i: number) => e.elev?.[i] || 0;
function lengths(e: RoadEdge) {
  const values = [0];
  for (let i = 1; i < e.pts.length; i++) values.push(values[i - 1] + Math.hypot(e.pts[i][0] - e.pts[i - 1][0], e.pts[i][1] - e.pts[i - 1][1]));
  return values;
}
function intersection(a: XZ, b: XZ, c: XZ, d: XZ) {
  const ax = b[0] - a[0], az = b[1] - a[1], bx = d[0] - c[0], bz = d[1] - c[1];
  const al = Math.hypot(ax, az), bl = Math.hypot(bx, bz), det = ax * bz - az * bx;
  if (al < .001 || bl < .001 || Math.abs(det) < al * bl * .2) return null;
  const dx = c[0] - a[0], dz = c[1] - a[1], t = (dx * bz - dz * bx) / det, u = (dx * az - dz * ax) / det;
  if (t < -1e-7 || t > 1.0000001 || u < -1e-7 || u > 1.0000001) return null;
  return { t: Math.max(0, Math.min(1, t)), u: Math.max(0, Math.min(1, u)),
    sin: Math.abs(det) / (al * bl), cos: Math.abs(ax * bx + az * bz) / (al * bl) };
}

// Integral of an eased slope. Both ends have zero gradient, with a constant
// gentle slope through the middle. Unlike short smoothstep ramps this does not
// need to exceed the grade bound to fit the actual mapped portal-to-junction run.
export function underpassRamp(distance: number, run: number, depth = ROAD_UNDERPASS_DEPTH) {
  if (distance <= 0) return 0; if (distance >= run) return depth;
  const ease = Math.min(EASE, run / 4), slope = depth / (run - ease);
  const eased = (d: number) => slope * .5 * (d - ease / Math.PI * Math.sin(Math.PI * d / ease));
  if (distance < ease) return eased(distance);
  if (distance > run - ease) return depth - eased(run - distance);
  return slope * (distance - ease / 2);
}

export function prepareRoadUnderpasses(roads: RoadEdge[], sites: readonly RoadUnderpassSite[] = ROAD_UNDERPASS_SITES): RoadUnderpassResult {
  if (sites === ROAD_UNDERPASS_SITES && cached.has(roads)) return cached.get(roads)!;
  const report: RoadUnderpassReport = { sites: 0, changedRoads: 0, profiles: [], unresolved: [],
    uncertainty: 'Opened underpass identities/directions from GHMC Budget2020-21; narrow retained-road-ID and crossing-geometry matches. Original plan alignment/connectivity retained. Depth, 20m slope easing and roof headroom are game estimates, not surveyed dimensions. Unverified or too-short profiles are reported, never converted into new flyovers.' };
  const byId = new Map(roads.map(e => [e.id, e])), updates = new Map<string, RoadEdge>();
  for (const site of sites) {
    const matching = site.lowerIds.map(id => byId.get(id)).filter((e): e is RoadEdge => !!e);
    if (!matching.length) continue; // A subset/tile without this site needs no global correction.
    report.sites++;
    for (const e of matching) {
      const reject = (reason: string) => report.unresolved.push({ site: site.id, roadId: e.id, reason });
      if (e.name !== site.name || e.pts.length < 2) { reject('Retained lower-road identity no longer matches.'); continue; }
      if (e.expressway || /survey|explicit/.test(String((e as RoadEdge & { elevationSource?: string }).elevationSource || ''))) {
        reject('Protected surveyed/explicit/expressway profile requires manual review.'); continue;
      }
      // The named portal joins must already be at the local road datum. Never
      // silently detach a road from its connected elevated endpoints.
      if (Math.abs(height(e, 0)) > .001 || Math.abs(height(e, e.pts.length - 1)) > .001) {
        reject('Portal joins are not at the local ground datum.'); continue;
      }
      const arc = lengths(e), length = arc.at(-1)!, hits: { s: number; half: number; upper: string; y: number }[] = [];
      for (const id of site.upperIds) {
        const upper = byId.get(id); if (!upper) continue;
        for (let i = 1; i < e.pts.length; i++) for (let j = 1; j < upper.pts.length; j++) {
          const hit = intersection(e.pts[i - 1], e.pts[i], upper.pts[j - 1], upper.pts[j]); if (!hit) continue;
          const s = arc[i - 1] + (arc[i] - arc[i - 1]) * hit.t;
          // Full finite carriageway width, including the lower road's projected
          // half width at oblique crossings; a small margin contains the slab.
          const half = (upper.w / 2 + e.w / 2 * hit.cos) / hit.sin + 2;
          if (s - half <= .01 || s + half >= length - .01) continue;
          const y = height(upper, j - 1) + (height(upper, j) - height(upper, j - 1)) * hit.u;
          hits.push({ s, half, upper: upper.id, y });
        }
      }
      if (!hits.length) { reject('No verified transverse upper-road geometry remains.'); continue; }
      // A previously modeled above-ground upper road is not lowered here. Real
      // flyovers and exterior roads remain byte-for-byte unchanged.
      const lo = Math.min(...hits.map(h => h.s - h.half)), hi = Math.max(...hits.map(h => h.s + h.half));
      const depth = ROAD_UNDERPASS_DEPTH, runA = lo, runB = length - hi;
      const maxGrade = Math.max(depth / (runA - Math.min(EASE, runA / 4)), depth / (runB - Math.min(EASE, runB / 4)));
      if (!(length > 0) || maxGrade > ROAD_UNDERPASS_MAX_GRADE + 1e-8 || hits.some(h => h.y < -.001)) {
        reject('Insufficient smooth approach distance or ambiguous negative upper-road level.'); continue;
      }
      const value = (s: number) => s < lo ? -underpassRamp(s, runA, depth) : s > hi ? -underpassRamp(length - s, runB, depth) : -depth;
      const pts: XZ[] = [e.pts[0]], elev = [0];
      const critical = [lo, hi, Math.min(EASE, runA / 4), lo - Math.min(EASE, runA / 4), hi + Math.min(EASE, runB / 4), length - Math.min(EASE, runB / 4)];
      for (let i = 1; i < e.pts.length; i++) {
        const a = e.pts[i - 1], b = e.pts[i], start = arc[i - 1], len = arc[i] - start;
        if (len < 1e-9) { pts.push(b); elev.push(value(arc[i])); continue; }
        const count = Math.max(1, Math.ceil(len / SAMPLE)), distances = Array.from({ length: count }, (_, j) => start + len * (j + 1) / count);
        distances.push(...critical.filter(s => s > start + 1e-6 && s < arc[i] - 1e-6)); distances.sort((a, b) => a - b);
        let previous = start;
        for (const s of distances) {
          if (s - previous < 1e-6) continue; previous = s;
          const u = (s - start) / len; pts.push(Math.abs(s - arc[i]) < 1e-6 ? b : [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]); elev.push(value(s));
        }
      }
      // Preserve exact shared endpoint heights and all original vertex coordinates.
      elev[elev.length - 1] = 0;
      const equal = pts.length === e.pts.length && pts.every((p, i) => p[0] === e.pts[i][0] && p[1] === e.pts[i][1] && Math.abs(elev[i] - height(e, i)) < 1e-7);
      if (!equal) updates.set(e.id, { ...e, pts, elev });
      report.profiles.push({ site: site.id, roadId: e.id, upperIds: [...new Set(hits.map(h => h.upper))], length,
        lowerStart: lo, lowerEnd: hi, depth, maxGrade, minimumSurfaceSeparation: Math.min(...hits.map(h => h.y + depth)) });
    }
  }
  const result = updates.size ? roads.map(e => updates.get(e.id) || e) : roads;
  const changes = [...updates.values()].map(e => ({ id: e.id, pts: e.pts, elev: e.elev })); report.changedRoads = changes.length;
  const output = { roads: result, changes, report };
  if (sites === ROAD_UNDERPASS_SITES) { cached.set(roads, output); cached.set(result, { ...output, changes: [], report: { ...report, changedRoads: 0 } }); }
  return output;
}
