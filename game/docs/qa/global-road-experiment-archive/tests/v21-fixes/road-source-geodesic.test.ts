import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import dataJSON from '../../src/world/road-source-geodesic-data.json';
import { applyVerifiedSourceRoadGeometry, applyVerifiedSourceRoadZone, sourceRoadDistanceAfter, sourceRoadGeometryErrors } from '../../src/world/road-source-geodesic';
import type { VerifiedSourceRoadGeometry, SourceRoadCutRepair } from '../../src/world/road-source-geodesic';
import type { RoadEdge, XZ } from '../../src/world/types';

const data = dataJSON as unknown as VerifiedSourceRoadGeometry;
const road = (p: SourceRoadCutRepair): RoadEdge => ({ seg: p.sourceSegmentID, name: 'unchanged business frontage', maxspeed: 60, ...structuredClone(p.expected) } as RoadEdge);
const distance = (a: XZ, b: XZ) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const keys = ['id', 'seg', 'name', 'cls', 'w', 'lanes', 'oneway', 'from', 'to', 'maxspeed'] as const;

test('source repair is a bounded 50-cut,136-road dataset with every actual incident copy accounted for', () => {
  assert.deepEqual(sourceRoadGeometryErrors(data), []);
  assert.equal(Object.keys(data.nodes).length, 50);
  assert.equal(data.roads.length, 136);
  assert.equal(data.roads.reduce((sum, p) => sum + p.copies.length, 0), 267);
  assert.equal(data.roads.filter(p => p.copies.some(c => c.kind === 'core')).length, 88);
  assert.equal(Object.keys(data.sourcePackSHA256).length, 24);
  assert.equal(data.sources.length, 84);
  for (const [id, node] of Object.entries(data.nodes)) {
    assert.equal(node.connectorID.length, 36);
    const incidents = data.roads.filter(p => p.expected.from === id || p.expected.to === id);
    assert.deepEqual(incidents.map(p => p.id).sort(), node.incidentRoadIDs);
    for (const p of incidents) assert.deepEqual(p.pts[p.expected.from === id ? 0 : p.pts.length - 1], node.after);
  }
});

test('the P.V.Narasimha Rao source cut is resegmented coherently through all three adjacent pieces', () => {
  const a = data.roads.find(p => p.id === '370065ed-0cb_0')!;
  const b = data.roads.find(p => p.id === '370065ed-0cb_1')!;
  const c = data.roads.find(p => p.id === '370065ed-0cb_2')!;
  const side = data.roads.find(p => p.id === 'd17394f6-d0c_0')!;
  assert.ok(distance(a.expected.pts.at(-1)!, a.pts.at(-1)!) > 13, 'source evidence, beyond the5m inferred-field limit');
  assert.deepEqual(a.pts.at(-1), b.pts[0]);
  assert.deepEqual(a.pts.at(-1), side.pts.at(-1));
  assert.deepEqual(b.pts.at(-1), c.pts[0]);
  assert.deepEqual(a.pts[0], a.expected.pts[0], 'unselected geographic cut remains fixed');
  assert.deepEqual(c.pts.at(-1), c.expected.pts.at(-1));
  assert.equal(a.sourceFractions.at(-1), .645560836);
  assert.equal(b.sourceFractions[0], .645560836);
  assert.equal(b.sourceFractions.at(-1), .668857076);
  assert.equal(c.sourceFractions[0], .668857076);
  assert.notEqual(a.cuts.actualBefore[1], a.cuts.declared[1]);
});

test('every source interior vertex survives on its true interval, rather than warping an endpoint field', () => {
  const origin = data.origin, kx = Math.cos(origin.lat * Math.PI / 180) * origin.NR * Math.PI / 180, kz = origin.MR * Math.PI / 180;
  for (const p of data.roads) {
    const source = data.sources.find(s => s.id === p.sourceSegmentID)!;
    for (let i = 0; i < source.geometryLonLat.length; i++) {
      const f = source.vertexFractions[i];
      if ((f - p.cuts.actualAfter[0]) * source.geodeticLengthM <= .001 || (p.cuts.actualAfter[1] - f) * source.geodeticLengthM <= .001) continue;
      const [lon, lat] = source.geometryLonLat[i], expected: XZ = [(lon - origin.lon) * kx, -(lat - origin.lat) * kz];
      assert.ok(p.pts.some(q => distance(q, expected) < 2e-6), `${p.id} preserves source vertex ${i}`);
    }
    assert.ok(p.sourceFractions.every((f, i) => i === 0 || f > p.sourceFractions[i - 1]));
    assert.ok(p.sourceArc.every((f, i) => i === 0 || f > p.sourceArc[i - 1]));
    assert.ok(p.correctedArc.every((f, i) => i === 0 || f > p.correctedArc[i - 1]));
  }
});

