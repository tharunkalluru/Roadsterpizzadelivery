#!/usr/bin/env node
/** Closer Chrome review registers observed lower shops; every dimension remains provisional. */
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
const sourceId = 'sv-madhapur-lower-shops-2026-04-chrome-20261018';
const listingId = 'listing-madhapur-mounika-communications-20261018';
const initialId = 'sv-madhapur-medplus-2026-04-chrome-20261017';
const date = '2026-10-18', reviewer = 'Codex Chrome street-level inspection';
const roadId = 'r_40395506413_0', buildingId = 'b_42a55533aa';
const road = core.roads.find((r) => r.id === roadId);
const camera = { lat: 17.4411613, lon: 78.3911867, headingDeg: 22, panoId: 'GT08ldGQbgKh-0PXwzwgTQ' };
// Preserve later corrections on reruns. The one-time observation migration retains its stable ID.
const insert = (array, item) => { if (!array.some((v) => v.id === item.id)) array.push(item); };
insert(data.sources, {
  id: sourceId, kind: 'street_view', title: 'Madhapur MedPlus block — closer view of Mounika, S.S. Computers and Truecare lower units',
  url: 'https://www.google.com/maps/@?api=1&map_action=pano&pano=GT08ldGQbgKh-0PXwzwgTQ&heading=22&fov=30',
  captureDate: '2026-04', observedDate: date, reviewer, position: camera, assetPolicy: 'reference_only',
  notes: 'Root agent inspected the same April 2026 panorama in the user-authorized Chrome session, first heading 39.59 then a closer heading 22 / field of view 30. The lower units are ordered left to right from the road: MOUNIKA COMMUNICATIONS (yellow board, blue lettering), S.S. COMPUTERS (yellow/pale orange board, white lettering) and Truecare Surgicals (pink/red board, white lettering). A small secondary board near the stair reads MOUNIKA XEROX. The initial narrow-view transcription PUNYA COMMUNICATIONS was incorrect and is superseded by this closer reading and the business listing. The units are recessed beneath the MedPlus band and road railing. Truecare is immediately left of the dominant ascending MedPlus entry stair at the right end of the band. Order and sign identities are observed; the authored widths, facade divisions, basement elevation, recess, entrances and stair dimensions are estimated. No whole-frontage completeness or measured geometric verification is claimed. No source imagery is redistributed.',
});
insert(data.sources, {
  id: listingId, kind: 'map_listing', title: 'Mounika Communications — Ashok Complex, below Medplus Pharmacy',
  url: 'https://www.google.com/maps/place/Mounika+Communications/data=!4m7!3m6!1s0x3bcb910198100a97:0xcb4a022d552fb234!8m2!3d17.4412143!4d78.3912541!16s%2Fg%2F11ysg7zn5j',
  captureDate: null, observedDate: date, reviewer, position: { lat: 17.4412143, lon: 78.3912541 }, assetPolicy: 'reference_only',
  notes: 'Directly opened Google Maps business listing in Chrome confirms Mounika Communications, Metro Piller no C1731, Ashok Complex, 1-101, BELOW Medplus Pharmacy, Megha Hills, Sri Sai Nagar, Madhapur. The listing pin and below-MedPlus address corroborate the observed identity and parent block. The pin is not a measured entrance and does not determine an individual frontage boundary. Listing data capture date is unknown.',
});
const initial = data.sources.find((s) => s.id === initialId);
if (initial && !initial.notes.includes('superseded by the closer October 18')) initial.notes = initial.notes.replace('Lower front units show PUNYA COMMUNICATIONS and S.S.COMPUTERS on the left, and Truecare Surgicals on the right.', 'The initial lower-left reading PUNYA COMMUNICATIONS is superseded by the closer October 18 review identifying MOUNIKA COMMUNICATIONS; S.S. COMPUTERS and Truecare Surgicals are also visible.');

