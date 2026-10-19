import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { StreetSurvey, nearestSurveyRoadPoint } from '../../src/world/streetSurvey';
import { surveyRecordHash } from '../../src/world/streetSurveyBatch';
import { SourceAccuracyLayer, type SourceAccuracyData } from '../../src/world/sourceAccuracy';
import type { StreetSurveyBatch, StreetSurveyData } from '../../src/world/streetSurveyTypes';
import type { Building, WorldChunkV2, WorldCore } from '../../src/world/schema';
import { buildingAccessPlan, accessRoadIndex } from '../../src/world/buildingAccess';
import { streetSequence } from '../../src/ui/streetSequence';
import { buildChunk } from '../../src/art/buildings';
import { buildStorefronts, disposeStorefronts } from '../../src/art/storefronts';
import { surveyFront } from '../../src/art/researchedBuildings';

vi.mock('../../src/art/mats', async () => {
  const three = await import('three'); return { getWorldMats: () => new Proxy({}, { get: () => new three.MeshBasicMaterial({ vertexColors: true }) }) };
});
vi.mock('../../src/art/frontAtlas', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/art/frontAtlas')>(); const three = await import('three');
  return { ...actual, getFrontAtlas: () => new three.Texture() };
});
vi.mock('../../src/art/sign', async () => {
  const three = await import('three'); return { TELUGU_FAMILY: 'Test', ensureTeluguFont: async () => {}, createSignTexture: async () => new three.Texture() };
});
const read = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const base = 'public/world/hyd-metro/v2/';
const batch = read<StreetSurveyBatch>('data/research/batches/madhapur-east-next-20261018.json');
const data = read<StreetSurveyData>('public/research/street-survey.json');
const accuracy = new SourceAccuracyLayer(read<SourceAccuracyData>(base + 'source-accuracy.json'));
const rawCore = accuracy.applyCore(read<WorldCore>(base + 'core.json'));
const survey = new StreetSurvey(data, rawCore), core = survey.applyCoreCorrections(rawCore);
const raw = accuracy.applyChunk(read<WorldChunkV2>(base + 'chunks/c_-82_-15.json'));
const applied = survey.applyChunk(raw), ids = new Set(batch.corrections!.map(c => 'buildingId' in c ? c.buildingId : ''));
const frontIds = new Set(batch.storefrontOverrides!.map(s => s.id));
const section = { ...applied, buildings: applied.buildings.filter(b => ids.has(b.id)), storefronts: applied.storefronts.filter(s => s.buildingId !== null && ids.has(s.buildingId)) };
const newFronts = section.storefronts.filter(s => frontIds.has(s.id));
const canvas = () => {
  const context = new Proxy({ measureText: (text: string) => ({ width: text.length * 24 }) }, { get: (target, key) => key in target ? target[key as keyof typeof target] : () => {} });
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });
};
afterEach(() => vi.unstubAllGlobals());

