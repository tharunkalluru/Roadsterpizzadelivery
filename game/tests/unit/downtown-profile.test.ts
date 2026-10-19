import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { SourceAccuracyLayer, type SourceAccuracyData } from '../../src/world/sourceAccuracy';
import { StreetSurvey, nearestSurveyRoadPoint, validateStreetSurvey } from '../../src/world/streetSurvey';
import { ingestStreetSurveyBatch } from '../../src/world/streetSurveyBatch';
import { WorldPhysics } from '../../src/world/collision';
import type { StreetSurveyBatch, StreetSurveyData } from '../../src/world/streetSurveyTypes';
import type { Building, WorldChunkV2, WorldCore } from '../../src/world/schema';

const read = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const base = 'public/world/hyd-metro/v2/';
const rawCore = read<WorldCore>(base + 'core.json');
const rawChunk = read<WorldChunkV2>(base + 'chunks/c_-83_-15.json');
const accuracy = new SourceAccuracyLayer(read<SourceAccuracyData>(base + 'source-accuracy.json'));
const batch = read<StreetSurveyBatch>('data/research/batches/madhapur-downtown-r328-retail-six-level-20261018.json');
const id = 'b_4f47cd269d';
let survey: StreetSurvey, chunk: WorldChunkV2, building: Building;

beforeAll(async () => {
  const current = read<StreetSurveyData>('public/research/street-survey.json');
  const preview = await ingestStreetSurveyBatch(current, batch, rawCore, validateStreetSurvey);
  survey = new StreetSurvey(preview.data, accuracy.applyCore(rawCore));
  chunk = survey.applyChunk(accuracy.applyChunk(rawChunk));
  building = chunk.buildings.find(b => b.id === id)!;
});

describe('researched Downtown-PG and retail building', () => {
  it('records observed six levels separately from the estimated 18.8 m height and preserves the source footprint', () => {
    const original = rawChunk.buildings.find(b => b.id === id)!;
    expect(accuracy.applyChunk(rawChunk).buildings.find(b => b.id === id)).toMatchObject({ heightM: 14, heightBasis: 'satellite_estimate', levels: null });
    expect(building).toMatchObject({ heightM: 18.8, levels: 6, heightBasis: 'street_review', heightStatus: 'provisional' });
    expect(building.footprint).toEqual(original.footprint);
    expect(building.centroid).toEqual(original.centroid);
    expect(building.baseHeightM).toBe(original.baseHeightM);
    expect(building.researchedProfile?.fronts.every(f => !f.access && !f.accessOnly)).toBe(true);
    expect(accuracy.applyChunk({ ...rawChunk, buildings: [building] }).buildings[0].heightM).toBe(18.8);
    expect(accuracy.data.buildings[id].satellite?.heightM).toBe(14); // frozen estimate remains archived
  });

  it('uses the corrected height for airborne contact, without widening the body or leaving a stale collider on unload', () => {
    const core = survey.applyCoreCorrections(accuracy.applyCore(rawCore));
    const world = new WorldPhysics(core, 200), [x, z] = building.centroid;
    const updated: WorldChunkV2 = { ...rawChunk, id: 'downtown-height-fixture', buildings: [building], storefronts: [] };
    const baseline = { ...updated, buildings: [accuracy.applyChunk(rawChunk).buildings.find(b => b.id === id)!] };
    world.addChunk(baseline);
    expect(world.contacts(x, z, 16, .5, .1).filter(c => c.id === id)).toEqual([]);
    world.removeChunk(updated.id);
    world.addChunk(updated);
    expect(world.contacts(x, z, 16, .5, .1).some(c => c.id === id)).toBe(true);
    expect(world.contacts(x, z, 18.9, .3, .1).filter(c => c.id === id)).toEqual([]);
    expect(world.contacts(-16558.0, -2891.6, 1, .5, .1).filter(c => c.id === id)).toEqual([]);
    world.removeChunk(updated.id);
    expect(world.contacts(x, z, 16, .5, .1).filter(c => c.id === id)).toEqual([]);
  });

  it('keeps the east-to-west operators on the south outer side, with brands and repeated PG boards separate', () => {
    const names = batch.storefrontOverrides!.slice().sort((a, b) => a.alongRoadM - b.alongRoadM).map(s => s.name);
    expect(names).toEqual(['WOOD WORLD HARDWARE & STEELS', 'Shri KRISHNA MOBILE', 'DOWNTOWN-PG', 'Ambika Stationary Gift & Toys']);
    const road = rawCore.roads.find(r => r.id === 'r_32889097687_0')!;
    for (const sf of batch.storefrontOverrides!) {
      const mid: [number, number] = [(sf.facade[0][0] + sf.facade[1][0]) / 2, (sf.facade[0][1] + sf.facade[1][1]) / 2];
      expect(sf).toMatchObject({ roadId: road.id, side: 'left', placementStatus: 'provisional', floor: 0 });
      expect(nearestSurveyRoadPoint(mid, road).side).toBe(sf.side);
    }
    const panels = building.researchedProfile!.signPanels!.map(p => p.text);
    expect(panels).toEqual(['Greenply MDF', 'safari\nLUGGAGE SHOPPE', 'DOWNTOWN-PG\nPREMIUM WOMEN SPACES']);
    expect(batch.storefrontOverrides!.filter(s => /DOWNTOWN/.test(s.name))).toHaveLength(1);
    expect(batch.storefrontOverrides!.some(s => /Greenply|safari/i.test(s.name))).toBe(false);
    expect(batch.storefrontOverrides!.find(s => s.group === 'hardware')?.appearance).toMatchObject({ frontStyle: 'open_bay', categoryProps: false, observedDisplay: 'hardware_goods' });
    expect(batch.storefrontOverrides!.find(s => s.name.startsWith('Ambika'))?.appearance).toMatchObject({ frontStyle: 'open_bay', categoryProps: false, observedDisplay: 'luggage_goods' });
  });
});
