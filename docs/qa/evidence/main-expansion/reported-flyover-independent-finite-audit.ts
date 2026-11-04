import { readFileSync, writeFileSync } from 'node:fs';
import { roadRibbon } from '../../../../src/world/bridge-clearance';
import type { RoadEdge, XZ } from '../../../../src/world/types';

const oldFile = process.argv[2], newFile = process.argv[3], outFile = process.argv[4];
const before = JSON.parse(readFileSync(oldFile, 'utf8')), after = JSON.parse(readFileSync(newFile, 'utf8'));
const oldRoads: RoadEdge[] = before.roads, newRoads: RoadEdge[] = after.roads;
const oldById = new Map(oldRoads.map(e => [e.id, e])), newById = new Map(newRoads.map(e => [e.id, e]));
const crossings: { roads: [string, string]; x: number; z: number }[] = before.report.bridgeClearance.crossings;
const changed = new Set(oldRoads.filter(e => {
  const n = newById.get(e.id); return !n || JSON.stringify([e.w, e.cls, e.pts, e.elev]) !== JSON.stringify([n.w, n.cls, n.pts, n.elev]);
}).map(e => e.id));
type P = [number, number, number]; type Tri = [P, P, P];
interface Index { tris: Tri[]; cells: Map<string, number[]> }
const indices = new Map<string, Index>();
function index(which: 'old' | 'new', id: string) {
  const key = `${which}:${id}`; const cached = indices.get(key); if (cached) return cached;
  const roads = which === 'old' ? oldRoads : newRoads, road = (which === 'old' ? oldById : newById).get(id)!;
  const result: Index = { tris: [], cells: new Map() };
  for (const q of roadRibbon(road, roads).quads) for (const k of [[0, 1, 2], [0, 2, 3]]) {
    const tri = k.map(i => q[i]) as Tri, number = result.tris.length; result.tris.push(tri);
    for (let x = Math.floor(Math.min(...tri.map(p => p[0])) / 40); x <= Math.floor(Math.max(...tri.map(p => p[0])) / 40); x++)
      for (let z = Math.floor(Math.min(...tri.map(p => p[2])) / 40); z <= Math.floor(Math.max(...tri.map(p => p[2])) / 40); z++) {
        const cell = `${x},${z}`; (result.cells.get(cell) || result.cells.set(cell, []).get(cell)!).push(number);
      }
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
function heights(i: Index, p: XZ) {
  return (i.cells.get(`${Math.floor(p[0] / 40)},${Math.floor(p[1] / 40)}`) || []).flatMap(k => {
    const y = plane(i.tris[k], p[0], p[1]); return y === null ? [] : [y];
  });
}
const pairs = new Map<string, [string, string]>();
for (const c of crossings) if (c.roads.some(id => changed.has(id))) pairs.set(c.roads.join('/'), c.roads);
let polygons = 0, samples = 0, sameCoverage = 0, missingBoundary = 0, missingCentroid = 0, minOld = Infinity, minNew = Infinity;
const failures: any[] = [], missing: any[] = [];
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
        const oldGap = ya - yb, a = heights(NA, p), b = heights(NB, p); samples++; minOld = Math.min(minOld, oldGap);
        if (!a.length || !b.length) {
          if (n === poly.length) missingCentroid++; else missingBoundary++;
          if (missing.length < 25) missing.push({ pair, point: p, centroid: n === poly.length, oldGap, upperAvailable: !!a.length, lowerAvailable: !!b.length }); continue;
        }
        sameCoverage++; const newGap = Math.min(...a) - Math.max(...b); minNew = Math.min(minNew, newGap);
        if (newGap < Math.min(5.85, oldGap) - .05) {
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
const report = { scope: 'Independent old accepted finite-ribbon overlap vertices and centroid, changed model road pairs; no native/device claim', oldFile, newFile,
  oldAcceptedCrossings: crossings.length, changedRoads: changed.size, affectedOrderedPairs: pairs.size, polygons, samples, sameCoverage, missingBoundary, missingCentroid, minOld, minNew, regressionPairs: [...regressions.values()], failures, missing };
writeFileSync(outFile, JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify({ ...report, regressionPairs: [...regressions.values()].map(r => ({ ...r, examples: r.examples.slice(0, 1) })), failures: failures.slice(0, 2), missing: missing.slice(0, 2) }, null, 2));
process.exitCode = failures.length || missingCentroid ? 1 : 0;
