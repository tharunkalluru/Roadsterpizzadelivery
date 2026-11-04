import test from 'node:test';
import assert from 'node:assert/strict';
import { applyModeledRoadNodePositions, applyTileRoadNodeTransports, roadNodeDisplacement, roadTransportMask, transportTileRoadNodes } from '../../src/world/road-node-transport';
import type { ModeledRoadNodes } from '../../src/world/road-node-transport';
import type { RoadEdge, XZ } from '../../src/world/types';

const source = (): RoadEdge => ({ id: 'side-street', seg: 'side-street', name: null, cls: 'residential', w: 6, lanes: 1, oneway: null,
  from: 'shifted', to: 'fixed', pts: [[0, 0], [20, 0], [60, 0]], elev: null, maxspeed: null });
const nodes: ModeledRoadNodes = { shifted: { before: [0, 0], after: [0, 4], delta: [0, 4] } };

test('the endpoint field is bounded and has zero endpoint derivative instead of snapping a side street', () => {
  assert.deepEqual(roadNodeDisplacement(0, 60, [0, 4], [0, 0]), [0, 4]);
  assert.deepEqual(roadNodeDisplacement(60, 60, [0, 4], [0, 0]), [0, 0]);
  const epsilon = .0001, at = roadNodeDisplacement(epsilon, 60, [0, 4], [0, 0]);
  assert.ok(Math.abs(at[1] - 4) / epsilon < .0001, 'start tangent is preserved');
  const end = roadNodeDisplacement(60 - epsilon, 60, [0, 0], [-3, 4]);
  assert.ok(Math.hypot(end[0] + 3, end[1] - 4) / epsilon < .0001, 'end tangent is preserved');
  for (let s = 0; s <= 60; s += .1) assert.ok(Math.hypot(...roadNodeDisplacement(s, 60, [3, 4], [-3, 4])) <= 5 + 1e-9);
});

test('side-street transport retains source controls, widths, levels and fixed far nodes without mutating source', () => {
  const e = source(), before = JSON.stringify(e), p = transportTileRoadNodes(e, nodes)!;
  assert.deepEqual(p.pts[0], [0, 4]); assert.deepEqual(p.pts.at(-1), [60, 0]);
  assert.ok(p.sourceXY.some(q => q[0] === 20 && q[1] === 0), 'preserve the actual source corner control');
  for (let i = 1; i < p.sourceArc.length; i++) assert.ok(p.sourceArc[i] - p.sourceArc[i - 1] <= 2 + 1e-9);
  assert.equal(p.elev, null); assert.equal(p.maximumDisplacement, 4);
  const applied = applyTileRoadNodeTransports([e], [p]);
  assert.deepEqual(applied.applied, [e.id]); assert.deepEqual(applied.mismatched, []);
  assert.equal(applied.roads[0].w, 6); assert.equal(applied.roads[0].lanes, 1); assert.equal(applied.roads[0].from, 'shifted');
  assert.equal(JSON.stringify(e), before);
});

test('source owners and compressed context copies use the identical transported geometry, while changed owners are rejected', () => {
  const owner = source(), p = transportTileRoadNodes(owner, nodes)!;
  const context = { ...owner, ctx: 1 } as RoadEdge & { ctx: number }; delete (context as Partial<RoadEdge>).lanes;
  const a = applyTileRoadNodeTransports([owner], [p]), b = applyTileRoadNodeTransports([context], [p]);
  assert.deepEqual(a.roads[0].pts, b.roads[0].pts); assert.deepEqual(b.mismatched, []); assert.equal((b.roads[0] as typeof context).ctx, 1);
  const changed = { ...owner, pts: [[0, 0], [21, 0], [60, 0]] as XZ[] };
  assert.deepEqual(applyTileRoadNodeTransports([changed], [p]).mismatched, [owner.id]);
  const missingOwnerMetadata = { ...owner }; delete (missingOwnerMetadata as Partial<RoadEdge>).lanes;
  assert.deepEqual(applyTileRoadNodeTransports([missingOwnerMetadata], [p]).mismatched, [owner.id]);
});

test('canonical transport corridors stay fixed and invalid source nodes or excessive shifts are rejected', () => {
  const mask = roadTransportMask([{ pts: [[30, -100], [30, 100]] }], []);
  assert.equal(mask([30, 0]), 0); assert.equal(mask([0, 0]), 1);
  const p = transportTileRoadNodes(source(), nodes, mask)!;
  const atRail = p.sourceXY.findIndex(q => q[0] === 30 && q[1] === 0);
  assert.ok(atRail >= 0); assert.deepEqual(p.pts[atRail], [30, 0]);
  assert.throws(() => transportTileRoadNodes(source(), { shifted: { before: [1, 0], after: [1, 4], delta: [0, 4] } }), /bind tile source/);
  assert.throws(() => transportTileRoadNodes(source(), { shifted: { before: [0, 0], after: [0, 6], delta: [0, 6] } }), /bind tile source/);
});

test('junction caps and furniture receive the same endpoint map without moving unrelated or changed source nodes', () => {
  const sourceNodes: Record<string, XZ> = { shifted: [0, 0], fixed: [60, 0] }, before = JSON.stringify(sourceNodes);
  const result = applyModeledRoadNodePositions(sourceNodes, nodes);
  assert.deepEqual(result.nodes.shifted, [0, 4]); assert.deepEqual(result.nodes.fixed, [60, 0]);
  assert.deepEqual(result.mismatched, []); assert.equal(JSON.stringify(sourceNodes), before);
  assert.deepEqual(applyModeledRoadNodePositions({ shifted: [1, 0] }, nodes).mismatched, ['shifted']);
});
