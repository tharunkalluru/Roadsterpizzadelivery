import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { prepareRoadGrades, roadGradeReport } from '../../src/world/road-grades';
import { roadRibbon } from '../../src/world/bridge-clearance';
import { roadQuadHeight } from '../../src/world/road-surface';
import type { CoreData, XZ } from '../../src/world/types';

const core: CoreData = JSON.parse(gunzipSync(readFileSync('public/city/core.pack.wasm')).toString());
const model = prepareRoadGrades(core.roads), report = roadGradeReport(model)!, byId = new Map(model.map(e => [e.id, e]));
const cross = (a: XZ, b: XZ, p: XZ) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
function overlap(a: XZ[], b: XZ[]) {
  const sign = Math.sign(cross(b[0], b[1], b[2])); if (!sign) return [];
  for (let i = 0; i < 3 && a.length; i++) {
    const out: XZ[] = [], p = b[i], q = b[(i + 1) % 3];
    for (let j = 0; j < a.length; j++) {
      const u = a[j], v = a[(j + 1) % a.length], du = sign * cross(p, q, u), dv = sign * cross(p, q, v);
      if (du >= -1e-8) out.push(u);
      if ((du >= 0) !== (dv >= 0)) { const t = du / (du - dv); out.push([u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t]); }
    }
    a = out;
  }
  return a;
}

test('citywide repaired modeled ground merges retain source alignment and one finite asphalt plane through the actual overlap', t => {
  let samples = 0, maximumDifference = 0;
  const joins = report.joinedApproaches!; assert.ok(joins.pairs > 0);
  assert.ok(joins.repairs.some(r => r.node === 'd6ba3a6d-36c' && r.roads.includes('23427c8c-e37_0')), 'the reported Tarnaka junction is repaired');
  for (const repair of joins.repairs) {
    const roads = repair.roads.map(id => byId.get(id)!);
    for (const e of roads) {
      const original = core.roads.find(r => r.id === e.id)!;
      assert.deepEqual([e.from, e.to, e.joinedPavement?.sourceWidth??e.w, e.oneway], [original.from, original.to, original.w, original.oneway]);
      for (const p of original.pts) assert.ok(e.pts.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-7), `${e.id}: retain every original XY control`);
    }
    const at = roads[0].from === repair.node ? roads[0].pts[0] : roads[0].pts.at(-1)!;
    const quads = roads.map(e => roadRibbon(e, model).quads.filter(q => q.some(p => Math.hypot(p[0] - at[0], p[2] - at[1]) < 140)));
    const distanceFromNode = (road: typeof roads[number], x: number, z: number) => {
      let distance = 0, best = Infinity, along = 0;
      for (let i = 1; i < road.pts.length; i++) {
        const a = road.pts[i - 1], b = road.pts[i], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz), u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (length * length || 1)));
        const d = Math.hypot(x - a[0] - dx * u, z - a[1] - dz * u);
        if (d < best) { best = d; along = distance + length * u; } distance += length;
      }
      return road.from === repair.node ? along : distance - along;
    };
    let joinedSamples = 0;
    for (const a of quads[0]) for (const b of quads[1]) {
      if (Math.max(...a.map(p => p[0])) < Math.min(...b.map(p => p[0])) || Math.max(...b.map(p => p[0])) < Math.min(...a.map(p => p[0])) || Math.max(...a.map(p => p[2])) < Math.min(...b.map(p => p[2])) || Math.max(...b.map(p => p[2])) < Math.min(...a.map(p => p[2]))) continue;
      for (const ai of [[0, 1, 2], [0, 2, 3]]) for (const bi of [[0, 1, 2], [0, 2, 3]]) {
        const poly = overlap(ai.map(i => [a[i][0], a[i][2]]), bi.map(i => [b[i][0], b[i][2]]));
        if (poly.length < 3) continue;
        const area = Math.abs(poly.reduce((v, p, i) => { const q = poly[(i + 1) % poly.length]; return v + p[0] * q[1] - p[1] * q[0]; }, 0)) / 2;
        if (area < .0001) continue;
        for (const [x, z] of poly) {
          // This is the connected merge at its node. The same source pair can
          // cross again farther along after these carriageways have diverged.
          if (roads.some((e, i) => distanceFromNode(e, x, z) > repair.runs[i] + 1e-6)) continue;
          const ya = roadQuadHeight(a, x, z), yb = roadQuadHeight(b, x, z); if (ya === null || yb === null) continue;
          const difference = Math.abs(ya - yb); maximumDifference = Math.max(maximumDifference, difference); joinedSamples++; samples++;
          assert.ok(difference < .03, `${repair.roads.join('/')}: intersecting pavement at ${x},${z}: ${ya}/${yb}`);
        }
      }
    }
    assert.ok(joinedSamples > 0, `${repair.node}: exercise its actual finite overlap`);
  }
  assert.equal(report.modelSteepSegments, 0); assert.equal(report.joinedEndpointMaxDifference, 0); assert.ok(report.minCrossingSeparation >= 5.849);
  t.diagnostic(JSON.stringify({ repairedPairs: joins.pairs, repairedRoads: joins.roads, retainedControls: joins.fixedPoints, maximumRun: joins.maximumRun, samples, maximumDifference, unresolved: joins.unresolved.length }));
});
