import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import manifest from '../../src/delivery/art/character-reviews.json';
import {
  canDisplayCharacter, getCharacterReleaseDecision, REVIEWED_PROCEDURAL_CANDIDATE,
  REQUIRED_CHARACTER_CHECKS, REQUIRED_CHARACTER_VIEWS,
  type CharacterReviewManifest, type CharacterReviewRecord,
} from '../../src/delivery/art/release-gate';

const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/** Structural fixture only. It is never written to the production manifest. */
function completeFixture(): CharacterReviewManifest {
  const characterId = 'fixture-only', assetSha = 'a'.repeat(64), referenceId = 'fixture-film-still';
  const record: CharacterReviewRecord = {
    characterId, name: 'TEST FIXTURE, not an approved actor', film: 'TEST FIXTURE', status: 'approved',
    candidate: { assetId: 'fixture', sha256: assetSha }, candidateFiles: [{ path: 'public/delivery/characters/fixture.glb', sha256: 'd'.repeat(64) }], authorId: 'fixture-artist', reviewerId: 'fixture-independent-reviewer', reviewedAt: '2026-10-31T10:00:00Z',
    checks: Object.fromEntries(REQUIRED_CHARACTER_CHECKS.map(check => [check, 'close-match'])),
    references: [{ id: referenceId, characterId, kind: 'film-still', sourceUrl: 'https://example.com/fixture', publisher: 'fixture', path: 'docs/delivery/character-review/fixture-only.jpg', sha256: 'b'.repeat(64), primarySource: true, visuallyVerified: true, note: 'Only exercises validation.' }],
    evidence: REQUIRED_CHARACTER_VIEWS.map(view => ({ view, path: `docs/delivery/character-review/fixture-${view}.jpg`, sha256: 'c'.repeat(64), assetSha256: assetSha, comparedReferenceIds: [referenceId], observedBy: 'fixture-independent-reviewer' })),
    feedback: [],
  };
  return { schemaVersion: 1, records: [record] };
}

test('rejected procedural art stays withheld and every future approval needs a complete independent record', () => {
  for (const record of manifest.records) {
    assert.equal(canDisplayCharacter(record.characterId, REVIEWED_PROCEDURAL_CANDIDATE), false, `Previously rejected procedural bundle cannot become a new asset: ${record.characterId}`);
    assert.equal(getCharacterReleaseDecision(record.characterId, record.candidate).allowed, record.status === 'approved', `Approval state must be supported by complete evidence: ${record.characterId}`);
  }
  assert.equal(getCharacterReleaseDecision('pushpa-raj', REVIEWED_PROCEDURAL_CANDIDATE).status, 'rejected');
  assert.equal(getCharacterReleaseDecision('arundhati', REVIEWED_PROCEDURAL_CANDIDATE).status, 'pending');
});

test('missing, stale, unknown and ambiguous candidates fail closed', () => {
  const fixture = completeFixture(), candidate = fixture.records[0].candidate!;
  assert.equal(getCharacterReleaseDecision('fixture-only', candidate, fixture).allowed, true, 'validator accepts a structurally complete test fixture only');
  for (const candidate of [null, undefined, { assetId: 'fixture', sha256: '' }, { assetId: 'fixture', sha256: 'd'.repeat(64) }]) assert.equal(getCharacterReleaseDecision('fixture-only', candidate, fixture).allowed, false);
  assert.equal(getCharacterReleaseDecision('other-film-role', candidate, fixture).allowed, false);
  fixture.records.push(clone(fixture.records[0]));
  assert.equal(getCharacterReleaseDecision('fixture-only', candidate, fixture).allowed, false);
});

