import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { StreetSurvey, summarizeStreetSurvey, validateStreetSurvey } from '../../src/world/streetSurvey';
import { SourceAccuracyLayer, type SourceAccuracyData } from '../../src/world/sourceAccuracy';
import type { ReviewedRange, StreetSurveyData, SurveyStorefront } from '../../src/world/streetSurveyTypes';
import type { Storefront, WorldChunkV2, WorldCore } from '../../src/world/schema';
import type { ResearchedFrontProfile } from '../../src/world/buildingProfile';
import { makeFixtureCore } from './fixture';

function fixture() {
  const core = makeFixtureCore();
  const source = { id: 'source-fixture', kind: 'street_view' as const, title: 'Test imagery', url: 'https://example.com/panorama', captureDate: '2026-01', observedDate: '2026-10-17', reviewer: 'Test reviewer', position: { lat: 17.4146, lon: 78.5484, headingDeg: 0 }, notes: 'Fictional test fixture, not a Hyderabad observation.', assetPolicy: 'reference_only' as const };
  const proof = ['source-fixture'];
  const exact: SurveyStorefront = { id: 'survey-fixture-shop', placementStatus: 'verified', chunkId: 'fixture-chunk', name: 'Fixture Pharmacy', nameTe: null, category: 'pharmacy', group: 'pharmacy', roadId: 'A1', side: 'left', buildingId: 'fixture-building', frontageKind: 'building', facade: [[-8, -805], [-8, -795]], entrance: [-8, -800], floor: 1, frontageWidthM: 10, alongRoadM: 800, facingHeading: -Math.PI / 2, lat: 17.42, lon: 78.548, captureDate: '2026-01', sourceIds: proof, reviewedAt: '2026-10-17', reviewer: 'Test reviewer', evidence: { identity: proof, position: proof, side: proof, floor: proof, facade: proof, neighbours: proof }, appearance: { signColor: '#085a3b' }, notes: 'Fictional measured frontage used only for tests.' };
  const old: Storefront = { id: 'listing-nearby', placeId: 'place-fixture', name: 'Fixture Pharmacy', nameTe: null, category: 'pharmacy', group: 'pharmacy', confidence: 0.9, sources: ['listing'], license: 'test', x: -8, z: -805, buildingId: 'fixture-building', roadId: 'A1', side: 'left', facade: [[-8, -808], [-8, -802]], facingHeading: -Math.PI / 2, floor: 0, status: 'provisional' };
  const chunk: WorldChunkV2 = { id: 'fixture-chunk', ix: 0, iz: 0, buildings: [{ id: 'fixture-building', osmId: 'fixture/1', footprint: [[-14, -805], [-8, -805], [-8, -795], [-14, -795]], heightM: 10, heightStatus: 'provisional', levels: 3, name: null, kind: 'commercial', frontRoadId: 'A1', frontSide: 'left', centroid: [-11, -800], intrudesCarriageway: true }], storefronts: [old] };
  const data: StreetSurveyData = { schemaVersion: 1, revision: 1, worldId: 'fixture', worldVersion: 'fixture', generatedAt: '2026-10-17', referencePolicy: 'Test-only reference data', sources: [source], observations: [], roads: core.roads.map((r) => ({ roadId: r.id, left: { status: 'unreviewed' }, right: { status: 'unreviewed' } })), storefrontOverrides: [exact], suppressions: [], corrections: [] };
  const range = (startM: number, endM: number, complete = true): ReviewedRange => ({ startM, endM, sourceIds: proof, reviewedAt: '2026-10-17', reviewer: 'Test reviewer', completeness: complete ? 'complete' : 'partial', allFrontagesRecorded: complete, storefrontIds: startM <= 800 && endM >= 800 ? [exact.id] : [], notes: 'Fixture range fully checked including non-shop frontage.' });
  return { core, data, exact, chunk, range };
}

