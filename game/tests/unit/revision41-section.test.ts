import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { StreetSurvey, nearestSurveyRoadPoint } from '../../src/world/streetSurvey';
import { surveyRecordHash } from '../../src/world/streetSurveyBatch';
import { SourceAccuracyLayer, type SourceAccuracyData } from '../../src/world/sourceAccuracy';
import type { StreetSurveyBatch, StreetSurveyData } from '../../src/world/streetSurveyTypes';
import type { Building, WorldChunkV2, WorldCore } from '../../src/world/schema';
import type { WorldPhysics } from '../../src/world/collision';
import { buildingAccessPlan, accessRoadIndex } from '../../src/world/buildingAccess';
import { MapView } from '../../src/ui/map';
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
const batch = read<StreetSurveyBatch>('data/research/batches/madhapur-r223-tail-20261018.json');
const data = read<StreetSurveyData>('public/research/street-survey.json');
const accuracy = new SourceAccuracyLayer(read<SourceAccuracyData>(base + 'source-accuracy.json'));
const rawCore = accuracy.applyCore(read<WorldCore>(base + 'core.json'));
const survey = new StreetSurvey(data, rawCore), core = survey.applyCoreCorrections(rawCore);
const raw = accuracy.applyChunk(read<WorldChunkV2>(base + 'chunks/c_-83_-15.json'));
const applied = survey.applyChunk(raw), ids = new Set(['b_09c40f224f', 'b_f51810dc45']);
const frontIds = new Set(batch.storefrontOverrides!.map(s => s.id));
const section = { ...applied, buildings: applied.buildings.filter(b => ids.has(b.id)), storefronts: applied.storefronts.filter(s => frontIds.has(s.id)) };
const road = core.roads.find(r => r.id === 'r_22340296037_0')!;
const canvas = () => {
  const context = new Proxy({ measureText: (text: string) => ({ width: text.length * 24 }) }, { get: (target, key) => key in target ? target[key as keyof typeof target] : () => {} });
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });
};
afterEach(() => vi.unstubAllGlobals());