test('all owner/context copies receive identical geometry without changing road identity, lanes or one-way rules', () => {
  for (const p of data.roads) for (const copy of p.copies) {
    const input = road(p);
    if (copy.context) {
      (input as RoadEdge & { ctx?: number }).ctx = 1;
      delete (input as Partial<RoadEdge>).lanes;
    }
    const before = structuredClone(input), output = applyVerifiedSourceRoadGeometry([input], data);
    assert.deepEqual(output.mismatched, []);
    assert.deepEqual(output.applied, [p.id]);
    assert.deepEqual(output.roads[0].pts, p.pts);
    for (const key of keys) assert.deepEqual(output.roads[0][key], before[key]);
    assert.deepEqual(input, before, 'raw pack object is immutable');
    output.roads[0].pts[0][0] += 1;
    assert.notEqual(output.roads[0].pts[0][0], p.pts[0][0], 'runtime cannot mutate the retained dataset');
  }
});

test('source normalization is atomic, idempotent and leaves business XZ, canonical rail/metro and unrelated roads intact', () => {
  const roads = data.roads.map(road), unrelated = { ...road(data.roads[0]), id: 'unrelated', from: 'outside-from', to: 'outside-to' }; roads.push(unrelated);
  const nodes = Object.fromEntries(Object.entries(data.nodes).map(([id, p]) => [id, [...p.before[0]] as XZ]));
  const source = { roads, nodes, food: [{ stop: [100, 200, 3, 'shop'] }], metro: { pts: [[1, 2], [3, 4]] }, railway: { pts: [[5, 6], [7, 8]] }, landmark: { p: [9, 10] } };
  const before = structuredClone(source), first = applyVerifiedSourceRoadZone(source, data);
  assert.deepEqual(first.report.mismatched, []);
  assert.equal(first.report.applied.length, 136);
  assert.equal(first.report.nodesApplied.length, 50);
  assert.equal(first.value.roads.at(-1), unrelated);
  for (const key of ['food', 'metro', 'railway', 'landmark'] as const) assert.equal(first.value[key], source[key]);
  assert.deepEqual(source, before);
  const repeated = applyVerifiedSourceRoadZone(first.value, data);
  assert.equal(repeated.value, first.value);
  assert.equal(repeated.report.applied.length, 0);
  assert.equal(repeated.report.alreadyApplied.length, 136);
  assert.equal(repeated.report.nodesAlreadyApplied.length, 50);
  const changed = structuredClone(source); changed.roads[1].oneway = changed.roads[1].oneway === 'forward' ? 'backward' : 'forward';
  const rejected = applyVerifiedSourceRoadZone(changed, data);
  assert.equal(rejected.value, changed);
  assert.deepEqual(rejected.report.applied, []);
  assert.ok(rejected.report.mismatched.includes(changed.roads[1].id));
  const badNode = structuredClone(source), id = Object.keys(badNode.nodes)[0]; badNode.nodes[id][0] += .2;
  assert.equal(applyVerifiedSourceRoadZone(badNode, data).value, badNode);
});

test('source repair keeps inherited height endpoints and relative vertical source ranges separate', () => {
  for (const p of data.roads) {
    assert.equal(p.elev === null, p.expected.elev === null);
    for (const index of [0, -1]) assert.equal(p.elev?.at(index) ?? 0, p.expected.elev?.at(index) ?? 0, 'XY normalization does not solve the300height gaps');
  }
  const source = data.sources.find(s => s.id.startsWith('370065ed'))!;
  assert.ok(source.levelRules, 'real bridge source metadata is retained');
  const negative = structuredClone(data), patch = negative.roads[0];
  patch.expected.elev = patch.expected.pts.map(() => -2); patch.elev = patch.pts.map(() => -2);
  const output = applyVerifiedSourceRoadGeometry([road(patch)], negative);
  assert.deepEqual(output.mismatched, []);
  assert.ok(output.roads[0].elev!.every(y => y === -2), 'no flattening of inherited negative profiles');
});

