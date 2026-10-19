#!/usr/bin/env node
/** Wider Chrome/pin registration corrects an earlier sign misreading; geometry stays provisional. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nearestSurveyRoadPoint, validateStreetSurvey } from '../src/world/streetSurvey.ts';
import { unproject } from './lib/geo.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'public/research/street-survey.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
// Legacy bootstrap seeds must never reintroduce records retracted by reviewed block batches.
if (data.appliedBatches?.length) { console.log(JSON.stringify({ result: 'legacy_seed_skipped', reason: 'Use reviewed JSON batches after the batch-import transition.' })); process.exit(0); }
const core = JSON.parse(fs.readFileSync(path.join(root, 'public/world/hyd-metro/v2/core.json'), 'utf8'));
const sourceId = 'sv-habsiguda-gatsi-2026-01-chrome-20261018';
const date = '2026-10-18', reviewer = 'Codex Chrome street-level inspection';
const roadId = 'r_53082489897_0', buildingId = 'b_1f09a30466';
const road = core.roads.find((r) => r.id === roadId);
const camera = { lat: 17.4194797, lon: 78.5410293, headingDeg: 206.62, panoId: '6InygWDOscgijOwrtOzQCw' };
const upsert = (array, item) => { if (!array.some((v) => v.id === item.id)) array.push(item); };

upsert(data.sources, {
  id: sourceId, kind: 'street_view', title: 'Habsiguda — Gatsi Sports / Amaravathi block, wider panorama and business-pin registration',
  url: 'https://www.google.com/maps/place/Gatsi+Sports/@17.4194797,78.5410293,536a,37.5y,206.62h,93.16t/data=!3m7!1e1!3m5!1s6InygWDOscgijOwrtOzQCw!2e0!7i16384!8i8192!4m6!3m5!1s0x3bcb99662dbcc26f:0x96ca71caea74ac4e!8m2!3d17.4193054!4d78.5408425',
  captureDate: '2026-01', observedDate: date, reviewer, position: camera,
  notes: 'Wider Chrome inspection at heading 230 degrees/FOV 80, followed by the Google Gatsi Sports business pin view at heading 206.62, confirms the sign reads GATSI SPORTS. Initial 2026-10-17 narrow-view transcription AFSI SPORTS was a misreading and is superseded. Google listing address is 1-1-84/H, Inner Ring Road; business pin 17.4193054,78.5408425 aligns with footprint b_1f09a30466 (OSM way357035513). Full dark-grey rectangular building is visible with white horizontal bands and three upper black/green glazed ribbons above the ground units. The GATSI SPORTS board has an off-white background and red lettering. Gatsi is on the northwest/right ground portion; Amaravathi RESTAURANT BANQUETS BAR occupies the southeast/left ground portion with a stair/BAR entry between and an upper restaurant/banquets/bar advertisement. Approximately four levels and 16.5 m height, shop widths, entrances and sign dimensions remain authored estimates. No imagery is redistributed.',
  assetPolicy: 'reference_only',
});

// Preserve the first capture record while visibly correcting its superseded transcription.
const firstSource = data.sources.find((s) => s.id === 'sv-habsiguda-2026-01-chrome-20261017');
if (firstSource) firstSource.notes = firstSource.notes.replace('neighbouring signs read AFSI SPORTS and', 'neighbouring signs read GATSI SPORTS (initially transcribed as AFSI SPORTS; corrected by the wider Chrome review on 2026-10-18) and');

const A = [-802.1, -527.95], B = [-786.23, -508.47];
const lerp = (t) => [+(A[0] + (B[0] - A[0]) * t).toFixed(2), +(A[1] + (B[1] - A[1]) * t).toFixed(2)];
const definitions = [
  { id: 'survey-habsiguda-gatsi-sports', observationId: 'survey-habsiguda-afsi-sports-observation', name: 'GATSI SPORTS', category: 'sporting_goods', group: 'apparel', facade: [lerp(.04), lerp(.35)], floor: 0, appearance: { facadeColor: '#33393a', signColor: '#e4e0d8', signTextColor: '#a12f32', heightM: 3.5, signHeightM: .9, signBaseM: 2.7, awning: false, categoryProps: false }, notes: 'Wider Chrome view and Google business-pin/address registration support this dark-grey building identity. GATSI SPORTS occupies the northwest/right ground portion as seen from the street. Approximately 8 m frontage, endpoints, entrance, sign base and shop depth are estimates. This corrects the initial AFSI SPORTS transcription; no measured facade verification is claimed.' },
  { id: 'survey-habsiguda-amaravathi', observationId: 'survey-habsiguda-amaravathi-banquets-observation', name: 'AMARAVATHI', category: 'restaurant_and_banquets', group: 'restaurant', facade: [lerp(.5), lerp(.97)], floor: 0, appearance: { facadeColor: '#33393a', signColor: '#2f3535', signTextColor: '#f5f2df', displayName: 'AMARAVATHI · RESTAURANT BANQUETS BAR', heightM: 3.5, signHeightM: 1.0, signBaseM: 2.6, awning: false, categoryProps: false, frontStyle: 'glazed' }, notes: 'Wider Chrome view confirms the southeast/left ground-level Amaravathi entrance on the same block as Gatsi Sports; an upper advertisement also names restaurant/banquets/bar and a stair/BAR entrance lies between the units. Approximately 12 m extent, exact entrance, sign heights and floor elevations remain estimates. Ground entry supersedes the earlier interpretation based only on its upper advertisement.' },
];
for (const item of definitions) {
  const mid = [(item.facade[0][0] + item.facade[1][0]) / 2, (item.facade[0][1] + item.facade[1][1]) / 2];
  const hit = nearestSurveyRoadPoint(mid, road), [lat, lon] = unproject(...mid);
  const sourceIds = item.name === 'AMARAVATHI' ? [sourceId, 'official-amaravathi-habsiguda'] : [sourceId];
  upsert(data.storefrontOverrides, {
    id: item.id, placementStatus: 'provisional', chunkId: 'c_-5_-3', name: item.name, nameTe: null,
    category: item.category, group: item.group, roadId, side: hit.side, buildingId, frontageKind: 'building', facade: item.facade, entrance: mid,
    floor: item.floor, frontageWidthM: +Math.hypot(item.facade[1][0] - item.facade[0][0], item.facade[1][1] - item.facade[0][1]).toFixed(2),
    alongRoadM: +hit.alongM.toFixed(2), facingHeading: +Math.atan2(-(hit.x - mid[0]), -(hit.z - mid[1])).toFixed(5),
    lat: +lat.toFixed(7), lon: +lon.toFixed(7), captureDate: '2026-01', sourceIds, reviewedAt: date, reviewer,
    evidence: { identity: sourceIds, position: [], side: [sourceId], floor: [sourceId], facade: [], neighbours: [sourceId] },
    suppressAliases: item.name === 'GATSI SPORTS' ? ['Gatsi Sports'] : ['Amaravathi Banquets', 'Amaravathi Restaurant Banquets Bar'], suppressionRadiusM: 60, appearance: item.appearance, notes: item.notes,
  });
  const observation = data.observations.find((o) => o.id === item.observationId);
  if (observation) {
    const correctionMarker = 'Wider Chrome review on 2026-10-18:';
    if (!observation.notes.includes(correctionMarker)) observation.notes = `Initial narrow-view record (superseded where corrected below): ${observation.notes} ${correctionMarker} ${item.notes}`;
    observation.name = item.name === 'AMARAVATHI' ? 'Amaravathi Restaurant Banquets Bar' : item.name;
    observation.roadId = roadId;
    observation.observedDate = date;
    observation.position = { lat: camera.lat, lon: camera.lon, headingDeg: camera.headingDeg };
    observation.sourceIds = [...new Set([...observation.sourceIds, ...sourceIds])];
    observation.storefrontOverrideId = item.id;
    observation.placementStatus = 'pending';
  } else upsert(data.observations, { id: item.observationId, sourceIds, captureDate: '2026-01', observedDate: date, name: item.name, category: item.category, roadId, position: { lat: camera.lat, lon: camera.lon, headingDeg: camera.headingDeg }, placementStatus: 'pending', storefrontOverrideId: item.id, notes: item.notes });
}

upsert(data.corrections, { id: 'profile-habsiguda-gatsi-block', kind: 'building_profile', buildingId, sourceIds: [sourceId], retainPresence: true, heightM: 16.5, levels: 4, dimensionStatus: 'provisional', facadeColor: '#33393a', style: 'habsiguda_gatsi_block', notes: 'Full photographed dark-grey Gatsi/Amaravathi block and Google business-pin match corroborate this footprint. Restore presence despite the estimated side-road intrusion flag. Four levels, 16.5 m height, glazing ribbon widths and cladding dimensions are provisional authored estimates; no adjacent alley width or geometry is certified.' });

// Flat observed bands/beams should not gain template awnings or category icons/props.
for (const sf of data.storefrontOverrides) if (/^survey-(habsiguda|madhapur)-/.test(sf.id)) sf.appearance = { ...sf.appearance, awning: false, categoryProps: false };

const review = data.roads.find((r) => r.roadId === roadId).left;
if (review.status !== 'verified') {
  review.status = 'partial'; review.reviewedRanges ??= [];
  if (!review.reviewedRanges.some((r) => r.sourceIds.includes(sourceId))) review.reviewedRanges.push({ startM: 44, endM: 69, sourceIds: [sourceId], reviewedAt: date, reviewer, completeness: 'partial', allFrontagesRecorded: false, storefrontIds: ['survey-habsiguda-amaravathi', 'survey-habsiguda-gatsi-sports'], notes: 'Approximately 25 m window corresponding to the photographed Gatsi/Amaravathi block on the southwest/left side. Brands, relative arrangement and broad footprint identity are matched; exact entrances, dimensions and the full side remain incomplete. The opposite side is not reviewed by this correction.' });
}
data.revision = Math.max(5, data.revision);
data.generatedAt = date;
const validation = validateStreetSurvey(data, core, { worldId: 'hyd-metro', worldVersion: '2.0.0' });
if (validation.errors.length) { console.error(JSON.stringify(validation, null, 2)); process.exit(1); }
fs.writeFileSync(file, JSON.stringify(data) + '\n');
console.log(JSON.stringify({ result: 'seeded', summary: validation.summary, sources: data.sources.length, observations: data.observations.length }, null, 2));
