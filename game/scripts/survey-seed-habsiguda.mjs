#!/usr/bin/env node
/**
 * Idempotent factual research seed from the root agent's Chrome inspection on 2026-10-17
 * America/Chicago. Never upgrades estimated dimensions to verified coverage.
 */
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
const sourceId = 'sv-habsiguda-2026-01-chrome-20261017';
const roadId = 'r_49952216502_0';
const road = core.roads.find((r) => r.id === roadId);
const camera = { lat: 17.4194797, lon: 78.5410293, headingDeg: 273.2, panoId: '6InygWDOscgijOwrtOzQCw' };
const observedDate = '2026-10-17';
const reviewer = 'Codex Chrome street-level inspection';
const source = {
  id: sourceId, kind: 'street_view', title: 'Habsiguda Main Road — Hotel Suprabhat frontage and opposite IICT wall',
  url: 'https://www.google.com/maps/@?api=1&map_action=pano&pano=6InygWDOscgijOwrtOzQCw',
  captureDate: '2026-01', observedDate, reviewer, position: camera,
  notes: 'Freshly inspected in the user-authorized Chrome session. Visible signs read HOTEL SUPRABHAT, PAN MAHAL and FOOD JUNCTION on the hotel frontage; neighbouring signs read GATSI SPORTS (initially transcribed as AFSI SPORTS; corrected by the wider Chrome review on 2026-10-18) and Amaravathi Banquets. Opposite side shows a painted IICT compound wall and trees; the raised planted median and metro piers C985/C986 are visible. Hotel footprint identity is corroborated by the existing listing and street view. Facade dimensions, shop divisions, hotel floor assignment and approximately four visible storeys remain estimates. Observed local date is America/Chicago 2026-10-17 (UTC session date 2026-10-18). No source image is redistributed.',
  assetPolicy: 'reference_only',
};
// Initial seed is append-only: later human/Chrome corrections must survive reruns.
const upsert = (list, item) => { if (!list.some((v) => v.id === item.id)) list.push(item); };
upsert(data.sources, source);

