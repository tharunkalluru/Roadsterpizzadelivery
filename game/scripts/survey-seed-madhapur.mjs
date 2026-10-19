#!/usr/bin/env node
/** Chrome-observed identity and layout; authored dimensions explicitly remain provisional. */
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
const sourceId = 'sv-madhapur-medplus-2026-04-chrome-20261017';
const date = '2026-10-17', reviewer = 'Codex Chrome street-level inspection';
const roadId = 'r_40395506413_0', buildingId = 'b_42a55533aa';
const road = core.roads.find((r) => r.id === roadId);
const camera = { lat: 17.4411613, lon: 78.3911867, headingDeg: 39.59, panoId: 'GT08ldGQbgKh-0PXwzwgTQ' };
// Initial seed is append-only: later human/Chrome corrections must survive reruns.
const upsert = (array, item) => { if (!array.some((v) => v.id === item.id)) array.push(item); };

upsert(data.sources, {
  id: sourceId, kind: 'street_view', title: 'Madhapur Main Road — MedPlus / Prestige Xclusive / Just For U commercial frontage',
  url: 'https://www.google.com/maps/@?api=1&map_action=pano&pano=GT08ldGQbgKh-0PXwzwgTQ',
  captureDate: '2026-04', observedDate: date, reviewer, position: camera,
  notes: 'Root agent inspected the north-side building facade in the user-authorized Chrome session. A MedPlus red band is visible on raised ground level with entrance stairs; large PRESTIGE Xclusive red board sits directly above on upper floor 1. JUST FOR U baby care/apparel/toys is on the right-hand upper section of the same white-frame blue-glass building. Lower front units show PUNYA COMMUNICATIONS and S.S.COMPUTERS on the left, and Truecare Surgicals on the right. Approximately five visible levels plus basement; 18 m overall height, shop widths, upper heights and facade split are authored estimates. Google business pin 17.4412822,78.3912682 agrees closely with the existing MedPlus point, supporting the footprint match. Only the north road side was inspected, so the opposite side stays unreviewed. No source imagery is redistributed.',
  assetPolicy: 'reference_only',
});

// South-facing footprint edges; east is the viewer's right when facing this north-side facade.
const westA = [-16709.29, -2953.98], westB = [-16694.00, -2953.13];
const eastA = [-16694.17, -2950.19], eastB = [-16678.51, -2949.31];
const lerp = (a, b, t) => [+(a[0] + (b[0] - a[0]) * t).toFixed(2), +(a[1] + (b[1] - a[1]) * t).toFixed(2)];
const definitions = [
  { id: 'survey-madhapur-medplus', name: 'MedPlus', category: 'pharmacy', group: 'pharmacy', facade: [lerp(westA, westB, .08), lerp(westA, westB, .98)], floor: 0, replace: ['sf_d479d84d00'], aliases: ['Medplus Mart Madhapur', 'MedPlus'], appearance: { facadeColor: '#e5e9e9', signColor: '#cf2736', signTextColor: '#ffffff', shutterColor: '#d6dadd', heightM: 3.4, signHeightM: .95, signBaseM: 3.0 }, notes: 'MedPlus identity, raised ground-floor band and stairs are photographed. Existing point is within roughly 4 m of the Google store pin and fits this footprint. West-side facade span, entrance and metric heights are approximate; no measured facade or floor survey is claimed.' },
  { id: 'survey-madhapur-prestige-xclusive', name: 'PRESTIGE Xclusive', category: 'home_appliances', group: 'electronics_mobile', facade: [lerp(westA, westB, .05), lerp(westA, westB, .98)], floor: 1, replace: [], aliases: ['Prestige Xclusive', 'Prestige'], appearance: { facadeColor: '#e5e9e9', signColor: '#c7212d', signTextColor: '#ffffff', heightM: 3.4, signHeightM: 1.2, signBaseM: 6.0 }, notes: 'Large red PRESTIGE Xclusive board is directly above MedPlus in the photographed facade. Placement on the west upper portion matches observed vertical relation. Board endpoints, width and height remain estimates.' },
  { id: 'survey-madhapur-just-for-u', name: 'JUST FOR U', category: 'baby_clothing_and_toys', group: 'apparel', facade: [lerp(eastA, eastB, .06), lerp(eastA, eastB, .96)], floor: 1, replace: [], aliases: ['Just For U', 'JUST FOR U'], appearance: { facadeColor: '#e5e9e9', signColor: '#d32e3f', signTextColor: '#ffffff', displayName: 'JUST FOR U · BABY CARE / APPAREL / TOYS', heightM: 3.4, signHeightM: 1.2, signBaseM: 6.0 }, notes: 'JUST FOR U sign sits to the right of PRESTIGE Xclusive on the same observed blue-glass building. Lower text names baby care, apparel and toys. Assignment to the east stepped footprint edge follows the shared-building image; dimensions and exact floor elevation remain provisional.' },
];
for (const item of definitions) {
  const mid = [(item.facade[0][0] + item.facade[1][0]) / 2, (item.facade[0][1] + item.facade[1][1]) / 2];
  const hit = nearestSurveyRoadPoint(mid, road), [lat, lon] = unproject(...mid);
  upsert(data.storefrontOverrides, {
    id: item.id, placementStatus: 'provisional', chunkId: 'c_-84_-15', name: item.name, nameTe: null,
    category: item.category, group: item.group, roadId, side: hit.side, buildingId, frontageKind: 'building', facade: item.facade, entrance: mid,
    floor: item.floor, frontageWidthM: +Math.hypot(item.facade[1][0] - item.facade[0][0], item.facade[1][1] - item.facade[0][1]).toFixed(2),
    alongRoadM: +hit.alongM.toFixed(2), facingHeading: +Math.atan2(-(hit.x - mid[0]), -(hit.z - mid[1])).toFixed(5),
    lat: +lat.toFixed(7), lon: +lon.toFixed(7), captureDate: '2026-04', sourceIds: [sourceId], reviewedAt: date, reviewer,
    evidence: { identity: [sourceId], position: [], side: [sourceId], floor: [], facade: [], neighbours: [sourceId] },
    replaceStorefrontIds: item.replace, suppressAliases: item.aliases, suppressionRadiusM: 65, appearance: { ...item.appearance, awning: false, categoryProps: false }, notes: item.notes,
  });
  upsert(data.observations, { id: item.id + '-observation', sourceIds: [sourceId], captureDate: '2026-04', observedDate: date, name: item.name, category: item.category, roadId, position: { lat: camera.lat, lon: camera.lon, headingDeg: camera.headingDeg }, placementStatus: 'pending', storefrontOverrideId: item.id, notes: 'Photographed identity is reconstructed provisionally; exact geometric proof remains incomplete. ' + item.notes });
}

