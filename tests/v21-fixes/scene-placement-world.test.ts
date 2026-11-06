import test from 'node:test';
import assert from 'node:assert/strict';
import { auditGroundScenePlacements } from './fixtures/scene-placement-world-audit';

test('all nine current street scenes prepare collision-clear ground approaches in the actual shipped city, with budgeted/synchronous parity', () => {
  const reports = auditGroundScenePlacements(); assert.equal(reports.length, 9);
  for (const report of reports) {
    assert.equal(report.fit, true, `${report.id}: no usable actual-city ground placement`);
    assert.equal(report.budgetedComplete, true, `${report.id}: incremental search stalled`);
    assert.deepEqual(report.budgetedPoint, report.point, `${report.id}: incremental search changed placement`);
    assert.ok(report.point!.y >= 0 && report.point!.y <= .37, `${report.id}: ground scene was placed on a roof`);
    assert.ok(report.offset! <= 250, `${report.id}: scene moved outside its public location's local approach`);
    if (report.id === 'sukumar-angle-parking') assert.equal(report.offset, 0, 'Sukumar must stay at the configured courtyard');
    assert.ok(report.steps < 2000, `${report.id}: preparation work is unbounded`);
  }
});

test('Sukumar’s fixed 45-degree courtyard clears the full-detail park fences and driveway', () => {
  const [high] = auditGroundScenePlacements('sukumar-angle-parking', false);
  assert.equal(high.fit, true);
  assert.equal(high.offset, 0);
  assert.deepEqual(high.budgetedPoint, high.point);
});
