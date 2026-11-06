import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLevels } from '../../src/delivery/content/levels';
import { CampaignQARecorder, type CampaignQASnapshot } from '../../src/delivery/qa/campaign-recorder';
import { CAMPAIGN_SCENARIOS, campaignRequiredFacts, campaignScenario, campaignScenarioURL } from '../../src/delivery/qa/campaign-scenarios';

const snapshot = (overrides: Partial<CampaignQASnapshot> = {}): CampaignQASnapshot => ({ x: 0, y: .55, z: 0, yaw: 0, speed: 0,
  flying: false, descending: false, jumping: false, placementRevision: 1, support: null, action: 'DELIVER', ready: false, instruction: '', ...overrides });
const fixture = (count = 19, mode: 'full-campaign' | 'isolated-scene' = 'full-campaign', manual=false) => {
  let now = 0; const levels = loadLevels().slice(0, count).map(level=>manual?{...level,callMode:'PLAYER_CALLS' as const}:level);
  const recorder = new CampaignQARecorder(levels, { mode, layout: 'desktop', environment: 'Unit fixture; no physical hardware' }, [], () => now);
  return { levels, recorder, advance: (ms: number) => now += ms };
};

test('every approved campaign scene has a physical workflow, a negative trial and independent art requirements', () => {
  const levels = loadLevels(); assert.equal(levels.length, 19); assert.equal(CAMPAIGN_SCENARIOS.length, levels.length);
  const ids = new Set<string>(), actors = new Set<string>();
  for (const level of levels) {
    const scenario = campaignScenario(level.id)!; assert.ok(scenario); assert.ok(!ids.has(scenario.id)); ids.add(scenario.id);
    assert.ok(scenario.manualSteps.length >= 2); assert.ok(scenario.negativeTrial.length > 30); assert.ok(scenario.visualChecks.length >= 2);
    assert.ok(scenario.requiredFacts.includes('manual-handoff')||scenario.completionKind==='placement'||scenario.completionKind==='overtake'); scenario.artIds.forEach(id => actors.add(id));
  }
  assert.equal(actors.size, 22, 'nineteen named primary actors and three Vakeel Saab companions need approval');
  assert.deepEqual(campaignScenario('paradise-rope-bucket')!.artIds, ['srikanth-odela']); assert.deepEqual(campaignScenario('salaar-inner-compound')!.artIds, ['prabhas-salaar']);
  assert.ok(campaignScenario('vakeel-next-station')!.requiredFacts.includes('authored-metro-exit'));
  assert.ok(campaignScenario('jessie-walking-delivery')!.requiredFacts.includes('authored-walk'));
  assert.ok(campaignScenario('bhanumathi-wedding-street')!.requiredFacts.includes('authored-dance'));
});

test('completion alone cannot count as pickup, physical gameplay, touch or visual likeness acceptance', () => {
  const f = fixture(1); f.recorder.begin(f.levels[0].id); f.recorder.complete(f.levels[0].id);
  const report = f.recorder.report(); assert.equal(report.rows[0].completed, true);
  assert.equal(report.rows[0].naturalJumpPickup, false); assert.equal(report.rows[0].manualHandoff, false);
  assert.ok(report.rows[0].missingPhysicalFacts.includes('truck-interior-contact')); assert.deepEqual(report.rows[0].missingArt, ['pushpa-raj']);
  assert.equal(report.acceptance.fullCampaignAccepted, false); assert.equal(report.inputEvidence.physicalHardwareVerified, false);
  assert.deepEqual(report.assistance.map(item => item.kind), ['pickup-not-observed']);
});

test('manual physical evidence at timestamp zero is recognized without automatically approving an actor', () => {
  const f = fixture(1,'full-campaign',true), scenario = campaignScenario(f.levels[0].id)!;
  f.recorder.sample(snapshot({ placementRevision: 0 })); f.recorder.sample(snapshot({ placementRevision: 1 }));
  f.recorder.begin(f.levels[0].id); f.recorder.picked('traffic:bus:1', true); f.recorder.input('handoff', 'keyboard', true);
  for (const fact of scenario.requiredFacts) f.recorder.fact(fact);
  f.recorder.complete(f.levels[0].id); f.recorder.complete(f.levels[0].id);
  const report = f.recorder.report(); assert.equal(report.attempts.length, 1); assert.equal(report.attempts[0].completedAt, 0);
  assert.equal(report.rows[0].observedSceneMechanics, true); assert.equal(report.acceptance.noAssistance, true);
  assert.equal(report.rows[0].allScenarioEvidence, false, 'film resemblance requires independent art approval');
  assert.deepEqual(f.recorder.summary(), { completed: 1, total: 1, trustedTouchObserved: false, activeLevel: 1, facts: 6,
    observerHealthy:true,observerFailureCount:0,lastObserverFailure:null });
});

test('staging and later relocations remain explicit even when the manual scene action succeeds', () => {
  const f = fixture(1, 'isolated-scene',true); f.recorder.sample(snapshot()); f.recorder.begin(f.levels[0].id);
  f.recorder.noteAssistance('qa-order-preparation'); f.recorder.sample(snapshot({ placementRevision: 2 }));
  f.recorder.input('handoff', 'mouse', true); f.recorder.complete(f.levels[0].id);
  const report = f.recorder.report(); assert.ok(report.assistance.some(item => item.kind === 'player-relocated'));
  assert.ok(report.assistance.some(item => item.kind === 'qa-order-preparation')); assert.equal(report.rows[0].manualHandoff, true);
  assert.equal(report.acceptance.noAssistance, false); assert.equal(report.acceptance.fullCampaignAccepted, false);
});