describe('street evidence and full-network coverage', () => {
  it('applies explicit replacements and suppressions to map listings without changing the source records',()=>{
    const {core,data,chunk}=fixture();
    data.storefrontOverrides[0].replaceStorefrontIds=['listing-nearby'];
    data.storefrontOverrides[0].replacePlaceIds=['place-fixture'];
    const survey=new StreetSurvey(data,core);
    expect(survey.allowsSourceListing('place-fixture',null)).toBe(false);
    expect(survey.allowsSourceListing('other-place','listing-nearby')).toBe(false);
    expect(survey.allowsSourceListing('unreviewed-place',null)).toBe(true);
    expect(chunk.storefronts[0].name).toBe('Fixture Pharmacy');
    expect(chunk.storefronts).toHaveLength(1);
  });
  it('requires every playable road, both sides, without inferring verification from a shop', () => {
    const { core, data, chunk } = fixture();
    const result = validateStreetSurvey(data, core, { chunks: [chunk] });
    expect(result.errors).toEqual([]);
    expect(result.summary).toMatchObject({ totalRoads: 6, totalSides: 12, unreviewedSides: 12, verifiedSides: 0, verifiedStorefronts: 1, coveragePercent: 0 });
    data.roads.pop();
    expect(validateStreetSurvey(data, core).errors.join(' ')).toContain('Playable road missing');
  });

  it('rejects missing proof, missing building IDs and misplaced facade/side/floor claims', () => {
    const { core, data, exact, chunk } = fixture();
    exact.evidence.floor = [];
    exact.side = 'right';
    exact.floor = 4;
    exact.buildingId = 'not-a-world-building';
    const errors = validateStreetSurvey(data, core, { chunks: [chunk] }).errors.join(' ');
    expect(errors).toContain('evidence.floor');
    expect(errors).toContain('side disagrees');
    expect(errors).toContain('building ID/chunk does not exist');
  });

  it('does not accept a listing source as proof for street-level geometry', () => {
    const { core, data } = fixture();
    data.sources[0].kind = 'map_listing';
    expect(validateStreetSurvey(data, core).errors.join(' ')).toContain('dated street-level evidence');
  });

  it('merges overlap and requires gap-free complete frontage review before verifying a side', () => {
    const { core, data, range } = fixture();
    data.roads[0].left = { status: 'verified', reviewedRanges: [range(0, 900)] };
    expect(validateStreetSurvey(data, core).errors.join(' ')).toContain('entire length');
    data.roads[0].left.reviewedRanges!.push(range(700, 1000));
    expect(validateStreetSurvey(data, core).errors).toEqual([]);
    const summary = summarizeStreetSurvey(data, core);
    expect(summary.reviewedSideLengthM).toBe(1000);
    expect(summary.verifiedSideLengthM).toBe(1000);
    expect(summary.verifiedSides).toBe(1);
    expect(summary.coveragePercent).toBeCloseTo(1000 / (summary.totalRoadLengthM * 2) * 100);
  });

  it('preserves source capture date, duplicate IDs and exact/pending placement distinctions', () => {
    const { core, data } = fixture();
    data.observations.push({ id: 'pending-fixture', sourceIds: ['source-fixture'], captureDate: '2026-01', observedDate: '2026-10-17', name: 'Visible sign', category: 'shop', roadId: 'A1', position: { lat: 17.42, lon: 78.548 }, placementStatus: 'pending', notes: 'Camera point only, not shop entrance.' });
    expect(validateStreetSurvey(data, core).errors).toEqual([]);
    expect(summarizeStreetSurvey(data, core).evidenceObservations).toBe(1);
    data.observations[0].placementStatus = 'exact';
    expect(validateStreetSurvey(data, core).errors.join(' ')).toContain('exact placement must link');
    data.sources.push({ ...data.sources[0] });
    expect(validateStreetSurvey(data, core).errors.join(' ')).toContain('duplicate id');
  });

  it('counts a full visual inventory separately from verified placement and ignores overlapping windows', () => {
    const { core, data, exact, range } = fixture();
    exact.placementStatus = 'provisional';
    data.roads[0].left = { status: 'partial', reviewedRanges: [range(0, 900, false), range(700, 1000, false)] };
    for (const r of data.roads[0].left.reviewedRanges!) r.allFrontagesRecorded = true;
    expect(validateStreetSurvey(data, core).errors).toEqual([]);
    const summary = summarizeStreetSurvey(data, core);
    expect(summary.visuallyInventoriedSideLengthM).toBe(1000);
    expect(summary.visuallyInventoriedSides).toBe(1);
    expect(summary.verifiedSideLengthM).toBe(0);
    expect(summary.verifiedSides).toBe(0);
    expect(summary.coveragePercent).toBe(0);
  });

  it('renders researched provisional geometry without claiming verified shop or side coverage', () => {
    const { core, data, exact, chunk, range } = fixture();
    exact.placementStatus = 'provisional';
    exact.evidence.floor = [];
    const survey = new StreetSurvey(data, core, { chunks: [chunk] });
    expect(survey.summary).toMatchObject({ positionedStorefronts: 1, provisionalStorefronts: 1, verifiedStorefronts: 0, verifiedSides: 0 });
    expect(survey.applyChunk(chunk).storefronts.at(-1)?.status).toBe('provisional');
    data.roads[0].left = { status: 'verified', reviewedRanges: [range(0, 1000)] };
    expect(validateStreetSurvey(data, core).errors.join(' ')).toContain('contains provisional placement');
  });

  it('keeps basement tenancy separate from authored exposed-front elevation and incomplete proof', () => {
    const { core, data, exact, chunk } = fixture();
    exact.placementStatus = 'provisional';
    exact.floor = -1;
    exact.evidence.floor = [];
    exact.appearance = { frontBaseM: 0, frontInsetM: .4, signOutsetM: .65, signWidthM: 3.8, heightM: 1.2, signBaseM: .75, frontStyle: 'glazed' };
    const survey = new StreetSurvey(data, core, { chunks: [chunk] });
    expect(survey.applyChunk(chunk).storefronts.at(-1)).toMatchObject({ floor: -1, status: 'provisional', appearance: exact.appearance });
    expect(survey.summary).toMatchObject({ verifiedStorefronts: 0, verifiedSides: 0 });
    exact.frontageKind = 'kiosk'; exact.buildingId = null;
    expect(validateStreetSurvey(data, core).errors.join(' ')).toContain('kiosk = 0');
  });

  it('rejects invalid facade elevations and offsets before runtime rendering', () => {
    const { core, data, exact } = fixture();
    exact.appearance = { frontBaseM: Number.NaN, frontInsetM: -1, signWidthM: Infinity, signOutsetM: 151 };
    const errors = validateStreetSurvey(data, core).errors.join(' ');
    for (const field of ['frontBaseM', 'frontInsetM', 'signWidthM', 'signOutsetM']) expect(errors).toContain(`appearance.${field}`);
    exact.floor = -6;
    expect(validateStreetSurvey(data, core).errors.join(' ')).toContain('basement -5');
  });

  it('accepts explicitly photographed open-bay stock without changing tenant or coverage claims', () => {
    const { core, data, exact, chunk } = fixture();
    exact.placementStatus = 'provisional';
    for (const observedDisplay of ['cement_bags', 'appliances', 'framed_art'] as const) {
      exact.appearance = { frontStyle: 'open_bay', observedDisplay, displaySide: 'left', awning: false, categoryProps: false };
      expect(validateStreetSurvey(data, core, { chunks: [chunk] }).errors).toEqual([]);
      const survey = new StreetSurvey(data, core, { chunks: [chunk] });
      expect(survey.summary).toMatchObject({ positionedStorefronts: 1, verifiedStorefronts: 0, verifiedSides: 0 });
      expect(survey.applyChunk(chunk).storefronts.at(-1)?.appearance).toEqual(exact.appearance);
    }
  });
});

