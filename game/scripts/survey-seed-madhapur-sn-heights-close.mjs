#!/usr/bin/env node
/** Final closer-view corrections: bank on upper left, uncertain ground names stay unpositioned. */
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
const sourceId = 'sv-madhapur-sn-heights-close-2026-04-chrome-20261018';
const initialId = 'sv-madhapur-sn-heights-2026-04-chrome-20261018';
const constructionId = 'sv-madhapur-opposite-construction-2026-04-chrome-20261018';
const date = '2026-10-18', reviewer = 'Codex Chrome street-level inspection';
const roadId = 'r_38680221829_0', buildingId = 'b_29048e3fbb';
const road = core.roads.find((r) => r.id === roadId);
const camera = { lat: 17.4410804, lon: 78.3914984, headingDeg: 32, panoId: 'kBA2xeBr-9C4DqDRvWTlRQ' };
const insert = (array, item) => { if (!array.some((v) => v.id === item.id)) array.push(item); };
insert(data.sources, {
  id: sourceId, kind: 'street_view', title: 'SN Heights closer view — Rajadhani Bank on upper left; uncertain ground names retained',
  url: 'https://www.google.com/maps/@?api=1&map_action=pano&pano=kBA2xeBr-9C4DqDRvWTlRQ&heading=32&pitch=0&fov=30',
  captureDate: '2026-04', observedDate: date, reviewer, position: camera, assetPolicy: 'reference_only',
  notes: 'Root inspected a closer heading 32 / field of view 30 of the same panorama in Chrome. A blue RAJADHANI BANK board is on the left quarter of the second upper floor. FIT.HIVE GYM occupies that level centre/right; its two visible red/white bands refer to one business. Common building-stair access and bank doorway remain unresolved. The earlier VANTAGE MOBILE STORE transcription is rejected: the blurred ground mobile board may read HARSH MOBILE STORE, but the operator is not confidently identified. Ground-left has partly obscured ... FASHIONS wording, ground centre a PHOTO STUDIO board with obscured operator name, and right-side TITAN / fastrack branding does not establish a tenant. None of these uncertain ground identities is positioned. All facade divisions and dimensions remain provisional; no imagery is redistributed.',
});
const a = [-16660.44, -2938.04], b = [-16642.14, -2936.42];
const lerp = (t) => [+(a[0] + (b[0] - a[0]) * t).toFixed(2), +(a[1] + (b[1] - a[1]) * t).toFixed(2)];
function geometry(from, to) {
  const facade = [lerp(from), lerp(to)];
  const mid = [(facade[0][0] + facade[1][0]) / 2, (facade[0][1] + facade[1][1]) / 2];
  const hit = nearestSurveyRoadPoint(mid, road), [lat, lon] = unproject(...mid);
  return { facade, entrance: mid, side: hit.side, frontageWidthM: +Math.hypot(facade[1][0] - facade[0][0], facade[1][1] - facade[0][1]).toFixed(2), alongRoadM: +hit.alongM.toFixed(2), facingHeading: +Math.atan2(-(hit.x - mid[0]), -(hit.z - mid[1])).toFixed(5), lat: +lat.toFixed(7), lon: +lon.toFixed(7) };
}
insert(data.storefrontOverrides, {
  id: 'survey-madhapur-rajadhani-bank', placementStatus: 'provisional', chunkId: 'c_-84_-15', name: 'RAJADHANI BANK', nameTe: null,
  category: 'bank', group: 'bank_atm', roadId, buildingId, frontageKind: 'building', ...geometry(.04, .25), floor: 2,
  captureDate: '2026-04', sourceIds: [initialId, sourceId], reviewedAt: date, reviewer,
  evidence: { identity: [sourceId], position: [], side: [sourceId], floor: [], facade: [], neighbours: [sourceId] },
  suppressAliases: ['Rajadhani Bank'], suppressionRadiusM: 45,
  appearance: { facadeColor: '#ece5df', signColor: '#344a97', signTextColor: '#ffffff', heightM: 3.2, signHeightM: 1, signBaseM: 9.7, signOutsetM: .65, signWidthM: 3.86, awning: false, categoryProps: false },
  notes: 'Closer view confirms the blue RAJADHANI BANK board on the left quarter of SN Heights second upper floor. The 3.86 m frontage, floor elevation and central facade anchor are estimates; common stair and actual bank door remain unresolved. A separate vertical 24x7 ATM sign is observed but does not establish a ground-level ATM entrance.',
});
const gym = data.storefrontOverrides.find((s) => s.id === 'survey-madhapur-fit-hive-gym');
if (gym && !gym.sourceIds.includes(sourceId)) {
  Object.assign(gym, geometry(.28, .97)); gym.sourceIds.push(sourceId);
  gym.evidence.identity.push(sourceId); gym.evidence.side.push(sourceId); gym.evidence.neighbours.push(sourceId);
  gym.notes = 'Closer view reserves the second-upper-floor left quarter for Rajadhani Bank and confirms FIT.HIVE GYM on the remaining centre/right, with two red/white sign bands referring to one business. Its approximately 12.68 m authored span and single 10 m main-band reconstruction are estimates. Common stair access, actual door, sign divisions and every vertical dimension remain unmeasured.';
}
const bankObservation = data.observations.find((o) => o.id === 'survey-madhapur-rajadhani-bank-atm-observation');
if (bankObservation && !bankObservation.sourceIds.includes(sourceId)) Object.assign(bankObservation, {
  name: 'RAJADHANI BANK / vertical 24x7 ATM sign', sourceIds: [...bankObservation.sourceIds, sourceId], observedDate: date,
  position: { lat: camera.lat, lon: camera.lon, headingDeg: camera.headingDeg }, storefrontOverrideId: 'survey-madhapur-rajadhani-bank',
  notes: 'Closer view identifies a blue Rajadhani Bank board on floor 2 left quarter, now provisionally reconstructed. The vertical purple/yellow 24x7 ATM sign remains a sign observation: exact ATM entrance, shared stair, bank door and measured dimensions are unresolved. No ground ATM placement is invented.',
});
const mobile = data.observations.find((o) => o.id === 'survey-madhapur-vantage-mobile-observation');
if (mobile && !mobile.sourceIds.includes(sourceId)) Object.assign(mobile, {
  name: 'Ground mobile-store board (operator name uncertain)', sourceIds: [...mobile.sourceIds, sourceId], observedDate: date,
  position: { lat: camera.lat, lon: camera.lon, headingDeg: camera.headingDeg },
  notes: 'Closer view rejects the original VANTAGE transcription. The blurred board may read HARSH MOBILE STORE, but the exact operator name remains uncertain. Legacy observation ID preserves correction history; neither Vantage nor Harsh is canonically displayed as a shop. Exact unit division and doorway remain pending.',
});
for (const item of [
  { id: 'survey-madhapur-sn-fashions-observation', name: 'Partly obscured ... FASHIONS ground board', category: 'apparel', notes: 'Ground-left sign has legible FASHIONS wording but an obscured operator name. Generic wording is recorded without an invented business name, doorway or frontage.' },
  { id: 'survey-madhapur-sn-photo-studio-observation', name: 'PHOTO STUDIO ground board (operator obscured)', category: 'photography', notes: 'Ground-centre photo-studio wording is visible but the operator name is obscured. This is an unpositioned sign observation, not an invented named storefront.' },
  { id: 'survey-madhapur-sn-titan-branding-observation', name: 'TITAN / fastrack branding', category: 'apparel', notes: 'Right-side Titan / fastrack marks are visible branding only. They do not establish a separately operated branded shop or its actual entrance; no tenant placement is created.' },
]) insert(data.observations, { ...item, sourceIds: [sourceId], captureDate: '2026-04', observedDate: date, roadId, position: { lat: camera.lat, lon: camera.lon, headingDeg: camera.headingDeg }, placementStatus: 'pending' });
insert(data.corrections, { id: 'anchor-madhapur-sn-heights', kind: 'landmark_anchor', buildingId, name: 'SN HEIGHTS', sourceIds: [initialId, sourceId], notes: 'Dark-blue SN HEIGHTS roof-fascia text is visible on the photographed building. This building-name anchor is not an additional tenant or verified measured sign geometry.' });
// The photographed MAIN face contradicts these listing-to-wall assignments only.
// Unreviewed side-alley storefronts and neighbouring buildings must remain intact.
for (const [storefrontId, name] of [
  ['sf_2381ff638e', 'hp service center-master tech'],
  ['sf_3c80cefac5', 'Idea clinics dental care'],
  ['sf_e94c09118e', 'Ciel - Dessert Bar'],
]) insert(data.suppressions, {
  id: `suppress-sn-heights-main-${storefrontId}`, storefrontId, sourceIds: [sourceId],
  reason: `${name}: photographed frontage does not support this snapped listing identity; actual operator pending. This explicit suppression applies only to its assigned main-road face on b_29048e3fbb. The close view shows Fashions/photo-studio/mobile/Titan wording with unresolved ground operators and researched upper tenants. It does not assert business closure or remove unreviewed side-alley labels.`,
});
const initial = data.sources.find((s) => s.id === initialId);
if (initial && !initial.notes.includes('closer heading 32 view corrects')) initial.notes += ' The closer heading 32 view corrects the distant VANTAGE reading to an uncertain HARSH-like mobile-store board and establishes Rajadhani Bank at floor 2 left; see the separate closer-view source. Ground operator names and access remain unresolved.';
const range = data.roads.find((r) => r.roadId === roadId).left.reviewedRanges?.find((r) => r.sourceIds.includes(initialId));
if (range && !range.sourceIds.includes(sourceId)) {
  range.sourceIds.push(sourceId); range.storefrontIds = data.storefrontOverrides.filter((s) => s.roadId === roadId && s.side === 'left').sort((a, b) => a.alongRoadM - b.alongRoadM || a.id.localeCompare(b.id)).map((s) => s.id);
  range.notes += ' Closer view adds Rajadhani Bank on the upper-left portion and narrows the single gym tenancy to centre/right. Ground operator identities and all measured entrances remain incomplete.';
}
insert(data.sources, {
  id: constructionId, kind: 'street_view', title: 'Madhapur opposite-side unfinished construction — observation only',
  url: 'https://www.google.com/maps/@?api=1&map_action=pano&pano=GT08ldGQbgKh-0PXwzwgTQ&heading=205&fov=80',
  captureDate: '2026-04', observedDate: date, reviewer, position: { lat: 17.4411613, lon: 78.3911867, headingDeg: 205, panoId: 'GT08ldGQbgKh-0PXwzwgTQ' }, assetPolicy: 'reference_only',
  notes: 'Opposite-side view in Chrome shows an apparently unoccupied roughly six-level beige/concrete facade, exposed scaffolding along its edges and a blue corrugated site fence at the street; taller cream apartment towers stand behind. Coordinates are the camera only. No exact building footprint, construction-site boundary, floor count, name or current occupancy survey has been established, so no geometric correction or invented shop is authored. The six-level description is an imagery estimate. No imagery is redistributed.',
});
insert(data.observations, { id: 'survey-madhapur-opposite-construction-observation', sourceIds: [constructionId], captureDate: '2026-04', observedDate: date, name: 'Unfinished concrete building, scaffolding and blue site fence', category: 'construction_site', roadId: 'r_40395506413_0', position: { lat: 17.4411613, lon: 78.3911867, headingDeg: 205 }, placementStatus: 'pending', notes: 'Observed opposite-side construction context: roughly six-level beige/concrete shell, edge scaffolding, blue corrugated site fence and taller cream towers behind. Road ID records the original camera street context only. Building match, exact side/footprint, dimensions, construction status and all shop identities remain unassigned; do not attach this to an arbitrary nearby building or upgrade coverage.' });
data.revision = Math.max(12, data.revision); data.generatedAt = date;
const validation = validateStreetSurvey(data, core, { worldId: 'hyd-metro', worldVersion: '2.0.0' });
if (validation.errors.length) { console.error(JSON.stringify(validation, null, 2)); process.exit(1); }
fs.writeFileSync(file, JSON.stringify(data) + '\n');
console.log(JSON.stringify({ result: 'seeded', summary: validation.summary }, null, 2));
