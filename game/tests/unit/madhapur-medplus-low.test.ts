import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { StreetSurvey, validateStreetSurvey } from '../../src/world/streetSurvey';
import type { StreetSurveyData, StreetSurveyBatch } from '../../src/world/streetSurveyTypes';
import { ingestStreetSurveyBatch } from '../../src/world/streetSurveyBatch';
import { SourceAccuracyLayer, type SourceAccuracyData } from '../../src/world/sourceAccuracy';
import { WorldPhysics } from '../../src/world/collision';
import { buildingAccessPlan } from '../../src/world/buildingAccess';
import type { WorldCore, WorldChunkV2, WorldManifest } from '../../src/world/schema';

const read = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const base = 'public/world/hyd-metro/v2/', manifest = read<WorldManifest>(base + 'manifest.json');
const layer = new SourceAccuracyLayer(read<SourceAccuracyData>(base + manifest.sourceAccuracy!.file));
const core = layer.applyCore(read<WorldCore>(base + manifest.core.file));
const raw = read<WorldChunkV2>(base + 'chunks/c_-83_-15.json'), sourceChunk = layer.applyChunk(raw);
const batch = read<StreetSurveyBatch>('data/research/batches/madhapur-medplus-vijaya-low-yellow-20261018.json');
const current = read<StreetSurveyData>('public/research/street-survey.json'), buildingId = 'b_93e07dedb0';

describe('photographed low MedPlus/Vijaya body', () => {
  it('corrects only its explicitly provisional height while preserving footprint and access', async () => {
    const data = (await ingestStreetSurveyBatch(current, batch, core, validateStreetSurvey)).data;
    const survey = new StreetSurvey(data, core), chunk = survey.applyChunk(sourceChunk);
    const before = sourceChunk.buildings.find(b => b.id === buildingId)!, after = chunk.buildings.find(b => b.id === buildingId)!;
    expect(before).toMatchObject({ heightM: 10.5, heightBasis: 'satellite_estimate' });
    expect(after).toMatchObject({ heightM: 7.4, levels: 2, heightStatus: 'provisional', heightBasis: 'street_review' });
    expect(after.footprint).toEqual(before.footprint); expect(after.holes).toEqual(before.holes); expect(after.centroid).toEqual(before.centroid);
    const beforeWorld = new WorldPhysics(core), afterWorld = new WorldPhysics(survey.applyCoreCorrections(core));
    beforeWorld.addChunk(sourceChunk); afterWorld.addChunk(chunk);
    const [x, z] = after.centroid;
    expect(beforeWorld.contacts(x, z, 8, .3, .1).some(c => c.id === buildingId)).toBe(true);
    expect(afterWorld.contacts(x, z, 8, .3, .1).some(c => c.id === buildingId)).toBe(false);
    expect(afterWorld.contacts(x, z, .2, .3, .1).some(c => c.id === buildingId)).toBe(true);
    expect(buildingAccessPlan(after, chunk.storefronts.filter(f => f.buildingId === buildingId), afterWorld.roads)).toMatchObject({ boxes: [], beams: [], pits: [], recesses: [] });
  });

  it('keeps a close observation separate from a complete side survey or new discount tenancy', async () => {
    const data = (await ingestStreetSurveyBatch(current, batch, core, validateStreetSurvey)).data, survey = new StreetSurvey(data, core);
    const fronts = data.storefrontOverrides.filter(f => batch.storefrontOverrides!.some(x => x.id === f.id)).sort((a, b) => a.alongRoadM - b.alongRoadM);
    expect(fronts.map(f => f.name)).toEqual(['MedPlus', 'VIJAYA SAI PHOTO FRAMES & STUDIO']);
    expect(fronts.every(f => f.floor === 0 && f.placementStatus === 'provisional')).toBe(true);
    expect(batch.roadReviews).toHaveLength(1);
    expect(batch.roadReviews![0].reviewedRanges!.every(r => r.allFrontagesRecorded === false && r.completeness === 'partial')).toBe(true);
    expect(survey.summary.verifiedStorefronts).toBe(0);
    expect(batch.sources!.every(s => s.captureDate === '2026-04' && s.assetPolicy === 'reference_only')).toBe(true);
    expect(batch.storefrontOverrides!.some(f => /discount|upper|gate/i.test(f.name))).toBe(false);
  });
});