describe('revision41 bounded glass / bank / tail source integration', () => {
  it('is the imported immutable12-front batch with distinct source and provisional metric status', async () => {
    expect(data.revision).toBeGreaterThanOrEqual(41);
    expect(data.appliedBatches!.find(b => b.id === batch.id)!.contentHash).toBe(await surveyRecordHash(batch));
    expect(section.storefronts).toHaveLength(12); expect(batch.sources).toHaveLength(10);
    expect(batch.storefrontOverrides!.every(s => s.placementStatus === 'provisional')).toBe(true);
    expect(batch.sources!.find(s => s.kind === 'satellite')!.captureDate).toBeNull();
    expect(batch.sources!.every(s => s.assetPolicy === 'reference_only')).toBe(true);
  });

  it('preserves observed west/east floor pairs, and reverses only the passing order in Atlas input', () => {
    const fronts = batch.storefrontOverrides!, expected = [
      ['SAMSUNG', 'LINEN CLUB', 'Canara Bank'],
      ['F2 LUXURIOUS THAI SPA', 'krafteria', "SRI SHIVA SAI LUXURY MEN'S HOSTEL / GUEST HOUSE"],
      ['LAKMÉ SALON FOR HIM AND HER', 'AMERICAN HAIR CLINIC'],
      ['La Excellence', 'Rego Thai Spa'], ['Amrutha Sankalp Clinic', 'IAC DENTAL'],
    ];
    const forward = streetSequence(road, fronts).sides.find(s => s.canonicalSide === 'left')!;
    const reverse = streetSequence(road, [...fronts].reverse(), true).sides.find(s => s.canonicalSide === 'left')!;
    expect(forward.side).toBe('left'); expect(reverse.side).toBe('right');
    for (let floor = 0; floor < expected.length; floor++) {
      expect(forward.floors.find(l => l.floor === floor)!.fronts.map(s => s.name)).toEqual(expected[floor]);
      expect(reverse.floors.find(l => l.floor === floor)!.fronts.map(s => s.name)).toEqual([...expected[floor]].reverse());
    }
    for (const s of fronts) expect(nearestSurveyRoadPoint(s.entrance, road)).toMatchObject({ side: 'left', alongM: expect.closeTo(s.alongRoadM, 3) });
    expect(fronts.some(s => s.floor > 4)).toBe(false); // highest west glass room stays unassigned
  });

  it('overrides a stale Canara glass-building name while Map receives Canara only at its observed bank', () => {
    const stale = { ...raw, buildings: raw.buildings.map(b => b.id === 'b_09c40f224f' ? { ...b, name: 'Canara Bank' } : b) };
    const corrected = survey.applyChunk(stale), glass = corrected.buildings.find(b => b.id === 'b_09c40f224f')!;
    expect(glass.name).toBe('MaPhar M K Eternal'); expect(glass.researchedProfile!.nameBand).toBeTruthy();
    const map = new MapView(core, {} as WorldPhysics, survey); map.addChunk(corrected);
    const banks = map.storefronts.filter(s => /^canara bank$/i.test(s.name));
    expect(banks).toHaveLength(1); expect(banks[0].buildingId).toBe('b_f51810dc45');
    expect(banks[0].x).toBeGreaterThan(glass.centroid[0]);
    expect(map.storefronts.filter(s => s.buildingId === glass.id).some(s => /canara/i.test(s.name))).toBe(false);
  });

  it('retains both source bodies and exact shared access plans instead of hiding new steps or pits in appearance', () => {
    const corrections = new Set(batch.corrections!.map(c => c.id));
    const prior = new StreetSurvey({ ...data, corrections: data.corrections.filter(c => !corrections.has(c.id)) }, rawCore).applyChunk(raw);
    const body = (b: Building) => ({ footprint: b.footprint, holes: b.holes, centroid: b.centroid, heightM: b.heightM,
      baseHeightM: b.baseHeightM, heightBasis: b.heightBasis, heightStatus: b.heightStatus, levels: b.levels, intrudesCarriageway: b.intrudesCarriageway });
    for (const b of section.buildings) {
      const old = prior.buildings.find(o => o.id === b.id)!;
      expect(body(b)).toEqual(body(old));
      expect(buildingAccessPlan(b, section.storefronts.filter(s => s.buildingId === b.id), accessRoadIndex(core)))
        .toEqual(buildingAccessPlan(old, prior.storefronts.filter(s => s.buildingId === b.id), accessRoadIndex(core)));
      expect(b.researchedProfile!.fronts.some(f => f.access || f.accessOnly)).toBe(false);
    }
    expect(section.buildings.map(b => [b.id, b.heightM]).sort()).toEqual([['b_09c40f224f', 19.2], ['b_f51810dc45', 20.2]]);
  });

  it('preserves prefix ranges and keeps orange/eastern identities pending while only the immediate median is inventoried', () => {
    const prefix = read<StreetSurveyBatch>('data/research/batches/madhapur-r177-r223-corner-foodcourt-20261018.json');
    const review = survey.segment(road.id)!;
    for (const old of prefix.roadReviews!.filter(r => r.roadId === road.id)) for (const range of old.reviewedRanges!)
      expect(review[old.side].reviewedRanges).toContainEqual(range);
    for (const side of ['left', 'right'] as const) {
      const tail = review[side].reviewedRanges!.filter(r => r.startM === 55 && r.endM === 154.93);
      expect(tail).toHaveLength(1); expect(tail[0].completeness).toBe('partial');
      expect(tail[0].allFrontagesRecorded).toBe(side === 'right');
      if (side === 'right') expect(tail[0].storefrontIds).toEqual([]);
    }
    expect(batch.storefrontOverrides!.some(s => /Pride|Bandhan|Sangeetha|OLA|Bharat|ICICI|Nainiron|AbroadKraft|happi/i.test(s.name))).toBe(false);
    expect(batch.observations!.some(o => o.id.endsWith('pride-missing-source-parent') && o.placementStatus === 'pending')).toBe(true);
    expect(batch.observations!.find(o => o.id.endsWith('east-continuation'))!.category).toBe('unreviewed_continuation');
    expect(data.observations.filter(o => o.id === 'obs-madhapur-r177-r223-glass-continuation')).toHaveLength(1);
  });

  it('keeps all12 operator plates and shared/repeated panels visible at low and standard without panel-edge overlap', async () => {
    canvas();
    for (const quality of ['low', 'standard'] as const) {
      const signs = buildStorefronts(section, core, quality), scene = new THREE.Group();
      scene.add(buildChunk(section, core, quality), signs); await signs.userData.pending; scene.updateMatrixWorld(true);
      const plate = (frame: ReturnType<typeof surveyFront>, u: number, y: number, h: number, width: number, depth: number, label: string) => {
        const normal = frame.world(0, 0, 1).sub(frame.world(0, 0, 0)).normalize();
        for (const fraction of [-.35, 0, .35]) {
          const centre = frame.world(u + width * fraction, y + h / 2, 0);
          const hit = new THREE.Raycaster(centre.clone().addScaledVector(normal, 8), normal.clone().negate(), 0, 9).intersectObject(scene, true)[0];
          expect(hit?.object.name, `${quality}/${label}`).toMatch(/^store-(signs|boards)/);
          expect(hit.point.clone().sub(centre).dot(normal), `${quality}/${label}`).toBeCloseTo(depth, 2);
        }
      };
      for (const s of section.storefronts) {
        const a = s.appearance!; plate(surveyFront(s.facade!, s.facingHeading), 0, a.signBaseM!, a.signHeightM!, a.signWidthM!, a.signOutsetM! + (s.floor > 0 ? .104 : .264), s.name);
      }
      for (const b of section.buildings) {
        const p = b.researchedProfile!, frame = surveyFront(p.fronts[0].facade!, p.fronts[0].facingHeading!);
        for (const panel of [...(p.nameBand && b.name ? [{ ...p.nameBand, text: b.name }] : []), ...(p.signPanels ?? [])])
          plate(frame, ((panel.at ?? .5) - .5) * frame.W, panel.baseM, panel.heightM, (panel.widthRatio ?? .65) * frame.W, (panel.outsetM ?? .65) + .104, panel.text);
        const panels = p.signPanels ?? [];
        for (let i = 0; i < panels.length; i++) for (let j = i + 1; j < panels.length; j++) {
          const a = panels[i], c = panels[j];
          if (Math.min(a.baseM + a.heightM, c.baseM + c.heightM) <= Math.max(a.baseM, c.baseM)) continue;
          const horizontalOverlap = Math.min(a.at! + a.widthRatio! / 2, c.at! + c.widthRatio! / 2) - Math.max(a.at! - a.widthRatio! / 2, c.at! - c.widthRatio! / 2);
          expect(horizontalOverlap, `${a.text}/${c.text}`).toBeLessThanOrEqual(0);
        }
      }
      disposeStorefronts(signs);
    }
  });
});
