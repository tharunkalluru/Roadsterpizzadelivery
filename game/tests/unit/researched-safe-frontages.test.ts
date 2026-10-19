import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { StreetSurvey } from '../../src/world/streetSurvey';
import type { StreetSurveyData } from '../../src/world/streetSurveyTypes';
import { SourceAccuracyLayer, type SourceAccuracyData } from '../../src/world/sourceAccuracy';
import { RoadIndex } from '../../src/world/roadIndex';
import { buildingAccessPlan } from '../../src/world/buildingAccess';
import type { Vec2, WorldChunkV2, WorldCore, WorldManifest } from '../../src/world/schema';

const read = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
function edgeDistance(p: Vec2, a: Vec2, b: Vec2) {
  const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t);
}

describe('researched signage on recovered source masses', () => {
  it('keeps Bata and its upper boards on the retained safe exterior rather than restoring the clipped alley sliver', () => {
    const base = 'public/world/hyd-metro/v2/', manifest = read<WorldManifest>(base + 'manifest.json');
    const accuracy = new SourceAccuracyLayer(read<SourceAccuracyData>(base + manifest.sourceAccuracy!.file));
    const core = accuracy.applyCore(read<WorldCore>(base + manifest.core.file));
    const data = read<StreetSurveyData>('public/research/street-survey.json'), raw = read<WorldChunkV2>(base + 'chunks/c_-83_-15.json');
    const sourceChunk = accuracy.applyChunk(raw), survey = new StreetSurvey(data, core), chunk = survey.applyChunk(sourceChunk);
    const building = chunk.buildings.find(b => b.id === 'b_836f4b519e')!, original = raw.buildings.find(b => b.id === building.id)!;
    expect(building.geometryReconciliation).toMatchObject({ status: 'clipped', geometryStatus: 'provisional' });
    expect(building.footprint).not.toEqual(original.footprint);
    expect(building.intrudesCarriageway).toBe(false);
    expect(building).toMatchObject({ heightM: 16.2, heightBasis: 'satellite_estimate', levels: null });
    expect(data.corrections.filter(c => c.kind === 'building_profile' && c.buildingId === building.id).every(c => c.kind === 'building_profile' && !c.retainPresence && c.heightM === undefined && c.levels === undefined)).toBe(true);
    const roads = new RoadIndex(survey.applyCoreCorrections(core)), fronts = chunk.storefronts.filter(f => f.buildingId === building.id && f.placeId.startsWith('survey:'));
    expect(fronts.length).toBeGreaterThanOrEqual(3);
    for (const front of fronts) for (let k = 0; k <= 12; k++) {
      const a = front.facade![0], b = front.facade![1], p: Vec2 = [a[0] + (b[0] - a[0]) * k / 12, a[1] + (b[1] - a[1]) * k / 12];
      expect(Math.min(...building.footprint.map((a, i) => edgeDistance(p, a, building.footprint[(i + 1) % building.footprint.length]))), front.id).toBeLessThan(.002);
      expect(roads.surface(...p, { maxY: .3, margin: .45 }), front.id).toBeNull();
    }
    expect(buildingAccessPlan(building, fronts, roads)).toMatchObject({ boxes: [], beams: [], pits: [], recesses: [] });
  });
});
