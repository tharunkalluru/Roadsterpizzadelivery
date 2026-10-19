import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { StreetSurvey, nearestSurveyRoadPoint, validateStreetSurvey } from '../../src/world/streetSurvey';
import { ingestStreetSurveyBatch } from '../../src/world/streetSurveyBatch';
import { SourceAccuracyLayer, type SourceAccuracyData } from '../../src/world/sourceAccuracy';
import { buildingAccessPlan } from '../../src/world/buildingAccess';
import { RoadIndex } from '../../src/world/roadIndex';
import { signTextArea } from '../../src/art/signAtlas';
import type { Building, WorldChunkV2, WorldCore } from '../../src/world/schema';
import type { StreetSurveyBatch, StreetSurveyData } from '../../src/world/streetSurveyTypes';

const read = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const base = 'public/world/hyd-metro/v2/';
const batch = read<StreetSurveyBatch>('data/research/batches/madhapur-r177-r223-corner-foodcourt-20261018.json');
const source = new SourceAccuracyLayer(read<SourceAccuracyData>(base + 'source-accuracy.json'));
const core = source.applyCore(read<WorldCore>(base + 'core.json'));
const raw = read<WorldChunkV2>(base + 'chunks/c_-83_-15.json');
const ids = ['b_47f0ce2c81', 'b_f0bce3a163'];
let before: WorldChunkV2, after: WorldChunkV2, roads: RoadIndex;

beforeAll(async () => {
  const current = read<StreetSurveyData>('public/research/street-survey.json');
  const preview = await ingestStreetSurveyBatch(current, batch, core, validateStreetSurvey);
  const correctionIds = new Set(batch.corrections!.map(c => c.id));
  const baseline = new StreetSurvey({ ...current, corrections: current.corrections.filter(c => !correctionIds.has(c.id)) }, core);
  const researched = new StreetSurvey(preview.data, core);
  before = baseline.applyChunk(source.applyChunk(raw));
  after = researched.applyChunk(source.applyChunk(raw));
  roads = new RoadIndex(researched.applyCoreCorrections(core));
});

