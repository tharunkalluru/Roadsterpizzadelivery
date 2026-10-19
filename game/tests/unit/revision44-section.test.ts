import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { StreetSurvey, nearestSurveyRoadPoint } from '../../src/world/streetSurvey';
import { surveyRecordHash } from '../../src/world/streetSurveyBatch';
import { SourceAccuracyLayer, type SourceAccuracyData } from '../../src/world/sourceAccuracy';
import type { StreetSurveyBatch, StreetSurveyData } from '../../src/world/streetSurveyTypes';
import type { Building, Vec2, WorldChunkV2, WorldCore } from '../../src/world/schema';
import { accessRoadIndex, buildingAccessPlan } from '../../src/world/buildingAccess';
import { streetSequence } from '../../src/ui/streetSequence';
import { MapView } from '../../src/ui/map';
import type { WorldPhysics } from '../../src/world/collision';

const read = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const base = 'public/world/hyd-metro/v2/';
const batch = read<StreetSurveyBatch>('data/research/batches/madhapur-after-compound-next-20261018.json');
const data = read<StreetSurveyData>('public/research/street-survey.json');
const previous = read<StreetSurveyData>('qa/artifacts/historical/revision43-final-street-survey.json');
const accuracy = new SourceAccuracyLayer(read<SourceAccuracyData>(base + 'source-accuracy.json'));
const rawCore = accuracy.applyCore(read<WorldCore>(base + 'core.json'));
const survey = new StreetSurvey(data, rawCore), prior = new StreetSurvey(previous, rawCore);
const core = survey.applyCoreCorrections(rawCore), raw = accuracy.applyChunk(read<WorldChunkV2>(base + 'chunks/c_-81_-14.json'));
const chunk = survey.applyChunk(raw), before = prior.applyChunk(raw);
const ids = new Set(['b_e5ad185902', 'b_4179bc1251']);
const frontIds = new Set(batch.storefrontOverrides!.map(s => s.id));
const fronts = chunk.storefronts.filter(s => frontIds.has(s.id));
const buildings = chunk.buildings.filter(b => ids.has(b.id));
const distanceToSegment = (p: Vec2, a: Vec2, b: Vec2): number => {
  const x = b[0] - a[0], z = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * x + (p[1] - a[1]) * z) / (x * x + z * z)));
  return Math.hypot(p[0] - a[0] - t * x, p[1] - a[1] - t * z);
};
const boundaryDistance = (p: Vec2, poly: Vec2[]): number => Math.min(...poly.map((a, i) => distanceToSegment(p, a, poly[(i + 1) % poly.length])));