for (const item of [
  { id: 'survey-madhapur-punya-communications-observation', name: 'MOUNIKA COMMUNICATIONS', category: 'electronics_mobile', notes: 'Yellow-board lower/basement frontage on the left. The initial PUNYA transcription was corrected to MOUNIKA by the closer October 18 view and business listing; the legacy observation ID preserves history. See survey-seed-madhapur-lower.mjs for the provisional reconstruction.' },
  { id: 'survey-madhapur-ss-computers-observation', name: 'S.S. COMPUTERS', category: 'electronics_mobile', notes: 'Readable lower-unit sign between Mounika Communications and Truecare Surgicals. See the closer October 18 registration for observed order and explicitly provisional unit geometry.' },
  { id: 'survey-madhapur-truecare-surgicals-observation', name: 'Truecare Surgicals', category: 'medical_supplies', notes: 'Readable pink sign on the right-hand lower unit. Exact entrance and basement/floor elevation remain pending; do not guess a storefront geometry from this camera position.' },
]) upsert(data.observations, { ...item, sourceIds: [sourceId], captureDate: '2026-04', observedDate: date, roadId, position: { lat: camera.lat, lon: camera.lon, headingDeg: camera.headingDeg }, placementStatus: 'pending' });

upsert(data.corrections, { id: 'profile-madhapur-medplus-building', kind: 'building_profile', buildingId, sourceIds: [sourceId], heightM: 18, levels: 5, dimensionStatus: 'provisional', facadeColor: '#e5e9e9', style: 'madhapur_commercial', notes: 'Photographed building has a white structural frame, blue glazing and approximately five visible levels plus basement. Use an approximately 18 m authored height while retaining provisional dimension status. Raised ground-floor stairs and lower units need further measured geometry; existing residential kind is not evidence of current use.' });

// Suppress only generic placements on the photographed street face, not inferred business closures.
for (const [id, name] of [['sf_3a0ae82223', "Udipi's Upahar"], ['sf_3d182edbc2', 'OYO 11966 Grand Euro Park Hotel'], ['sf_6522952872', 'OYO Flagship Hotel Diamond Park'], ['sf_d330788774', 'Sarvi Take Away']]) upsert(data.suppressions, { id: `suppress-madhapur-${id}`, storefrontId: id, sourceIds: [sourceId], reason: `${name} was generically attached to this photographed street-facing wall by the listing pipeline. The inspected facade instead displays MedPlus / PRESTIGE Xclusive / JUST FOR U and lower shop signs. Suppress this unverified facade assignment only; this does not assert the business is closed or absent elsewhere.` });

const review = data.roads.find((r) => r.roadId === roadId).left;
if (review.status !== 'verified') {
  review.status = 'partial'; review.reviewedRanges ??= [];
  const range = { startM: 0, endM: Math.min(35, road.lengthM), sourceIds: [sourceId], reviewedAt: date, reviewer, completeness: 'partial', allFrontagesRecorded: false, storefrontIds: [], notes: 'North-side commercial building photographed from the south. An initial approximately 35 m observation window covers this frontage; shop and floor dimensions are incomplete. The opposite/south road side was not inspected and stays unreviewed. Street edge is only 45.63 m long, so a 60 m whole-edge claim would be invalid.' };
  const i = review.reviewedRanges.findIndex((r) => r.sourceIds.includes(sourceId));
  if (i < 0) review.reviewedRanges.push(range);
}
data.revision = Math.max(4, data.revision);
const validation = validateStreetSurvey(data, core, { worldId: 'hyd-metro', worldVersion: '2.0.0' });
if (validation.errors.length) { console.error(JSON.stringify(validation, null, 2)); process.exit(1); }
fs.writeFileSync(file, JSON.stringify(data) + '\n');
console.log(JSON.stringify({ result: 'seeded', summary: validation.summary }, null, 2));