test('synthetic input and mouse use in a touch layout cannot be reported as true touch or physical-phone testing', () => {
  const levels = loadLevels().slice(0, 1), recorder = new CampaignQARecorder(levels, { mode: 'full-campaign', layout: 'touch-layout', environment: 'Desktop layout simulation' });
  recorder.begin(levels[0].id); recorder.input('jump', 'touch', false); recorder.input('handoff', 'touch', false);
  assert.equal(recorder.active!.inputs.length, 0); recorder.input('drive', 'mouse', true);
  assert.equal(recorder.report().inputEvidence.trustedTouchObserved, false); recorder.input('steer', 'touch', true);
  assert.equal(recorder.report().inputEvidence.trustedTouchObserved, true); assert.equal(recorder.report().inputEvidence.physicalHardwareVerified, false);
});

test('pickup must be a real jumping carrier pickup and an old handoff cannot validate later completion', () => {
  const f = fixture(1); f.recorder.begin(f.levels[0].id); f.recorder.picked('auto:1', false); f.recorder.picked('bus:2', true);
  f.recorder.input('handoff', 'keyboard', true); f.advance(16000); f.recorder.complete(f.levels[0].id);
  const report = f.recorder.report(); assert.equal(report.rows[0].naturalJumpPickup, false); assert.equal(report.rows[0].manualHandoff, false);
  assert.equal(report.attempts[0].pickup!.carrierId, 'auto:1');
});

test('recording stays bounded and report consumers cannot mutate the recorded attempts', () => {
  const f = fixture(1); f.recorder.begin(f.levels[0].id);
  for (let n = 0; n < 1000; n++) { f.advance(110); f.recorder.sample(snapshot()); f.recorder.input('drive', 'keyboard', true); }
  const report = f.recorder.report(); assert.ok(report.attempts[0].samples.length <= 240); assert.ok(report.attempts[0].inputs.length <= 300);
  report.attempts[0].facts.push('forged'); assert.ok(!f.recorder.active!.facts.includes('forged'));
});

test('paused active-time polling cannot evict real gameplay samples, while a changed action still records at the same instant',()=>{
  const f=fixture(1);f.recorder.begin(f.levels[0].id);f.recorder.sample(snapshot());
  for(let i=0;i<1000;i++)f.recorder.sample(snapshot());assert.equal(f.recorder.active!.samples.length,1);
  f.recorder.sample(snapshot({action:'HAND OVER',ready:true}));assert.equal(f.recorder.active!.samples.length,2);
  f.advance(100);f.recorder.sample(snapshot({action:'HAND OVER',ready:true}));assert.equal(f.recorder.active!.samples.length,3);
});

test('all physical facts and an artifact path do not automatically certify visual scene quality', () => {
  const levels = [loadLevels()[3]], scenario = campaignScenario(levels[0].id)!;
  const recorder = new CampaignQARecorder(levels, { mode: 'isolated-scene', layout: 'desktop', environment: 'Visual accounting fixture' },[{characterId:'srikanth-odela',allowed:true,status:'synthetic unit fixture only'}]);
  recorder.begin(levels[0].id); recorder.picked('bus:1',true); recorder.input('handoff','keyboard',true);
  campaignRequiredFacts(levels[0],true).forEach(fact=>recorder.fact(fact)); recorder.complete(levels[0].id); recorder.evidence('/fixture/scene.png');
  assert.equal(recorder.report().rows[0].observedSceneMechanics,true); assert.equal(recorder.report().rows[0].allScenarioEvidence,false);
  assert.equal(recorder.reviewVisualCheck('not a configured check','/fixture/scene.png'),false);
  assert.equal(recorder.reviewVisualCheck(scenario.visualChecks[0],''),false);
  for(const check of scenario.visualChecks)assert.equal(recorder.reviewVisualCheck(check,'/fixture/scene.png'),true);
  const report=recorder.report();assert.deepEqual(report.rows[0].missingVisualChecks,[]);assert.equal(report.rows[0].allScenarioEvidence,true);
  assert.equal(report.acceptance.fullCampaignAccepted,false,'an isolated scene is still not a natural full campaign');
});

test('future content increases the denominator and needs its own explicit scene acceptance checklist', () => {
  const levels = loadLevels(), extra = { ...levels[18], id: 'future-delivery', level: 20 };
  const recorder = new CampaignQARecorder([...levels, extra], { mode: 'full-campaign', layout: 'desktop', environment: 'Content extension fixture' });
  const report = recorder.report(); assert.equal(report.expectedLevelIds.length, 20); assert.equal(report.rows.at(-1)!.configuredScenario, false);
  assert.equal(report.acceptance.fullCampaignAccepted, false);
  const trainURL = new URL(campaignScenarioURL(levels[1], true), 'http://localhost'); assert.equal(trainURL.searchParams.get('qaTrainRide'), '1');
  assert.equal(trainURL.searchParams.get('qaTouch'), '1'); assert.equal(trainURL.searchParams.get('qaCampaign'), '1');
  assert.equal(trainURL.searchParams.has('qaCampaignMode'), false, 'isolated scene starts must not masquerade as a full campaign');
});
