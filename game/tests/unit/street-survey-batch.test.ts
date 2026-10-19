import { describe, expect, it } from 'vitest';
import { buildStreetWorkQueue } from '../../src/world/streetSurveyQueue';
import { ingestStreetSurveyBatch, surveyRecordHash } from '../../src/world/streetSurveyBatch';
import { validateStreetSurvey } from '../../src/world/streetSurvey';
import { unproject } from '../../src/world/geo';
import type { StreetSurveyBatch, StreetSurveyData } from '../../src/world/streetSurveyTypes';
import { makeFixtureCore } from './fixture';

function fixture() {
  const core = makeFixtureCore();
  const data: StreetSurveyData = { schemaVersion: 1, revision: 12, worldId: 'fixture', worldVersion: 'fixture', generatedAt: '2026-10-18', referencePolicy: 'Test only', sources: [], observations: [], storefrontOverrides: [], suppressions: [], corrections: [], roads: core.roads.map((r) => ({ roadId: r.id, left: { status: 'unreviewed' }, right: { status: 'unreviewed' } })) };
  const batch: StreetSurveyBatch = { schemaVersion: 1, id: 'test-block', worldId: 'fixture', worldVersion: 'fixture', reviewedAt: '2026-10-18', reviewer: 'Test reviewer', notes: 'Fictional observation; no geometric placement.', sources: [{ id: 'test-source', kind: 'street_view', title: 'Test panorama', url: 'https://example.com/pano', captureDate: '2026-01', observedDate: '2026-10-18', reviewer: 'Test reviewer', position: { lat: 17.4146, lon: 78.5484 }, notes: 'Fictional test evidence.', assetPolicy: 'reference_only' }], observations: [{ id: 'test-observation', sourceIds: ['test-source'], captureDate: '2026-01', observedDate: '2026-10-18', name: 'Unresolved sign', category: 'shop', roadId: core.roads[0].id, position: { lat: 17.4146, lon: 78.5484 }, placementStatus: 'pending', notes: 'Camera only; not an entrance.' }] };
  return { core, data, batch };
}