test('ambiguous/malformed bindings and owner metadata loss fail closed', () => {
  const raw = road(data.roads[0]), missing = { ...raw }; delete (missing as Partial<RoadEdge>).lanes;
  assert.deepEqual(applyVerifiedSourceRoadGeometry([missing], data).mismatched, [missing.id]);
  const bad = structuredClone(data); bad.roads[0].sourceFractions[1] = bad.roads[0].sourceFractions[0];
  const result = applyVerifiedSourceRoadGeometry([raw], bad);
  assert.equal(result.roads[0], raw); assert.equal(result.applied.length, 0); assert.ok(result.mismatched.length);
  const duplicate = structuredClone(data); duplicate.roads.push(duplicate.roads[0]);
  assert.ok(sourceRoadGeometryErrors(duplicate).length);
  const badPosition = structuredClone(data); Object.values(badPosition.nodes)[0].after[0] += 1;
  assert.ok(sourceRoadGeometryErrors(badPosition).some(error => error.startsWith('source-node-position:')));
  const malformed = structuredClone(data); (Object.values(malformed.nodes)[0] as unknown as {after: null}).after = null;
  assert.doesNotThrow(() => sourceRoadGeometryErrors(malformed));
  assert.ok(sourceRoadGeometryErrors(malformed).length);
});

test('edge-relative route distance mapping distinguishes trimmed positions from geography', () => {
  const trimmed = data.roads.find(p => p.sourceArc[0] > .1 || p.sourceArc.at(-1)! < p.expected.pts.slice(1).reduce((sum, point, i) => sum + distance(point, p.expected.pts[i]), 0) - .1)!;
  assert.ok(trimmed);
  const at = sourceRoadDistanceAfter(trimmed, trimmed.sourceArc[0]);
  assert.equal(at.distance, 0); assert.equal(at.clipped, false);
  assert.equal(sourceRoadDistanceAfter(trimmed, trimmed.sourceArc[0] - 1).clipped, true);
  assert.throws(() => sourceRoadDistanceAfter(trimmed, NaN));
});

test('a missing or stale incident arm rejects the entire road/node update', () => {
  const roads = data.roads.map(road), nodes = Object.fromEntries(Object.entries(data.nodes).map(([id, p]) => [id, [...p.before[0]] as XZ]));
  const stale = { ...road(data.roads[0]), id: 'unreviewed-incident-road' };
  const source = { roads: [...roads, stale], nodes }, rejected = applyVerifiedSourceRoadZone(source, data);
  assert.equal(rejected.value, source);
  assert.equal(rejected.report.applied.length, 0); assert.equal(rejected.report.nodesApplied.length, 0);
  assert.ok(rejected.report.mismatched.some(s => s.startsWith('incident:unreviewed-incident-road:')));
  const incomplete = structuredClone(data), removed = incomplete.roads.shift()!;
  for (const node of Object.values(incomplete.nodes)) node.incidentRoadIDs = node.incidentRoadIDs.filter(id => id !== removed.id);
  assert.deepEqual(sourceRoadGeometryErrors(incomplete), [], 'structurally valid partial payload still needs supplied-incidence validation');
  const partial = applyVerifiedSourceRoadZone({ roads, nodes }, incomplete);
  assert.equal(partial.report.applied.length, 0); assert.equal(partial.report.nodesApplied.length, 0);
  assert.ok(partial.report.mismatched.some(s => s.startsWith(`incident:${removed.id}:`)));
});

test('the one-cut extension retains all prior reviewed roads and handles the distinct f4ca owner endpoint faithfully', () => {
  const previous = JSON.parse(readFileSync('docs/qa/evidence/reported-roads/geodetic-source-repair-20261103/source-data-generation-07769824130acb1081023a8130b50c2beef979d72e18829183aefccd6e6c04f9.json', 'utf8')) as VerifiedSourceRoadGeometry;
  for (const p of previous.roads) assert.deepEqual(data.roads.find(q => q.id === p.id), p);
  for (const [id, node] of Object.entries(previous.nodes)) assert.deepEqual(data.nodes[id], node);
  assert.deepEqual(data.roads.filter(p => !previous.roads.some(q => q.id === p.id)).map(p => p.id).sort(), ['5a23ce42-637_0', '5a23ce42-637_1', 'f4ca0bc7-9b6_0']);
  const owner = data.roads.find(p => p.id === 'f4ca0bc7-9b6_0')!, arterial = data.roads.find(p => p.id === '5a23ce42-637_0')!;
  assert.deepEqual(owner.expected.pts[0], [-14420.4, -5596]);
  assert.deepEqual(arterial.expected.pts.at(-1), [-14420.1, -5595.8]);
  assert.deepEqual(owner.pts[0], arterial.pts.at(-1));
  assert.deepEqual(owner.pts.at(-1), owner.expected.pts.at(-1));
  assert.deepEqual(owner.copies, [{ kind: 'tile', pack: 'packs/p-5_-2.pack.wasm', tile: '-15_-6', context: false }]);
  assert.equal(owner.expected.lanes, 1); assert.equal(owner.expected.w, 4.5); assert.equal(owner.expected.oneway, null);
});
