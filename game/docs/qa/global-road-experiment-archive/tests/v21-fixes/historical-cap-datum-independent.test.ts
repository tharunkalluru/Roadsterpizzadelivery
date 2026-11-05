import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const load = (file: string, expected: string) => { const bytes = readFileSync(file); assert.equal(createHash('sha256').update(bytes).digest('hex'), expected); return JSON.parse(bytes.toString()); };
const replay = () => load('docs/qa/evidence/reported-roads/historical-cap-datum-independent-9413-20261103-v2.json', '582052cbea5477c9bf2e889cd74b6f38614997b30753d2cc9609313ee7915d9e');

test('literal historical mixed-class cap film removes a real17mm false structural layer', () => {
  const r = replay(), rows = r.results.filter((x: any) => x.road === '9cf108b9-a5e_0'); assert.equal(rows.length, 5);
  for (const witness of rows) {
    const strip = witness.sourceBoundRows.find((s: any) => !s.triangulatedPatch), cap = witness.sourceBoundRows.find((s: any) => s.triangulatedPatch);
    assert.equal(strip.paintLift, .045); assert.equal(cap.paintLift, .062);
    assert.ok(Math.abs(cap.wrongOwnClassNormalization - strip.wrongOwnClassNormalization) > .0169, 'literal wrong-class negative must reproduce the observed solver defect');
    assert.ok(Math.abs(cap.structuralFromFloat32 - strip.structuralFromFloat32) < 1e-8);
    assert.equal(cap.structuralSupport, 0); assert.equal(strip.structuralSupport, 0);
  }
  assert.equal(r.summary.classifications['film-normalization-false-ambiguity'], 58);
  assert.equal(r.summary.maxFloat32StructuralError < 1e-8, true);
});

test('correct film must retain43 genuine same-node structural steps and real oldphysics support', () => {
  const r = replay(), classification = load('docs/qa/evidence/reported-roads/historical-cap-seam-source-classification-independent-9413-20261103.json', 'cf28fef6d7391f47e62d5037b4e3f8d1bf3700373b7ee6e26be7fb1e732d116e');
  assert.equal(r.summary.classifications['genuine-structural-ambiguity'], 43);
  assert.deepEqual(classification.groups.map((g: any) => g.witnesses), [9, 16, 18]);
  for (const group of classification.groups) {
    assert.ok(group.actualOldCapStructuralY > .01, 'a true low clearance must not be rounded into coplanarity');
    assert.equal(group.actualOldOwnStripY, 0);
    assert.ok(group.oldPhysicsSupportQueries.some((q: any) => q.actualSupportY === 0 && !q.triangulatedPatch));
    assert.ok(group.oldPhysicsSupportQueries.some((q: any) => q.actualSupportY === group.actualOldCapStructuralY && q.triangulatedPatch));
    assert.equal(new Set(group.incidentSourceProofs.map((p: any) => p.connectorID)).size, 1);
    assert.ok(group.incidentSourceProofs.every((p: any) => p.sourceSegmentID.length === 36 && p.connectorID === group.fullConnectorID && p.sourceProjectionResidualM < .075));
    assert.equal(group.repairApplied, false);
    assert.equal(group.independentClearanceStillRequired, true);
    for (const binding of group.literalSurfaceBindings) {
      assert.equal(binding.literalPoints.length, 3); assert.equal(binding.structuralQuad.length, 4);
      assert.ok(Number.isFinite(binding.paintLift)); assert.ok(binding.legacySourceBranches.length > 0);
    }
  }
});

test('a shared replay tile never certifies unrelated historical headroom datums', () => {
  const r = replay(); assert.equal(r.headroomCoverage.totalDirectHeadRows, 903); assert.equal(r.headroomCoverage.pointsInReplayedTiles, 16);
  assert.equal(r.headroomCoverage.rowsWithAtLeastOneReplayedRoadDatum, 0); assert.equal(r.headroomCoverage.rowsWithBothReplayedRoadDatums, 0);
  assert.equal(r.releaseApproved, false);
});