const A = [-838.82, -565.11], B = [-822.23, -545.10];
const edgeLength = Math.hypot(B[0] - A[0], B[1] - A[1]);
const pointAt = (s) => [+(A[0] + (B[0] - A[0]) * s / edgeLength).toFixed(2), +(A[1] + (B[1] - A[1]) * s / edgeLength).toFixed(2)];
const frontages = [
  { id: 'survey-habsiguda-hotel-suprabhat', name: 'HOTEL SUPRABHAT', category: 'hotel', group: 'hotel_lodging', start: 5, end: 21, floor: 3, appearance: { facadeColor: '#d7d6c7', signColor: '#d7d6c7', signTextColor: '#f0f0e6', heightM: 2.5, signHeightM: 1.1, signBaseM: 11.4 }, replacements: ['sf_3ba81a67ef'], aliases: ['Hotel Suprabhat', 'Suprabhat Hotel'], notes: 'Identity and broad main-road-facing stone facade observed. Upper HOTEL SUPRABHAT board is reproduced on the existing footprint edge; 16 m board span, floor 3, sign base 11.4 m and exact endpoints are approximate authored geometry. Existing estimated side-road listing frontage is displaced. These dimensions have not been field-measured.' },
  { id: 'survey-habsiguda-pan-mahal', name: 'PAN MAHAL', category: 'convenience_store', group: 'grocery', start: 1, end: 9, floor: 0, appearance: { facadeColor: '#d7d6c7', signColor: '#222a2a', signTextColor: '#f4ecd4', shutterColor: '#746b5e', heightM: 3.2, signHeightM: 0.7, signBaseM: 2.6 }, replacements: [], aliases: ['Pan Mahal'], notes: 'PAN MAHAL is legible at the hotel ground frontage. Shop division, width, entrance and position within the shared photographed hotel edge are approximate. Precise neighbouring shop order remains pending further views.' },
  { id: 'survey-habsiguda-food-junction', name: 'FOOD JUNCTION', category: 'restaurant', group: 'restaurant', start: 11, end: 22, floor: 0, appearance: { facadeColor: '#d7d6c7', signColor: '#192925', signTextColor: '#fff6df', shutterColor: '#676a61', heightM: 3.2, signHeightM: 0.7, signBaseM: 2.6 }, replacements: [], aliases: ['Food Junction'], notes: 'FOOD JUNCTION is legible at the hotel ground frontage. Shop division, width, entrance and position within the shared photographed hotel edge are approximate. Precise neighbouring shop order remains pending further views.' },
];
for (const item of frontages) {
  const facade = [pointAt(item.start), pointAt(item.end)];
  const mid = [(facade[0][0] + facade[1][0]) / 2, (facade[0][1] + facade[1][1]) / 2];
  const hit = nearestSurveyRoadPoint(mid, road);
  const [lat, lon] = unproject(...mid);
  const record = {
    id: item.id, placementStatus: 'provisional', chunkId: 'c_-5_-3',
    name: item.name, nameTe: null, category: item.category, group: item.group,
    roadId, side: hit.side, buildingId: 'b_a88aeb5138', frontageKind: 'building',
    facade, entrance: mid, floor: item.floor,
    frontageWidthM: +Math.hypot(facade[1][0] - facade[0][0], facade[1][1] - facade[0][1]).toFixed(2),
    alongRoadM: +hit.alongM.toFixed(2), facingHeading: +Math.atan2(-(hit.x - mid[0]), -(hit.z - mid[1])).toFixed(5),
    lat: +lat.toFixed(7), lon: +lon.toFixed(7), captureDate: '2026-01', sourceIds: [sourceId], reviewedAt: observedDate, reviewer,
    evidence: { identity: [sourceId], position: [], side: [sourceId], floor: [], facade: [], neighbours: [] },
    replaceStorefrontIds: item.replacements, suppressAliases: item.aliases, suppressionRadiusM: 80,
    appearance: { ...item.appearance, awning: false, categoryProps: false }, notes: item.notes,
  };
  upsert(data.storefrontOverrides, record);
  upsert(data.observations, { id: `${item.id}-observation`, sourceIds: [sourceId], captureDate: '2026-01', observedDate, name: item.name, category: item.category, roadId, position: { lat: camera.lat, lon: camera.lon }, placementStatus: 'pending', storefrontOverrideId: item.id, notes: `Brand/sign identity observed in Chrome. A provisional reconstruction is rendered on the hotel footprint. Exact dimensions, entrance and floor proof remain pending. ${item.notes}` });
}

for (const item of [
  { id: 'survey-habsiguda-afsi-sports-observation', name: 'GATSI SPORTS', category: 'sporting_goods', notes: 'Readable ground-level sign on the adjacent southeast neighbour, initially misread as AFSI SPORTS in the narrow view and corrected to GATSI SPORTS during the wider 2026-10-18 Chrome review. The initial record key is retained for correction history. Run survey-seed-gatsi.mjs for the subsequent footprint registration and provisional reconstruction. Observation camera location must not be used as the shop coordinate.' },
  { id: 'survey-habsiguda-amaravathi-banquets-observation', name: 'Amaravathi Banquets', category: 'event_venue', notes: 'Readable upper-level sign on the adjacent southeast neighbour. Own building, exact floor, entrance and facade geometry have not yet been matched. Observation camera location must not be used as the shop coordinate.' },
  { id: 'survey-habsiguda-iict-wall-observation', name: 'IICT compound wall and trees', category: 'institutional_compound', notes: 'Painted compound wall with trees observed on the opposite/northeast side of the road. This is non-shop frontage; do not fill it with estimated business signs. Exact wall geometry and gates remain pending.' },
  { id: 'survey-habsiguda-median-piers-observation', name: 'Planted median and metro piers C985 / C986', category: 'streetscape', notes: 'Raised planted median and numbered metro piers C985 and C986 observed. Exact pier/median dimensions and alignments are not established by this capture alone.' },
]) upsert(data.observations, { ...item, sourceIds: [sourceId], captureDate: '2026-01', observedDate, roadId, position: { lat: camera.lat, lon: camera.lon }, placementStatus: 'pending' });

