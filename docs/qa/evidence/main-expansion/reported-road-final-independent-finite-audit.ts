import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { roadRibbon } from '../../../../src/world/bridge-clearance';
import type { RoadEdge, XZ } from '../../../../src/world/types';
import mapped from '../../../../src/world/bridge-level-data.json';

const oldFile = process.argv[2], newFile = process.argv[3], outFile = process.argv[4];
const before = JSON.parse(readFileSync(oldFile, 'utf8')), after = JSON.parse(readFileSync(newFile, 'utf8'));
const oldRoads: RoadEdge[] = before.roads, newRoads: RoadEdge[] = after.roads;
const oldById = new Map(oldRoads.map(e => [e.id, e])), newById = new Map(newRoads.map(e => [e.id, e]));
const crossings: { roads: [string, string]; x: number; z: number }[] = before.report.bridgeClearance.crossings;
const changed = new Set(oldRoads.filter(e => {
  const n = newById.get(e.id); return !n || JSON.stringify(e) !== JSON.stringify(n);
}).map(e => e.id));
type P = [number, number, number]; type Tri = [P, P, P];
interface Index { tris: Tri[]; cells: Map<string, number[]> }
const indices = new Map<string, Index>();
const arcMeta = new WeakMap<Tri, { a: XZ; b: XZ; start: number; length: number }>();
function index(which: 'old' | 'new', id: string) {
  const key = `${which}:${id}`; const cached = indices.get(key); if (cached) return cached;
  const roads = which === 'old' ? oldRoads : newRoads, road = (which === 'old' ? oldById : newById).get(id)!;
  const result: Index = { tris: [], cells: new Map() };
  let arc = 0;
  for (const [segment, q] of roadRibbon(road, roads).quads.entries()) {
    const a = road.pts[segment], b = road.pts[segment + 1], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (const k of [[0, 1, 2], [0, 2, 3]]) {
    const tri = k.map(i => q[i]) as Tri, number = result.tris.length; result.tris.push(tri); arcMeta.set(tri, { a, b, start: arc, length });
    for (let x = Math.floor(Math.min(...tri.map(p => p[0])) / 40); x <= Math.floor(Math.max(...tri.map(p => p[0])) / 40); x++)
      for (let z = Math.floor(Math.min(...tri.map(p => p[2])) / 40); z <= Math.floor(Math.max(...tri.map(p => p[2])) / 40); z++) {
        const cell = `${x},${z}`; (result.cells.get(cell) || result.cells.set(cell, []).get(cell)!).push(number);
      }
  }
    arc += length;
  }
  indices.set(key, result); return result;
}
function plane(t: Tri, x: number, z: number) {
  const u = new THREEless(t, x, z); return u.inside ? u.height : null;
}
class THREEless {
  inside = false; height = 0;
  constructor(t: Tri, x: number, z: number) {
    const b = [t[1][0] - t[0][0], t[1][2] - t[0][2]], c = [t[2][0] - t[0][0], t[2][2] - t[0][2]], det = b[0] * c[1] - b[1] * c[0];
    if (Math.abs(det) < 1e-10) return;
    const px = x - t[0][0], pz = z - t[0][2], v = (px * c[1] - pz * c[0]) / det, w = (b[0] * pz - b[1] * px) / det;
    this.inside = v >= -1e-6 && w >= -1e-6 && v + w <= 1.000001; this.height = t[0][1] + v * (t[1][1] - t[0][1]) + w * (t[2][1] - t[0][1]);
  }
}
const cross = (a: XZ, b: XZ, p: XZ) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
function clip(subject: XZ[], boundary: XZ[]) {
  const orientation = Math.sign(cross(boundary[0], boundary[1], boundary[2])); if (!orientation) return [];
  for (let edge = 0; edge < 3 && subject.length; edge++) {
    const a = boundary[edge], b = boundary[(edge + 1) % 3], output: XZ[] = [];
    let previous = subject.at(-1)!, prior = orientation * cross(a, b, previous);
    for (const p of subject) {
      const value = orientation * cross(a, b, p);
      if ((prior >= 0) !== (value >= 0)) { const u = prior / (prior - value); output.push([previous[0] + (p[0] - previous[0]) * u, previous[1] + (p[1] - previous[1]) * u]); }
      if (value >= -1e-8) output.push(p); previous = p; prior = value;
    }
    subject = output;
  }
  return subject;
}
function along(t: Tri, p: XZ) {
  const m = arcMeta.get(t)!; return m.start + m.length * Math.max(0, Math.min(1, ((p[0] - m.a[0]) * (m.b[0] - m.a[0]) + (p[1] - m.a[1]) * (m.b[1] - m.a[1])) / (m.length * m.length || 1)));
}
function heights(i: Index, p: XZ, branch?: Tri) {
  return (i.cells.get(`${Math.floor(p[0] / 40)},${Math.floor(p[1] / 40)}`) || []).flatMap(k => {
    if (branch && Math.abs(along(i.tris[k], p) - along(branch, p)) > 5) return [];
    const y = plane(i.tris[k], p[0], p[1]); return y === null ? [] : [y];
  });
}
// A legitimate connected ground correction can remove an old inferred height
// split, but only inside the actual finite overlap component attached to its
// real source node. This reviewer tracer does not exempt whole road pairs.
const source = JSON.parse(gunzipSync(readFileSync('public/city/core.pack.wasm')).toString());
const sourceById = new Map<string, RoadEdge>(source.roads.map((e: RoadEdge) => [e.id, e]));
const protectedLevels = new Set(mapped.roads.map(e => e.id));
const allowed = new Map<string, { node: string; polygon: XZ[] }[]>();
const pointInside = (poly: XZ[], p: XZ) => {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) { const d = cross(poly[i], poly[(i + 1) % poly.length], p); if (Math.abs(d) < 1e-5) continue; if (sign && Math.sign(d) !== sign) return false; sign = Math.sign(d); }
  return true;
};
function traceComponent(node: string, upperId: string, ground: { id: string; reverse: boolean }[]) {
  const upperSource = sourceById.get(upperId)!; if (!upperSource || protectedLevels.has(upperId) || upperSource.expressway || /survey|explicit/.test(String((upperSource as any).elevationSource ?? ''))) return;
  const startAtEnd = upperSource.to === node;
  if (upperSource.from !== node && !startAtEnd) return;
  const upEnd = startAtEnd ? upperSource.pts.length - 1 : 0;
  if (Math.abs(upperSource.elev?.[upEnd] ?? 0) > .001) return;
  let expected = node, expectedPoint = upperSource.pts[upEnd];
  for (const part of ground) {
    const s = sourceById.get(part.id)!; if (!s || protectedLevels.has(part.id) || s.expressway || /survey|explicit/.test(String((s as any).elevationSource ?? ''))) return;
    if ((part.reverse ? s.to : s.from) !== expected || s.elev?.some(y => Math.abs(y) > .001)) return;
    const start = part.reverse ? s.pts.at(-1)! : s.pts[0];
    if (Math.hypot(start[0] - expectedPoint[0], start[1] - expectedPoint[1]) > .15) return;
    expected = (part.reverse ? s.from : s.to)!; expectedPoint = part.reverse ? s.pts[0] : s.pts.at(-1)!;
  }
  const oldUpper = oldById.get(upperId); if (!oldUpper) return;
  const upper = roadRibbon(oldUpper, oldRoads).quads, groundQuads = ground.flatMap(part => {
    const e = oldById.get(part.id)!; if (!e) return []; const quads = roadRibbon(e, oldRoads).quads;
    return (part.reverse ? [...quads].reverse() : quads).map(q => ({ id: part.id, q }));
  });
  const orderedUpper = startAtEnd ? [...upper].reverse() : upper;
  const hits = new Map<string, { a: number; b: number; id: string; polygon: XZ[] }[]>();
  for (let a = 0; a < orderedUpper.length; a++) for (let b = 0; b < groundQuads.length; b++) {
    const A = orderedUpper[a], B = groundQuads[b].q;
    if (Math.max(...A.map(p => p[0])) < Math.min(...B.map(p => p[0])) || Math.max(...B.map(p => p[0])) < Math.min(...A.map(p => p[0])) || Math.max(...A.map(p => p[2])) < Math.min(...B.map(p => p[2])) || Math.max(...B.map(p => p[2])) < Math.min(...A.map(p => p[2]))) continue;
    for (const ai of [[0, 1, 2], [0, 2, 3]]) for (const bi of [[0, 1, 2], [0, 2, 3]]) {
      const polygon = clip(ai.map(k => [A[k][0], A[k][2]]), bi.map(k => [B[k][0], B[k][2]]));
      if (polygon.length < 3 || Math.abs(polygon.reduce((n, p, i) => { const q = polygon[(i + 1) % polygon.length]; return n + p[0] * q[1] - p[1] * q[0]; }, 0)) / 2 < .000001) continue;
      const key = `${a},${b}`; (hits.get(key) ?? hits.set(key, []).get(key)!).push({ a, b, id: groundQuads[b].id, polygon });
    }
  }
  const connected = new Set<string>(), queue = ['0,0'];
  while (queue.length) {
    const key = queue.pop()!; if (connected.has(key) || !hits.has(key)) continue; connected.add(key);
    const [a, b] = key.split(',').map(Number);
    for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) if (da || db) queue.push(`${a + da},${b + db}`);
  }
  for (const key of connected) for (const h of hits.get(key)!) {
    const pair = [upperId, h.id].sort().join('/');
    (allowed.get(pair) ?? allowed.set(pair, []).get(pair)!).push({ node, polygon: h.polygon });
  }
}
for (const r of after.report.joinedApproaches?.repairs ?? []) {
  const pair = r.roads.map((id: string) => sourceById.get(id)) as [RoadEdge | undefined, RoadEdge | undefined];
  if (!pair.every(Boolean)) continue;
  for (let i = 0; i < 2; i++) {
    const upper = pair[i]!, lower = pair[1 - i]!;
    if (!upper.elev?.some(y => y > 1.2) || lower.elev?.some(y => Math.abs(y) > .001)) continue;
    const reverse = lower.to === r.node;
    if ((reverse ? lower.to : lower.from) !== r.node) continue;
    const a = upper.from === r.node ? upper.pts[0] : upper.pts.at(-1)!, b = reverse ? lower.pts.at(-1)! : lower.pts[0];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) > .15) continue;
    traceComponent(r.node, upper.id, [{ id: lower.id, reverse }]);
  }
}
// These are exact source graph chains at the reported counterflow fork. Both
// intermediate IDs are required; an unrelated transverse road is never added.
traceComponent('4cda42fb-55e', 'bdf0bad3-182_0', [{ id: '38a7824d-0e1_0', reverse: false }, { id: '38a7824d-0e1_1', reverse: false }]);
traceComponent('e97da6ca-736', 'bdf0bad3-182_0', [{ id: '37e421d1-548_1', reverse: true }, { id: '37e421d1-548_0', reverse: true }]);
// Independently traced source-zero approach continuations beyond their mapped
// positive bridge-layer ends; exemption remains inside their attached polygons.
traceComponent('d60b33b7-410', 'd0978a06-15a_0', [{ id: '808b15b2-43d_3', reverse: true }, { id: '808b15b2-43d_2', reverse: true }, { id: '808b15b2-43d_1', reverse: true }]);
traceComponent('111ae5f3-7ac', '51be01ba-57f_0', [{ id: 'c4ec566b-98c_1', reverse: true }, { id: 'c4ec566b-98c_0', reverse: true }]);
traceComponent('ad3cd089-6a5', 'c74bed09-107_0', [{ id: 'b002b0ec-3e8_3', reverse: true }, { id: 'b002b0ec-3e8_2', reverse: true }, { id: 'b002b0ec-3e8_1', reverse: true }]);
const justifiedGround = new Map<string, { pair: string[]; node: string; count: number; examples: any[] }>();

