import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { StreetSurvey, validateStreetSurvey } from '../../src/world/streetSurvey';
import type { StreetSurveyData } from '../../src/world/streetSurveyTypes';
import type { ResearchedBuildingProfile } from '../../src/world/buildingProfile';
import type { WorldChunkV2, WorldCore, WorldManifest } from '../../src/world/schema';
import { SourceAccuracyLayer, type SourceAccuracyData } from '../../src/world/sourceAccuracy';
import { buildingAccessPlan } from '../../src/world/buildingAccess';
import { RoadIndex } from '../../src/world/roadIndex';

const read = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const base = 'public/world/hyd-metro/v2/';
const manifest = read<WorldManifest>(base + 'manifest.json');
const source = new SourceAccuracyLayer(read<SourceAccuracyData>(base + manifest.sourceAccuracy!.file));
const core = source.applyCore(read<WorldCore>(base + manifest.core.file));
const current = read<StreetSurveyData>('public/research/street-survey.json');
const raw = read<WorldChunkV2>(base + 'chunks/c_-84_-15.json');
const targets = ['b_743cd80e16', 'b_42a55533aa'];

function signProfile(buildingId: string): ResearchedBuildingProfile {
  const isBrown = buildingId === targets[0];
  return {
    signageOnly: true,
    sourceIds: [isBrown ? 'sv-madhapur-brown-block-2026-04-chrome-20261018' : 'sv-madhapur-lower-shops-2026-04-chrome-20261018'],
    appearanceStatus: 'observed', dimensionStatus: 'provisional', wallColor: isBrown ? '#926952' : '#e5e9e9',
    fronts: [{ storefrontIds: [isBrown ? 'survey-madhapur-slns-printers' : 'survey-madhapur-truecare-surgicals'], floors: [] }],
    signPanels: [{ text: 'Observed secondary board', baseM: 2, heightM: .5, color: '#eeeeee', textColor: '#333333' }],
  };
}

describe('secondary signs preserve the researched physical world', () => {
  it('retains every existing access box, recess and basement pit on the actual brown/MedPlus blocks', () => {
    const survey = new StreetSurvey(current, core), chunk = survey.applyChunk(source.applyChunk(raw));
    const roads = new RoadIndex(survey.applyCoreCorrections(core));
    const baseline: Record<string, string> = {};
    const comparisons: { before: ReturnType<typeof buildingAccessPlan>; after: ReturnType<typeof buildingAccessPlan> }[] = [];
    for (const id of targets) {
      const building = chunk.buildings.find(b => b.id === id)!;
      const withoutSigns = { ...building, researchedProfile: undefined };
      const stores = chunk.storefronts.filter(s => s.buildingId === id);
      const before = buildingAccessPlan(withoutSigns, stores, roads);
      expect(before.boxes.length).toBeGreaterThan(10); expect(before.pits).toHaveLength(1);
      baseline[id] = createHash('sha256').update(JSON.stringify(before)).digest('hex');
      comparisons.push({ before, after: buildingAccessPlan({ ...withoutSigns, researchedProfile: signProfile(id) }, stores, roads) });
      if (building.researchedProfile?.signageOnly) comparisons.push({ before, after: buildingAccessPlan(building, stores, roads) });
    }
    if (process.env.CAPTURE_SURVEY_SIGN_BASELINE) console.info('SIGNAGE_PHYSICAL_BASELINE', JSON.stringify(baseline));
    for (const { before, after } of comparisons) expect(after).toEqual(before);
  });

  it('accepts evidence-backed panels without increasing tenant or coverage counts', () => {
    const data = structuredClone(current);
    for (const correction of data.corrections) if (correction.kind === 'building_profile' && targets.includes(correction.buildingId)) {
      correction.profile = signProfile(correction.buildingId);
      correction.sourceIds = [...new Set([...correction.sourceIds, ...correction.profile.sourceIds])];
    }
    expect(validateStreetSurvey(data, core).errors).toEqual([]);
    const before = new StreetSurvey(current, core), after = new StreetSurvey(data, core);
    expect(after.summary).toEqual(before.summary);
  });

  it('rejects physical or architectural edits hidden inside a signage-only profile', () => {
    const data = structuredClone(current), correction = data.corrections.find(c => c.kind === 'building_profile' && c.buildingId === targets[0])!;
    if (correction.kind !== 'building_profile') throw new Error('Missing actual brown-block correction');
    correction.profile = signProfile(targets[0]);
    correction.profile.fronts[0].access = { landingHeightM: 1, landingDepthM: 1, stairs: [] };
    correction.profile.fronts[0].floors = [{ baseM: 0, heightM: 3, glazingRatio: 1 }];
    const errors = validateStreetSurvey(data, core).errors.join(' ');
    expect(errors).toContain('signage-only faces cannot change architecture or access');
    expect(errors).toContain('signage-only faces require empty floor bands');
  });
});
