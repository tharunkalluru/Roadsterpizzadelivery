import reviewManifest from './character-reviews.json';

export type CharacterReviewStatus = 'pending' | 'rejected' | 'approved';
export type ReviewView = 'front' | 'three-quarter' | 'profile' | 'full-body' | 'in-game-handoff';
export type ReviewCheck = 'identity' | 'film-role' | 'hair-and-face' | 'costume-and-body' | 'scene-pose' | 'in-game-readability';
export interface CharacterCandidate { assetId: string; sha256: string }
export interface CharacterArtifactFingerprint { path: string; sha256: string }
export interface CharacterReference {
  id: string; characterId: string; kind: 'film-still' | 'actor-portrait' | 'public-appearance' | 'character-illustration';
  sourceUrl: string; publisher: string; path: string; sha256: string;
  primarySource: boolean; visuallyVerified: boolean; note: string;
}
export interface CharacterViewEvidence {
  view: ReviewView; path: string; sha256: string; assetSha256: string;
  comparedReferenceIds: string[]; observedBy: string;
}
export interface CharacterReviewRecord {
  characterId: string; name: string; film: string; status: CharacterReviewStatus;
  candidate: CharacterCandidate | null; candidateFiles?: CharacterArtifactFingerprint[];
  authorId?: string; reviewerId?: string; reviewedAt?: string;
  checks?: Partial<Record<ReviewCheck, 'close-match' | 'needs-work' | 'wrong-role' | 'not-reviewed'>>;
  references: CharacterReference[]; evidence: CharacterViewEvidence[]; feedback: string[];
}
export interface CharacterReviewManifest { schemaVersion: number; records: CharacterReviewRecord[] }
export interface CharacterReleaseDecision { allowed: boolean; status: CharacterReviewStatus; reasons: string[] }

export const REQUIRED_CHARACTER_VIEWS: readonly ReviewView[] = ['front', 'three-quarter', 'profile', 'full-body', 'in-game-handoff'];
export const REQUIRED_CHARACTER_CHECKS: readonly ReviewCheck[] = ['identity', 'film-role', 'hair-and-face', 'costume-and-body', 'scene-pose', 'in-game-readability'];
/** Fingerprint of the reviewed source bundle, not a claim that these actors pass. */
export const REVIEWED_PROCEDURAL_CANDIDATE: Readonly<CharacterCandidate> = Object.freeze({
  assetId: 'procedural-sculpted-v2', sha256: 'd29b0d8bab2d462d905a5da722b7fd37e43e8b6cb8d6c8119ce8cd2ec1e4a692',
});
export const CHARACTER_REVIEW_MANIFEST = reviewManifest as CharacterReviewManifest;
const validSha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const localEvidencePath = (value: unknown): value is string => typeof value === 'string' && /^(docs\/delivery\/character-review\/|public\/delivery\/)/.test(value) && !value.includes('..');
/** These deliveries portray directors themselves, rather than a film role. */
export const requiredCharacterReferenceKind = (characterId: string): 'film-still' | 'public-appearance' =>
  ['sukumar','maruthi','srikanth-odela'].includes(characterId) ? 'public-appearance' : 'film-still';

/**
 * Fail closed. This validates an independently recorded visual verdict; it does
 * not calculate likeness, infer approval from polygon count, or approve models.
 * Build-time tests also verify the bytes behind every recorded local artifact.
 */
export function getCharacterReleaseDecision(characterId: string, candidate: CharacterCandidate | null | undefined, manifest: CharacterReviewManifest = CHARACTER_REVIEW_MANIFEST): CharacterReleaseDecision {
  const denied = (status: CharacterReviewStatus, ...reasons: string[]): CharacterReleaseDecision => ({ allowed: false, status, reasons });
  if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.records)) return denied('pending', 'Unsupported or missing review manifest.');
  if (!candidate?.assetId || !validSha(candidate.sha256)) return denied('pending', 'An exact candidate asset fingerprint is required.');
  const records = manifest.records.filter(record => record?.characterId === characterId && record.candidate?.assetId === candidate.assetId && record.candidate?.sha256 === candidate.sha256);
  if (records.length !== 1) return denied('pending', records.length ? 'Ambiguous candidate review; release withheld.' : 'No review exists for this exact character and asset fingerprint.');
  const record = records[0];
  if (record.status !== 'approved') return denied(record.status === 'rejected' ? 'rejected' : 'pending', ...(Array.isArray(record.feedback) && record.feedback.length ? record.feedback : ['Independent visual review is incomplete.']));
  const reasons: string[] = [];
  if (typeof record.authorId !== 'string' || !record.authorId.trim() || typeof record.reviewerId !== 'string' || !record.reviewerId.trim() || record.authorId === record.reviewerId) reasons.push('An independent reviewer distinct from the artist is required.');
  if (!record.reviewedAt || !Number.isFinite(Date.parse(record.reviewedAt))) reasons.push('A dated visual verdict is required.');
  if (!Array.isArray(record.candidateFiles) || !record.candidateFiles.length || record.candidateFiles.some(file => !file || !validSha(file.sha256) || typeof file.path !== 'string' || !/^(src\/delivery\/|public\/delivery\/)/.test(file.path) || file.path.includes('..'))) reasons.push('The exact model, texture, rig and animation artifact list is required.');
  for (const check of REQUIRED_CHARACTER_CHECKS) if (record.checks?.[check] !== 'close-match') reasons.push(`Visual check has not passed: ${check}.`);
  const references = Array.isArray(record.references) ? record.references : [];
  const requiredKind = requiredCharacterReferenceKind(characterId);
  const filmReferences = references.filter(ref => ref && ref.kind === requiredKind && ref.characterId === characterId && ref.primarySource === true && ref.visuallyVerified === true && validSha(ref.sha256) && localEvidencePath(ref.path) && typeof ref.sourceUrl === 'string' && /^https:\/\//.test(ref.sourceUrl));
  if (!filmReferences.length) reasons.push(`A visually checked, fingerprinted primary ${requiredKind} reference is required; an actor portrait alone is insufficient.`);
  if (references.some(ref => !ref || typeof ref.id !== 'string' || !ref.id) || new Set(references.map(ref => ref?.id)).size !== references.length) reasons.push('Reference IDs must be unique and nonempty.');
  const evidence = Array.isArray(record.evidence) ? record.evidence : [];
  for (const view of REQUIRED_CHARACTER_VIEWS) {
    const matches = evidence.filter(item => item && item.view === view && item.assetSha256 === candidate.sha256 && validSha(item.sha256) && localEvidencePath(item.path) && item.observedBy === record.reviewerId && Array.isArray(item.comparedReferenceIds) && filmReferences.some(ref => item.comparedReferenceIds.includes(ref.id)));
    if (matches.length !== 1) reasons.push(`A unique independently observed film comparison is required for ${view}.`);
  }
  return reasons.length ? denied('pending', ...reasons) : { allowed: true, status: 'approved', reasons: ['Exact candidate passed the recorded independent film-reference review.'] };
}

export function canDisplayCharacter(characterId: string, candidate: CharacterCandidate | null | undefined): boolean {
  return getCharacterReleaseDecision(characterId, candidate).allowed;
}
