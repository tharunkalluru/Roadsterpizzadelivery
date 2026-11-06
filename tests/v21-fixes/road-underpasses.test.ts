import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { prepareRoadUnderpasses, underpassRamp, ROAD_UNDERPASS_SITES, ROAD_UNDERPASS_MAX_GRADE, type RoadUnderpassSite } from '../../src/world/road-underpasses';
import { prepareRoadGrades, applyRoadGradePatches } from '../../src/world/road-grades';
import { roadRibbon } from '../../src/world/bridge-clearance';
import { roadQuadHeight, type RoadQuad } from '../../src/world/road-surface';
import type { RoadEdge, XZ } from '../../src/world/types';

function road(id: string, name: string, pts: XZ[], y = 0, w = 10): RoadEdge {
  return { id, seg: id, name, pts, elev: pts.map(() => y), cls: 'primary', lanes: 2, w, from: id + ':start', to: id + ':end', oneway: 'forward', maxspeed: 50 };
}
const site: RoadUnderpassSite = { id: 'fixture', name: 'Fixture Underpass', lowerIds: ['lower'], upperIds: ['upper'], sourceURL: 'fixture', opened: '2018-01-03' };
function maxGrade(e: RoadEdge) {
  let value = 0;
  for (let i = 1; i < e.pts.length; i++) {
    const length = Math.hypot(e.pts[i][0] - e.pts[i - 1][0], e.pts[i][1] - e.pts[i - 1][1]);
    if (length > 1e-8) value = Math.max(value, Math.abs(e.elev![i] - e.elev![i - 1]) / length);
  }
  return value;
}
test('verified road underpasses descend smoothly while the crossing road and connected portal joins stay at ground', () => {
  const lower = road('lower', site.name, [[-300, 0], [-100, 0], [0, 0], [90, 0], [300, 0]]);
  const upper = road('upper', 'Cross street', [[0, -200], [0, 200]]);
  const approach = { ...road('approach', 'Approach', [[-400, 0], [-300, 0]]), to: lower.from };
  const source = [lower, upper, approach], before = JSON.stringify(source), out = prepareRoadUnderpasses(source, [site]);
  assert.equal(JSON.stringify(source), before, 'source geometry/heights are immutable');
  assert.equal(out.report.changedRoads, 1); assert.equal(out.report.unresolved.length, 0);
  assert.equal(out.roads[1], upper); assert.equal(out.roads[2], approach);
  const repaired = out.roads[0]; assert.ok(Math.min(...repaired.elev!) < -6);
  assert.equal(repaired.elev![0], 0); assert.equal(repaired.elev!.at(-1), 0);
  assert.equal(repaired.from, approach.to); assert.equal(repaired.oneway, lower.oneway);
  for (const p of lower.pts) assert.ok(repaired.pts.some(q => p[0] === q[0] && p[1] === q[1]), 'every original plan vertex survives');
  assert.ok(maxGrade(repaired) <= ROAD_UNDERPASS_MAX_GRADE);
  assert.ok(repaired.elev![1] > -.001, 'portal begins with an eased gradient');
  assert.deepEqual(applyRoadGradePatches(source, out.changes), out.roads, 'the same patch drives worker geometry and core physics');
});

test('slope easing is continuous at both ramp ends without a jump in speed or road height', () => {
  const run = 150, h = .0001;
  for (const x of [0, 20, 130, 150]) {
    const left = (underpassRamp(x, run) - underpassRamp(x - h, run)) / h;
    const right = (underpassRamp(x + h, run) - underpassRamp(x, run)) / h;
    assert.ok(Math.abs(left - right) < 1e-5, `continuous slope at ${x}`);
  }
  assert.equal(underpassRamp(-1, run), 0); assert.equal(underpassRamp(run + 1, run), 6.4);
});

test('identity mismatch, insufficient ramp length and protected profiles are reported without changing neighboring roads', () => {
  const upper = road('upper', 'Cross street', [[0, -200], [0, 200]]);
  for (const lower of [road('lower', 'Wrong place', [[-300, 0], [300, 0]]), road('lower', site.name, [[-30, 0], [30, 0]]),
    { ...road('lower', site.name, [[-300, 0], [300, 0]]), elevationSource: 'survey' }, road('lower', site.name, [[-300, 0], [300, 0]], 4)]) {
    const source = [lower, upper], out = prepareRoadUnderpasses(source, [site]);
    assert.equal(out.roads, source); assert.equal(out.changes.length, 0); assert.equal(out.report.unresolved.length, 1);
  }
  const unknown = prepareRoadUnderpasses([road('unverified', 'Unverified Underpass', [[-300, 0], [300, 0]]), upper]);
  assert.equal(unknown.changes.length, 0, 'a generic name must not create an invented city underpass');
});