describe('full-network work queue', () => {
  it('assigns every road and side once to connected work blocks without claiming survey coverage', () => {
    const { core, data } = fixture();
    const queue = buildStreetWorkQueue(core, data, { maxRoadsPerBlock: 2, targetRoadLengthM: 1500 });
    const assigned = queue.blocks.flatMap((b) => b.roadIds);
    expect(assigned.slice().sort()).toEqual(core.roads.map((r) => r.id).sort());
    expect(new Set(assigned).size).toBe(core.roads.length);
    expect(queue.roads.flatMap((r) => r.sides)).toHaveLength(core.roads.length * 2);
    expect(queue.summary.remainingObservationM).toBe(queue.summary.remainingVerificationM);
    for (const block of queue.blocks) {
      const reached = new Set([block.roadIds[0]]);
      for (let pass = 0; pass < block.roadIds.length; pass++) for (const id of block.roadIds) {
        const r = core.roads.find((road) => road.id === id)!;
        if ([...reached].some((other) => { const n = core.roads.find((road) => road.id === other)!; return [n.fromNode, n.toNode].includes(r.fromNode) || [n.fromNode, n.toNode].includes(r.toNode); })) reached.add(id);
      }
      expect(reached.size).toBe(block.roadIds.length);
    }
  });
  it('uses the canonical map projection in generated research links', () => {
    const { core, data } = fixture();
    const first = buildStreetWorkQueue(core, data).roads[0];
    const road = core.roads.find((r) => r.id === first.roadId)!;
    const [a, b] = road.points, expected = unproject((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    const viewpoint = new URL(first.sides[0].researchUrl).searchParams.get('viewpoint')!.split(',').map(Number);
    expect(viewpoint[0]).toBeCloseTo(expected[0], 6); expect(viewpoint[1]).toBeCloseTo(expected[1], 6);
  });
});

describe('reviewed-block batch ingestion', () => {
  it('is immutable and content-addressed; observation imports do not upgrade coverage', async () => {
    const { core, data, batch } = fixture();
    const imported = await ingestStreetSurveyBatch(data, batch, core, validateStreetSurvey);
    expect(imported.data.revision).toBe(13); expect(data.revision).toBe(12); expect(data.observations).toEqual([]);
    expect(validateStreetSurvey(imported.data, core).summary).toMatchObject({ verifiedSides: 0, partialSides: 0, evidenceObservations: 1 });
    const repeated = await ingestStreetSurveyBatch(imported.data, batch, core, validateStreetSurvey);
    expect(repeated.changed).toBe(false); expect(repeated.data).toBe(imported.data);
    await expect(ingestStreetSurveyBatch(imported.data, { ...batch, notes: 'Different content' }, core, validateStreetSurvey)).rejects.toThrow('different content');
  });
  it('requires an exact prior-record hash before replacing earlier evidence', async () => {
    const { core, data, batch } = fixture();
    const imported = await ingestStreetSurveyBatch(data, batch, core, validateStreetSurvey);
    const revised = { ...batch, id: 'correction-block', observations: [{ ...batch.observations![0], name: 'Closer corrected sign' }] };
    await expect(ingestStreetSurveyBatch(imported.data, revised, core, validateStreetSurvey)).rejects.toThrow('expectedPrevious');
    revised.expectedPrevious = { 'observations:test-observation': await surveyRecordHash(imported.data.observations[0]) };
    const result = await ingestStreetSurveyBatch(imported.data, revised, core, validateStreetSurvey);
    expect(result.data.observations[0].name).toBe('Closer corrected sign');
  });
  it('rejects unknown world IDs and unsupported whole-side verification atomically', async () => {
    const { core, data, batch } = fixture();
    await expect(ingestStreetSurveyBatch(data, { ...batch, worldVersion: 'wrong' }, core, validateStreetSurvey)).rejects.toThrow('different world');
    await expect(ingestStreetSurveyBatch(data, { ...batch, roadReviews: [{ roadId: core.roads[0].id, side: 'left', status: 'verified' }] }, core, validateStreetSurvey)).rejects.toThrow('claimed review');
    expect(data.revision).toBe(12); expect(data.sources).toEqual([]);
  });

  it('retracts contradicted placements only with exact hashes and retains the original research record', async () => {
    const { core, data, batch } = fixture();
    const imported = await ingestStreetSurveyBatch(data, batch, core, validateStreetSurvey);
    const correction: StreetSurveyBatch = { ...batch, id: 'withdraw-wrong-attachment', sources: [], observations: [], retractions: [{ collection: 'observations', id: 'test-observation', expectedHash: await surveyRecordHash(imported.data.observations[0]), reason: 'Closer angle disproves the earlier building association.', sourceIds: ['test-source'] }] };
    const result = await ingestStreetSurveyBatch(imported.data, correction, core, validateStreetSurvey);
    expect(result.data.observations).toEqual([]);
    expect(result.data.retractionHistory?.[0]).toMatchObject({ id: 'test-observation', record: imported.data.observations[0], sourceIds: ['test-source'] });
    expect(imported.data.observations).toHaveLength(1);
    correction.id = 'bad-retraction'; correction.retractions![0].expectedHash = '0'.repeat(64);
    await expect(ingestStreetSurveyBatch(imported.data, correction, core, validateStreetSurvey)).rejects.toThrow('previous record hash');
  });

  it('withdraws a wrong-side observation window instead of retaining false reviewed length', async () => {
    const { core, data, batch } = fixture();
    const imported = await ingestStreetSurveyBatch(data, batch, core, validateStreetSurvey);
    imported.data.roads[0].left = { status: 'partial', reviewedRanges: [{ startM: 0, endM: 20, sourceIds: ['test-source'], reviewedAt: batch.reviewedAt, reviewer: batch.reviewer, completeness: 'partial', allFrontagesRecorded: false, storefrontIds: [], notes: 'Initially attributed window, later disproven.' }] };
    const key = `roadReviews:${core.roads[0].id}:left`;
    const correction: StreetSurveyBatch = { ...batch, id: 'withdraw-wrong-side', sources: [], observations: [], expectedPrevious: { [key]: await surveyRecordHash(imported.data.roads[0].left) }, roadReviews: [{ roadId: core.roads[0].id, side: 'left', replace: true, status: 'needs_revisit', sourceIds: ['test-source'], notes: 'The previous source was looking at another street side.' }] };
    const result = await ingestStreetSurveyBatch(imported.data, correction, core, validateStreetSurvey);
    expect(validateStreetSurvey(result.data, core).summary).toMatchObject({ reviewedSideLengthM: 0, needsRevisitSides: 1 });
    expect(result.data.retractionHistory?.[0].collection).toBe('roadReviews');
  });
});