describe('revision44 connected raised-retail source integration', () => {
  it('loads the immutable seven-front batch once and retains the dated camera references', async () => {
    expect(data.revision).toBeGreaterThanOrEqual(44);
    expect(data.appliedBatches!.find(b => b.id === batch.id)!.contentHash).toBe(await surveyRecordHash(batch));
    expect(fronts).toHaveLength(7); expect(new Set(fronts.map(s => s.id)).size).toBe(7);
    expect(batch.corrections!.filter(c => c.kind === 'building_profile')).toHaveLength(2);
    expect(batch.corrections!.filter(c => c.kind === 'landmark_anchor')).toHaveLength(2);
    expect(batch.sources).toHaveLength(16); expect(batch.observations).toHaveLength(14);
    expect(batch.storefrontOverrides!.every(s => s.placementStatus === 'provisional')).toBe(true);
    for (const source of batch.sources!) {
      expect(source.captureDate).toBe('2026-04'); expect(source.assetPolicy).toBe('reference_only');
      const q = new URL(source.url).searchParams;
      expect(q.get('pano')).toBe(source.position!.panoId);
      expect(Number(q.get('heading'))).toBe(source.position!.headingDeg);
    }
    expect(batch.sources!.find(s => s.id.endsWith('electronics-close-apr2026-20261018'))!.notes).toContain('TVS ELECTRONICS LIMITED');
    expect(batch.sources!.find(s => s.id.endsWith('eye-floor-close-apr2026-20261018'))!.notes).toContain('5th Floor / Lift in Cellar');
  });

  it('follows the unique directed continuation and preserves the three aligned retail/upper pairs', () => {
    let last = core.directed.find(e => e.id === 'r_54532951764_0:f')!;
    for (const roadId of ['r_49611679382_0', 'r_43518450735_0']) {
      const edge = core.directed.find(e => e.id === roadId + ':f')!, road = core.roads.find(r => r.id === roadId)!;
      expect(last.next).toContain(edge.id); expect(last.toNode).toBe(edge.fromNode);
      expect(road).toMatchObject({ highway: 'primary', oneway: true, bridge: false, tunnel: false, elevationM: 0 }); last = edge;
    }
    const road = core.roads.find(r => r.id === 'r_49611679382_0')!;
    const sequence = streetSequence(road, batch.storefrontOverrides!).sides.find(s => s.canonicalSide === 'left')!;
    const reverse = streetSequence(road, [...batch.storefrontOverrides!].reverse(), true).sides.find(s => s.canonicalSide === 'left')!;
    const expected = [
      ['THE VOGUE SALON', 'Printo', 'The Optic Store'],
      ['FACE CLINICS', 'LBR DENTAL & IMPLANT CENTER', 'TVS ELECTRONICS LIMITED / Dell Authorised Service Center', 'BANGS UNISEX SALON'],
    ];
    for (const floor of [0, 1]) {
      expect(sequence.floors.find(f => f.floor === floor)!.fronts.map(s => s.name)).toEqual(expected[floor]);
      expect(reverse.floors.find(f => f.floor === floor)!.fronts.map(s => s.name)).toEqual([...expected[floor]].reverse());
    }
    expect(sequence.side).toBe('left'); expect(reverse.side).toBe('right');
    for (const s of batch.storefrontOverrides!) expect(nearestSurveyRoadPoint(s.entrance, road)).toMatchObject({ side: 'left', alongM: expect.closeTo(s.alongRoadM, 3) });
    for (const [a, b] of [['vogue-salon', 'lbr-dental'], ['printo', 'tvs-electronics'], ['optic-store', 'bangs-salon']]) {
      const lower = fronts.find(s => s.id.endsWith(a))!, upper = fronts.find(s => s.id.endsWith(b))!;
      expect(lower.facade).toEqual(upper.facade); expect(lower.floor).toBe(0); expect(upper.floor).toBe(1);
      expect(lower.appearance!.frontBaseM).toBe(3); expect(lower.appearance!.frontStyle).toBe('glazed');
    }
  });

  it('uses retained source edges rather than flattening the sawtooth or naming its blind west wall', () => {
    for (const b of buildings) {
      for (const front of b.researchedProfile!.fronts) for (const point of front.facade!) expect(boundaryDistance(point, b.footprint)).toBeLessThan(.02);
      for (const s of fronts.filter(s => s.buildingId === b.id)) for (const point of s.facade!) expect(boundaryDistance(point, b.footprint)).toBeLessThan(.02);
    }
    const sawtooth = buildings.find(b => b.id === 'b_4179bc1251')!.researchedProfile!;
    expect(sawtooth.fronts).toHaveLength(4); expect(sawtooth.fronts[0].storefrontIds ?? []).toEqual([]);
    const lengths = sawtooth.fronts.map(f => Math.hypot(f.facade![1][0] - f.facade![0][0], f.facade![1][1] - f.facade![0][1]));
    expect(lengths.map(l => Math.round(l * 100) / 100)).toEqual([7.01, 9.48, 5.27, 7.88]);
    expect(sawtooth.fronts.slice(1).map(f => f.storefrontIds)).toEqual([
      ['survey-madhapur-after-compound-vogue-salon', 'survey-madhapur-after-compound-lbr-dental'],
      ['survey-madhapur-after-compound-printo', 'survey-madhapur-after-compound-tvs-electronics'],
      ['survey-madhapur-after-compound-optic-store', 'survey-madhapur-after-compound-bangs-salon'],
    ]);
  });

  it('replaces only the two confirmed same-parent listings and preserves the unrelated rear Printo inventory', () => {
    expect(batch.storefrontOverrides!.flatMap(s => s.replaceStorefrontIds ?? []).sort()).toEqual(['sf_65fe5604a9', 'sf_d15593a83b']);
    const map = new MapView(core, {} as WorldPhysics, survey); map.addChunk(chunk);
    for (const id of ['sf_65fe5604a9', 'sf_d15593a83b']) expect(map.storefronts.some(s => s.id === id)).toBe(false);
    const printo = map.storefronts.find(s => s.id === 'sf_012840b6f8')!;
    expect(printo.placement!.display).toBe('listing_only'); expect(printo.roadId).toBe('r_25458819302_0');
    expect(printo.x).toBe(raw.storefronts.find(s => s.id === printo.id)!.x); expect(printo.z).toBe(raw.storefronts.find(s => s.id === printo.id)!.z);
    expect(survey.allowsSourceListing('012840b6-f8cf-4397-b20c-30a230240c20', printo.id)).toBe(true);
    expect(batch.storefrontOverrides!.find(s => s.id.endsWith('-printo'))!.replaceStorefrontIds).toBeUndefined();
    expect(batch.suppressions ?? []).toEqual([]);
  });

  it('keeps posted-floor directions, building names and advertising separate from occupied storefronts', () => {
    const names = fronts.map(s => s.name);
    expect(names.some(n => /Madhavi|KTK|K T K|Kangen|SREA|SPACE III|APURUPA/.test(n))).toBe(false);
    expect(fronts.every(s => s.floor === 0 || s.floor === 1)).toBe(true);
    const eye = batch.observations!.find(o => o.id.endsWith('eye-posted-floor'))!;
    expect(eye.placementStatus).toBe('pending'); expect(eye.name).toContain('5th Floor / Lift in Cellar');
    expect(eye.notes).toContain('canonical');
    expect(batch.observations!.find(o => o.id.endsWith('accountant-panel-occupancy'))!.placementStatus).toBe('pending');
    expect(buildings.map(b => b.name).sort()).toEqual(['APURUPA KUSHI', 'SPACE III']);
    expect(names.filter(n => /TVS|Dell/.test(n))).toEqual(['TVS ELECTRONICS LIMITED / Dell Authorised Service Center']);
  });

  it('preserves building bodies, vertical support and shared access plans at frozen43 source heights', () => {
    const physical = (b: Building) => ({ footprint: b.footprint, holes: b.holes, centroid: b.centroid, heightM: b.heightM,
      baseHeightM: b.baseHeightM, heightBasis: b.heightBasis, heightStatus: b.heightStatus, levels: b.levels, intrudesCarriageway: b.intrudesCarriageway });
    for (const b of buildings) {
      const old = before.buildings.find(o => o.id === b.id)!; expect(physical(b)).toEqual(physical(old));
      const plan = buildingAccessPlan(b, chunk.storefronts.filter(s => s.buildingId === b.id), accessRoadIndex(core));
      expect(plan).toEqual(buildingAccessPlan(old, before.storefronts.filter(s => s.buildingId === b.id), accessRoadIndex(prior.applyCoreCorrections(rawCore))));
      expect(plan.boxes).toEqual([]); expect(plan.beams).toEqual([]); expect(plan.pits).toEqual([]);
      expect(b.researchedProfile!.fronts.some(f => f.access || f.accessOnly)).toBe(false);
    }
    expect(buildings.map(b => [b.id, b.heightM]).sort()).toEqual([['b_4179bc1251', 20.5], ['b_e5ad185902', 18.4]]);
    expect(batch.corrections!.every(c => c.kind !== 'building_profile' || (c.heightM === undefined && c.levels === undefined && !c.retainPresence))).toBe(true);
  });

  it('bounds only immediate-median visual inventory and retains all prior accepted road reviews', () => {
    expect(batch.roadReviews).toHaveLength(4);
    for (const [roadId, endM] of [['r_49611679382_0', 75.87], ['r_43518450735_0', 38.93]] as const)
      for (const side of ['left', 'right'] as const) {
        const range = survey.segment(roadId)![side].reviewedRanges!.find(r => r.startM === 0 && r.endM === endM)!;
        expect(range.completeness).toBe('partial'); expect(range.allFrontagesRecorded).toBe(side === 'right');
        if (side === 'right') expect(range.storefrontIds).toEqual([]);
      }
    for (const roadId of ['r_22340296037_0', 'r_36314993425_0', 'r_68630266621_0', 'r_57338498840_0', 'r_31627731675_0', 'r_54532951764_0'])
      expect(survey.segment(roadId)).toEqual(prior.segment(roadId));
    expect(data.observations.find(o => o.id === 'obs-madhapur-r223-tail-pride-missing-source-parent')!.placementStatus).toBe('pending');
  });
});
