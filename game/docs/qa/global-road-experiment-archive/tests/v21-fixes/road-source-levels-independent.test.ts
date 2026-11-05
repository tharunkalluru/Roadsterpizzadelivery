import test from 'node:test';
import assert from 'node:assert/strict';
import sourceJSON from '../../src/world/road-source-geodesic-data.json';
import mapped from '../../src/world/bridge-level-data.json';
import { mappedRoadLevels } from '../../src/world/road-crossing-levels';
import type { VerifiedSourceRoadGeometry } from '../../src/world/road-source-geodesic';
import type { RoadEdge, XZ } from '../../src/world/types';

const source = sourceJSON as unknown as VerifiedSourceRoadGeometry;
const pairs = source.roads.flatMap(p => {
  const record = mapped.roads.find(e => e.id === p.id);
  return record ? [{ patch: p, record }] : [];
});
const makeRoad = (p: typeof source.roads[number], pts: XZ[]): RoadEdge => ({ ...structuredClone(p.expected),
  seg: p.sourceSegmentID, name: null, maxspeed: null, pts: structuredClone(pts), elev: null } as RoadEdge);

test('source resegmentation preserves geographically witnessed bridge floors at their new point indices', () => {
  assert.equal(pairs.length, 2, 'Exact source-repair/bridge-evidence intersection is bounded');
  let checked = 0, changedIndices = 0;
  for (const { patch, record } of pairs) {
    const road = makeRoad(patch, patch.pts), output = mappedRoadLevels([road]).roads[0];
    for (const [oldIndex, x, z, floor] of record.points) {
      let nearest = -1, distance = Infinity;
      road.pts.forEach((p, i) => { const d = Math.hypot(p[0] - x, p[1] - z); if (d < distance) { distance = d; nearest = i; } });
      if (distance > .15) continue; // This control is on a source segment, not an exact retained vertex.
      assert.ok((output.elev?.[nearest] ?? 0) >= floor - 1e-9,
        `${road.id}: witnessed floor at (${x},${z}) moved index ${oldIndex}→${nearest}`);
      checked++; changedIndices += Number(nearest !== oldIndex);
    }
    assert.equal(road.elev, null, 'Floor mapping does not mutate source input');
  }
  assert.equal(checked, 19); assert.equal(changedIndices, 18);
});

test('legacy bridge bindings stay intact and shifted lookalike geometry cannot inherit their floors', () => {
  for (const { patch, record } of pairs) {
    const legacy = makeRoad(patch, patch.expected.pts), mappedLegacy = mappedRoadLevels([legacy]).roads[0];
    for (const [index, , , floor] of record.points) assert.ok((mappedLegacy.elev?.[index] ?? 0) >= floor);
    for (const pts of [patch.expected.pts, patch.pts]) {
      const changed = makeRoad(patch, pts.map(([x, z]) => [x + 1, z + 1]));
      assert.equal(mappedRoadLevels([changed]).points, 0, 'Unknown geographic geometry is never matched by an old array index');
    }
  }
});
