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
import { MapView } from '../../src/ui/map';
import type { WorldPhysics } from '../../src/world/collision';
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
const batch = read<StreetSurveyBatch>('data/research/batches/madhapur-east-after-ramraj-20261018.json');
const data = read<StreetSurveyData>('public/research/street-survey.json');
const accuracy = new SourceAccuracyLayer(read<SourceAccuracyData>(base + 'source-accuracy.json'));
const rawCore = accuracy.applyCore(read<WorldCore>(base + 'core.json'));
const survey = new StreetSurvey(data, rawCore), core = survey.applyCoreCorrections(rawCore);
const sourceChunks = ['c_-82_-15', 'c_-81_-14'].map(id => read<WorldChunkV2>(base + 'chunks/' + id + '.json'));
const chunks = sourceChunks.map(raw => survey.applyChunk(accuracy.applyChunk(raw)));
const raw = accuracy.applyChunk(sourceChunks[0]), applied = chunks[0];
const ids = new Set(['b_d9a7c2b71c', 'b_74fd38e218']), frontIds = new Set(batch.storefrontOverrides!.map(s => s.id));
const section = { ...applied, buildings: applied.buildings.filter(b => ids.has(b.id)), storefronts: applied.storefronts.filter(s => s.buildingId !== null && ids.has(s.buildingId)) };
const fronts = section.storefronts.filter(s => frontIds.has(s.id));
afterEach(() => vi.unstubAllGlobals());

