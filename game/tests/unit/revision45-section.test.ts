import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { StreetSurvey } from '../../src/world/streetSurvey';
import { surveyRecordHash } from '../../src/world/streetSurveyBatch';
import { SourceAccuracyLayer, type SourceAccuracyData } from '../../src/world/sourceAccuracy';
import type { StreetSurveyBatch, StreetSurveyData } from '../../src/world/streetSurveyTypes';
import type { WorldChunkV2, WorldCore } from '../../src/world/schema';
import { accessRoadIndex, buildingAccessPlan } from '../../src/world/buildingAccess';
import { MapView } from '../../src/ui/map';
import type { WorldPhysics } from '../../src/world/collision';

const read = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const base = 'public/world/hyd-metro/v2/';
const batch = read<StreetSurveyBatch>('data/research/batches/madhapur-after-shelter-next-20261018.json');
const data = read<StreetSurveyData>('public/research/street-survey.json');
const previous = read<StreetSurveyData>('qa/artifacts/historical/revision44-final-street-survey.json');
const accuracy = new SourceAccuracyLayer(read<SourceAccuracyData>(base + 'source-accuracy.json'));
const rawCore = accuracy.applyCore(read<WorldCore>(base + 'core.json'));
const survey = new StreetSurvey(data, rawCore), prior = new StreetSurvey(previous, rawCore);
const core = survey.applyCoreCorrections(rawCore);
const source = ['c_-81_-14', 'c_-80_-14'].map(id => read<WorldChunkV2>(base + 'chunks/' + id + '.json'));
const raw = source.map(chunk => accuracy.applyChunk(chunk)), chunks = raw.map(chunk => survey.applyChunk(chunk));

describe('revision45 coverage-first utility and construction section', () => {
  it('imports one immutable evidence batch with exact dates and no invented tenant or profile', async () => {
    expect(data.revision).toBeGreaterThanOrEqual(45);
    expect(data.appliedBatches!.find(b => b.id === batch.id)!.contentHash).toBe(await surveyRecordHash(batch));
    expect(batch.storefrontOverrides ?? []).toEqual([]); expect(batch.corrections ?? []).toEqual([]);
    expect([...new Set(batch.sources!.map(s => s.captureDate))].sort()).toEqual(['2025-01', '2026-04']);
    expect(batch.sources!.filter(s => s.captureDate === '2026-04')).toHaveLength(2);
    expect(batch.sources!.filter(s => s.captureDate === '2025-01')).toHaveLength(21);
    for (const source of batch.sources!) {
      expect(source.assetPolicy).toBe('reference_only');
      const q = new URL(source.url).searchParams;
      expect(q.get('pano')).toBe(source.position!.panoId);
      expect(Number(q.get('heading'))).toBe(source.position!.headingDeg);
    }
    expect(batch.observations!.every(o => o.placementStatus === 'pending')).toBe(true);
    expect(batch.observations!.some(o => o.name.includes('Kavuri Hills Reservoir'))).toBe(true);
  });

  it('records each whole directed edge once on LEFT while leaving unreviewed RIGHT unchanged', () => {
    let last = core.directed.find(e => e.id === 'r_43518450735_0:f')!;
    let total = 0;
    const ranges = [['r_21627390159_0', 75.18], ['r_28656101950_0', 6.8], ['r_21924906449_0', 164.5]] as const;
    for (const [roadId, endM] of ranges) {
      const edge = core.directed.find(e => e.id === roadId + ':f')!, road = core.roads.find(r => r.id === roadId)!;
      expect(last.next).toContain(edge.id); expect(last.toNode).toBe(edge.fromNode);
      expect(road).toMatchObject({ highway: 'primary', oneway: true, bridge: false, tunnel: false, elevationM: 0, lengthM: endM });
      const review = batch.roadReviews!.filter(r => r.roadId === roadId);
      expect(review).toHaveLength(1); expect(review[0].side).toBe('left'); expect(review[0].reviewedRanges).toHaveLength(1);
      const range = review[0].reviewedRanges![0];
      expect(range).toMatchObject({ startM: 0, endM, completeness: 'partial', storefrontIds: [], allFrontagesRecorded: false });
      expect(review[0].status).toBe('partial');
      expect(survey.segment(roadId)!.right).toEqual(prior.segment(roadId)!.right);
      total += endM; last = edge;
    }
    expect(total).toBeCloseTo(246.48, 6); expect(batch.roadReviews).toHaveLength(3);
  });

  it('removes only the photographed wrong clinic facade while retaining its raw listing archive', () => {
    expect(batch.suppressions!.map(s => s.storefrontId)).toEqual(['sf_0c9d03bfbb']);
    const id = 'sf_0c9d03bfbb', original = source.flatMap(c => c.storefronts).find(s => s.id === id)!;
    expect(original.name).toBe('Dr A and N Clinic'); expect(original.buildingId).toBe('b_03bf7ecf6e');
    const map = new MapView(core, {} as WorldPhysics, survey); chunks.forEach(c => map.addChunk(c));
    expect(map.storefronts.some(s => s.id === id)).toBe(false);
    expect(survey.allowsSourceListing(original.placeId, original.id)).toBe(false);
    const manifest = read<{ listingIndex: { file: string } }>(base + 'manifest.json');
    const listings = read<{ places: { id: string; name: string; x: number; z: number }[] }>(base + manifest.listingIndex.file);
    expect(listings.places.find(s => s.id === original.placeId)).toMatchObject({ name: original.name, x: original.x, z: original.z });
    expect(batch.suppressions![0].reason).toContain('does not certify closure');
  });

  it('does not turn advertisements, rear arrows, unresolved floor signs or temporary activity into storefronts', () => {
    expect(batch.storefrontOverrides ?? []).toHaveLength(0);
    const text = batch.observations!.map(o => o.name + ' ' + o.notes).join('\n');
    expect(text).toContain('Medicover'); expect(text).toContain('SBI');
    expect(text).toContain('KSHATRIYA'); expect(text).toContain('source');
    for (const o of batch.observations!) expect(o.storefrontOverrideId).toBeUndefined();
    expect(batch.observations!.find(o => o.id.endsWith('road-width-gap'))!.placementStatus).toBe('pending');
  });

  it('preserves both affected chunks, building access and all canonical road widths from frozen44', () => {
    expect(core).toEqual(prior.applyCoreCorrections(rawCore));
    for (const [i, chunk] of chunks.entries()) {
      const before = prior.applyChunk(raw[i]); expect(chunk.buildings).toEqual(before.buildings);
      for (const building of chunk.buildings) {
        const old = before.buildings.find(b => b.id === building.id)!;
        expect(buildingAccessPlan(building, chunk.storefronts.filter(s => s.buildingId === building.id), accessRoadIndex(core)))
          .toEqual(buildingAccessPlan(old, before.storefronts.filter(s => s.buildingId === old.id), accessRoadIndex(core)));
      }
    }
    for (const roadId of ['r_21627390159_0', 'r_28656101950_0', 'r_21924906449_0'])
      expect(core.roads.find(r => r.id === roadId)!.widthM).toBe(4.5);
    for (const roadId of ['r_22340296037_0', 'r_36314993425_0', 'r_68630266621_0', 'r_57338498840_0', 'r_31627731675_0', 'r_54532951764_0', 'r_49611679382_0', 'r_43518450735_0'])
      expect(survey.segment(roadId)).toEqual(prior.segment(roadId));
  });
});