const pairs = new Map<string, [string, string]>();
for (const c of crossings) if (c.roads.some(id => changed.has(id))) pairs.set(c.roads.join('/'), c.roads);
let polygons = 0, samples = 0, sameCoverage = 0, missingBoundary = 0, missingCentroid = 0, minOld = Infinity, minNew = Infinity;
const failures: any[] = [], missing: any[] = [];
const coverageChanges = new Map<string, any>();
const regressions = new Map<string, any>();
for (const pair of pairs.values()) {
  const [A, B] = pair.map(id => index('old', id)), [NA, NB] = pair.map(id => index('new', id));
  for (const ta of A.tris) {
    const candidates = new Set<number>();
    for (let x = Math.floor(Math.min(...ta.map(p => p[0])) / 40); x <= Math.floor(Math.max(...ta.map(p => p[0])) / 40); x++)
      for (let z = Math.floor(Math.min(...ta.map(p => p[2])) / 40); z <= Math.floor(Math.max(...ta.map(p => p[2])) / 40); z++)
        for (const k of B.cells.get(`${x},${z}`) || []) candidates.add(k);
    for (const k of candidates) {
      const tb = B.tris[k], poly = clip(ta.map(p => [p[0], p[2]]), tb.map(p => [p[0], p[2]])); if (poly.length < 3) continue;
      const area = Math.abs(poly.reduce((v, p, i) => { const q = poly[(i + 1) % poly.length]; return v + p[0] * q[1] - p[1] * q[0]; }, 0)) / 2;
      if (area < .025) continue;
      const centroid: XZ = [poly.reduce((n, p) => n + p[0], 0) / poly.length, poly.reduce((n, p) => n + p[1], 0) / poly.length];
      polygons++;
      for (const [n, p] of [...poly, centroid].entries()) {
        const ya = plane(ta, p[0], p[1]), yb = plane(tb, p[0], p[1]); if (ya === null || yb === null || ya - yb < 4.5 - 1e-5) continue;
        // Either source road can loop through this point at two levels.
        // Match both original arc branches; min(all levels)-max(all levels)
        // otherwise reports false losses even on identical local geometry.
        const oldGap = ya - yb, a = heights(NA, p, ta), b = heights(NB, p, tb); samples++; minOld = Math.min(minOld, oldGap);
        if (!a.length || !b.length) {
          if (n === poly.length) missingCentroid++; else missingBoundary++;
          const narrowed = (!a.length ? !!newById.get(pair[0])?.joinedPavement : true) && (!b.length ? !!newById.get(pair[1])?.joinedPavement : true);
          const key = pair.join('/'), coverage = coverageChanges.get(key) ?? { pair, boundary: 0, centroid: 0, withLocalWidthProfile: 0, examples: [] };
          coverage[n === poly.length ? 'centroid' : 'boundary']++; if (narrowed) coverage.withLocalWidthProfile++;
          if (coverage.examples.length < 3) coverage.examples.push({ point: p, oldGap, upperAvailable: !!a.length, lowerAvailable: !!b.length, narrowed }); coverageChanges.set(key, coverage);
          if (missing.length < 10000) missing.push({ pair, point: p, centroid: n === poly.length, oldGap, upperAvailable: !!a.length, lowerAvailable: !!b.length, narrowed }); continue;
        }
        sameCoverage++; const newGap = Math.min(...a) - Math.max(...b); minNew = Math.min(minNew, newGap);
        if (newGap < Math.min(5.85, oldGap) - .05) {
          const attached = Math.abs(newGap) <= .03 ? (allowed.get([...pair].sort().join('/')) ?? []).find(c => pointInside(c.polygon, p)) : undefined;
          if (attached) {
            const key = `${pair.join('/')}/${attached.node}`, entry = justifiedGround.get(key) ?? { pair, node: attached.node, count: 0, examples: [] };
            entry.count++; if (entry.examples.length < 2) entry.examples.push({ point: p, oldGap, newGap }); justifiedGround.set(key, entry); continue;
          }
          const category = Math.abs(newGap) <= .15 ? 'now-coplanar' : newGap < 0 ? 'reversed-order' : 'reduced-positive-headroom';
          const key = `${pair.join('/')}/${category}`, entry = regressions.get(key) || { pair, category, count: 0, minimumGap: Infinity, maximumGap: -Infinity, examples: [] };
          entry.count++; entry.minimumGap = Math.min(entry.minimumGap, newGap); entry.maximumGap = Math.max(entry.maximumGap, newGap);
          if (entry.examples.length < 2) entry.examples.push({ point: p, oldGap, newGap }); regressions.set(key, entry);
          if (failures.length < 100) failures.push({ pair, point: p, oldGap, newGap, upper: a, lower: b });
        }
      }
    }
  }
}
// Repeat clipping on the candidate's surviving finite ribbons. Removed old
// shoulder coverage is recorded separately; it cannot conceal a new low gap
// in the physical pavement which remains.
let newFinitePolygons = 0, newFiniteSamples = 0, newFiniteProtectedSamples = 0, newFiniteWithoutOldCoverage = 0;
const newFiniteFailures: any[] = [];
for (const pair of pairs.values()) {
  const [A, B] = pair.map(id => index('new', id)), [OA, OB] = pair.map(id => index('old', id));
  for (const ta of A.tris) {
    const candidates = new Set<number>();
    for (let x = Math.floor(Math.min(...ta.map(p => p[0])) / 40); x <= Math.floor(Math.max(...ta.map(p => p[0])) / 40); x++)
      for (let z = Math.floor(Math.min(...ta.map(p => p[2])) / 40); z <= Math.floor(Math.max(...ta.map(p => p[2])) / 40); z++)
        for (const k of B.cells.get(`${x},${z}`) ?? []) candidates.add(k);
    for (const k of candidates) {
      const tb = B.tris[k], poly = clip(ta.map(p => [p[0], p[2]]), tb.map(p => [p[0], p[2]])); if (poly.length < 3) continue;
      if (Math.abs(poly.reduce((v, p, i) => { const q = poly[(i + 1) % poly.length]; return v + p[0] * q[1] - p[1] * q[0]; }, 0)) / 2 < .025) continue;
      newFinitePolygons++;
      const centroid: XZ = [poly.reduce((v, p) => v + p[0], 0) / poly.length, poly.reduce((v, p) => v + p[1], 0) / poly.length];
      for (const p of [...poly, centroid]) {
        const ya = plane(ta, ...p), yb = plane(tb, ...p); if (ya === null || yb === null) continue; newFiniteSamples++;
        const oldA = heights(OA, p, ta), oldB = heights(OB, p, tb);
        if (!oldA.length || !oldB.length) { newFiniteWithoutOldCoverage++; continue; }
        const oldGap = Math.max(...oldA) - Math.min(...oldB); if (oldGap < 4.5 - 1e-5) continue; newFiniteProtectedSamples++;
        const newGap = ya - yb;
        if (newGap < Math.min(5.85, oldGap) - .05 && !(Math.abs(newGap) <= .03 && (allowed.get([...pair].sort().join('/')) ?? []).some(c => pointInside(c.polygon, p))))
          if (newFiniteFailures.length < 10000) newFiniteFailures.push({ pair, point: p, oldGap, newGap });
      }
    }
  }
}