describe('revision43 bounded east-after-Ramraj source integration', () => {
  it('matches the imported immutable three-front batch and case-sensitive camera references', async () => {
    expect(data.revision).toBeGreaterThanOrEqual(43);
    expect(data.appliedBatches!.find(b => b.id === batch.id)!.contentHash).toBe(await surveyRecordHash(batch));
    expect(fronts).toHaveLength(3); expect(batch.corrections!.filter(c => c.kind === 'building_profile')).toHaveLength(2);
    expect(batch.corrections!.filter(c => c.kind === 'landmark_anchor')).toHaveLength(1);
    expect(batch.sources).toHaveLength(15); expect(batch.observations).toHaveLength(21);
    expect(batch.sources!.every(s => s.captureDate === '2026-04' && s.assetPolicy === 'reference_only')).toBe(true);
    for (const source of batch.sources!) {
      const q = new URL(source.url).searchParams;
      expect(q.get('pano')).toBe(source.position!.panoId); expect(Number(q.get('heading'))).toBe(source.position!.headingDeg);
    }
    expect(batch.sources!.find(s => s.id.includes('compound-occlusion'))!.position!.panoId).toBe('Np4sY7tvYtpr8rwb9I431w');
    expect(batch.storefrontOverrides!.every(s => s.placementStatus === 'provisional')).toBe(true);
  });

  it('uses the real directed continuation and preserves passing order independently of travel direction', () => {
    let previous = core.directed.find(e => e.id === 'r_68630266621_0:f')!;
    for (const roadId of ['r_57338498840_0', 'r_31627731675_0', 'r_54532951764_0']) {
      const edge = core.directed.find(e => e.id === roadId + ':f')!, road = core.roads.find(r => r.id === roadId)!;
      expect(previous.next).toContain(edge.id); expect(previous.toNode).toBe(edge.fromNode);
      expect(road).toMatchObject({ highway: 'primary', oneway: true, bridge: false, tunnel: false, elevationM: 0 });
      const local = batch.storefrontOverrides!.filter(s => s.roadId === roadId);
      const expected = roadId === 'r_57338498840_0' ? ['GODAVARI'] : roadId === 'r_31627731675_0' ? ['RAM ENTERPRISES', 'HELMET WORLD / Padmaja Agencies'] : [];
      if (local.length) {
        const forward = streetSequence(road, local).sides.find(s => s.canonicalSide === 'left')!;
        const reverse = streetSequence(road, [...local].reverse(), true).sides.find(s => s.canonicalSide === 'left')!;
        expect(forward.side).toBe('left'); expect(reverse.side).toBe('right');
        expect(forward.floors.find(f => f.floor === 0)!.fronts.map(s => s.name)).toEqual(expected);
        expect(reverse.floors.find(f => f.floor === 0)!.fronts.map(s => s.name)).toEqual([...expected].reverse());
      } else expect(expected).toEqual([]);
      for (const s of local) expect(nearestSurveyRoadPoint(s.entrance, road)).toMatchObject({ side: 'left', alongM: expect.closeTo(s.alongRoadM, 3) });
      previous = edge;
    }
    expect(fronts.every(s => s.floor === 0)).toBe(true);
  });

  it('suppresses two photographed wrong public facade guesses while keeping original raw inventory and unrelated side listings', () => {
    expect(batch.suppressions!.map(s => s.storefrontId).sort()).toEqual(['sf_090f3c25ff', 'sf_17c1c1e23e']);
    const map = new MapView(core, {} as WorldPhysics, survey); chunks.forEach(c => map.addChunk(c));
    for (const [id, place] of [['sf_090f3c25ff', '090f3c25-ffe9-45a9-95e7-a6029a086f68'], ['sf_17c1c1e23e', '17c1c1e2-3e68-4d02-acb1-0b54759e3394']]) {
      expect(sourceChunks.flatMap(c => c.storefronts).some(s => s.id === id)).toBe(true);
      expect(map.storefronts.some(s => s.id === id)).toBe(false); expect(survey.allowsSourceListing(place, id)).toBe(false);
    }
    expect(survey.allowsSourceListing('75f8a29e-11ed-4279-9c02-a511e0283abf', 'sf_75f8a29e11')).toBe(true);
    expect(survey.allowsSourceListing('5ed3d5d4-1258-4446-93f7-30803ff4bb35', 'sf_5ed3d5d412')).toBe(true);
    expect(survey.allowsSourceListing('8eb57c44-4661-4a63-885c-ba9a85f662c1', 'sf_8eb57c4446')).toBe(true);
  });

  it('keeps canopy, missing-white-body, booth and temple identities as observations without guessed parents or upper tenants', () => {
    for (const word of ['DEVI SRI', 'Dento Facial', 'SRI RAMDEV', 'SAGAR ELECTRICAL', 'MAHA LAXMI', 'GS Bakery', 'HP GAS', 'LaundryTO', 'PAWAN PUTRA', 'Sri Venkateswara']) {
      expect(batch.observations!.some(o => o.name.includes(word) && o.placementStatus === 'pending')).toBe(true);
      expect(fronts.some(s => s.name.includes(word))).toBe(false);
    }
    expect(batch.observations!.find(o => o.id.endsWith('white-body-source-gap'))!.notes).toContain('no separate near-road body');
    expect(batch.observations!.find(o => o.id.endsWith('east-shrine-pg'))!.notes).toContain('శ్రీ వేంకటేశ్వర స్వామి దేవాలయం');
    expect(fronts.some(s => /Hanuman|PANN TOP|SIS|PRINCE|Asianpaint|Enclave/.test(s.name))).toBe(false);
    expect(section.buildings.find(b => b.id === 'b_74fd38e218')!.name).toBe('BALAIAH YADAV ENCLAVE');
    expect(batch.corrections!.find(c => c.kind === 'landmark_anchor')!.notes).toContain('E versus F unresolved');
    expect(data.observations.filter(o => o.id === 'obs-madhapur-east-next-east-continuation')).toHaveLength(1);
  });

  it('retains exact building body/support inputs and shared access plans at the unchanged source heights', () => {
    const previous = structuredClone(data), corrections = new Set(batch.corrections!.map(c => c.id));
    previous.corrections = previous.corrections.filter(c => !corrections.has(c.id));
    previous.storefrontOverrides = previous.storefrontOverrides.filter(s => !frontIds.has(s.id));
    for (const road of previous.roads) for (const side of ['left', 'right'] as const)
      for (const range of road[side].reviewedRanges ?? []) range.storefrontIds = range.storefrontIds.filter(id => !frontIds.has(id));
    const before = new StreetSurvey(previous, rawCore).applyChunk(raw);
    const body = (b: Building) => ({ footprint: b.footprint, holes: b.holes, centroid: b.centroid, heightM: b.heightM,
      baseHeightM: b.baseHeightM, heightBasis: b.heightBasis, heightStatus: b.heightStatus, levels: b.levels, intrudesCarriageway: b.intrudesCarriageway });
    for (const b of section.buildings) {
      const old = before.buildings.find(o => o.id === b.id)!; expect(body(b)).toEqual(body(old));
      const plan = buildingAccessPlan(b, section.storefronts.filter(s => s.buildingId === b.id), accessRoadIndex(core));
      expect(plan).toEqual(buildingAccessPlan(old, before.storefronts.filter(s => s.buildingId === b.id), accessRoadIndex(core)));
      expect(plan.boxes).toEqual([]); expect(plan.pits).toEqual([]); expect(b.researchedProfile!.fronts.some(f => f.access || f.accessOnly)).toBe(false);
    }
    expect(section.buildings.map(b => [b.id, b.heightM]).sort()).toEqual([['b_74fd38e218', 17.7], ['b_d9a7c2b71c', 14.9]]);
    expect(batch.corrections!.every(c => c.kind !== 'building_profile' || (c.heightM === undefined && c.levels === undefined && !c.retainPresence))).toBe(true);
  });

  it('bounds median-only inventory to the three local ranges and preserves accepted41/42/Pride', () => {
    expect(batch.roadReviews).toHaveLength(6);
    for (const [roadId, endM] of [['r_57338498840_0', 40.08], ['r_31627731675_0', 32.7], ['r_54532951764_0', 59.11]] as const)
      for (const side of ['left', 'right'] as const) {
        const range = survey.segment(roadId)![side].reviewedRanges!.find(r => r.startM === 0 && r.endM === endM)!;
        expect(range.completeness).toBe('partial'); expect(range.allFrontagesRecorded).toBe(side === 'right');
        if (side === 'right') expect(range.storefrontIds).toEqual([]);
      }
    for (const path of ['madhapur-r223-tail-20261018', 'madhapur-east-next-20261018']) {
      const accepted = read<StreetSurveyBatch>('data/research/batches/' + path + '.json');
      for (const r of accepted.roadReviews!) for (const range of r.reviewedRanges!) expect(survey.segment(r.roadId)![r.side].reviewedRanges).toContainEqual(range);
    }
    expect(data.observations.find(o => o.id === 'obs-madhapur-r223-tail-pride-missing-source-parent')!.placementStatus).toBe('pending');
  });

  it('keeps all merchant, building-name and supplier plates visible at three samples in low and standard', async () => {
    const context = new Proxy({ measureText: (text: string) => ({ width: text.length * 24 }) }, { get: (target, key) => key in target ? target[key as keyof typeof target] : () => {} });
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });
    for (const quality of ['low', 'standard'] as const) {
      const signs = buildStorefronts(section, core, quality), scene = new THREE.Group(); scene.add(buildChunk(section, core, quality), signs);
      await signs.userData.pending; scene.updateMatrixWorld(true);
      const plate = (frame: ReturnType<typeof surveyFront>, u: number, y: number, h: number, width: number, depth: number, label: string) => {
        const normal = frame.world(0, 0, 1).sub(frame.world(0, 0, 0)).normalize();
        for (const fraction of [-.35, 0, .35]) {
          const centre = frame.world(u + width * fraction, y + h / 2, 0);
          const hit = new THREE.Raycaster(centre.clone().addScaledVector(normal, 8), normal.clone().negate(), 0, 9).intersectObject(scene, true)[0];
          expect(hit?.object.name, `${quality}/${label}/${fraction}`).toMatch(/^store-(signs|boards)/);
          expect(hit.point.clone().sub(centre).dot(normal), `${quality}/${label}/${fraction}`).toBeCloseTo(depth, 2);
        }
      };
      for (const s of fronts) { const a = s.appearance!; plate(surveyFront(s.facade!, s.facingHeading), 0, a.signBaseM!, a.signHeightM!, a.signWidthM!, a.signOutsetM! + .264, s.name); }
      for (const b of section.buildings) {
        const p = b.researchedProfile!, frame = surveyFront(p.fronts[0].facade!, p.fronts[0].facingHeading!);
        for (const board of [...(p.nameBand ? [{ ...p.nameBand, text: b.name! }] : []), ...(p.signPanels ?? [])])
          plate(frame, ((board.at ?? .5) - .5) * frame.W, board.baseM, board.heightM, (board.widthRatio ?? .65) * frame.W, (board.outsetM ?? .65) + .104, board.text);
      }
      disposeStorefronts(signs);
    }
  });
});