function intersect(a: XZ[], b: XZ[]): XZ[] {
  const cross = (a: XZ, b: XZ, p: XZ) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  const sign = Math.sign(cross(b[0], b[1], b[2])); if (!sign) return [];
  for (let i = 0; i < b.length && a.length; i++) {
    const out: XZ[] = [], p = b[i], q = b[(i + 1) % b.length];
    for (let j = 0; j < a.length; j++) {
      const u = a[j], v = a[(j + 1) % a.length], du = sign * cross(p, q, u), dv = sign * cross(p, q, v);
      if (du >= -1e-7) out.push(u);
      if ((du >= 0) !== (dv >= 0)) { const t = du / (du - dv); out.push([u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t]); }
    }
    a = out;
  }
  return a;
}
function overlapVertices(a: RoadQuad, b: RoadQuad) {
  const vertices: XZ[] = [];
  if (Math.max(...a.map(p => p[0])) < Math.min(...b.map(p => p[0])) || Math.min(...a.map(p => p[0])) > Math.max(...b.map(p => p[0])) ||
    Math.max(...a.map(p => p[2])) < Math.min(...b.map(p => p[2])) || Math.min(...a.map(p => p[2])) > Math.max(...b.map(p => p[2]))) return vertices;
  for (const ai of [[0, 1, 2], [0, 2, 3]]) for (const bi of [[0, 1, 2], [0, 2, 3]]) {
    const p = intersect(ai.map(i => [a[i][0], a[i][2]]), bi.map(i => [b[i][0], b[i][2]]));
    if (p.length >= 3) vertices.push(...p);
  }
  return vertices;
}
test('all four shipped GHMC lower carriageways gain finite headroom and leave actual flyovers/exterior roads unchanged', t => {
  const core = JSON.parse(gunzipSync(readFileSync('public/city/core.pack.wasm')).toString());
  const before = prepareRoadGrades(core.roads), out = prepareRoadUnderpasses(before), changed = new Set(out.changes.map(e => e.id));
  assert.equal(out.report.sites, 3); assert.equal(out.report.changedRoads, 4); assert.deepEqual(out.report.unresolved, []);
  assert.deepEqual([...changed].sort(), ROAD_UNDERPASS_SITES.flatMap(s => [...s.lowerIds]).sort());
  assert.deepEqual(out.roads.map(e => e.id), before.map(e => e.id));
  const byId = new Map(out.roads.map(e => [e.id, e])); let inspected = 0, gap = Infinity;
  for (let i = 0; i < before.length; i++) {
    if (!changed.has(before[i].id)) assert.equal(out.roads[i], before[i]);
    else {
      const e = out.roads[i]; assert.ok(maxGrade(e) <= ROAD_UNDERPASS_MAX_GRADE + 1e-8);
      assert.equal(e.elev![0], 0); assert.equal(e.elev!.at(-1), 0);
      assert.equal(e.from, before[i].from); assert.equal(e.to, before[i].to);
      for (const p of before[i].pts) assert.ok(e.pts.some(q => p[0] === q[0] && p[1] === q[1]));
    }
  }
  for (const site of ROAD_UNDERPASS_SITES) for (const id of site.lowerIds) {
    const lower = roadRibbon(byId.get(id)!, out.roads);
    for (const upperId of site.upperIds) {
      const upper = roadRibbon(byId.get(upperId)!, out.roads);
      for (const a of lower.quads) for (const b of upper.quads) for (const p of overlapVertices(a, b)) {
        const low = roadQuadHeight(a, ...p), high = roadQuadHeight(b, ...p);
        if (low === null || high === null) continue;
        inspected++; gap = Math.min(gap, high - low);
        assert.ok(high - low >= 6.2, `${site.id} finite road envelopes need headroom, got ${high - low}`);
      }
    }
  }
  assert.ok(inspected > 100); t.diagnostic(`${inspected} finite-overlap vertices, minimum surface gap ${gap.toFixed(3)}m`);
  const again = prepareRoadUnderpasses(out.roads); assert.equal(again.roads, out.roads); assert.equal(again.changes.length, 0);
  assert.equal(prepareRoadUnderpasses(before), out, 'repeated startup query reuses the prepared result');
});