upsert(data.corrections, { id: 'profile-habsiguda-hotel-suprabhat', kind: 'building_profile', buildingId: 'b_a88aeb5138', sourceIds: [sourceId], retainPresence: true, heightM: 14.2, levels: 4, dimensionStatus: 'provisional', facadeColor: '#d7d6c7', style: 'hotel_suprabhat', notes: 'Chrome street view confirms this hotel building exists where the current model wrongly omits it due to estimated side-road overlap. Restore presence. Four visible storeys and 14.2 m overall height are authored estimates, not surveyed dimensions; nearby road geometry remains provisional.' });
upsert(data.corrections, { id: 'anchor-habsiguda-hotel-suprabhat', kind: 'landmark_anchor', buildingId: 'b_a88aeb5138', name: 'Hotel Suprabhat', sourceIds: [sourceId], notes: 'Photographed hotel identity corroborates the existing Hotel Suprabhat listing on this footprint. Building dimensions and individual shop extents remain provisional.' });

const segment = data.roads.find((r) => r.roadId === roadId);
for (const side of ['left', 'right']) {
  const review = segment[side];
  // Preserve any later complete review. This seed adds a partial observation window only.
  if (review.status !== 'verified') {
    review.status = 'partial';
    review.reviewedRanges ??= [];
    const notes = `Initial Chrome observation window, approximately 30–60 m along this stored road edge. ${side === 'left' ? 'Hotel Suprabhat / PAN MAHAL / FOOD JUNCTION frontage visible; exact internal shop order and geometry incomplete.' : 'Opposite IICT compound wall/trees and median context visible; no business frontage is inferred here.'} Both ends, entrances and obscured frontage need further panorama review. This is not complete road-side coverage.`;
    const range = { startM: 30, endM: 60, sourceIds: [sourceId], reviewedAt: observedDate, reviewer, completeness: 'partial', allFrontagesRecorded: false, storefrontIds: [], notes };
    const i = review.reviewedRanges.findIndex((r) => r.sourceIds.includes(sourceId) && r.completeness === 'partial');
    if (i < 0) review.reviewedRanges.push(range);
  }
}

for (const [nodeId, junctionId] of [['308613838', 'j_49242675751'], ['308613843', 'j_52795083676'], ['1779592744', 'j_31516603949'], ['7732806133', 'j_3105566162']]) {
  const id = `osm-signal-node-${nodeId}`;
  const junction = core.junctions.find((j) => j.id === junctionId);
  const node = core.nodes.find((n) => n.id === junction.nodeId);
  const [lat, lon] = unproject(node.x, node.z);
  upsert(data.sources, { id, kind: 'map_listing', title: `OpenStreetMap traffic-signal node ${nodeId}`, url: `https://www.openstreetmap.org/node/${nodeId}`, captureDate: '2026-10-17', observedDate, reviewer: 'Codex bundled OSM snapshot / exact coordinate matching', position: { lat: +lat.toFixed(7), lon: +lon.toFixed(7) }, notes: `Bundled OSM snapshot marks highway=traffic_signals at node ${nodeId}. Its coordinates match v2 junction ${junctionId}. This establishes a sourced signal location; current physical state, heads, phases, timings and the full junction layout have not been street-view verified.`, assetPolicy: 'reference_only' });
  upsert(data.corrections, { id: `signal-correction-${nodeId}`, kind: 'traffic_signal', junctionId, sourceIds: [id], timingStatus: 'provisional', notes: 'Enable a traffic signal at the exact matched OSM location. Timings remain game-authored/provisional; do not upgrade junction geometry or movement fidelity.' });
}

data.revision = Math.max(2, data.revision);
const result = validateStreetSurvey(data, core, { worldId: 'hyd-metro', worldVersion: '2.0.0' });
if (result.errors.length) { console.error(JSON.stringify(result, null, 2)); process.exit(1); }
fs.writeFileSync(file, JSON.stringify(data) + '\n');
console.log(JSON.stringify({ result: 'seeded', summary: result.summary }, null, 2));