describe('revision42 bounded east-next frontage source integration', () => {
  it('has the imported immutable batch with dated sources and provisional dimensions', async () => {
    expect(data.revision).toBeGreaterThanOrEqual(42);
    expect(data.appliedBatches!.find(b => b.id === batch.id)!.contentHash).toBe(await surveyRecordHash(batch));
    expect(newFronts).toHaveLength(12); expect(section.buildings).toHaveLength(6);
    expect(batch.sources).toHaveLength(12); expect(new Set(batch.sources!.map(s => s.position?.panoId)).size).toBe(11);
    expect(batch.sources!.every(s => s.captureDate === '2026-04' && s.assetPolicy === 'reference_only')).toBe(true);
    expect(batch.storefrontOverrides!.every(s => s.placementStatus === 'provisional')).toBe(true);
    expect(batch.corrections!.every(c => c.kind === 'building_profile' && c.heightM === undefined && c.levels === undefined && !c.retainPresence)).toBe(true);
  });

  it('keeps actual passing order on each north outer side and reverses it without changing floor assignments', () => {
    const expected = [
      { roadId: 'r_36314993425_0', floors: [[0, ['happi', 'The Arvind Store', 'HOTEL ZEE ROOMS', 'JAGADAMBA HARDWARE & SANITARY', 'RATAN PLYWOOD & GLASS EMPORIUM', 'DTDC', 'SRI MAHALAKSHMI MEDICAL & GENERAL', 'SWAPNA COMMUNICATIONS']]] },
      { roadId: 'r_68630266621_0', floors: [[0, ['RAMRAJ COTTON & LINEN', 'ROMAN ISLAND']], [1, ['Live Ceramique']], [3, ['STARK FITNESS STUDIO / cult.fit']]] },
    ] as const;
    for (const wanted of expected) {
      const road = core.roads.find(r => r.id === wanted.roadId)!;
      const fronts = batch.storefrontOverrides!.filter(s => s.roadId === road.id);
      const forward = streetSequence(road, fronts).sides.find(s => s.canonicalSide === 'left')!;
      const reverse = streetSequence(road, [...fronts].reverse(), true).sides.find(s => s.canonicalSide === 'left')!;
      expect(forward.side).toBe('left'); expect(reverse.side).toBe('right');
      for (const [floor, names] of wanted.floors) {
        expect(forward.floors.find(f => f.floor === floor)!.fronts.map(s => s.name)).toEqual(names);
        expect(reverse.floors.find(f => f.floor === floor)!.fronts.map(s => s.name)).toEqual([...names].reverse());
      }
      for (const s of fronts) expect(nearestSurveyRoadPoint(s.entrance, road)).toMatchObject({ side: 'left', alongM: expect.closeTo(s.alongRoadM, 3) });
    }
  });

  it('records unresolved canopy shops and repeated supplier/booking/gym panels without inventing additional tenants', () => {
    for (const name of ['SRI GANESH ELECTRICALS', 'SRI AMBICA SWEET SHOP', 'SHIV SHANKAR POWER TOOLS', 'BALAJI BAG REPAIRING CENTER', 'MD ALI KIRANA', 'GEETA WOOD WORKS']) {
      expect(batch.observations!.some(o => o.name.includes(name) && o.placementStatus === 'pending')).toBe(true);
      expect(newFronts.some(s => s.name.includes(name))).toBe(false);
    }
    expect(batch.observations!.find(o => o.id.endsWith('md-ali-pending'))!.roadId).toBe('r_68630266621_0');
    expect(newFronts.some(s => /Forest|SIS|COLSTON|OYO|CERA|Greenply|Merino|Prince|Pan Hub/.test(s.name))).toBe(false);
    expect(newFronts.filter(s => /cult\.fit|STARK/.test(s.name))).toHaveLength(1);
    expect(newFronts.some(s => s.floor === 2 || s.floor > 3)).toBe(false);
    expect(batch.observations!.some(o => o.id.endsWith('housekeeping') && /first merchant word is not/.test(o.notes))).toBe(true);
    const zee = section.buildings.find(b => b.id === 'b_09663ac5b1')!;
    const swapna = section.buildings.find(b => b.id === 'b_6c775fada8')!;
    expect(zee.researchedProfile!.signageOnly).toBe(true); expect(swapna.researchedProfile!.signageOnly).toBe(true);
  });

  it('supersedes the source Happi, Live and gym records once while preserving unresolved listing evidence', () => {
    for (const [place, frontage] of [
      ['577dc5c4-9d50-45fc-89f0-a6ab691d356d', 'sf_577dc5c49d'],
      ['25a3bdda-8269-491f-9000-f36f0d3a6a88', 'sf_25a3bdda82'],
      ['e751708a-d0d7-4681-a6a6-bba275dc615c', 'sf_e751708ad0'],
    ]) {
      expect(survey.allowsSourceListing(place, frontage)).toBe(false);
      expect(applied.storefronts.some(s => s.id === frontage)).toBe(false);
    }
    expect(survey.allowsSourceListing('1a3b9f4d-3545-4b37-b660-3486ee34ce60', 'sf_1a3b9f4d35')).toBe(true);
    expect(data.observations.filter(o => o.id === 'obs-madhapur-r223-tail-east-continuation')).toHaveLength(1);
    expect(data.observations.find(o => o.id === 'obs-madhapur-r223-tail-east-continuation')!.notes).toContain('extended, not duplicated');
  });

  it('preserves source-safe bodies, inherited heights and all shared access plans without restoring clipped slivers', () => {
    const corrections = new Set(batch.corrections!.map(c => c.id));
    const previousData = structuredClone(data);
    previousData.corrections = previousData.corrections.filter(c => !corrections.has(c.id));
    previousData.storefrontOverrides = previousData.storefrontOverrides.filter(s => !frontIds.has(s.id));
    for (const road of previousData.roads) for (const side of ['left', 'right'] as const)
      for (const range of road[side].reviewedRanges ?? []) range.storefrontIds = range.storefrontIds.filter(id => !frontIds.has(id));
    const prior = new StreetSurvey(previousData, rawCore).applyChunk(raw);
    const body = (b: Building) => ({ footprint: b.footprint, holes: b.holes, centroid: b.centroid, heightM: b.heightM,
      baseHeightM: b.baseHeightM, heightBasis: b.heightBasis, heightStatus: b.heightStatus, levels: b.levels, intrudesCarriageway: b.intrudesCarriageway });
    for (const b of section.buildings) {
      const old = prior.buildings.find(o => o.id === b.id)!;
      expect(body(b)).toEqual(body(old));
      const before = buildingAccessPlan(old, prior.storefronts.filter(s => s.buildingId === b.id), accessRoadIndex(core));
      const after = buildingAccessPlan(b, section.storefronts.filter(s => s.buildingId === b.id), accessRoadIndex(core));
      expect(after).toEqual(before); expect(after.pits).toEqual([]); expect(after.boxes).toEqual([]);
      expect(b.researchedProfile!.fronts.some(f => f.access || f.accessOnly)).toBe(false);
    }
    expect(section.buildings.map(b => [b.id, b.heightM]).sort()).toEqual([
      ['b_00c24876c5', 18.3], ['b_09663ac5b1', 16.9], ['b_0fee4c9239', 4.3],
      ['b_6c775fada8', 7], ['b_dab147be8f', 15.8], ['b_fc25788907', 20.9],
    ]);
    expect(section.buildings.find(b => b.id === 'b_fc25788907')!.footprint).toContainEqual([-16381.5303, -2871.8473]);
    expect(section.buildings.find(b => b.id === 'b_00c24876c5')!.footprint).toContainEqual([-16279.3488, -2839.3658]);
  });

  it('keeps bounded median inventory separate from incomplete shops and accepted revision41 ranges', () => {
    expect(batch.roadReviews).toHaveLength(4);
    for (const [roadId, endM] of [['r_36314993425_0', 79.89], ['r_68630266621_0', 32.24]] as const) {
      for (const side of ['left', 'right'] as const) {
        const range = survey.segment(roadId)![side].reviewedRanges!.find(r => r.startM === 0 && r.endM === endM)!;
        expect(range.completeness).toBe('partial'); expect(range.allFrontagesRecorded).toBe(side === 'right');
        if (side === 'right') expect(range.storefrontIds).toEqual([]);
      }
    }
    const accepted = read<StreetSurveyBatch>('data/research/batches/madhapur-r223-tail-20261018.json');
    for (const review of accepted.roadReviews!) for (const range of review.reviewedRanges!)
      expect(survey.segment(review.roadId)![review.side].reviewedRanges).toContainEqual(range);
    expect(data.observations.find(o => o.id === 'obs-madhapur-r223-tail-pride-missing-source-parent')!.placementStatus).toBe('pending');
    expect(newFronts.some(s => /Godavari|Bawarchi|Pann Top/.test(s.name))).toBe(false);
  });

  it('keeps every observed operator and repeat panel visible at three horizontal samples in both quality levels', async () => {
    canvas();
    for (const quality of ['low', 'standard'] as const) {
      const signs = buildStorefronts(section, core, quality), scene = new THREE.Group();
      scene.add(buildChunk(section, core, quality), signs); await signs.userData.pending; scene.updateMatrixWorld(true);
      const plate = (frame: ReturnType<typeof surveyFront>, u: number, y: number, h: number, width: number, depth: number, label: string) => {
        const normal = frame.world(0, 0, 1).sub(frame.world(0, 0, 0)).normalize();
        for (const fraction of [-.35, 0, .35]) {
          const centre = frame.world(u + width * fraction, y + h / 2, 0);
          const hit = new THREE.Raycaster(centre.clone().addScaledVector(normal, 8), normal.clone().negate(), 0, 9).intersectObject(scene, true)[0];
          expect(hit?.object.name, `${quality}/${label}/${fraction}`).toMatch(/^store-(signs|boards)/);
          expect(hit.point.clone().sub(centre).dot(normal), `${quality}/${label}/${fraction}`).toBeCloseTo(depth, 2);
        }
      };
      for (const s of newFronts) {
        const a = s.appearance!;
        plate(surveyFront(s.facade!, s.facingHeading), 0, a.signBaseM!, a.signHeightM!, a.signWidthM!, a.signOutsetM! + (s.floor > 0 ? .104 : .264), s.name);
      }
      for (const b of section.buildings) {
        const p = b.researchedProfile!, frame = surveyFront(p.fronts[0].facade!, p.fronts[0].facingHeading!);
        for (const panel of p.signPanels ?? [])
          plate(frame, ((panel.at ?? .5) - .5) * frame.W, panel.baseM, panel.heightM, (panel.widthRatio ?? .65) * frame.W, (panel.outsetM ?? .65) + .104, panel.text);
      }
      disposeStorefronts(signs);
    }
  });
});