const a = [-16709.29, -2953.98], b = [-16694.00, -2953.13];
const lerp = (t) => [+(a[0] + (b[0] - a[0]) * t).toFixed(2), +(a[1] + (b[1] - a[1]) * t).toFixed(2)];
const definitions = [
  { id: 'survey-madhapur-mounika-communications', observationId: 'survey-madhapur-punya-communications-observation', name: 'MOUNIKA COMMUNICATIONS', category: 'electronics_mobile', group: 'electronics_mobile', from: .08, to: .34, signColor: '#e5c22e', signTextColor: '#234ea1', aliases: ['Mounika Communications'], sourceIds: [sourceId, listingId], notes: 'Closer imagery and the directly opened listing confirm Mounika Communications below MedPlus. The earlier PUNYA transcription was a misread; the old observation ID is retained only for stable history. Leftmost lower-unit identity and its order before S.S. Computers are observed. Approximately 4 m width, central entrance and all vertical dimensions are provisional estimates; the listing pin is not used as an exact doorway.' },
  { id: 'survey-madhapur-ss-computers', observationId: 'survey-madhapur-ss-computers-observation', name: 'S.S. COMPUTERS', category: 'electronics_mobile', group: 'electronics_mobile', from: .35, to: .61, signColor: '#d6a94f', signTextColor: '#ffffff', aliases: ['S.S. Computers', 'SS Computers'], sourceIds: [sourceId], notes: 'Legible yellow/pale-orange sign with white letters is between Mounika Communications and Truecare Surgicals beneath the MedPlus band. Unit order is observed; approximately 4 m frontage, central entrance, basement tenancy geometry, sign colour values and all elevations remain authored estimates.' },
  { id: 'survey-madhapur-truecare-surgicals', observationId: 'survey-madhapur-truecare-surgicals-observation', name: 'Truecare Surgicals', category: 'medical_supplies', group: 'pharmacy', from: .62, to: .83, signColor: '#c7436c', signTextColor: '#ffffff', aliases: ['Truecare Surgicals'], sourceIds: [sourceId], notes: 'Legible pink/red board with white letters is right of S.S. Computers and immediately left of the ascending MedPlus stair at the right end of the band. The authored 3.2 m frontage leaves space for that stair. The exact unit boundary, entrance, recess depth, basement floor elevation and dimensions are unmeasured and remain provisional.' },
];
for (const item of definitions) {
  const facade = [lerp(item.from), lerp(item.to)];
  const mid = [(facade[0][0] + facade[1][0]) / 2, (facade[0][1] + facade[1][1]) / 2];
  const hit = nearestSurveyRoadPoint(mid, road), [lat, lon] = unproject(...mid);
  insert(data.storefrontOverrides, {
    id: item.id, placementStatus: 'provisional', chunkId: 'c_-84_-15', name: item.name, nameTe: null,
    category: item.category, group: item.group, roadId, side: hit.side, buildingId, frontageKind: 'building', facade, entrance: mid,
    floor: -1, frontageWidthM: +Math.hypot(facade[1][0] - facade[0][0], facade[1][1] - facade[0][1]).toFixed(2),
    alongRoadM: +hit.alongM.toFixed(2), facingHeading: +Math.atan2(-(hit.x - mid[0]), -(hit.z - mid[1])).toFixed(5),
    lat: +lat.toFixed(7), lon: +lon.toFixed(7), captureDate: '2026-04', sourceIds: item.sourceIds, reviewedAt: date, reviewer,
    evidence: { identity: item.sourceIds, position: [], side: [sourceId], floor: [], facade: [], neighbours: [sourceId] },
    suppressAliases: item.aliases, suppressionRadiusM: 45,
    appearance: { facadeColor: '#e5e9e9', signColor: item.signColor, signTextColor: item.signTextColor, shutterColor: '#35494c', frontBaseM: 0, frontInsetM: .4, signOutsetM: .65, heightM: 1.2, signHeightM: .45, signBaseM: .75, frontStyle: 'glazed', awning: false, categoryProps: false }, notes: item.notes,
  });
  const observation = data.observations.find((o) => o.id === item.observationId);
  if (observation && !observation.sourceIds.includes(sourceId)) Object.assign(observation, {
    name: item.name, sourceIds: [...new Set([...observation.sourceIds, ...item.sourceIds])], observedDate: date,
    position: { lat: camera.lat, lon: camera.lon, headingDeg: camera.headingDeg }, storefrontOverrideId: item.id,
    notes: 'Photographed identity and neighbour order are reconstructed provisionally; placementStatus remains pending until exact geometric proof is complete. ' + item.notes,
  });
}
insert(data.observations, { id: 'survey-madhapur-mounika-xerox-observation', name: 'MOUNIKA XEROX secondary board', category: 'office_service', sourceIds: [sourceId], captureDate: '2026-04', observedDate: date, roadId, position: { lat: camera.lat, lon: camera.lon, headingDeg: camera.headingDeg }, placementStatus: 'pending', storefrontOverrideId: 'survey-madhapur-mounika-communications', notes: 'Small secondary MOUNIKA XEROX board is legible beside the Truecare/MedPlus stair opening. It is recorded as a sign observation associated with Mounika, not a separately measured business entrance or invented additional shop.' });
// Keep the original upper-front geometry; only add explicit elevations/visibility offsets for this review.
for (const sf of data.storefrontOverrides.filter((s) => s.buildingId === buildingId)) {
  sf.appearance ??= {};
  sf.appearance.signOutsetM ??= .65;
  if (['survey-madhapur-medplus', 'survey-madhapur-prestige-xclusive', 'survey-madhapur-just-for-u'].includes(sf.id)) sf.appearance.signWidthM ??= sf.frontageWidthM;
  if (sf.id === 'survey-madhapur-medplus') { sf.appearance.frontBaseM ??= 1.25; sf.appearance.frontStyle ??= 'glazed'; }
}
const range = data.roads.find((r) => r.roadId === roadId).left.reviewedRanges?.find((r) => r.sourceIds.includes(initialId));
if (range && !range.sourceIds.includes(sourceId)) {
  range.sourceIds.push(sourceId); range.reviewedAt = date;
  range.storefrontIds = data.storefrontOverrides.filter((s) => s.roadId === roadId && s.side === 'left' && s.alongRoadM >= range.startM && s.alongRoadM <= range.endM).sort((a, b) => a.alongRoadM - b.alongRoadM || a.id.localeCompare(b.id)).map((s) => s.id);
  range.notes += ' Closer October 18 review resolves Mounika / S.S. Computers / Truecare lower-unit order. Approximate divisions are added without expanding the observation window or claiming complete frontage measurement.';
}
data.revision = Math.max(7, data.revision); data.generatedAt = date;
const validation = validateStreetSurvey(data, core, { worldId: 'hyd-metro', worldVersion: '2.0.0' });
if (validation.errors.length) { console.error(JSON.stringify(validation, null, 2)); process.exit(1); }
fs.writeFileSync(file, JSON.stringify(data) + '\n');
console.log(JSON.stringify({ result: 'seeded', summary: validation.summary }, null, 2));