describe('bounded Madhapur cream corner and foodcourt evidence', () => {
  it('preserves physical inputs and shared access, including the explicitly unresolved foodcourt body', () => {
    const physical = (b: Building) => ({ footprint: b.footprint, holes: b.holes, centroid: b.centroid, heightM: b.heightM,
      levels: b.levels, baseHeightM: b.baseHeightM, heightBasis: b.heightBasis, heightStatus: b.heightStatus, intrudesCarriageway: b.intrudesCarriageway });
    for (const id of ids) {
      const old = before.buildings.find(b => b.id === id)!, current = after.buildings.find(b => b.id === id)!;
      expect(physical(current)).toEqual(physical(old));
      expect(buildingAccessPlan(current, after.storefronts.filter(s => s.buildingId === id), roads))
        .toEqual(buildingAccessPlan(old, before.storefronts.filter(s => s.buildingId === id), roads));
    }
    expect(after.buildings.find(b => b.id === ids[0])).toMatchObject({ heightM: 9, heightBasis: 'satellite_estimate' });
    expect(after.buildings.find(b => b.id === ids[1])).toMatchObject({ heightM: 7, heightBasis: 'class_fallback',
      researchedProfile: { signageOnly: true, fronts: [{ floors: [] }] } });
    expect(batch.corrections!.every(c => c.kind === 'building_profile' && !c.heightM && c.levels === undefined && !c.retainPresence)).toBe(true);
  });

  it('keeps the observed west-to-east order and one clinic despite its higher mounted sign', () => {
    const fronts = batch.storefrontOverrides!, order = (floor: number) => fronts.filter(s => s.floor === floor).sort((a, b) => a.alongRoadM - b.alongRoadM).map(s => s.name);
    expect(order(0)).toEqual(['SURYA PLYWOOD & HARDWARE', 'RAJASTHAN RESTAURANT', 'LAXMI ELECTRO VISION', 'Sri Laxmi Sanitation', 'Madhapuram Food Court']);
    expect(order(1)).toEqual(['SRI SAI SARITHA SUPERSPECIALITY DENTAL CLINIC', "VIRA'S HOMEOPATHY"]);
    expect(order(2)).toEqual(['Oxrich ADMISSIONS HUB', 'The Magic Look']);
    const road = core.roads.find(r => r.id === 'r_22340296037_0')!;
    for (const sf of fronts) {
      expect(sf).toMatchObject({ side: 'left', roadId: road.id, placementStatus: 'provisional' });
      expect(nearestSurveyRoadPoint(sf.entrance, road).side).toBe('left');
      expect(nearestSurveyRoadPoint(sf.entrance, road).alongM).toBeCloseTo(sf.alongRoadM, 3);
    }
    expect(fronts.filter(s => /SRI SAI SARITHA/.test(s.name))).toHaveLength(1);
    expect(fronts.find(s => /SRI SAI SARITHA/.test(s.name))!.appearance!.signBaseM).toBeGreaterThan(5.5);
    expect(fronts.some(s => /Schneider|CERA|Supreme|MERINO|Tea Stall|Village Taste|KAIRA/i.test(s.name))).toBe(false);
    expect(after.storefronts.some(s => s.id === 'sf_a3dbe54e6a' || s.id === 'sf_dc876fc93d')).toBe(false);
  });

  it('keeps supplier rectangles outside the actual operator text area at the shared ground band', () => {
    const profile = after.buildings.find(b => b.id === ids[0])!.researchedProfile!, facade = profile.fronts[0].facade!;
    const width = Math.hypot(facade[1][0] - facade[0][0], facade[1][1] - facade[0][1]);
    const origin = nearestSurveyRoadPoint(facade[0], core.roads.find(r => r.id === 'r_22340296037_0')!).alongM;
    const span = nearestSurveyRoadPoint(facade[1], core.roads.find(r => r.id === 'r_22340296037_0')!).alongM - origin;
    for (const sf of batch.storefrontOverrides!.filter(s => s.buildingId === ids[0] && s.floor === 0)) {
      const a = sf.appearance!, center = (sf.alongRoadM - origin) / span * width;
      const textWidth = signTextArea(a.signWidthM!, a.signHeightM!).widthM;
      for (const panel of profile.signPanels!.filter(p => p.baseM < 3)) {
        const pc = panel.at! * width, half = panel.widthRatio! * width / 2;
        expect(Math.min(center + textWidth / 2, pc + half) - Math.max(center - textWidth / 2, pc - half)).toBeLessThanOrEqual(.01);
      }
    }
  });

  it('inventories only the immediate median and preserves uncertain businesses as pending observations', () => {
    const review = batch.roadReviews!;
    expect(review.filter(r => r.side === 'right').map(r => [r.roadId, r.reviewedRanges![0].startM, r.reviewedRanges![0].endM]))
      .toEqual([['r_17731498241_0', 0, 10.26], ['r_22340296037_0', 0, 55]]);
    for (const r of review) for (const range of r.reviewedRanges!) {
      expect(range.completeness).toBe('partial');
      expect(range.allFrontagesRecorded).toBe(r.side === 'right');
      if (r.side === 'right') expect(range.storefrontIds).toEqual([]);
    }
    const tea = batch.observations!.find(o => o.name === 'MADHAPURAM TEA STALL')!;
    expect(tea).toMatchObject({ placementStatus: 'pending', category: 'unplaced_food_cart' });
    const corrected = batch.observations!.find(o => o.id === 'obs-madhapur-r328-red-clothing-partial-logo')!;
    expect(corrected.name).toContain('KAIRA'); expect(corrected.placementStatus).toBe('pending');
    expect(batch.expectedPrevious!['observations:' + corrected.id]).toMatch(/^[0-9a-f]{64}$/);
  });
});