test('approval needs every independently observed angle, correct-film still and every visual check', () => {
  for (const view of REQUIRED_CHARACTER_VIEWS) {
    const fixture = completeFixture(); fixture.records[0].evidence = fixture.records[0].evidence.filter(e => e.view !== view);
    assert.equal(getCharacterReleaseDecision('fixture-only', fixture.records[0].candidate, fixture).allowed, false, view);
  }
  for (const check of REQUIRED_CHARACTER_CHECKS) {
    const fixture = completeFixture(); fixture.records[0].checks![check] = 'needs-work';
    assert.equal(getCharacterReleaseDecision('fixture-only', fixture.records[0].candidate, fixture).allowed, false, check);
  }
  const mutations: ((r: CharacterReviewRecord) => void)[] = [
    r => { r.reviewerId = r.authorId; }, r => { r.references[0].kind = 'actor-portrait'; },
    r => { r.references[0].characterId = 'wrong-role'; }, r => { r.references[0].visuallyVerified = false; },
    r => { r.references[0].primarySource = false; }, r => { r.references[0].sha256 = ''; },
    r => { r.evidence[0].assetSha256 = 'd'.repeat(64); }, r => { r.evidence[0].comparedReferenceIds = []; },
    r => { r.evidence[0].observedBy = 'artist'; }, r => { r.evidence[0].path = '../../external.jpg'; },
    r => { r.candidateFiles = []; }, r => { r.candidateFiles![0].sha256 = ''; },
  ];
  for (const mutate of mutations) { const fixture = completeFixture(); mutate(fixture.records[0]); assert.equal(getCharacterReleaseDecision('fixture-only', fixture.records[0].candidate, fixture).allowed, false); }
});

test('recorded source bundle and actual reference/evidence bytes have exact fingerprints', async () => {
  const observed = await Promise.all(manifest.sourceBundle.files.map(async file => sha(await readFile(file.path))));
  const sourceChanged = observed.some((hash, index) => hash !== manifest.sourceBundle.files[index].sha256);
  const files = manifest.sourceBundle.files.map(file => ({ path: file.path, sha256: file.sha256 }));
  assert.equal(sha(JSON.stringify(files)), manifest.sourceBundle.sha256);
  assert.equal(manifest.sourceBundle.sha256, REVIEWED_PROCEDURAL_CANDIDATE.sha256);
  if (sourceChanged) assert.equal(manifest.records.some(record => record.status === 'approved' && record.candidate?.sha256 === manifest.sourceBundle.sha256), false, 'Changed source cannot retain an approval. Rejection evidence remains historical.');
  for (const record of manifest.records) for (const artifact of [...record.references, ...record.evidence]) {
    assert.equal(sha(await readFile(artifact.path)), artifact.sha256, `Review artifact changed: ${artifact.path}`);
  }
  for (const record of manifest.records) if (record.status === 'approved') {
    const files = await Promise.all((record.candidateFiles ?? []).map(async file => ({ path: file.path, sha256: sha(await readFile(file.path)) })));
    assert.deepEqual(files, record.candidateFiles, 'Approved model artifact bytes must match exactly.');
    assert.equal(sha(JSON.stringify(files)), record.candidate!.sha256, 'Approved candidate fingerprint must cover every artifact.');
  }
});

test('director appearances require primary public-appearance evidence while film roles still require the correct film',()=>{
  for(const identity of ['sukumar','maruthi']){
    const f=completeFixture(),record=f.records[0];record.characterId=identity;record.references[0].characterId=identity;
    assert.equal(getCharacterReleaseDecision(identity,record.candidate,f).allowed,false,'A film still is not evidence of a director appearance.');
    record.references[0].kind='public-appearance';
    assert.equal(getCharacterReleaseDecision(identity,record.candidate,f).allowed,true,'A primary verified appearance can satisfy the same independent view checks.');
    record.references[0].primarySource=false;assert.equal(getCharacterReleaseDecision(identity,record.candidate,f).allowed,false);
  }
  const f=completeFixture();f.records[0].references[0].kind='public-appearance';
  assert.equal(getCharacterReleaseDecision('fixture-only',f.records[0].candidate,f).allowed,false,'Film roles cannot use the director exception.');
});
