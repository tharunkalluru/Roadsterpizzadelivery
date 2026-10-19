#!/usr/bin/env node
/** Observed business order on the block west of Post Office Road; metric geometry is estimated. */
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
const sourceId = 'sv-madhapur-brown-block-2026-04-chrome-20261018';
const satelliteId = 'satellite-madhapur-post-office-blocks-chrome-20261018';
const date = '2026-10-18', reviewer = 'Codex Chrome street-level inspection';
const roadId = 'r_14775775715_0', buildingId = 'b_743cd80e16';
const road = core.roads.find((r) => r.id === roadId);
const camera = { lat: 17.4411909, lon: 78.3910953, headingDeg: 350, panoId: '_aD0u0ox_sRuha6lb7I6Dg' };
// Append-only so later, better photographic or measured corrections survive reruns.
const insert = (array, item) => { if (!array.some((v) => v.id === item.id)) array.push(item); };
insert(data.sources, {
  id: sourceId, kind: 'street_view', title: 'Madhapur west-of-Post-Office-Road brown block — six observed commercial fronts',
  url: 'https://www.google.com/maps/@?api=1&map_action=pano&pano=_aD0u0ox_sRuha6lb7I6Dg&heading=350&pitch=5&fov=65',
  captureDate: '2026-04', observedDate: date, reviewer, position: camera, assetPolicy: 'reference_only',
  notes: 'Root agent walked west to this second panorama in the user-authorized Chrome session after seeing the same block from pano GT08ldGQbgKh-0PXwzwgTQ at heading 335. The full warm-brown block is immediately west of the narrow Post Office Road alley, with a farther-set-back white building beyond it to the west. Five visible levels include raised ground. Brown vertical cladding piers, offwhite horizontal bands, a wider left window area and narrower right window area are observed. Ground centre-right is SLNS PRINTERS / JUMBO XEROX, with a secondary NOTARY STAMP PAPERS board at the same opening; ground far-right is red Kotak Mutual Fund beside the alley. First upper floor has EVANIA Luxury Unisex Salon & Aesthetics left and Trend Tags right. Second upper floor has NOTHING (R) Exclusive Service Centre left and PURPLE LUXURIOUS SPA right. The earlier distant RHYTHM reading is corrected to NOTHING by this closer panorama. Left-ground laundromat wording, a Samsung MOBILE | ACCESSORIES | REPAIR sign, Ma-hu and SKINII higher signs, and an Anwar Service Center side-alley sign remain observations only. Footprint association, 18 m height, 12.48 m facade width, exact shop divisions, entrances and sign elevations are inferred reconstruction dimensions, not measured verification. No imagery is redistributed.',
});
insert(data.sources, {
  id: satelliteId, kind: 'satellite', title: 'Madhapur — MedPlus, Post Office Road and adjacent brown/white building relationship',
  url: 'https://www.google.com/maps/@17.44128,78.3911,163m/data=!3m1!1e3',
  captureDate: null, observedDate: date, reviewer, assetPolicy: 'reference_only', position: { lat: 17.44128, lon: 78.3911 },
  notes: 'Root inspected the satellite view in Chrome. It supports a single brown block immediately west of Post Office Road, separate from the adjoining white building set farther back to the west. This supports provisional association with existing OSM way356161033 / b_743cd80e16; it is not a measured footprint correction. Copyright 2026 is not an imagery capture date, so captureDate remains unknown. The Nothing Exclusive Service Center map label does not by itself prove any entrance or override ambiguous Samsung repair wording elsewhere on the facade. No imagery is redistributed.',
});
const a = [-16729.09, -2957.44], b = [-16716.64, -2956.63];
const lerp = (t) => [+(a[0] + (b[0] - a[0]) * t).toFixed(2), +(a[1] + (b[1] - a[1]) * t).toFixed(2)];
const definitions = [
  { id: 'survey-madhapur-slns-printers', name: 'SLNS PRINTERS / JUMBO XEROX', category: 'printing_and_copying', group: 'office_service', from: .37, to: .75, floor: 0, signColor: '#e0c537', signTextColor: '#b8292e', signBaseM: 3, signHeightM: .75, aliases: ['SLNS Printers', 'Jumbo Xerox'], notes: 'Ground centre-right yellow/red print-and-copy sign and associated opening are observed. NOTARY STAMP PAPERS is a secondary board of this same opening, not a separately invented shop. This estimated 4.74 m unit span, raised threshold and all elevations remain provisional.' },
  { id: 'survey-madhapur-kotak-mutual-fund', name: 'Kotak Mutual Fund', category: 'investment_service', group: 'bank_atm', from: .77, to: .98, floor: 0, signColor: '#c72636', signTextColor: '#ffffff', signBaseM: 3, signHeightM: .75, aliases: ['Kotak Mutual Fund'], notes: 'Red Kotak Mutual Fund ground frontage is observed at the far-right end immediately beside Post Office Road. The 2.62 m width and central doorway are inferred. This is an investment-service frontage, not evidence of an ATM or of all nearby Kotak listing placements.' },
  { id: 'survey-madhapur-evania', name: 'EVANIA Luxury Unisex Salon & Aesthetics', category: 'beauty_salon', group: 'other', from: .04, to: .63, floor: 1, signColor: '#242528', signTextColor: '#ffffff', signBaseM: 5.9, signHeightM: .95, aliases: ['Evania', 'Evania Luxury Unisex Salon'], notes: 'EVANIA black/white board occupies the wider left portion of the first upper floor. Its identity, side and vertical relation to the second-level Nothing sign are observed; the 7.36 m facade span, entrance, precise floor elevation and letter styling remain estimates.' },
  { id: 'survey-madhapur-trend-tags', name: 'Trend Tags', category: 'apparel', group: 'apparel', from: .67, to: .97, floor: 1, signColor: '#262322', signTextColor: '#d6b67d', signBaseM: 5.9, signHeightM: .95, aliases: ['Trend Tags'], notes: 'Trend Tags black/gold board is on the narrower right portion of the first upper floor, right of Evania. Approximately 3.74 m span and sign heights are authored estimates; no measured entrance or facade partition is claimed.' },
  { id: 'survey-madhapur-nothing-service-centre', name: 'NOTHING Exclusive Service Centre', category: 'mobile_phone_repair', group: 'electronics_mobile', from: .04, to: .63, floor: 2, signColor: '#232526', signTextColor: '#d6cda7', signBaseM: 9.1, signHeightM: .95, aliases: ['Nothing Exclusive Service Center', 'Nothing Exclusive Service Centre'], notes: 'Closer panorama resolves the left second-upper-floor board as NOTHING (R) / Exclusive Service Centre, correcting the earlier distant RHYTHM transcription. The photographed board is charcoal with pale-gold/offwhite letters; a normal white brand template is not substituted. Satellite label corroborates broad identity only. Its shared width above Evania, exact entrance and metric sign position are provisional.' },
  { id: 'survey-madhapur-purple-spa', name: 'PURPLE LUXURIOUS SPA', category: 'spa', group: 'other', from: .67, to: .97, floor: 2, signColor: '#795581', signTextColor: '#ffffff', signBaseM: 9.1, signHeightM: .95, aliases: ['Purple Luxurious Spa'], notes: 'PURPLE LUXURIOUS SPA is the observed purple/white board on the right second upper floor above Trend Tags. Exact board edges, approximately 3.74 m unit span, access and elevations remain provisional estimates.' },
];
for (const item of definitions) {
  const facade = [lerp(item.from), lerp(item.to)];
  const mid = [(facade[0][0] + facade[1][0]) / 2, (facade[0][1] + facade[1][1]) / 2];
  const hit = nearestSurveyRoadPoint(mid, road), [lat, lon] = unproject(...mid);
  insert(data.storefrontOverrides, {
    id: item.id, placementStatus: 'provisional', chunkId: 'c_-84_-15', name: item.name, nameTe: null,
    category: item.category, group: item.group, roadId, side: hit.side, buildingId, frontageKind: 'building', facade, entrance: mid,
    floor: item.floor, frontageWidthM: +Math.hypot(facade[1][0] - facade[0][0], facade[1][1] - facade[0][1]).toFixed(2),
    alongRoadM: +hit.alongM.toFixed(2), facingHeading: +Math.atan2(-(hit.x - mid[0]), -(hit.z - mid[1])).toFixed(5),
    lat: +lat.toFixed(7), lon: +lon.toFixed(7), captureDate: '2026-04', sourceIds: [sourceId, satelliteId], reviewedAt: date, reviewer,
    evidence: { identity: [sourceId], position: [], side: [sourceId], floor: [], facade: [], neighbours: [sourceId] },
    suppressAliases: item.aliases, suppressionRadiusM: 45,
    appearance: { facadeColor: '#926952', signColor: item.signColor, signTextColor: item.signTextColor, shutterColor: '#3b3937', heightM: 2.8, signHeightM: item.signHeightM, signBaseM: item.signBaseM, signOutsetM: .65, ...(item.floor === 0 ? { frontBaseM: 1.2, frontStyle: 'glazed' } : {}), awning: false, categoryProps: false }, notes: item.notes,
  });
  insert(data.observations, { id: item.id + '-observation', sourceIds: [sourceId], captureDate: '2026-04', observedDate: date, name: item.name, category: item.category, roadId, position: { lat: camera.lat, lon: camera.lon, headingDeg: camera.headingDeg }, placementStatus: 'pending', storefrontOverrideId: item.id, notes: 'Identity and broad facade arrangement are observed; exact measured placement remains pending. ' + item.notes });
}
for (const item of [
  { id: 'survey-madhapur-brown-laundromat-observation', name: 'Left-ground laundromat sign (H5 / Hi5 reading uncertain)', category: 'laundry', notes: 'Leftmost ground opening shows a laundromat sign, but exact H5/Hi5 wording and unit boundaries are not confirmed. Do not create an exact branded placement or equate a nearby listing with this opening without closer evidence.' },
  { id: 'survey-madhapur-brown-samsung-repair-observation', name: 'SAMSUNG MOBILE | ACCESSORIES | REPAIR wording', category: 'electronics_mobile', notes: 'Centre-left ground sign wording is visible, but the business identity and whether this is an official brand service centre are ambiguous. It remains an observation without a separate storefront placement or brand affiliation claim.' },
  { id: 'survey-madhapur-brown-notary-board-observation', name: 'NOTARY STAMP PAPERS secondary board', category: 'office_service', storefrontOverrideId: 'survey-madhapur-slns-printers', notes: 'Black NOTARY STAMP PAPERS board is adjacent to the SLNS print-and-copy sign at the same observed opening. Secondary board only; it does not establish an additional separately accessed shop.' },
  { id: 'survey-madhapur-brown-ma-hu-observation', name: 'Ma-hu upper sign (reading uncertain)', category: 'shop', notes: 'Higher right-hand sign was readable at a distance as Ma-hu. Identity, floor tenancy and exact wording remain uncertain; no frontage override is created.' },
  { id: 'survey-madhapur-brown-skinii-observation', name: 'SKINII rooftop sign (reading uncertain)', category: 'shop', notes: 'Roof-level sign appears to read SKINII. Closer identity, actual floor access and location are pending; it is not counted as a positioned shop.' },
  { id: 'survey-madhapur-anwar-service-observation', name: 'Anwar Service Center side-alley sign', category: 'electronics_mobile', notes: 'A far-right side-alley sign names Anwar Service Center. Its wall, floor, doorway and precise road association are not established. This record uses the camera-facing main-road context only and does not invent a side-alley storefront.' },
]) insert(data.observations, { ...item, sourceIds: [sourceId], captureDate: '2026-04', observedDate: date, roadId, position: { lat: camera.lat, lon: camera.lon, headingDeg: camera.headingDeg }, placementStatus: 'pending' });
insert(data.corrections, { id: 'profile-madhapur-brown-commercial-block', kind: 'building_profile', buildingId, sourceIds: [sourceId, satelliteId], heightM: 18, levels: 5, dimensionStatus: 'provisional', facadeColor: '#926952', style: 'madhapur_brown_commercial', notes: 'Five visible levels including raised ground are observed. Approximately 18 m height and the existing narrow OSM footprint association remain provisional. Brown vertical cladding piers, offwhite floor bands, wider left windows, narrower right windows and a narrow central structural strip inform the independently authored profile. Retain this block separately from the western white building b_1363284530; no footprint merge or measured dimensions are claimed.' });
// One-time colour correction from the closer photo; do not overwrite subsequent researched edits.
const nothing = data.storefrontOverrides.find((s) => s.id === 'survey-madhapur-nothing-service-centre');
if (nothing?.appearance?.signColor === '#e4e4e0') {
  nothing.appearance.signColor = '#232526'; nothing.appearance.signTextColor = '#d6cda7';
  nothing.notes += ' Closer photo corrects the board to charcoal with pale-gold/offwhite lettering; the initial light template is superseded.';
}
const review = data.roads.find((r) => r.roadId === roadId).left;
if (review.status !== 'verified' && !review.reviewedRanges?.some((r) => r.sourceIds.includes(sourceId))) {
  review.status = 'partial'; review.reviewedRanges ??= [];
  review.reviewedRanges.push({ startM: 18, endM: 37, sourceIds: [sourceId], reviewedAt: date, reviewer, completeness: 'partial', allFrontagesRecorded: false, storefrontIds: data.storefrontOverrides.filter((s) => s.roadId === roadId && s.side === 'left').sort((a, b) => a.alongRoadM - b.alongRoadM || a.id.localeCompare(b.id)).map((s) => s.id), notes: 'Approximately 19 m north-side observation window containing the brown commercial block. Six legible business fronts are reconstructed provisionally; several ambiguous and secondary signs remain observations. Exact unit/floor geometry, all frontage completeness and the opposite side remain unreviewed.' });
}
data.revision = Math.max(8, data.revision); data.generatedAt = date;
const validation = validateStreetSurvey(data, core, { worldId: 'hyd-metro', worldVersion: '2.0.0' });
if (validation.errors.length) { console.error(JSON.stringify(validation, null, 2)); process.exit(1); }
fs.writeFileSync(file, JSON.stringify(data) + '\n');
console.log(JSON.stringify({ result: 'seeded', summary: validation.summary }, null, 2));