describe('survey runtime corrections', () => {
  it('lets a full visual inventory supersede guessed signs without deleting source listings or measured fronts', () => {
    const { core, data, chunk, range } = fixture();
    data.roads[0].left = { status: 'partial', reviewedRanges: [range(780, 800, false), range(799, 820, false)] };
    for (const r of data.roads[0].left.reviewedRanges!) r.allFrontagesRecorded = true;
    const source: Storefront = { ...chunk.storefronts[0], id: 'different-source-name', name: 'Unreviewed source label', x: -30, z: -50,
      facade: [[-8, -810], [-8, -790]], placement: { association: 'source_contained', display: 'facade', floorBasis: 'unknown', displacementM: 4, roadSide: 'supported', reasons: [] } };
    const verified = { ...source, id: 'independently-measured', status: 'verified' as const };
    chunk.storefronts = [source, verified];
    const before = structuredClone(chunk), survey = new StreetSurvey(data, core), revised = survey.applyChunk(chunk);
    expect(revised.storefronts.map(s => s.id)).toEqual([source.id, verified.id, 'survey-fixture-shop']);
    expect(revised.storefronts[0]).toMatchObject({ name: source.name, x: -30, z: -50, facade: source.facade, placement: { ...source.placement, display: 'listing_only', reasons: ['street_inventory_supersedes_guessed_frontage'] } });
    expect(revised.storefronts[1]).toBe(verified);
    expect(revised.storefronts[2]).toMatchObject({ placeId: 'survey:survey-fixture-shop', status: 'verified', side: 'left', floor: 1 });
    expect(survey.allowsSourceListing(source.placeId, source.id)).toBe(true); // searchable listing, not a claimed photographed frontage
    expect(revised.buildings).toEqual(before.buildings);
    expect(chunk).toEqual(before);
  });

  it('protects inventoried boundary overlaps while leaving another side, road and genuinely unreviewed gap alone', () => {
    const { core, data, chunk, range } = fixture();
    data.roads[0].left = { status: 'partial', reviewedRanges: [range(780, 795, false), range(805, 820, false)] };
    for (const r of data.roads[0].left.reviewedRanges!) r.allFrontagesRecorded = true;
    const raw = (id: string, a: number, b: number): Storefront => ({ ...chunk.storefronts[0], id, name: id, facade: [[-8, -b], [-8, -a]], x: -8, z: -(a + b) / 2 });
    chunk.storefronts = [raw('inside', 785, 790), raw('straddles', 790, 810), raw('extends-past-end', 815, 825),
      raw('unreviewed-gap', 796, 804), raw('outside-end', 821, 825),
      { ...raw('other-road', 785, 790), roadId: 'A2' },
      { ...raw('other-side', 785, 790), side: 'right', x: 8, facade: [[8, -790], [8, -785]] },
      { ...raw('conflicting-side', 785, 790), x: 8, facade: [[8, -790], [8, -785]] }];
    const revised = new StreetSurvey(data, core).applyChunk(chunk);
    for (const sf of revised.storefronts.slice(0, 3)) expect(sf.placement?.display, sf.id).toBe('listing_only');
    for (const sf of revised.storefronts.slice(3, -1)) expect(sf.placement, sf.id).toBeUndefined();
    for (const r of data.roads[0].left.reviewedRanges!) r.allFrontagesRecorded = false;
    expect(new StreetSurvey(data, core).applyChunk(chunk).storefronts[0].placement).toBeUndefined();
  });

  it('applies inventory precedence across streamed chunks and repeated application without duplicating observed fronts', () => {
    const { core, data, chunk, range } = fixture();
    data.roads[0].left = { status: 'partial', reviewedRanges: [{ ...range(780, 820, false), allFrontagesRecorded: true }] };
    const second: WorldChunkV2 = { id: 'other-streamed-chunk', ix: 1, iz: 0, buildings: [], storefronts: [{ ...chunk.storefronts[0], id: 'different-name', name: 'Another guessed sign', buildingId: null }] };
    const survey = new StreetSurvey(data, core), first = survey.applyChunk(second), observed = survey.applyChunk(chunk);
    expect(first.storefronts[0].placement?.display).toBe('listing_only');
    expect(survey.applyChunk(second)).toEqual(first);
    expect(survey.applyChunk(first)).toEqual(first);
    expect(survey.applyChunk(observed)).toEqual(observed);
    expect(observed.storefronts.filter(s => s.placeId.startsWith('survey:'))).toHaveLength(1);
  });

  it('removes the live Paradise guessed hospital placard from the inventoried face while retaining its raw listing', () => {
    const read = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
    const base = 'public/world/hyd-metro/v2/';
    const core = read<WorldCore>(base + 'core.json'), source = new SourceAccuracyLayer(read<SourceAccuracyData>(base + 'source-accuracy.json'));
    const raw = read<WorldChunkV2>(base + 'chunks/c_-33_-16.json'), audited = source.applyChunk(raw);
    const original = audited.storefronts.find(s => s.id === 'sf_3290958da3')!;
    expect(original).toMatchObject({ name: 'Sunshine Heart Institute', roadId: 'r_13220415640_0', side: 'left', placement: { display: 'facade' } });
    const survey = new StreetSurvey(read<StreetSurveyData>('public/research/street-survey.json'), source.applyCore(core));
    const revised = survey.applyChunk(audited).storefronts.find(s => s.id === original.id)!;
    expect(revised.placement).toMatchObject({ association: 'source_contained', display: 'listing_only', reasons: ['street_inventory_supersedes_guessed_frontage'] });
    expect([revised.name, revised.x, revised.z, revised.facade]).toEqual([original.name, original.x, original.z, original.facade]);
    expect(survey.allowsSourceListing(original.placeId, original.id)).toBe(true);
    expect(original.placement?.display).toBe('facade');
  });

  it('validates observed arcade openings and balustrades before profile rendering', () => {
    const { core, data, chunk } = fixture();
    const floor = { baseM: 3, heightM: 3, glazingRatio: .7, openingShape: 'arched' as const, balustrade: { heightM: .85, color: '#6c5142', spacingM: .28 } };
    data.corrections.push({ id: 'arcade-profile', kind: 'building_profile', buildingId: 'fixture-building', dimensionStatus: 'provisional', sourceIds: ['source-fixture'], notes: 'Test-only observed arcade with estimated dimensions.', profile: { sourceIds: ['source-fixture'], appearanceStatus: 'observed', dimensionStatus: 'provisional', wallColor: '#e6dfcd', fronts: [{ storefrontIds: ['survey-fixture-shop'], floors: [floor] }] } });
    expect(validateStreetSurvey(data, core, { chunks: [chunk] }).errors).toEqual([]);
    floor.balustrade.spacingM = 0;
    floor.balustrade.color = 'brown';
    const errors = validateStreetSurvey(data, core).errors.join(' ');
    expect(errors).toContain('balustrade spacing must be positive');
    expect(errors).toContain('invalid balustrade colour');
  });

  it('keeps observed advertisements inside a sourced profile without inventing a tenancy', () => {
    const { core, data, chunk } = fixture();
    const panel = { text: 'Fictional sale banner — 26 Jun to 25 Jul 2025', baseM: 6, heightM: 1, at: .5, widthRatio: .8, color: '#f3ead0', textColor: '#a03030', frontIndex: 0 };
    data.corrections.push({ id: 'ad-profile', kind: 'building_profile', buildingId: 'fixture-building', dimensionStatus: 'provisional', sourceIds: ['source-fixture'], notes: 'Test-only historical banner, not a new business.', profile: { sourceIds: ['source-fixture'], appearanceStatus: 'observed', dimensionStatus: 'provisional', wallColor: '#e6dfcd', signPanels: [panel], fronts: [{ storefrontIds: ['survey-fixture-shop'], floors: [{ baseM: 0, heightM: 9, glazingRatio: .5 }] }] } });
    const survey = new StreetSurvey(data, core, { chunks: [chunk] });
    expect(survey.summary.positionedStorefronts).toBe(1);
    expect(survey.applyChunk(chunk).buildings[0].researchedProfile?.signPanels).toEqual([panel]);
    panel.text = ''; panel.frontIndex = 5; panel.color = 'red'; panel.at = .95;
    const errors = validateStreetSurvey(data, core).errors.join(' ');
    expect(errors).toContain('sign panel needs visible text');
    expect(errors).toContain('invalid sign panel face index');
    expect(errors).toContain('invalid sign panel colour');
    expect(errors).toContain('sign panel extends outside its source face');
  });

  it('requires an access plan for entry-only profile sections', () => {
    const { core, data, chunk } = fixture();
    const front: ResearchedFrontProfile = { storefrontIds: ['survey-fixture-shop'], accessOnly: true, floors: [{ baseM: 0, heightM: 3.7, glazingRatio: 0 }] };
    const profile = { sourceIds: ['source-fixture'], appearanceStatus: 'observed' as const, dimensionStatus: 'provisional' as const, wallColor: '#e6dfcd', fronts: [front] };
    data.corrections.push({ id: 'entry-only-profile', kind: 'building_profile', buildingId: 'fixture-building', dimensionStatus: 'provisional', sourceIds: ['source-fixture'], notes: 'Test-only local entry section avoids repainting an entire wall.', profile });
    expect(validateStreetSurvey(data, core, { chunks: [chunk] }).errors.join(' ')).toContain('accessOnly face requires an access plan');
    profile.fronts[0] = { ...front, access: { landingHeightM: .8, landingDepthM: .5, stairs: [{ at: .5, widthM: 2, risers: 4, runM: .8 }] } };
    expect(validateStreetSurvey(data, core, { chunks: [chunk] }).errors).toEqual([]);
  });

  it('replaces nearby same-side aliases while retaining other branches and leaves source chunks intact', () => {
    const { core, data, chunk } = fixture();
    chunk.storefronts.push({ ...chunk.storefronts[0], id: 'listing-other-branch', placeId: 'other-place', z: -50 });
    chunk.storefronts.push({ ...chunk.storefronts[0], id: 'listing-opposite', placeId: 'opposite-place', side: 'right' });
    const before = structuredClone(chunk);
    const revised = new StreetSurvey(data, core, { chunks: [chunk] }).applyChunk(chunk);
    expect(revised.storefronts.map((s) => s.id)).toEqual(['listing-other-branch', 'listing-opposite', 'survey-fixture-shop']);
    expect(revised.storefronts.at(-1)?.floor).toBe(1);
    expect(chunk).toEqual(before);
  });

  it('suppresses explicit displaced listing IDs even when they load from another chunk', () => {
    const { core, data, exact, chunk } = fixture();
    exact.replaceStorefrontIds = ['listing-nearby'];
    const second: WorldChunkV2 = { id: 'second', ix: 1, iz: 0, buildings: [], storefronts: [{ ...chunk.storefronts[0], roadId: 'A2' }] };
    chunk.storefronts = [];
    const survey = new StreetSurvey(data, core, { chunks: [chunk, second] });
    expect(survey.applyChunk(second).storefronts).toEqual([]);
  });

  it('restores observed presence while retaining provisional estimated dimensions', () => {
    const { core, data, chunk } = fixture();
    data.corrections.push({ id: 'building-profile', kind: 'building_profile', buildingId: 'fixture-building', sourceIds: ['source-fixture'], notes: 'Presence observed; height estimate remains provisional.', retainPresence: true, heightM: 14.2, levels: 4, dimensionStatus: 'provisional', facadeColor: '#e3dccb', style: 'test-style' });
    data.corrections.push({ id: 'width', kind: 'road_width', roadId: 'A1', widthM: 15, sourceIds: ['source-fixture'], notes: 'Estimated width in fixture; no field measurement evidence.' });
    const survey = new StreetSurvey(data, core, { chunks: [chunk] });
    expect(survey.applyChunk(chunk).buildings[0]).toMatchObject({ intrudesCarriageway: false, heightM: 14.2, levels: 4, heightStatus: 'provisional', surveyStyle: 'test-style' });
    expect(survey.applyCoreCorrections(core).roads[0]).toMatchObject({ widthM: 15, status: { width: 'provisional' } });
    expect(core.roads[0].widthM).toBe(12);
    expect(chunk.buildings[0].intrudesCarriageway).toBe(true);
  });

  it('enables sourced signal locations without upgrading junction geometry or invented timing accuracy', () => {
    const { core, data } = fixture();
    core.junctions.push({ id: 'fixture-junction', nodeId: 'n1', incoming: ['A1:f'], outgoing: ['A2:f'], movementStatus: 'provisional', signalled: false });
    data.corrections.push({ id: 'signal-location', kind: 'traffic_signal', junctionId: 'fixture-junction', timingStatus: 'provisional', sourceIds: ['source-fixture'], notes: 'Signal location corroborated; timing is game authored.' });
    const revised = new StreetSurvey(data, core).applyCoreCorrections(core);
    expect(revised.junctions[0]).toMatchObject({ signalled: true, movementStatus: 'provisional' });
    expect(core.junctions[0].signalled).toBe(false);
    data.corrections[0] = { ...data.corrections[0], junctionId: 'unknown' } as typeof data.corrections[0];
    expect(validateStreetSurvey(data, core).errors.join(' ')).toContain('unknown junction');
  });
});
