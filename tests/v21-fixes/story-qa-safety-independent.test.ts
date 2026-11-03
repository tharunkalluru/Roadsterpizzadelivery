import test from 'node:test';
import assert from 'node:assert/strict';
import { CampaignQARecorder } from '../../src/delivery/qa/campaign-recorder';
import { loadLevels } from '../../src/delivery/content/levels';

test('failure accounting never rethrows when an Error carries a nonstring or unprintable message', () => {
  for (const message of [42, null, Symbol('diagnostic'), { toString() { throw new Error('unprintable diagnostic'); } }]) {
    const recorder = new CampaignQARecorder(loadLevels(), { mode: 'full-campaign', layout: 'desktop',
      environment: 'Independent malformed-error accounting fixture' }, [], () => 1);
    const failure = new Error('original diagnostic'); Object.defineProperty(failure, 'message', { value: message });
    assert.doesNotThrow(() => recorder.observerFailed('passive scene observation', failure),
      'the error-reporting path must not throw back into the game event bus');
    const report = recorder.report();
    assert.equal(report.observer.healthy, false); assert.equal(report.observer.failureCount, 1);
    assert.equal(typeof report.observer.failures[0].message, 'string');
    assert.equal(report.acceptance.fullCampaignAccepted, false);
  }
});

test('unprintable thrown values and a failing observer clock remain bounded, exportable permanent failures', () => {
  const recorder = new CampaignQARecorder(loadLevels(), { mode: 'full-campaign', layout: 'desktop',
    environment: 'Independent hostile-error accounting fixture' }, [], () => { throw new Error('clock failure'); });
  const failure = { toString() { throw new Error('message conversion failure'); } };
  assert.doesNotThrow(() => recorder.observerFailed('initial observation', failure));
  const report = recorder.report(); assert.equal(report.observer.healthy, false);
  assert.equal(report.observer.failures[0].at, 0);
  assert.equal(report.observer.failures[0].message, 'Unknown observer failure');
  report.observer.failures[0].message = 'external mutation';
  assert.equal(recorder.report().observer.failures[0].message, 'Unknown observer failure', 'a report consumer cannot clear or rewrite diagnostic evidence');
});
