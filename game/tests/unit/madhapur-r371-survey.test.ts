import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { StreetSurvey, validateStreetSurvey } from '../../src/world/streetSurvey';
import { ingestStreetSurveyBatch } from '../../src/world/streetSurveyBatch';
import type { StreetSurveyBatch, StreetSurveyData } from '../../src/world/streetSurveyTypes';
import { SourceAccuracyLayer, type SourceAccuracyData } from '../../src/world/sourceAccuracy';
import { buildingAccessPlan } from '../../src/world/buildingAccess';
import { RoadIndex } from '../../src/world/roadIndex';
import type { WorldChunkV2, WorldCore, WorldManifest } from '../../src/world/schema';

const read = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;
const base = 'public/world/hyd-metro/v2/';
const manifest = read<WorldManifest>(base + 'manifest.json');
const layer = new SourceAccuracyLayer(read<SourceAccuracyData>(base + manifest.sourceAccuracy!.file));
const core = layer.applyCore(read<WorldCore>(base + manifest.core.file));
const batch = read<StreetSurveyBatch>('data/research/batches/madhapur-r371-dsk-ss-estates-both-sides-20261018.json');
const current = read<StreetSurveyData>('public/research/street-survey.json');
const targets = ['b_405234dcd0', 'b_097ade60f4'];
const rawChunks = ['c_-84_-15', 'c_-83_-15'].map(id => read<WorldChunkV2>(base + 'chunks/' + id + '.json'));

async function fixture() {
  const after = (await ingestStreetSurveyBatch(current, batch, core, validateStreetSurvey)).data;
  const before = structuredClone(after);
  const without = <T extends { id: string }>(records: T[], incoming: { id: string }[] = []): T[] => {
    const introduced = new Set(incoming.map(x => x.id)); return records.filter(x => !introduced.has(x.id));
  };
  before.storefrontOverrides = without(before.storefrontOverrides, batch.storefrontOverrides);
  before.corrections = without(before.corrections, batch.corrections);
  before.suppressions = without(before.suppressions, batch.suppressions);
  before.observations = without(before.observations, batch.observations);
  const addedFronts = new Set(batch.storefrontOverrides!.map(f => f.id));
  const segment = before.roads.find(r => r.roadId === 'r_37185680086_0')!;
  for (const side of ['left', 'right'] as const) {
    const ranges = (segment[side].reviewedRanges ?? []).filter(r => !r.storefrontIds.some(id => addedFronts.has(id)) && !r.sourceIds.some(id => batch.sources!.some(s => s.id === id)));
    segment[side] = ranges.length ? { status: 'partial', reviewedRanges: ranges } : { status: 'unreviewed' };
  }
  return { before, after };
}

function physical(data: StreetSurveyData) {
  const survey = new StreetSurvey(data, core), roads = new RoadIndex(survey.applyCoreCorrections(core));
  return rawChunks.flatMap(raw => {
    const chunk = survey.applyChunk(layer.applyChunk(raw));
    return chunk.buildings.filter(b => targets.includes(b.id)).map(b => ({ id: b.id, footprint: b.footprint, holes: b.holes, centroid: b.centroid, heightM: b.heightM, heightBasis: b.heightBasis, heightStatus: b.heightStatus, baseHeightM: b.baseHeightM, intrudes: b.intrudesCarriageway, access: buildingAccessPlan(b, chunk.storefronts.filter(s => s.buildingId === b.id), roads) }));
  }).sort((a, b) => a.id.localeCompare(b.id));
}

describe('dated continuous Madhapur r371 reconstruction', () => {
  it('preserves source footprints, satellite heights and every physical access component', async () => {
    const { before, after } = await fixture(), original = physical(before), rebuilt = physical(after);
    expect(original).toHaveLength(2); expect(rebuilt).toEqual(original);
    expect(rebuilt.every(b => b.heightBasis === 'satellite_estimate' && b.heightStatus === 'provisional')).toBe(true);
    expect(rebuilt.every(b => b.access.boxes.length === 0 && b.access.pits.length === 0)).toBe(true);
    if (process.env.CAPTURE_SURVEY_SIGN_BASELINE) console.info('R371_PHYSICAL_BASELINE', createHash('sha256').update(JSON.stringify(original)).digest('hex'));
  });

  it('keeps observed west-to-east shop order and product branding distinct from extra tenants', async () => {
    const { after } = await fixture(), fronts = after.storefrontOverrides.filter(f => batch.storefrontOverrides!.some(x => x.id === f.id));
    expect(fronts).toHaveLength(11); expect(fronts.every(f => f.placementStatus === 'provisional' && f.roadId === 'r_37185680086_0' && f.side === 'left')).toBe(true);
    const ground = fronts.filter(f => f.floor === 0).sort((a, b) => a.alongRoadM - b.alongRoadM);
    expect(ground.map(f => f.id)).toEqual(['dsk-global-express', 'madhav-marketing-services', 'sri-madhav-acc', 'apollo-pharmacy-dsk-row', 'balaji-art-gallery', 'bosch-ss-estates'].map(x => 'survey-madhapur-' + x));
    expect(ground[1].appearance).toMatchObject({ frontStyle: 'open_bay', observedDisplay: 'cement_bags', displaySide: 'left' });
    expect(ground[2].appearance).toMatchObject({ frontStyle: 'open_bay', observedDisplay: 'cement_bags', displaySide: 'right' });
    const panels = after.corrections.filter(c => c.kind === 'building_profile' && targets.includes(c.buildingId)).flatMap(c => c.kind === 'building_profile' ? c.profile?.signPanels ?? [] : []);
    expect(panels.map(p => p.text).some(t => t.includes('MAHA CEMENT'))).toBe(true);
    expect(fronts.some(f => f.name.includes('MAHA CEMENT') || f.name.includes('SS ESTATES'))).toBe(false);
  });

  it('inventories only the immediate carriageway sides without promoting metric verification', async () => {
    const { after } = await fixture(), survey = new StreetSurvey(after, core), side = after.roads.find(r => r.roadId === 'r_37185680086_0')!;
    for (const key of ['left', 'right'] as const) expect(side[key]).toMatchObject({ status: 'partial', reviewedRanges: [{ startM: 0, endM: 50.76, completeness: 'partial', allFrontagesRecorded: true }] });
    expect(side.right.reviewedRanges![0].storefrontIds).toEqual([]);
    expect(side.left.reviewedRanges![0].storefrontIds).toHaveLength(11);
    expect(survey.summary).toMatchObject({ verifiedSides: 0, verifiedStorefronts: 0, verifiedSideLengthM: 0 });
    expect(batch.sources!.every(s => s.captureDate === '2026-04' && s.assetPolicy === 'reference_only')).toBe(true);
  });
});
