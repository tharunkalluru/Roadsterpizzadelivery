import type { WorldCore } from './schema';
import type { SurveyValidationContext, validateStreetSurvey } from './streetSurvey';
import type { StreetSurveyBatch, StreetSurveyData } from './streetSurveyTypes';

export function canonicalSurveyJSON(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalSurveyJSON).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([k, v]) => `${JSON.stringify(k)}:${canonicalSurveyJSON(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
export async function surveyRecordHash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalSurveyJSON(value));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Atomic, immutable evidence merge. The shared validator must run before any result is committed. */
export async function ingestStreetSurveyBatch(data: StreetSurveyData, batch: StreetSurveyBatch, core: WorldCore, validate: typeof validateStreetSurvey, context: SurveyValidationContext = {}): Promise<{ data: StreetSurveyData; changed: boolean; hash: string }> {
  if (batch.schemaVersion !== 1 || !batch.id?.trim() || !batch.notes?.trim() || !batch.reviewer?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(batch.reviewedAt)) throw new Error('Batch needs schemaVersion1, id, notes, reviewer and review date');
  if (batch.worldId !== data.worldId || batch.worldVersion !== data.worldVersion) throw new Error('Batch targets a different world/version');
  if (!['sources', 'observations', 'storefrontOverrides', 'suppressions', 'corrections', 'roadReviews', 'retractions'].some((key) => Array.isArray(batch[key as keyof StreetSurveyBatch]) && (batch[key as keyof StreetSurveyBatch] as unknown[]).length)) throw new Error('Batch has no evidence records or explicit research corrections');
  const hash = await surveyRecordHash(batch), receipt = data.appliedBatches?.find((r) => r.id === batch.id);
  if (receipt) {
    if (receipt.contentHash !== hash) throw new Error(`Batch ${batch.id} was already applied with different content; create a new revision batch`);
    return { data, changed: false, hash };
  }
  const next = structuredClone(data);
  for (const collection of ['sources', 'observations', 'storefrontOverrides', 'suppressions', 'corrections'] as const) {
    const incoming = batch[collection] ?? [];
    if (!Array.isArray(incoming)) throw new Error(`${collection} must be an array`);
    const seen = new Set<string>();
    for (const item of incoming) {
      if (!item.id || seen.has(item.id)) throw new Error(`${collection}: missing or duplicate incoming ID ${item.id}`);
      seen.add(item.id);
      const list = next[collection] as { id: string }[], index = list.findIndex((r) => r.id === item.id);
      if (index < 0) list.push(structuredClone(item));
      else if (canonicalSurveyJSON(list[index]) !== canonicalSurveyJSON(item)) {
        const key = `${collection}:${item.id}`, expected = batch.expectedPrevious?.[key];
        if (!expected || expected !== await surveyRecordHash(list[index])) throw new Error(`Conflicting ${key}; exact expectedPrevious hash is required to replace evidence`);
        list[index] = structuredClone(item);
      }
    }
  }
  for (const retraction of batch.retractions ?? []) {
    if (!['sources', 'observations', 'storefrontOverrides', 'suppressions', 'corrections'].includes(retraction.collection) || !retraction.reason?.trim() || !retraction.sourceIds?.length) throw new Error('Retraction requires collection, reason and source IDs');
    const list = next[retraction.collection] as { id: string }[], index = list.findIndex((r) => r.id === retraction.id);
    if (index < 0 || await surveyRecordHash(list[index]) !== retraction.expectedHash) throw new Error(`Retraction ${retraction.collection}:${retraction.id} does not match its previous record hash`);
    next.retractionHistory ??= [];
    next.retractionHistory.push({ batchId: batch.id, collection: retraction.collection, id: retraction.id, recordHash: retraction.expectedHash, record: structuredClone(list[index]), reason: retraction.reason, sourceIds: retraction.sourceIds, reviewedAt: batch.reviewedAt });
    list.splice(index, 1);
  }
  const roadIds = new Set(core.roads.map((r) => r.id));
  for (const update of batch.roadReviews ?? []) {
    if (!roadIds.has(update.roadId) || !['left', 'right'].includes(update.side)) throw new Error(`Invalid road review ${update.roadId}/${update.side}`);
    const road = next.roads.find((r) => r.roadId === update.roadId)!;
    const existing = road[update.side];
    if (update.replace) {
      const key = `roadReviews:${update.roadId}:${update.side}`;
      if (!update.notes?.trim() || !update.sourceIds?.length || batch.expectedPrevious?.[key] !== await surveyRecordHash(existing)) throw new Error(`Road-side replacement ${key} needs its exact previous hash, reason and sources`);
      next.retractionHistory ??= [];
      next.retractionHistory.push({ batchId: batch.id, collection: 'roadReviews', id: `${update.roadId}:${update.side}`, recordHash: await surveyRecordHash(existing), record: structuredClone(existing), reason: update.notes, sourceIds: update.sourceIds, reviewedAt: batch.reviewedAt });
      road[update.side] = { status: update.status, ...(update.reviewedRanges?.length ? { reviewedRanges: structuredClone(update.reviewedRanges) } : {}), notes: update.notes };
      continue;
    }
    if (existing.status === 'verified' && update.status !== 'verified') throw new Error(`Refusing silent downgrade of verified side ${update.roadId}/${update.side}`);
    existing.status = update.status;
    const ranges = existing.reviewedRanges ?? [];
    for (const range of update.reviewedRanges ?? []) if (!ranges.some((r) => canonicalSurveyJSON(r) === canonicalSurveyJSON(range))) ranges.push(structuredClone(range));
    if (ranges.length) existing.reviewedRanges = ranges.sort((a, b) => a.startM - b.startM || a.endM - b.endM);
    if (update.notes) existing.notes = update.notes;
  }
  next.appliedBatches ??= []; next.appliedBatches.push({ id: batch.id, contentHash: hash, reviewedAt: batch.reviewedAt, reviewer: batch.reviewer });
  next.revision++; next.generatedAt = batch.reviewedAt > next.generatedAt.slice(0, 10) ? batch.reviewedAt : next.generatedAt;
  const result = validate(next, core, context);
  if (result.errors.length) throw new Error(`Batch rejected:\n${result.errors.join('\n')}`);
  return { data: next, changed: true, hash };
}
