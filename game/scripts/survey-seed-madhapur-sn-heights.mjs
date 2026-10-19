#!/usr/bin/env node
/** Chrome-observed upper businesses on SN Heights; ground entrances remain pending. */
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
const sourceId = 'sv-madhapur-sn-heights-2026-04-chrome-20261018';
const date = '2026-10-18', reviewer = 'Codex Chrome street-level inspection';
const roadId = 'r_38680221829_0', buildingId = 'b_29048e3fbb';
const road = core.roads.find((r) => r.id === roadId);
const camera = { lat: 17.4410804, lon: 78.3914984, headingDeg: 50, panoId: 'kBA2xeBr-9C4DqDRvWTlRQ' };
const insert = (array, item) => { if (!array.some((v) => v.id === item.id)) array.push(item); };
insert(data.sources, {
  id: sourceId, kind: 'street_view', title: 'Madhapur SN Heights — Vave Salon, Neoclassic Concepts and Fit.Hive Gym',
  url: 'https://www.google.com/maps/@?api=1&map_action=pano&pano=kBA2xeBr-9C4DqDRvWTlRQ&heading=50&pitch=0&fov=55',
  captureDate: '2026-04', observedDate: date, reviewer, position: camera, assetPolicy: 'reference_only',
  notes: 'Root agent inspected this April 2026 panorama in the user-authorized Chrome session. The building immediately east of the Ayyappa Society Main Road alley has offwhite fascia, dark-blue SN HEIGHTS lettering and a tall rose/pink right fascia strip with a gold decorative emblem. Three visible levels include ground. VAVE SALON UNISEX occupies roughly the left 65 percent of the first upper floor; Neoclassic Concepts occupies roughly the right 30 percent, with a black board, white letters and gold couch icon. FIT.HIVE GYM is on the second upper floor with red/white bands near the centre and right; these refer to one business, not duplicate shops. VANTAGE MOBILE STORE ground wording and a vertical RAJADHANI BANK / 24x7 ATM sign are visible, but their entrances, exact floor/unit divisions and institutional identity remain pending. Existing footprint association, approximately 11.8 m height and all facade widths, doorway positions and sign elevations remain provisional estimates. No imagery is redistributed.',
});
const a = [-16660.44, -2938.04], b = [-16642.14, -2936.42];
const lerp = (t) => [+(a[0] + (b[0] - a[0]) * t).toFixed(2), +(a[1] + (b[1] - a[1]) * t).toFixed(2)];
const definitions = [
  { id: 'survey-madhapur-vave-salon', name: 'VAVE SALON UNISEX', category: 'beauty_salon', group: 'other', from: .04, to: .64, floor: 1, signColor: '#24272b', signTextColor: '#ffffff', signBaseM: 6.1, signHeightM: 1, aliases: ['Vave Salon', 'Vave Salon Unisex'], notes: 'Vave Salon Unisex is legible on the wider left first-upper-floor band. Approximately 11.02 m frontage follows the observed broad division. Endpoints, entrance, colours and sign height are authored estimates; no measured unit dimensions are claimed.' },
  { id: 'survey-madhapur-neoclassic-concepts', name: 'Neoclassic Concepts', category: 'interior_design', group: 'office_service', from: .68, to: .97, floor: 1, signColor: '#24272b', signTextColor: '#ffffff', signBaseM: 6.1, signHeightM: 1, aliases: ['Neoclassic Concepts'], notes: 'Neoclassic Concepts black board with white lettering and a gold couch icon occupies the right first-upper-floor portion. The 5.33 m span, central entrance and all metric elevations are provisional. Its furniture-like icon is observed but does not by itself establish a retail category or ground entrance.' },
  { id: 'survey-madhapur-fit-hive-gym', name: 'FIT.HIVE GYM', category: 'fitness_centre', group: 'other', from: .04, to: .97, floor: 2, signColor: '#c6313d', signTextColor: '#ffffff', signBaseM: 9.7, signHeightM: 1, aliases: ['Fit Hive Gym', 'Fit.Hive Gym'], notes: 'FIT.HIVE GYM has observed red/white bands near the centre and right of the second upper floor. This is a single business registration spanning that level, not two tenants. A single authored 10 m sign approximates the main band; exact board divisions, access, 17.09 m tenancy span and elevations remain unmeasured.' },
];
for (const item of definitions) {
  const facade = [lerp(item.from), lerp(item.to)];
  const mid = [(facade[0][0] + facade[1][0]) / 2, (facade[0][1] + facade[1][1]) / 2];
  const hit = nearestSurveyRoadPoint(mid, road), [lat, lon] = unproject(...mid);
  const width = +Math.hypot(facade[1][0] - facade[0][0], facade[1][1] - facade[0][1]).toFixed(2);
  insert(data.storefrontOverrides, {
    id: item.id, placementStatus: 'provisional', chunkId: 'c_-84_-15', name: item.name, nameTe: null,
    category: item.category, group: item.group, roadId, side: hit.side, buildingId, frontageKind: 'building', facade, entrance: mid,
    floor: item.floor, frontageWidthM: width, alongRoadM: +hit.alongM.toFixed(2), facingHeading: +Math.atan2(-(hit.x - mid[0]), -(hit.z - mid[1])).toFixed(5),
    lat: +lat.toFixed(7), lon: +lon.toFixed(7), captureDate: '2026-04', sourceIds: [sourceId], reviewedAt: date, reviewer,
    evidence: { identity: [sourceId], position: [], side: [sourceId], floor: [], facade: [], neighbours: [sourceId] },
    suppressAliases: item.aliases, suppressionRadiusM: 45,
    appearance: { facadeColor: '#ece5df', signColor: item.signColor, signTextColor: item.signTextColor, heightM: 3.2, signHeightM: item.signHeightM, signBaseM: item.signBaseM, signOutsetM: .65, signWidthM: item.floor === 2 ? 10 : width, awning: false, categoryProps: false }, notes: item.notes,
  });
  insert(data.observations, { id: item.id + '-observation', sourceIds: [sourceId], captureDate: '2026-04', observedDate: date, name: item.name, category: item.category, roadId, position: { lat: camera.lat, lon: camera.lon, headingDeg: camera.headingDeg }, placementStatus: 'pending', storefrontOverrideId: item.id, notes: 'Photographed identity and broad upper-floor arrangement are provisionally reconstructed. Exact metric geometry remains pending. ' + item.notes });
}
for (const item of [
  { id: 'survey-madhapur-vantage-mobile-observation', name: 'VANTAGE MOBILE STORE', category: 'electronics_mobile', notes: 'Ground-level white wording on a black board is visible towards centre-right of SN Heights. Identity is observed, but exact unit division, door and frontage are awaiting a closer view; no storefront override is created yet.' },
  { id: 'survey-madhapur-rajadhani-bank-atm-observation', name: 'RAJADHANI BANK / 24x7 ATM vertical sign', category: 'bank_atm', notes: 'Purple/yellow vertical sign is visible on the right fascia. A ground-right ATM entrance might be nearby, but this view does not prove its floor, exact wall, doorway or institutional identity. Do not convert the sign alone into an invented ATM entrance.' },
]) insert(data.observations, { ...item, sourceIds: [sourceId], captureDate: '2026-04', observedDate: date, roadId, position: { lat: camera.lat, lon: camera.lon, headingDeg: camera.headingDeg }, placementStatus: 'pending' });
insert(data.corrections, { id: 'profile-madhapur-sn-heights', kind: 'building_profile', buildingId, sourceIds: [sourceId], heightM: 11.8, levels: 3, dimensionStatus: 'provisional', facadeColor: '#ece5df', style: 'madhapur_sn_heights', notes: 'Three visible levels including ground inform an approximately 11.8 m provisional height. Offwhite horizontal fascia, dark-blue SN HEIGHTS lettering and a tall right rose/pink fascia with a gold emblem are observed. Footprint b_29048e3fbb is provisionally matched by its position immediately east of Ayyappa Society Main Road; precise geometry is not field-measured. Ground shop and ATM entrances remain pending.' });
const review = data.roads.find((r) => r.roadId === roadId).left;
if (review.status !== 'verified' && !review.reviewedRanges?.some((r) => r.sourceIds.includes(sourceId))) {
  review.status = 'partial'; review.reviewedRanges ??= [];
  review.reviewedRanges.push({ startM: 5, endM: 30, sourceIds: [sourceId], reviewedAt: date, reviewer, completeness: 'partial', allFrontagesRecorded: false, storefrontIds: data.storefrontOverrides.filter((s) => s.roadId === roadId && s.side === 'left').sort((a, b) => a.alongRoadM - b.alongRoadM || a.id.localeCompare(b.id)).map((s) => s.id), notes: 'Approximately 25 m north-side observation window around SN Heights. Three clear upper businesses are provisionally positioned; ground frontage divisions, ATM access and remaining neighbouring/non-shop frontage remain incomplete. The opposite side stays unreviewed.' });
}
data.revision = Math.max(10, data.revision); data.generatedAt = date;
const validation = validateStreetSurvey(data, core, { worldId: 'hyd-metro', worldVersion: '2.0.0' });
if (validation.errors.length) { console.error(JSON.stringify(validation, null, 2)); process.exit(1); }
fs.writeFileSync(file, JSON.stringify(data) + '\n');
console.log(JSON.stringify({ result: 'seeded', summary: validation.summary }, null, 2));
