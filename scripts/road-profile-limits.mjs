import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

export const GLOBAL_GRADE_CHANGE_PER_METRE = .00625;
export const LOCAL_GRADE_CHANGE_POLICY_PATH = 'docs/qa/evidence/reported-roads/anandbagh-generated-approach-policy-9413.json';
export const LOCAL_GRADE_CHANGE_POLICY_SHA256 = 'ae74b4f9e2ba131fd4290af445e3969489849dfa59dfcfb487571061514aaf2c';
export const LOCAL_GRADE_CHANGE_CLASSIFICATION_SHA256 = '43c22f6f8fbb084e0f5a735bfb427ec1621f1deadcabdc3276221f9a03a3718f';
const sha = b => createHash('sha256').update(b).digest('hex');
const equal = (a, b, message) => assert.deepEqual(a, b, message);
const arc = pts => { const a = [0]; for (let i = 1; i < pts.length; i++) a.push(a.at(-1) + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return a; };
const keys = (value, names, message) => equal(Object.keys(value).sort(), names.slice().sort(), message);
const verifiedRebases = new WeakMap();

/** This is conditional comfort authority, not a physical release approval. */
export function createRoadProfileLimits(policyBytes, classificationBytes) {
  assert.equal(sha(policyBytes), LOCAL_GRADE_CHANGE_POLICY_SHA256, 'Local curvature policy SHA changed');
  assert.equal(sha(classificationBytes), LOCAL_GRADE_CHANGE_CLASSIFICATION_SHA256, 'Local curvature classification SHA changed');
  const policy = JSON.parse(policyBytes), classification = JSON.parse(classificationBytes);
  assert.equal(policy.version, 1); assert.equal(classification.pass, true, 'Local curvature classification did not pass');
  assert.equal(policy.sourceClassificationSHA256, LOCAL_GRADE_CHANGE_CLASSIFICATION_SHA256);
  assert.equal(policy.globalGradeChangePerMetre, GLOBAL_GRADE_CHANGE_PER_METRE);
  assert.equal(policy.maximumPermittedLocalGradeChangePerMetre, .015);
  const records = new Map(classification.records.map(r => [r.road, r])), roads = new Map();
  assert.equal(records.size, classification.records.length);
  for (const p of policy.roads) {
    assert.ok(!roads.has(p.id), 'Duplicate local curvature authority');
    const c = records.get(p.id), count = p.inputControlCount;
    assert.ok(c && c.rawSourceProfile === null && c.currentProfileIsSurveyed === false, `${p.id}: local policy needs an independently classified generated profile`);
    assert.equal(c.controls.length, count); assert.equal(p.inputHeights.length, count);
    equal(c.controls.map(r => r.index), Array.from({ length: count }, (_, i) => i));
    equal(c.controls.map(r => r.inputHeight), p.inputHeights);
    equal(c.controls.filter(r => r.immutableFacilityControl).map(r => r.index), p.protectedControlIndices);
    assert.equal(p.protectedControlIndices.length, 10);
    equal([...p.protectedControlIndices, ...p.generatedControlIndices].sort((a, b) => a - b), Array.from({ length: count }, (_, i) => i));
    equal(p.existingHeightEnvelope, [-6.5, 0]);
    equal([Math.min(...p.inputHeights), Math.max(...p.inputHeights)], p.existingHeightEnvelope);
    assert.ok(p.maximumGradeChangePerMetre > GLOBAL_GRADE_CHANGE_PER_METRE && p.maximumGradeChangePerMetre <= .015);
    assert.equal(p.sourceClassificationSHA256, LOCAL_GRADE_CHANGE_CLASSIFICATION_SHA256);
    roads.set(p.id, { policy: p, classification: c, points: c.controls.map(r => r.point), protected: new Set(p.protectedControlIndices), generated: new Set(p.generatedControlIndices) });
  }
  assert.equal(roads.size, 2); assert.equal(records.size, roads.size);
  return { policy, roads, policySHA256: sha(policyBytes), classificationSHA256: sha(classificationBytes) };
}

export async function loadRoadProfileLimits(root, { rebaseProof, expectedModelSHA256, expectedFootprintsSHA256 } = {}) {
  const policyBytes = await readFile(resolve(root, LOCAL_GRADE_CHANGE_POLICY_PATH));
  // Check the pinned policy before using any path from it.
  assert.equal(sha(policyBytes), LOCAL_GRADE_CHANGE_POLICY_SHA256, 'Local curvature policy SHA changed');
  const policy = JSON.parse(policyBytes);
  const authority = createRoadProfileLimits(policyBytes, await readFile(resolve(root, policy.sourceClassification)));
  if (rebaseProof) {
    assert.match(expectedModelSHA256 ?? '', /^[a-f0-9]{64}$/, 'Explicit scoped proof needs the candidate model SHA');
    const file = resolve(rebaseProof), bytes = await readFile(file);
    const args = [resolve(root, 'scripts/qa/verify-scoped-generated-facility-rebase.py'), '--verify-proof', file, '--expected-model-sha256', expectedModelSHA256];
    if (expectedFootprintsSHA256) args.push('--expected-footprints-sha256', expectedFootprintsSHA256);
    // Offline only. Replay the single stdlib verifier instead of duplicating its
    // signed-zero/full-record/rail checks in a second language.
    const proof = JSON.parse(execFileSync('python3', args, { encoding: 'utf8', maxBuffer: 1024 * 1024 }));
    assert.equal(proof.proofSHA256, sha(bytes), 'Scoped proof changed during verification');
    assert.equal(proof.sourcePolicySHA256, authority.policySHA256); assert.equal(proof.sourceClassificationSHA256, authority.classificationSHA256);
    equal(proof.roads.slice().sort(), [...authority.roads.keys()].sort(), 'Scoped proof road inventory changed');
    assert.equal(proof.releaseApproved, false); assert.equal(proof.heightAuthorityGranted, false);
    authority.rebase = proof;
    verifiedRebases.set(authority, structuredClone(proof));
  }
  return authority;
}

function checkInput(authority, id, expected) {
  const record = authority.roads.get(id);
  if (!record) return null;
  const { policy, points } = record;
  assert.ok(expected && expected.elevationSource !== 'surveyed' && expected.elevationSource !== 'explicit' && !expected.expressway, `${id}: protected profile cannot use generated comfort authority`);
  equal(expected.pts, points, `${id}: local curvature expected XYZ changed`);
  equal(expected.elev, policy.inputHeights, `${id}: local curvature expected heights changed`);
  assert.equal(expected.pts.length, policy.inputControlCount);
  return { ...record, arcs: arc(expected.pts) };
}

/** Same middle-control selection as the offline road_grade_change_limit. */
export function expectedLocalGradeChangeControls(authority, id, expected) {
  const record = checkInput(authority, id, expected);
  if (!record) return [];
  const { policy, generated, arcs } = record, controls = [];
  for (let j = 1; j < arcs.length - 1; j++) {
    if (![j - 1, j, j + 1].some(k => generated.has(k))) continue;
    if (!policy.curvatureIntervals.some(([lo, hi]) => lo - 1e-8 <= arcs[j] && arcs[j] <= hi + 1e-8)) continue;
    controls.push({ index: j, modelArc: arcs.slice(j - 1, j + 2), maximumGradeChangePerMetre: policy.maximumGradeChangePerMetre });
  }
  return controls;
}

/** Validates the full emitted inventory before a generator can attach it. */
export function bindLocalGradeChangePolicies(authority, blocks, profiles, sourceModelSHA256, { requireAttached = false } = {}) {
  assert.ok(Array.isArray(blocks), 'Local curvature policy inventory must be an array');
  const byId = new Map(), result = new Map();
  for (const p of profiles) { assert.ok(p && typeof p.id === 'string' && !byId.has(p.id), 'Duplicate/invalid solved profile inventory'); byId.set(p.id, p); }
  const required = [...byId.keys()].filter(id => authority.roads.has(id)).sort();
  if (required.length || blocks.length) assert.equal(sourceModelSHA256, verifiedRebases.get(authority)?.sourceModelSHA256 ?? authority.policy.sourceModelSHA256, 'Local curvature input model SHA changed');
  equal(blocks.map(b => b?.road).sort(), required, 'Local curvature road inventory is missing, duplicate or out of scope');
  for (const b of blocks) {
    keys(b, ['road', 'sourcePolicySHA256', 'sourceClassificationSHA256', 'controlCount', 'protectedControlIndices', 'existingHeightEnvelope', 'controls'], 'Unknown local curvature fields');
    const p = byId.get(b.road), record = checkInput(authority, b.road, p.expected);
    assert.ok(record && (p.stage ?? 'roadGrades') === 'conditionedWorld', `${b.road}: local policy belongs to its conditioned profile`);
    assert.equal(b.sourcePolicySHA256, authority.policySHA256); assert.equal(b.sourceClassificationSHA256, authority.classificationSHA256);
    assert.equal(b.controlCount, record.policy.inputControlCount);
    equal(b.protectedControlIndices, record.policy.protectedControlIndices); equal(b.existingHeightEnvelope, record.policy.existingHeightEnvelope);
    assert.ok(Array.isArray(p.elev) && p.elev.length === b.controlCount && p.elev.every(Number.isFinite));
    for (const j of b.protectedControlIndices) assert.ok(Object.is(p.elev[j], p.expected.elev[j]), `${b.road}: protected target control ${j} changed`);
    assert.ok(p.elev.every(y => y >= b.existingHeightEnvelope[0] && y <= b.existingHeightEnvelope[1]), `${b.road}: target escaped the existing height envelope`);
    const controls = expectedLocalGradeChangeControls(authority, b.road, p.expected);
    assert.ok(Array.isArray(b.controls)); equal(b.controls.map(c => c.index), controls.map(c => c.index), `${b.road}: local control inventory is missing, duplicate or out of scope`);
    const indexedLimits = Array(b.controlCount).fill(GLOBAL_GRADE_CHANGE_PER_METRE);
    for (let i = 0; i < controls.length; i++) {
      const c = b.controls[i], expected = controls[i]; keys(c, ['index', 'modelArc', 'maximumGradeChangePerMetre'], 'Unknown local control fields');
      assert.ok(Array.isArray(c.modelArc) && c.modelArc.length === 3 && c.modelArc.every((s, k) => Number.isFinite(s) && Math.abs(s - expected.modelArc[k]) <= 1e-8), `${b.road}: stale local control arc`);
      assert.ok(Number.isFinite(c.maximumGradeChangePerMetre) && c.maximumGradeChangePerMetre > GLOBAL_GRADE_CHANGE_PER_METRE && c.maximumGradeChangePerMetre <= expected.maximumGradeChangePerMetre && c.maximumGradeChangePerMetre <= .015, `${b.road}: inflated/out-of-policy local coefficient`);
      indexedLimits[c.index] = c.maximumGradeChangePerMetre;
    }
    if (requireAttached || p.limits?.localGradeChange !== undefined) equal(p.limits?.localGradeChange, b, `${b.road}: profile local policy does not match the solved inventory`);
    result.set(b.road, { block: structuredClone(b), indexedLimits, protectedControlIndices: record.protected });
  }
  for (const p of profiles) if (!result.has(p.id)) assert.equal(p.limits?.localGradeChange, undefined, `${p.id}: unlicensed attached local curvature policy`);
  return result;
}

/** Grade remains unconditional. Only an exact, fully protected old triplet
 * may retain its old curvature; generated triplets always use indexed limits. */
export function checkRoadProfileLimits(profile, indexed, fallback = {}) {
  const { id, expected, elev } = profile;
  assert.ok(expected?.pts && Array.isArray(elev) && elev.length === expected.pts.length && elev.every(Number.isFinite), `${id}: invalid solved profile`);
  const global = profile.limits?.gradeChangePerMetre ?? fallback.gradeChangePerMetre ?? GLOBAL_GRADE_CHANGE_PER_METRE;
  assert.equal(global, GLOBAL_GRADE_CHANGE_PER_METRE, `${id}: global curvature limit changed`);
  const maximumGrade = profile.limits?.maxGrade ?? fallback.maxGrade ?? .1;
  assert.ok(Number.isFinite(maximumGrade) && maximumGrade > 0 && maximumGrade <= .1);
  let previous = null, previousLength = 0, previousSegment = 0, maximumCurvature = 0; const inherited = [];
  for (let i = 1; i < elev.length; i++) {
    const a = expected.pts[i - 1], b = expected.pts[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]); if (length < 1e-8) continue;
    const grade = (elev[i] - elev[i - 1]) / length;
    assert.ok(Math.abs(grade) <= maximumGrade + 1e-6, `${id}: solved mesh exceeds its validated grade`);
    if (previous !== null) {
      const curvature = Math.abs(grade - previous) / ((length + previousLength) / 2), j = i - 1;
      maximumCurvature = Math.max(maximumCurvature, curvature);
      let exactInherited = false;
      if (indexed && previousSegment === i - 1 && [j - 1, j, j + 1].every(k => indexed.protectedControlIndices.has(k) && Object.is(elev[k], expected.elev[k]))) {
        const oldBefore = (expected.elev[j] - expected.elev[j - 1]) / previousLength, oldAfter = (expected.elev[j + 1] - expected.elev[j]) / length;
        exactInherited = Object.is(curvature, Math.abs(oldAfter - oldBefore) / ((length + previousLength) / 2));
        if (exactInherited && curvature > global + 1e-6) inherited.push({ index: j, curvature });
      }
      assert.ok(exactInherited || curvature <= (previousSegment === i - 1 ? indexed?.indexedLimits[j] ?? global : global) + 1e-6, `${id}: solved profile has an unvalidated grade jump at ${j}`);
    }
    previous = grade; previousLength = length; previousSegment = i;
  }
  return { maximumCurvature, inheritedProtectedTriplets: inherited };
}
