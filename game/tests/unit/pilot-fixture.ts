/** Synthetic test-only proving ground; never a real mapping qualification or release asset. */
import type { PilotZoneDefinition } from '../../src/pilot/zone';
import type { StreetSurveyData, SurveyStorefront } from '../../src/world/streetSurveyTypes';
import { makeFixtureCore } from './fixture';
import { WorldPhysics } from '../../src/world/collision';

export const hash = 'a'.repeat(64);
export function fixture() {
  const core = makeFixtureCore();
  // This synthetic pilot needs a returnable edge graph, unlike the general fixture's one-way spur.
  core.roads.find(r => r.id === 'C')!.oneway = false;
  core.directed.push({ ...core.directed.find(e => e.id === 'C:f')!, id: 'C:b', forward: false, fromNode: 'n4', toNode: 'n3', next: [] });
  for (const edge of core.directed) {
    const others = core.directed.filter(e => e.fromNode === edge.toNode && e.roadId !== edge.roadId);
    edge.next = (others.length ? others : core.directed.filter(e => e.fromNode === edge.toNode)).map(e => e.id);
  }
  const world = new WorldPhysics(core);
  core.pois.push({ id: 'fixture-pizza', category: 'pizzeria' } as any);
  core.deliveries.find(d => d.id === 'd_start')!.poiId = 'fixture-pizza';
  const roadIds = ['A1', 'A2', 'B', 'C', 'D'];
  const source = { id: 'synthetic-evidence', captureDate: '2026-10', url: 'https://example.invalid/fixture', reviewer: 'synthetic test' };
  const survey: StreetSurveyData = {
    schemaVersion: 1, revision: 133, worldId: 'fixture', worldVersion: 'fixture', generatedAt: '', referencePolicy: 'SYNTHETIC ONLY',
    sources: [source as any], observations: [], corrections: [], suppressions: [],
    roads: roadIds.map(roadId => {
      const side = { status: 'verified' as const, reviewedRanges: [{ startM: 0, endM: core.roads.find(r => r.id === roadId)!.lengthM, completeness: 'complete' as const, allFrontagesRecorded: true, sourceIds: [source.id], storefrontIds: core.deliveries.filter(d => d.roadId === roadId).map(d => 'sf_' + d.id), reviewedAt: '2026-10-20', reviewer: 'synthetic test', notes: 'SYNTHETIC' }] };
      return { roadId, left: structuredClone(side), right: { ...structuredClone(side), reviewedRanges: side.reviewedRanges.map(r => ({ ...r, storefrontIds: [] })) } };
    }),
    storefrontOverrides: core.deliveries.map(d => ({ id: 'sf_' + d.id, roadId: d.roadId, side: d.side, floor: d.level, entrance: d.entrance, placementStatus: 'verified', sourceIds: [source.id] } as SurveyStorefront)),
  };
  const definition: PilotZoneDefinition = { schemaVersion: 1, id: 'synthetic-fixture', label: 'Synthetic proving ground', surveyRevision: 133, surveySha256: hash, qualificationReceipt: 'SYNTHETIC-TEST-ONLY', polygon: [[-50, 50], [450, 50], [450, -2050], [-50, -2050]], roadIds, spawn: { x: -3, z: -25, heading: 0, roadId: 'A1' }, entrances: core.deliveries.map(d => ({ deliveryId: d.id, storefrontId: 'sf_' + d.id })), jobs: [{ id: 'first', pickupId: 'd_start', stops: ['d_main'] }, { id: 'side', pickupId: 'd_start', stops: ['d_side'] }], maxHeightM: 40 };
  return { world, core, survey, definition };
}