if (process.argv[5]) writeFileSync(process.argv[5], JSON.stringify({ source: 'Independent source-node-attached finite overlap polygons; only coplanar differences within.03m are eligible', modelSha256: createHash('sha256').update(readFileSync(newFile)).digest('hex'), components: [...allowed.entries()].map(([pair, fragments]) => ({ pair, fragments })) }, null, 2));
const report = { scope: 'Independent old accepted finite-ribbon overlap vertices and centroid, changed model road pairs; no native/device claim', oldFile, newFile, oldModelSha256: createHash('sha256').update(readFileSync(oldFile)).digest('hex'), candidateModelSha256: createHash('sha256').update(readFileSync(newFile)).digest('hex'),
  sourceAttachedComponents: [...allowed.entries()].map(([pair, polygons]) => ({ pair, polygonFragments: polygons.length, nodes: [...new Set(polygons.map(p => p.node))] })), justifiedGround: [...justifiedGround.values()],
  oldAcceptedCrossings: crossings.length, changedRoads: changed.size, affectedOrderedPairs: pairs.size, polygons, samples, sameCoverage, missingBoundary, missingCentroid, minOld, minNew, regressionPairs: [...regressions.values()], failures, missing, coverageChanges: [...coverageChanges.values()], newFinitePolygons, newFiniteSamples, newFiniteProtectedSamples, newFiniteWithoutOldCoverage, newFiniteFailures };
writeFileSync(outFile, JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify({ ...report, regressionPairs: [...regressions.values()].map(r => ({ ...r, examples: r.examples.slice(0, 1) })), failures: failures.slice(0, 2), missing: missing.slice(0, 2) }, null, 2));
process.exitCode = failures.length || newFiniteFailures.length || missing.some(m => m.centroid && !m.narrowed) ? 1 : 0;
