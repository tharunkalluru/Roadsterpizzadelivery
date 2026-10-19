#!/usr/bin/env node
/** Separate east entry below Just For U: one legible restaurant, one still-uncertain brand. */
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
const sourceId = 'sv-madhapur-g5-east-front-2026-04-chrome-20261018';
const date = '2026-10-18', reviewer = 'Codex Chrome street-level inspection';
const roadId = 'r_40395506413_0', buildingId = 'b_42a55533aa';
const road = core.roads.find((r) => r.id === roadId);
const camera = { lat: 17.4411000, lon: 78.3914028, headingDeg: 40, panoId: 'cHAUooNOfxFkI1ZyFu3dHw' };
const insert = (array, item) => { if (!array.some((v) => v.id === item.id)) array.push(item); };
insert(data.sources, {
  id: sourceId, kind: 'street_view', title: 'Madhapur MedPlus/Just For U block — G5 Gourmet Shawarma on the east raised-ground facade',
  url: 'https://www.google.com/maps/@?api=1&map_action=pano&pano=cHAUooNOfxFkI1ZyFu3dHw&heading=40&pitch=2&fov=55',
  captureDate: '2026-04', observedDate: date, reviewer, position: camera, assetPolicy: 'reference_only',
  notes: 'Root agent inspected this April 2026 panorama in the user-authorized Chrome session at heading 40 / pitch 2 / field of view 55. The east/right stepped facade of the same blue-glass building, below JUST FOR U, has G5 GOURMET SHAWARMA in black letters on the right half of a white raised-ground band. The left half bears a colourful stylized brand that could not be confidently transcribed; no invented business name is assigned there. A separate far-right stair with approximately six risers reaches this facade, with pavement setback; this is distinct from the west MedPlus entry. Identity, broad half-band position and separate stair are observed. Metric frontage division, entrance, 1.2 m threshold, sign dimensions and exact floor heights are provisional estimates. No source imagery is redistributed.',
});
const a = [-16694.17, -2950.19], b = [-16678.51, -2949.31];
const lerp = (t) => [+(a[0] + (b[0] - a[0]) * t).toFixed(2), +(a[1] + (b[1] - a[1]) * t).toFixed(2)];
const facade = [lerp(.52), lerp(.90)];
const mid = [(facade[0][0] + facade[1][0]) / 2, (facade[0][1] + facade[1][1]) / 2];
const hit = nearestSurveyRoadPoint(mid, road), [lat, lon] = unproject(...mid);
const width = +Math.hypot(facade[1][0] - facade[0][0], facade[1][1] - facade[0][1]).toFixed(2);
insert(data.storefrontOverrides, {
  id: 'survey-madhapur-g5-gourmet-shawarma', placementStatus: 'provisional', chunkId: 'c_-84_-15', name: 'G5 GOURMET SHAWARMA', nameTe: null,
  category: 'shawarma_restaurant', group: 'restaurant', roadId, side: hit.side, buildingId, frontageKind: 'building', facade, entrance: mid,
  floor: 0, frontageWidthM: width, alongRoadM: +hit.alongM.toFixed(2), facingHeading: +Math.atan2(-(hit.x - mid[0]), -(hit.z - mid[1])).toFixed(5),
  lat: +lat.toFixed(7), lon: +lon.toFixed(7), captureDate: '2026-04', sourceIds: [sourceId], reviewedAt: date, reviewer,
  evidence: { identity: [sourceId], position: [], side: [sourceId], floor: [], facade: [], neighbours: [sourceId] },
  suppressAliases: ['G5 Gourmet Shawarma'], suppressionRadiusM: 45,
  appearance: { facadeColor: '#e5e9e9', signColor: '#efefea', signTextColor: '#25272a', shutterColor: '#35494c', displayName: 'G5 GOURMET SHAWARMA', heightM: 2.5, signHeightM: .8, signBaseM: 3.1, signWidthM: width, signOutsetM: .65, frontBaseM: 1.2, frontStyle: 'glazed', awning: false, categoryProps: false },
  notes: 'Legible G5 GOURMET SHAWARMA board is on the right half of the east raised-ground facade below Just For U. This approximately 5.96 m span uses part of the existing stepped footprint edge and leaves room at the far-right stair. The shared board division, centre entrance, threshold and every metric dimension are authored estimates. No food catalog or delivery-pickup eligibility is inferred by this registration alone.',
});
insert(data.observations, { id: 'survey-madhapur-g5-gourmet-shawarma-observation', sourceIds: [sourceId], captureDate: '2026-04', observedDate: date, name: 'G5 GOURMET SHAWARMA', category: 'shawarma_restaurant', roadId, position: { lat: camera.lat, lon: camera.lon, headingDeg: camera.headingDeg }, placementStatus: 'pending', storefrontOverrideId: 'survey-madhapur-g5-gourmet-shawarma', notes: 'Identity and right-half band position are photographed and provisionally reconstructed. Exact facade endpoints, doorway and floor/elevation measurement remain pending.' });
insert(data.observations, { id: 'survey-madhapur-east-colourful-brand-observation', sourceIds: [sourceId], captureDate: '2026-04', observedDate: date, name: 'Unresolved colourful brand left of G5', category: 'shop', roadId, position: { lat: camera.lat, lon: camera.lon, headingDeg: camera.headingDeg }, placementStatus: 'pending', notes: 'The left half of the raised-ground board below Just For U has a colourful stylized mark, possibly LOON / 100N. The reading is uncertain and is not used as a storefront name or an invented tenant. Separate six-riser far-right entry and pavement setback are also observed; dimensions remain estimated.' });
const profile = data.corrections.find((c) => c.id === 'profile-madhapur-medplus-building');
if (profile && !profile.sourceIds.includes(sourceId)) { profile.sourceIds.push(sourceId); profile.notes += ' The October 18 east view also confirms a separate raised-ground G5 frontage below Just For U and a distinct approximately six-riser stair at its far-right end; metric dimensions remain provisional.'; }
const range = data.roads.find((r) => r.roadId === roadId).left.reviewedRanges?.find((r) => r.startM === 0);
if (range && !range.sourceIds.includes(sourceId)) {
  range.sourceIds.push(sourceId); range.reviewedAt = date;
  range.storefrontIds = data.storefrontOverrides.filter((s) => s.roadId === roadId && s.side === 'left' && s.alongRoadM >= range.startM && s.alongRoadM <= range.endM).sort((a, b) => a.alongRoadM - b.alongRoadM || a.id.localeCompare(b.id)).map((s) => s.id);
  range.notes += ' East-facing camera also resolves G5 Gourmet Shawarma below Just For U. The neighbouring colourful brand remains unresolved; no coverage completion is claimed.';
}
data.revision = Math.max(9, data.revision); data.generatedAt = date;
const validation = validateStreetSurvey(data, core, { worldId: 'hyd-metro', worldVersion: '2.0.0' });
if (validation.errors.length) { console.error(JSON.stringify(validation, null, 2)); process.exit(1); }
fs.writeFileSync(file, JSON.stringify(data) + '\n');
console.log(JSON.stringify({ result: 'seeded', summary: validation.summary }, null, 2));
