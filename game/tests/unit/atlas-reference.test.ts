import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { streetViewReference } from '../../src/ui/streetReference';
import { project, unproject } from '../../src/world/geo';
import type { WorldCore } from '../../src/world/schema';
import type { StreetSurveyBatch } from '../../src/world/streetSurveyTypes';

const read = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;
const fallbackUrl = 'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=17,78';
const road = { points: [[0, 0], [100, 0], [100, 100]] as [number, number][] };
const source = (id: string, x: number, z: number) => {
  const [lat, lon] = unproject(x, z);
  return { id, kind: 'street_view', url: `https://example.test/${id}?heading=270&pitch=8&fov=42.5`, position: { lat, lon } };
};
const choose = <T extends { id: string; kind: string; url: string; position?: { lat: number; lon: number } }>(sources: T[], ids: string[] = []) =>
  streetViewReference({ road, sources, associatedSourceIds: new Set(ids), project, fallbackUrl });

describe('Atlas road reference selection', () => {
  it('opens the actual TRIDENT road observation instead of the batch-first shelter370m away', () => {
    const core = read<WorldCore>('public/world/hyd-metro/v2/core.json');
    const batch = read<StreetSurveyBatch>('data/research/batches/raidurg-hitec-quickpass-2-20261018.json');
    const selectedRoad = core.roads.find(r => r.id === 'r_39977434396_1')!;
    const observations = batch.observations!.filter(o => o.roadId === selectedRoad.id);
    const associated = new Set(observations.flatMap(o => o.sourceIds));
    const expected = batch.sources!.find(s => s.id === 'sv-raidurg-hitec2-408m-west-202511-20261018')!;
    expect(batch.sources!.find(s => s.kind === 'street_view')!.position!.panoId).toBe('GRLM6ubWYSFDKnJaPBgWYg');
    const result = streetViewReference({ road: selectedRoad, sources: batch.sources!, associatedSourceIds: associated, project, fallbackUrl });
    expect(result.source).toBe(expected); expect(result.basis).toBe('road_evidence'); expect(result.url).toBe(expected.url);
    expect(result.url).toContain('5i86qy3VVq3aYlwpQAxeqA');
  });

  it('uses every segment of a bent road when no specific road observation exists', () => {
    const farther = source('near-start', 10, 10), closeToReturnLeg = source('return-leg', 101, 50);
    expect(choose([farther, closeToReturnLeg]).source).toBe(closeToReturnLeg);
  });

  it('prefers road-specific evidence among local cameras without rewriting captured framing', () => {
    const nearbyContext = source('context', 100, 50), observed = source('observed', 108, 50);
    const result = choose([nearbyContext, observed], [observed.id]);
    expect(result.source).toBe(observed); expect(result.url).toBe(observed.url);
    expect(result.url).toContain('heading=270&pitch=8&fov=42.5');
  });

  it('rejects distant road-linked or batch-linked business cameras in favour of a local camera', () => {
    const distant = source('other-block-business', 500, 500), local = source('local-context', 102, 30);
    expect(choose([distant, local], [distant.id]).source).toBe(local);
    expect(choose([distant], [distant.id])).toEqual({ url: fallbackUrl, basis: 'road_location' });
  });

  it('keeps a road-associated legacy URL when its camera coordinates are absent', () => {
    const legacy = { id: 'legacy', kind: 'street_view', url: 'https://example.test/raw?pitch=-4&fov=60' };
    expect(choose([legacy], [legacy.id])).toEqual({ source: legacy, url: legacy.url, basis: 'unpositioned_reference' });
  });

  it('uses an unpositioned review link only when no positioned camera is available', () => {
    const legacy = { id: 'legacy', kind: 'street_view', url: 'https://example.test/legacy' };
    expect(choose([legacy]).source).toBe(legacy);
    const distant = source('distant', 500, 500);
    expect(choose([legacy, distant])).toEqual({ url: fallbackUrl, basis: 'road_location' });
  });

  it('does not turn business listings, invalid positions or missing references into Street View evidence', () => {
    const official = { id: 'official', kind: 'official_business', url: 'https://example.test/business' };
    const invalid = { id: 'invalid', kind: 'street_view', url: 'https://example.test/invalid', position: { lat: NaN, lon: 78 } };
    expect(choose([official, invalid], [official.id, invalid.id])).toEqual({ url: fallbackUrl, basis: 'road_location' });
    expect(choose([])).toEqual({ url: fallbackUrl, basis: 'road_location' });
  });

  it('preserves the selected source and its framing-uncertainty notes without mutating inputs', () => {
    const observed = { ...source('unresolved-framing', 101, 50), notes: 'Exact side and captured framing remain unresolved.' };
    const sources = [observed], before = JSON.stringify(sources);
    const result = choose(sources, [observed.id]);
    expect(result.source).toBe(observed); expect(result.source!.notes).toContain('unresolved');
    expect(JSON.stringify(sources)).toBe(before);
  });
});
