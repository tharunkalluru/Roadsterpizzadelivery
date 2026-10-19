import type { Building, RoadEdge, Storefront, Vec2, WorldChunk, WorldChunkV2, WorldCore, WorldCoreV2 } from './schema';
import type { ReviewedRange, StreetSegmentReview, StreetSource, StreetSurveyData, SurveyCorrection, SurveyStorefront, SurveySummary } from './streetSurveyTypes';
export type * from './streetSurveyTypes';

const STATUSES = new Set(['unreviewed', 'partial', 'verified', 'unavailable', 'needs_revisit']);
const GROUPS = new Set(['grocery', 'restaurant', 'cafe_bakery', 'pharmacy', 'hospital_clinic', 'bank_atm', 'apparel', 'electronics_mobile', 'jewellery', 'hotel_lodging', 'auto_service', 'hardware', 'education', 'worship', 'office_service', 'other']);
const SOURCE_KINDS = new Set(['street_view', 'street_photo', 'satellite', 'official_business', 'field_survey', 'map_listing']);
const STREET_KINDS = new Set(['street_view', 'street_photo', 'field_survey']);
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const text = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0;
const date = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?$/.test(s);
const point = (p: unknown): p is Vec2 => Array.isArray(p) && p.length === 2 && p.every(finite);
const dist = (a: Vec2, b: Vec2): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
const normalized = (s: string): string => s.toLocaleLowerCase('en').replace(/[^\p{L}\p{N}]+/gu, '');

function onSegment(p: Vec2, a: Vec2, b: Vec2): { d: number; x: number; z: number; t: number } {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2)) : 0;
  const x = a[0] + dx * t, z = a[1] + dz * t;
  return { d: Math.hypot(p[0] - x, p[1] - z), x, z, t };
}

export function nearestSurveyRoadPoint(p: Vec2, road: RoadEdge): { d: number; x: number; z: number; alongM: number; side: 'left' | 'right' } {
  let best = { d: Infinity, x: 0, z: 0, alongM: 0, side: 'left' as 'left' | 'right' }, accumulated = 0;
  for (let i = 0; i + 1 < road.points.length; i++) {
    const a = road.points[i], b = road.points[i + 1], hit = onSegment(p, a, b), len = dist(a, b);
    if (hit.d < best.d) best = { ...hit, alongM: accumulated + hit.t * len, side: (b[0] - a[0]) * (p[1] - hit.z) - (b[1] - a[1]) * (p[0] - hit.x) < 0 ? 'left' : 'right' };
    accumulated += len;
  }
  return best;
}

/** Union length prevents overlapping source ranges from inflating coverage. */
function rangeLength(ranges: ReviewedRange[], lengthM: number, completeOnly = false): number {
  const sorted = ranges.filter((r) => r && typeof r === 'object' && (!completeOnly || (r.completeness === 'complete' && r.allFrontagesRecorded)) && finite(r.startM) && finite(r.endM))
    .map((r) => [Math.max(0, r.startM), Math.min(lengthM, r.endM)]).sort((a, b) => a[0] - b[0]);
  let total = 0, end = 0;
  for (const [a, b] of sorted) { if (b > Math.max(a, end)) total += b - Math.max(a, end); end = Math.max(end, b); }
  return total;
}

export function summarizeStreetSurvey(data: StreetSurveyData, core: WorldCore): SurveySummary {
  const byId = new Map(data.roads.map((r) => [r.roadId, r]));
  const summary: SurveySummary = { totalRoads: core.roads.length, totalSides: core.roads.length * 2, verifiedSides: 0, partialSides: 0, unreviewedSides: 0, unavailableSides: 0, needsRevisitSides: 0, verifiedStorefronts: data.storefrontOverrides.filter((s) => s.placementStatus === 'verified').length, provisionalStorefronts: data.storefrontOverrides.filter((s) => s.placementStatus === 'provisional').length, positionedStorefronts: data.storefrontOverrides.length, evidenceObservations: data.observations.length, totalRoadLengthM: 0, reviewedSideLengthM: 0, visuallyInventoriedSides: 0, visuallyInventoriedSideLengthM: 0, visualInventoryPercent: 0, verifiedSideLengthM: 0, coveragePercent: 0 };
  for (const road of core.roads) {
    summary.totalRoadLengthM += road.lengthM;
    for (const side of ['left', 'right'] as const) {
      const review = byId.get(road.id)?.[side];
      if (review?.status === 'verified') summary.verifiedSides++;
      else if (review?.status === 'partial') summary.partialSides++;
      else if (review?.status === 'unavailable') summary.unavailableSides++;
      else if (review?.status === 'needs_revisit') summary.needsRevisitSides++;
      else summary.unreviewedSides++;
      const ranges = review?.reviewedRanges ?? [];
      summary.reviewedSideLengthM += rangeLength(ranges, road.lengthM);
      const visualLength = rangeLength(ranges.filter(r => r.allFrontagesRecorded), road.lengthM);
      summary.visuallyInventoriedSideLengthM += visualLength;
      if (visualLength >= road.lengthM - 0.1) summary.visuallyInventoriedSides++;
      // A complete subrange can be verified while the whole side remains partial.
      summary.verifiedSideLengthM += rangeLength(ranges, road.lengthM, true);
    }
  }
  summary.coveragePercent = summary.totalRoadLengthM ? summary.verifiedSideLengthM / (summary.totalRoadLengthM * 2) * 100 : 0;
  summary.visualInventoryPercent = summary.totalRoadLengthM ? summary.visuallyInventoriedSideLengthM / (summary.totalRoadLengthM * 2) * 100 : 0;
  return summary;
}

export interface SurveyValidationContext {
  worldId?: string;
  worldVersion?: string;
  /** Supply every chunk in the CLI validator to check real building IDs and facade attachment. */
  chunks?: WorldChunkV2[];
}

/** Same validator is used by authoring scripts, tests and browser load. No guessed verification. */
export function validateStreetSurvey(raw: unknown, core: WorldCore, context: SurveyValidationContext = {}): { errors: string[]; warnings: string[]; summary: SurveySummary | null } {
  const errors: string[] = [], warnings: string[] = [];
  const err = (message: string): void => { if (errors.length < 500) errors.push(message); };
  if (!raw || typeof raw !== 'object') return { errors: ['Survey must be an object'], warnings, summary: null };
  const data = raw as StreetSurveyData;
  if (data.schemaVersion !== 1) err('Unsupported survey schemaVersion');
  if (!Number.isInteger(data.revision) || data.revision < 1) err('revision must be a positive integer');
  if (!text(data.worldId) || (context.worldId && data.worldId !== context.worldId)) err('worldId does not match the loaded world');
  if (!text(data.worldVersion) || (context.worldVersion && data.worldVersion !== context.worldVersion)) err('worldVersion does not match the loaded world');
  if (!text(data.generatedAt) || !Number.isFinite(Date.parse(data.generatedAt))) err('generatedAt must be a valid date or timestamp');
  if (!text(data.referencePolicy)) err('referencePolicy is required');
  for (const key of ['sources', 'roads', 'observations', 'storefrontOverrides', 'suppressions', 'corrections'] as const) {
    if (!Array.isArray(data[key])) err(`${key} must be an array`);
  }
  if (errors.length) return { errors, warnings, summary: null };
  if (data.appliedBatches !== undefined) {
    if (!Array.isArray(data.appliedBatches)) err('appliedBatches must be an array');
    else {
      const receipts = new Set<string>();
      for (const receipt of data.appliedBatches) {
        if (!text(receipt.id) || receipts.has(receipt.id) || !/^[\da-f]{64}$/.test(receipt.contentHash) || !date(receipt.reviewedAt) || !text(receipt.reviewer)) err('Invalid or duplicate batch receipt');
        receipts.add(receipt.id);
      }
    }
  }
  const ids = new Set<string>();
  const id = (value: unknown, where: string): void => { if (!text(value)) err(`${where}: missing id`); else if (ids.has(value)) err(`${where}: duplicate id ${value}`); else ids.add(value); };
  const roads = new Map(core.roads.map((r) => [r.id, r]));
  const sources = new Map<string, StreetSource>();
  for (const source of data.sources) {
    if (!source || typeof source !== 'object') { err('Invalid source'); continue; }
    id(source.id, 'source'); sources.set(source.id, source);
    if (!SOURCE_KINDS.has(source.kind)) err(`${source.id}: unsupported source kind`);
    try { const url = new URL(source.url); if (!['https:', 'http:'].includes(url.protocol)) err(`${source.id}: source URL must use https/http`); }
    catch { err(`${source.id}: invalid source URL`); }
    if (!text(source.title) || !text(source.notes) || !text(source.reviewer) || !date(source.observedDate)) err(`${source.id}: source title, notes, reviewer and observedDate are required`);
    if (source.captureDate !== null && !date(source.captureDate)) err(`${source.id}: captureDate must be YYYY-MM or YYYY-MM-DD, or null if unknown`);
    if (source.captureDate && source.captureDate > source.observedDate) err(`${source.id}: capture date is after observation date`);
    if (source.assetPolicy !== 'reference_only' && source.assetPolicy !== 'open_licensed') err(`${source.id}: assetPolicy required`);
    if (source.assetPolicy === 'open_licensed' && !text(source.license)) err(`${source.id}: open_licensed assets require a license`);
    if (STREET_KINDS.has(source.kind) && (!source.position || !finite(source.position.lat) || !finite(source.position.lon))) err(`${source.id}: street-level evidence requires its camera/observation coordinates`);
    if (source.position && (Math.abs(source.position.lat) > 90 || Math.abs(source.position.lon) > 180 || (source.position.headingDeg !== undefined && (!finite(source.position.headingDeg) || source.position.headingDeg < 0 || source.position.headingDeg >= 360)))) err(`${source.id}: invalid observation coordinates/heading`);
  }
  const refs = (values: unknown, where: string, streetLevel = false): string[] => {
    if (!Array.isArray(values) || !values.length || values.some((v) => !text(v))) { err(`${where}: at least one source ID is required`); return []; }
    for (const value of values) if (!sources.has(value)) err(`${where}: unknown source ${value}`);
    if (streetLevel && !values.some((v) => { const s = sources.get(v); return s && STREET_KINDS.has(s.kind) && s.captureDate; })) err(`${where}: dated street-level evidence is required`);
    return values;
  };
  for (const retracted of data.retractionHistory ?? []) {
    if (!text(retracted.batchId) || !text(retracted.id) || !text(retracted.reason) || !/^[\da-f]{64}$/.test(retracted.recordHash) || !date(retracted.reviewedAt)) err('Invalid research retraction history');
    refs(retracted.sourceIds, `retraction ${retracted.id}`);
  }
  const chunkMap = context.chunks ? new Map(context.chunks.map((c) => [c.id, c])) : null;
  const buildings = context.chunks ? new Map(context.chunks.flatMap((c) => c.buildings.map((b) => [b.id, { building: b, chunkId: c.id }] as const))) : null;
  const storefrontIds = context.chunks ? new Set(context.chunks.flatMap((c) => (c.storefronts ?? []).map((s) => s.id))) : null;
  const placeIds = context.chunks ? new Set(context.chunks.flatMap((c) => (c.storefronts ?? []).map((s) => s.placeId))) : null;
  const overrides = new Map<string, SurveyStorefront>();
  for (const sf of data.storefrontOverrides) {
    if (!sf || typeof sf !== 'object') { err('Invalid storefront override'); continue; }
    id(sf.id, 'storefront'); overrides.set(sf.id, sf);
    const label = sf.id, road = roads.get(sf.roadId);
    if (!['verified', 'provisional'].includes(sf.placementStatus)) err(`${label}: explicit placementStatus required`);
    const sfSources = refs(sf.sourceIds, label, true);
    if (!text(sf.name) || !text(sf.category) || !GROUPS.has(sf.group)) err(`${label}: name/category/group required`);
    if (!road) err(`${label}: unknown road ${sf.roadId}`);
    if (!['left', 'right'].includes(sf.side)) err(`${label}: side is required`);
    if (!text(sf.chunkId) || (chunkMap && !chunkMap.has(sf.chunkId))) err(`${label}: unknown or missing chunkId`);
    if (!['building', 'kiosk'].includes(sf.frontageKind) || (sf.frontageKind === 'building' && !sf.buildingId) || (sf.frontageKind === 'kiosk' && sf.buildingId !== null)) err(`${label}: frontageKind/buildingId inconsistent`);
    if (!Number.isInteger(sf.floor) || sf.floor < -5 || sf.floor > 80 || (sf.frontageKind === 'kiosk' && sf.floor !== 0)) err(`${label}: floor must be an observed integer from basement -5 to upper floor 80 (kiosk = 0)`);
    if (!date(sf.captureDate) || !date(sf.reviewedAt) || !text(sf.reviewer) || !text(sf.notes)) err(`${label}: captureDate, reviewedAt, reviewer and notes required`);
    if (!finite(sf.lat) || Math.abs(sf.lat) > 90 || !finite(sf.lon) || Math.abs(sf.lon) > 180) err(`${label}: invalid source latitude/longitude`);
    if (!sf.evidence || typeof sf.evidence !== 'object') err(`${label}: observation proof is required`);
    else for (const dimension of ['identity', 'position', 'side', 'floor', 'facade', 'neighbours'] as const) {
      const values = sf.evidence[dimension];
      const dimensions = sf.placementStatus === 'provisional' && dimension !== 'identity' && Array.isArray(values) && !values.length ? [] : refs(values, `${label}.evidence.${dimension}`, dimension !== 'identity');
      for (const sourceId of dimensions) if (!sfSources.includes(sourceId)) err(`${label}: proof source ${sourceId} not included in sourceIds`);
    }
    if (!Array.isArray(sf.facade) || sf.facade.length !== 2 || !sf.facade.every(point) || !point(sf.entrance)) { err(`${label}: facade endpoints and entrance coordinates required`); continue; }
    const width = dist(sf.facade[0], sf.facade[1]), mid: Vec2 = [(sf.facade[0][0] + sf.facade[1][0]) / 2, (sf.facade[0][1] + sf.facade[1][1]) / 2];
    if (!finite(sf.frontageWidthM) || width < 0.7 || width > 150 || Math.abs(width - sf.frontageWidthM) > 0.25) err(`${label}: measured frontage width does not match facade geometry`);
    if (!finite(sf.facingHeading)) err(`${label}: facingHeading required`);
    if (dist(sf.entrance, mid) > Math.max(12, width)) err(`${label}: entrance is too far from the observed facade`);
    if (road) {
      const hit = nearestSurveyRoadPoint(mid, road);
      if (hit.side !== sf.side) err(`${label}: side disagrees with facade geometry relative to road points`);
      if (hit.d > 100) err(`${label}: facade is more than 100 m from its road`);
      if (!finite(sf.alongRoadM) || Math.abs(hit.alongM - sf.alongRoadM) > 2) err(`${label}: alongRoadM disagrees with facade geometry`);
      const faceDot = ((hit.x - mid[0]) * -Math.sin(sf.facingHeading) + (hit.z - mid[1]) * -Math.cos(sf.facingHeading)) / (hit.d || 1);
      if (faceDot < 0.5) err(`${label}: facade normal does not face its road`);
    }
    if (sf.buildingId && buildings) {
      const found = buildings.get(sf.buildingId);
      if (!found || found.chunkId !== sf.chunkId) err(`${label}: building ID/chunk does not exist in this world`);
      else {
        const fp = found.building.footprint;
        for (const endpoint of sf.facade) {
          const edgeDistance = Math.min(...fp.map((a, i) => onSegment(endpoint, a, fp[(i + 1) % fp.length]).d));
          if (edgeDistance > 1.5) err(`${label}: facade endpoint is detached from building footprint`);
        }
        if (found.building.levels !== null && sf.floor >= found.building.levels) err(`${label}: floor exceeds building levels`);
      }
    }
    if (sf.suppressionRadiusM !== undefined && (!finite(sf.suppressionRadiusM) || sf.suppressionRadiusM < 1 || sf.suppressionRadiusM > 250)) err(`${label}: suppressionRadiusM must be 1–250 m`);
    for (const old of sf.replaceStorefrontIds ?? []) if (storefrontIds && !storefrontIds.has(old)) err(`${label}: replacement storefront ${old} does not exist`);
    for (const old of sf.replacePlaceIds ?? []) if (placeIds && !placeIds.has(old)) err(`${label}: replacement place ${old} does not exist`);
    if (sf.appearance) {
      for (const key of ['facadeColor', 'signColor', 'signTextColor', 'shutterColor', 'awningColor'] as const) if (sf.appearance[key] && !/^#[\da-f]{6}$/i.test(sf.appearance[key]!)) err(`${label}: ${key} must be a six-digit hex colour`);
      for (const key of ['heightM', 'signHeightM', 'signBaseM', 'frontBaseM', 'frontInsetM', 'signWidthM', 'signOutsetM'] as const) if (sf.appearance[key] !== undefined && (!finite(sf.appearance[key]) || sf.appearance[key]! < 0 || sf.appearance[key]! > 150)) err(`${label}: invalid appearance.${key}`);
      for (const key of ['awning', 'categoryProps'] as const) if (sf.appearance[key] !== undefined && typeof sf.appearance[key] !== 'boolean') err(`${label}: invalid appearance.${key}`);
      if (sf.appearance.frontStyle !== undefined && !['glazed', 'shutter', 'open_bay'].includes(sf.appearance.frontStyle)) err(`${label}: invalid appearance.frontStyle`);
      if (sf.appearance.observedDisplay !== undefined && !['electrical_goods','medicines','cement_bags','appliances','framed_art','hardware_goods','luggage_goods'].includes(sf.appearance.observedDisplay)) err(`${label}: invalid appearance.observedDisplay`);
      if (sf.appearance.displaySide !== undefined && !['left','right','both'].includes(sf.appearance.displaySide)) err(`${label}: invalid appearance.displaySide`);
      if (sf.appearance.frontOpening && (!finite(sf.appearance.frontOpening.at) || sf.appearance.frontOpening.at < 0 || sf.appearance.frontOpening.at > 1 || !finite(sf.appearance.frontOpening.widthM) || sf.appearance.frontOpening.widthM <= 0 || sf.appearance.frontOpening.widthM > sf.frontageWidthM)) err(`${label}: invalid appearance.frontOpening`);
    }
  }
  const reviewed = new Set<string>();
  for (const segment of data.roads) {
    if (!segment || typeof segment !== 'object') { err('Invalid road review'); continue; }
    if (reviewed.has(segment.roadId)) err(`Duplicate road review ${segment.roadId}`);
    reviewed.add(segment.roadId);
    const road = roads.get(segment.roadId);
    if (!road) { err(`Survey references unknown road ${segment.roadId}`); continue; }
    for (const side of ['left', 'right'] as const) {
      const review = segment[side], label = `${segment.roadId}.${side}`;
      if (!review || !STATUSES.has(review.status)) { err(`${label}: valid side status required`); continue; }
      if (review.reviewedRanges !== undefined && !Array.isArray(review.reviewedRanges)) { err(`${label}: reviewedRanges must be an array`); continue; }
      const ranges = review.reviewedRanges ?? [];
      if (review.status === 'unreviewed' && ranges.length) err(`${label}: unreviewed side cannot contain reviewed ranges`);
      if ((review.status === 'verified' || review.status === 'partial') && !ranges.length) err(`${label}: claimed review requires bounded evidence ranges`);
      for (const range of ranges) {
        if (!range || typeof range !== 'object') { err(`${label}: invalid reviewed range`); continue; }
        if (!finite(range.startM) || !finite(range.endM) || range.startM < 0 || range.endM <= range.startM || range.endM > road.lengthM + 0.1) err(`${label}: review range outside road length`);
        refs(range.sourceIds, label, true);
        if (!date(range.reviewedAt) || !text(range.reviewer) || !text(range.notes) || !['partial', 'complete'].includes(range.completeness) || typeof range.allFrontagesRecorded !== 'boolean') err(`${label}: reviewed range needs date, reviewer, notes and completeness`);
        if (!Array.isArray(range.storefrontIds)) { err(`${label}: ordered storefrontIds required`); continue; }
        if (new Set(range.storefrontIds).size !== range.storefrontIds.length) err(`${label}: duplicate storefront in frontage sequence`);
        let previous = -Infinity;
        for (const sfId of range.storefrontIds) {
          const sf = overrides.get(sfId);
          if (!sf || sf.roadId !== road.id || sf.side !== side) { err(`${label}: storefront ${sfId} is not a registered frontage on this side`); continue; }
          if (range.completeness === 'complete' && sf.placementStatus !== 'verified') err(`${label}: complete frontage sequence contains provisional placement ${sfId}`);
          if (sf.alongRoadM < previous || sf.alongRoadM < range.startM - 1 || sf.alongRoadM > range.endM + 1) err(`${label}: storefront sequence is not in observed road order/range`);
          previous = sf.alongRoadM;
        }
      }
      if (review.status === 'verified' && rangeLength(ranges, road.lengthM, true) < road.lengthM - 0.1) err(`${label}: verified side must have complete gap-free evidence for its entire length`);
    }
  }
  for (const road of core.roads) if (!reviewed.has(road.id)) err(`Playable road missing from survey manifest: ${road.id}`);
  for (const observation of data.observations) {
    if (!observation || typeof observation !== 'object') { err('Invalid observation'); continue; }
    id(observation.id, 'observation'); refs(observation.sourceIds, observation.id);
    if (!text(observation.name) || !text(observation.category) || !text(observation.notes) || !date(observation.observedDate)) err(`${observation.id}: observation name, category, notes and date required`);
    if (observation.captureDate !== null && !date(observation.captureDate)) err(`${observation.id}: invalid captureDate`);
    if (observation.roadId !== null && !roads.has(observation.roadId)) err(`${observation.id}: unknown road`);
    if (!observation.position || !finite(observation.position.lat) || !finite(observation.position.lon) || Math.abs(observation.position.lat) > 90 || Math.abs(observation.position.lon) > 180) err(`${observation.id}: observation coordinates required`);
    if (!['pending', 'exact'].includes(observation.placementStatus)) err(`${observation.id}: invalid placementStatus`);
    if (observation.placementStatus === 'exact' && overrides.get(observation.storefrontOverrideId ?? '')?.placementStatus !== 'verified') err(`${observation.id}: exact placement must link a verified storefront override`);
  }
  for (const suppression of data.suppressions) {
    if (!suppression || typeof suppression !== 'object') { err('Invalid suppression'); continue; }
    id(suppression.id, 'suppression'); refs(suppression.sourceIds, suppression.id, true);
    if (!text(suppression.reason) || !text(suppression.storefrontId) || (storefrontIds && !storefrontIds.has(suppression.storefrontId))) err(`${suppression.id}: suppression needs a real storefront ID and reason`);
  }
  for (const correction of data.corrections) {
    if (!correction || typeof correction !== 'object') { err('Invalid correction'); continue; }
    id(correction.id, 'correction'); refs(correction.sourceIds, correction.id);
    if (!text(correction.notes)) err(`${correction.id}: correction notes required`);
    if (correction.kind === 'traffic_signal') {
      if (!core.junctions.some((j) => j.id === correction.junctionId)) err(`${correction.id}: traffic signal references an unknown junction`);
      if (correction.timingStatus !== undefined && !['provisional', 'verified'].includes(correction.timingStatus)) err(`${correction.id}: invalid signal timingStatus`);
    } else if (correction.kind === 'road_width') {
      if (!roads.has(correction.roadId) || !finite(correction.widthM) || correction.widthM < 2 || correction.widthM > 80) err(`${correction.id}: invalid road width or unknown road`);
      if (correction.dimensionStatus !== undefined && !['provisional', 'verified'].includes(correction.dimensionStatus)) err(`${correction.id}: invalid width dimensionStatus`);
      if (correction.dimensionStatus === 'verified' && !correction.sourceIds.some(id => sources.get(id)?.kind === 'field_survey')) err(`${correction.id}: verified width requires field measurement evidence`);
    } else if (correction.kind === 'building_height') {
      if (!text(correction.buildingId) || (buildings && !buildings.has(correction.buildingId)) || !finite(correction.heightM) || correction.heightM < 1 || correction.heightM > 400 || (correction.levels !== null && (!Number.isInteger(correction.levels) || correction.levels < 1))) err(`${correction.id}: invalid building height/levels or unknown building`);
      if (correction.dimensionStatus !== undefined && !['provisional', 'verified'].includes(correction.dimensionStatus)) err(`${correction.id}: invalid height dimensionStatus`);
      if (correction.dimensionStatus === 'verified' && !correction.sourceIds.some(id => sources.get(id)?.kind === 'field_survey')) err(`${correction.id}: verified height requires field measurement evidence`);
    } else if (correction.kind === 'building_profile') {
      if (!text(correction.buildingId) || (buildings && !buildings.has(correction.buildingId))) err(`${correction.id}: building profile references an unknown building`);
      if (!['provisional', 'verified'].includes(correction.dimensionStatus)) err(`${correction.id}: building profile dimensionStatus required`);
      if (correction.dimensionStatus === 'verified' && !correction.sourceIds.some(id => sources.get(id)?.kind === 'field_survey')) err(`${correction.id}: verified building dimensions require field measurement evidence`);
      if (correction.heightM !== undefined && (!finite(correction.heightM) || correction.heightM < 1 || correction.heightM > 400)) err(`${correction.id}: invalid building profile height`);
      if (correction.levels !== undefined && correction.levels !== null && (!Number.isInteger(correction.levels) || correction.levels < 1)) err(`${correction.id}: invalid building profile levels`);
      if (correction.retainPresence !== undefined && typeof correction.retainPresence !== 'boolean') err(`${correction.id}: retainPresence must be boolean`);
      if (correction.retainPresence) refs(correction.sourceIds, `${correction.id}.retainPresence`, true);
      if (correction.profile) {
        const p = correction.profile, label = `${correction.id}.profile`;
        if (p.signageOnly !== undefined && typeof p.signageOnly !== 'boolean') err(`${label}: signageOnly must be boolean`);
        const profileSources = refs(p.sourceIds, label, p.appearanceStatus === 'observed');
        if (profileSources.some((sourceId) => !correction.sourceIds.includes(sourceId))) err(`${label}: profile sources must be listed by the correction`);
        if (!['observed', 'inferred'].includes(p.appearanceStatus) || p.dimensionStatus !== correction.dimensionStatus || !/^#[\da-f]{6}$/i.test(p.wallColor)) err(`${label}: invalid appearance/dimension status or wall colour`);
        const metric = (n: unknown, where: string, max = 150): void => { if (!finite(n) || n < 0 || n > max) err(`${label}: invalid ${where}`); };
        const colour = (value: string | undefined, where: string): void => { if (value !== undefined && !/^#[\da-f]{6}$/i.test(value)) err(`${label}: invalid ${where} colour`); };
        if (p.nameBand) {
          metric(p.nameBand.baseM, 'name band base'); metric(p.nameBand.heightM, 'name band height');
          if (p.nameBand.widthRatio !== undefined) metric(p.nameBand.widthRatio, 'name band width', 1);
          if (p.nameBand.at !== undefined) {
            metric(p.nameBand.at, 'name band position', 1);
            const halfWidth = (p.nameBand.widthRatio ?? .65) / 2;
            if (p.nameBand.at - halfWidth < -1e-6 || p.nameBand.at + halfWidth > 1 + 1e-6) err(`${label}: name band extends outside its source face`);
          }
          if (p.nameBand.outsetM !== undefined) metric(p.nameBand.outsetM, 'name band outset', 20);
          if (p.nameBand.frontIndex !== undefined && (!Number.isInteger(p.nameBand.frontIndex) || p.nameBand.frontIndex < 0 || p.nameBand.frontIndex >= p.fronts.length)) err(`${label}: invalid name band face index`);
          colour(p.nameBand.color, 'name band'); colour(p.nameBand.textColor, 'name band text');
        }
        if (p.signPanels !== undefined && !Array.isArray(p.signPanels)) err(`${label}: sign panels must be an array`);
        else for (const panel of p.signPanels ?? []) {
          if (!text(panel.text) || panel.text.length > 500) err(`${label}: sign panel needs visible text of at most 500 characters`);
          metric(panel.baseM, 'sign panel base'); metric(panel.heightM, 'sign panel height');
          if (panel.widthRatio !== undefined) metric(panel.widthRatio, 'sign panel width', 1);
          if (panel.at !== undefined) {
            metric(panel.at, 'sign panel position', 1);
            const halfWidth = (panel.widthRatio ?? .65) / 2;
            if (panel.at - halfWidth < -1e-6 || panel.at + halfWidth > 1 + 1e-6) err(`${label}: sign panel extends outside its source face`);
          }
          if (panel.outsetM !== undefined) metric(panel.outsetM, 'sign panel outset', 20);
          if (panel.frontIndex !== undefined && (!Number.isInteger(panel.frontIndex) || panel.frontIndex < 0 || panel.frontIndex >= p.fronts.length)) err(`${label}: invalid sign panel face index`);
          if (!/^#[\da-f]{6}$/i.test(panel.color) || !/^#[\da-f]{6}$/i.test(panel.textColor)) err(`${label}: invalid sign panel colour`);
        }
        if (!Array.isArray(p.fronts) || !p.fronts.length) err(`${label}: at least one researched face required`);
        else for (const front of p.fronts) {
          if (!front.facade && !front.storefrontIds?.length) err(`${label}: facade or storefront IDs required`);
          for (const sfId of front.storefrontIds ?? []) if (overrides.get(sfId)?.buildingId !== correction.buildingId) err(`${label}: unknown/mismatched storefront ${sfId}`);
          if (front.facade && (!Array.isArray(front.facade) || front.facade.length !== 2 || !front.facade.every(point) || !finite(front.facingHeading))) err(`${label}: explicit face needs endpoints and heading`);
          const building = buildings?.get(correction.buildingId)?.building;
          if (front.facade && building) for (const endpoint of front.facade) if (Math.min(...building.footprint.map((a, i) => onSegment(endpoint, a, building.footprint[(i + 1) % building.footprint.length]).d)) > 1.5) err(`${label}: explicit facade detached from building`);
          if (p.signageOnly && ['access', 'accessOnly', 'setbackM', 'bays', 'piers', 'fascia', 'accents', 'screens'].some(key => key in front)) err(`${label}: signage-only faces cannot change architecture or access`);
          if (p.signageOnly && (!Array.isArray(front.floors) || front.floors.length)) err(`${label}: signage-only faces require empty floor bands`);
          if (!Array.isArray(front.floors) || (!p.signageOnly && !front.floors.length)) err(`${label}: floor bands required`);
          else for (const floor of front.floors) {
            metric(floor.baseM, 'floor base'); metric(floor.heightM, 'floor height'); metric(floor.glazingRatio, 'glazingRatio', 1);
            for (const key of ['glazingHeightRatio', 'bandHeightM', 'outsetM'] as const) if (floor[key] !== undefined) metric(floor[key], key, key === 'glazingHeightRatio' ? 1 : 150);
            colour(floor.glassColor, 'glass'); colour(floor.bandColor, 'band'); colour(floor.wallColor, 'floor wall');
            if (floor.openingShape !== undefined && floor.openingShape !== 'arched') err(`${label}: invalid opening shape`);
            if (floor.balustrade) {
              metric(floor.balustrade.heightM, 'balustrade height', 10); colour(floor.balustrade.color, 'balustrade');
              if (floor.balustrade.spacingM !== undefined) {
                metric(floor.balustrade.spacingM, 'balustrade spacing', 20);
                if (floor.balustrade.spacingM === 0) err(`${label}: balustrade spacing must be positive`);
              }
            }
          }
          for (const bay of front.bays ?? []) { metric(bay.start, 'bay start', 1); metric(bay.end, 'bay end', 1); if (bay.end <= bay.start) err(`${label}: bay endpoints inverted`); if (bay.glazingRatio !== undefined) metric(bay.glazingRatio, 'bay glazing', 1); colour(bay.glassColor, 'bay glass'); }
          for (const pier of front.piers ?? []) { metric(pier.at, 'pier at', 1); metric(pier.widthM, 'pier width', 20); colour(pier.color, 'pier'); if (pier.depthM !== undefined) metric(pier.depthM, 'pier depth', 20); }
          if (front.setbackM !== undefined) metric(front.setbackM, 'setback', 20);
          if (front.accessOnly !== undefined && typeof front.accessOnly !== 'boolean') err(`${label}: accessOnly must be boolean`);
          if (front.accessOnly && !front.access) err(`${label}: accessOnly face requires an access plan`);
          if (front.fascia) { metric(front.fascia.baseM, 'fascia base'); metric(front.fascia.heightM, 'fascia height'); colour(front.fascia.color, 'fascia'); if (front.fascia.outsetM !== undefined) metric(front.fascia.outsetM, 'fascia outset', 20); }
          for (const accent of front.accents ?? []) { metric(accent.start, 'accent start', 1); metric(accent.end, 'accent end', 1); if (accent.end <= accent.start) err(`${label}: accent endpoints inverted`); metric(accent.baseM, 'accent base'); metric(accent.heightM, 'accent height'); colour(accent.color, 'accent'); if (accent.outsetM !== undefined) metric(accent.outsetM, 'accent outset', 20); if (accent.outlineM !== undefined) metric(accent.outlineM, 'accent outline', 10); if (accent.depthM !== undefined) metric(accent.depthM, 'accent depth', 3); if (accent.kind !== undefined && !['cladding','light_string'].includes(accent.kind)) err(`${label}: invalid accent kind`); }
          for (const screen of front.screens ?? []) {
            if(!Array.isArray(screen.outline)||screen.outline.length<3||screen.outline.some(p=>!Array.isArray(p)||p.length!==2||!finite(p[0])||!finite(p[1])||p[0]<0||p[0]>1||p[1]<0||p[1]>150))err(`${label}: invalid screen outline`);
            if(!/^#[\da-f]{6}$/i.test(screen.color))err(`${label}: invalid screen colour`);
            if(screen.outsetM!==undefined)metric(screen.outsetM,'screen outset',3);
            if(screen.cellM!==undefined&&(!finite(screen.cellM)||screen.cellM<.05||screen.cellM>2))err(`${label}: invalid screen cell size`);
            if(screen.pattern!==undefined&&!['lattice','solid'].includes(screen.pattern))err(`${label}: invalid screen pattern`);
          }
          if (front.access) {
            metric(front.access.landingHeightM, 'landing height', 10); metric(front.access.landingDepthM, 'landing depth', 20);
            for (const stair of front.access.stairs ?? []) { metric(stair.at, 'stair at', 1); metric(stair.widthM, 'stair width', 20); metric(stair.runM, 'stair run', 30); if (!Number.isInteger(stair.risers) || stair.risers < 1 || stair.risers > 100) err(`${label}: invalid stair risers`); }
            for (const opening of front.access.basementOpenings ?? []) { metric(opening.at, 'basement opening at', 1); metric(opening.widthM, 'basement opening width', 20); metric(opening.depthM, 'basement opening depth', 10); }
          }
        }
      }
    } else if (correction.kind === 'landmark_anchor') {
      if (!text(correction.name) || !text(correction.buildingId) || (buildings && !buildings.has(correction.buildingId))) err(`${correction.id}: landmark requires a real building and name`);
    } else err('Unsupported correction kind');
  }
  if (!data.storefrontOverrides.some((s) => s.placementStatus === 'verified')) warnings.push('No storefronts have exact street-level placement verification yet. Existing listings and estimated reconstructions remain provisional.');
  return { errors, warnings, summary: errors.length ? null : summarizeStreetSurvey(data, core) };
}

export class StreetSurvey {
  readonly data: StreetSurveyData;
  readonly summary: SurveySummary;
  private readonly segments: Map<string, StreetSegmentReview>;
  private readonly perChunk = new Map<string, SurveyStorefront[]>();
  private readonly byRoadSide = new Map<string, { exact: SurveyStorefront; names: Set<string> }[]>();
  private readonly inventoriedSides = new Map<string, { road: RoadEdge; ranges: [number, number][] }>();
  private readonly buildingCorrections = new Map<string, SurveyCorrection[]>();
  private readonly suppressIds: Set<string>;
  private readonly suppressPlaces: Set<string>;

  constructor(data: StreetSurveyData, core: WorldCore, context: SurveyValidationContext = {}) {
    const validation = validateStreetSurvey(data, core, context);
    if (validation.errors.length) throw new Error(`Street survey is invalid: ${validation.errors.slice(0, 8).join('; ')}`);
    this.data = data; this.summary = validation.summary!;
    this.segments = new Map(data.roads.map((r) => [r.roadId, r]));
    const roads = new Map(core.roads.map(r => [r.id, r]));
    for (const review of data.roads) for (const side of ['left', 'right'] as const) {
      const road = roads.get(review.roadId)!;
      const ranges: [number, number][] = [];
      for (const range of (review[side].reviewedRanges ?? []).filter(r => r.allFrontagesRecorded).sort((a, b) => a.startM - b.startM)) {
        const previous = ranges.at(-1);
        if (previous && range.startM <= previous[1]) previous[1] = Math.max(previous[1], range.endM);
        else ranges.push([range.startM, range.endM]);
      }
      if (ranges.length) this.inventoriedSides.set(`${road.id}:${side}`, { road, ranges });
    }
    this.suppressIds = new Set([...data.suppressions.map((s) => s.storefrontId), ...data.storefrontOverrides.flatMap((s) => s.replaceStorefrontIds ?? []), ...data.storefrontOverrides.map((s) => s.id)]);
    this.suppressPlaces = new Set(data.storefrontOverrides.flatMap((s) => s.replacePlaceIds ?? []));
    for (const sf of data.storefrontOverrides) {
      const list = this.perChunk.get(sf.chunkId) ?? []; list.push(sf); this.perChunk.set(sf.chunkId, list);
      const key = `${sf.roadId}:${sf.side}`, aliases = this.byRoadSide.get(key) ?? [];
      aliases.push({ exact: sf, names: new Set([sf.name, ...(sf.suppressAliases ?? [])].map(normalized)) });
      this.byRoadSide.set(key, aliases);
    }
    for (const correction of data.corrections) {
      if (!('buildingId' in correction)) continue;
      const list = this.buildingCorrections.get(correction.buildingId) ?? [];
      list.push(correction); this.buildingCorrections.set(correction.buildingId, list);
    }
  }

  segment(roadId: string): StreetSegmentReview | undefined { return this.segments.get(roadId); }

  /** Immutable layer: base listing package and its checksums remain intact. */
  /** Apply the same explicit research replacements to map/search presentation, preserving the raw archive. */
  allowsSourceListing(placeId:string,frontageId:string|null):boolean {
    return !this.suppressPlaces.has(placeId) && (!frontageId || !this.suppressIds.has(frontageId));
  }

  /** A complete visual inventory supersedes guessed signs, not the underlying business listing.
   * Use the facade's road span, rather than a displaced listing point or another side.
   * A guessed sign crossing an inventoried boundary must also yield: part of that sign would
   * otherwise be painted over an observed frontage. The source listing remains searchable. */
  private inventoryPresentation(sf: Storefront): Storefront {
    if (sf.placeId.startsWith('survey:') || sf.status === 'verified' || !sf.facade || sf.placement?.display === 'listing_only') return sf;
    const inventory = this.inventoriedSides.get(`${sf.roadId}:${sf.side}`);
    if (!inventory) return sf;
    const points = [...sf.facade, [(sf.facade[0][0] + sf.facade[1][0]) / 2, (sf.facade[0][1] + sf.facade[1][1]) / 2] as Vec2];
    const hits = points.map(p => nearestSurveyRoadPoint(p, inventory.road));
    if (hits.some(hit => hit.side !== sf.side)) return sf;
    const start = Math.min(...hits.map(hit => hit.alongM)), end = Math.max(...hits.map(hit => hit.alongM));
    if (!inventory.ranges.some(([a, b]) => Math.min(end, b) - Math.max(start, a) > 1e-6)) return sf;
    return { ...sf, placement: {
      association: 'unmatched', floorBasis: 'unknown', displacementM: 0, roadSide: 'unknown',
      ...sf.placement, display: 'listing_only',
      reasons: [...(sf.placement?.reasons ?? []), 'street_inventory_supersedes_guessed_frontage'],
    } };
  }

  applyChunk(chunk: WorldChunk | WorldChunkV2): WorldChunkV2 {
    const storefronts = (('storefronts' in chunk ? chunk.storefronts : []) ?? []).filter((sf) => {
      if (this.suppressIds.has(sf.id) || this.suppressPlaces.has(sf.placeId)) return false;
      return !(this.byRoadSide.get(`${sf.roadId}:${sf.side}`) ?? []).some(({ exact, names }) => {
        if (sf.status === 'verified') return false;
        return names.has(normalized(sf.name)) && Math.hypot(sf.x - exact.entrance[0], sf.z - exact.entrance[1]) <= (exact.suppressionRadiusM ?? 80);
      });
    }).map(sf => this.inventoryPresentation(sf));
    for (const sf of this.perChunk.get(chunk.id) ?? []) {
      if (sf.buildingId && !chunk.buildings.some((b) => b.id === sf.buildingId)) throw new Error(`Survey frontage ${sf.id} references a missing building in ${chunk.id}`);
      storefronts.push({ id: sf.id, placeId: `survey:${sf.id}`, name: sf.name, nameTe: sf.nameTe, category: sf.category, group: sf.group, confidence: 1, sources: sf.sourceIds, license: 'Factual survey; source imagery reference only', x: sf.entrance[0], z: sf.entrance[1], buildingId: sf.buildingId, roadId: sf.roadId, side: sf.side, facade: sf.facade.map((p) => [...p] as Vec2) as [Vec2, Vec2], facingHeading: sf.facingHeading, floor: sf.floor as Storefront['floor'], status: sf.placementStatus, ...(sf.appearance ? { appearance: { ...sf.appearance } } : {}) });
    }
    const buildings = chunk.buildings.flatMap((building): Building[] => {
      let b = building;
      for (const correction of this.buildingCorrections.get(building.id) ?? []) {
        if (correction.kind === 'building_height' && correction.buildingId === b.id) b = { ...b, heightM: correction.heightM, levels: correction.levels, heightStatus: correction.dimensionStatus ?? 'provisional', heightBasis: 'street_review', ...(correction.facadeColor ? { facadeColor: correction.facadeColor } : {}) } as Building;
        else if (correction.kind === 'building_profile' && correction.buildingId === b.id) b = { ...b, ...(correction.heightM !== undefined ? { heightM: correction.heightM, heightStatus: correction.dimensionStatus, heightBasis: 'street_review' as const } : {}), ...(correction.levels !== undefined ? { levels: correction.levels } : {}), ...(correction.retainPresence ? { intrudesCarriageway: false } : {}), ...(correction.facadeColor ? { facadeColor: correction.facadeColor } : {}), ...(correction.style ? { surveyStyle: correction.style } : {}), ...(correction.profile ? { researchedProfile: structuredClone(correction.profile) } : {}) } as Building;
        else if (correction.kind === 'landmark_anchor' && correction.buildingId === b.id) b = { ...b, name: correction.name };
      }
      const repair=b.geometryReconciliation;
      // A documented retained frontage overrides a generic road-clearance estimate.
      // Otherwise safe components are shared verbatim by rendering, map and collision.
      if(!b.intrudesCarriageway || !repair || repair.status==='unresolved' || !repair.parts.length)return [b];
      return repair.parts.map((part,index)=>({...b,id:index===0?b.id:`${b.id}:safe:${index}`,footprint:part.footprint,
        holes:part.holes.length?part.holes:undefined,centroid:part.centroid,intrudesCarriageway:false,
        geometryReconciliation:{...repair,parentBuildingId:building.id,componentIndex:index}}));
    });
    return { ...chunk, buildings, storefronts };
  }

  applyCoreCorrections<T extends WorldCore>(core: T): T {
    const widths = new Map(this.data.corrections.filter((c) => c.kind === 'road_width').map((c) => [c.roadId, c]));
    const signals = new Set(this.data.corrections.filter((c) => c.kind === 'traffic_signal').map((c) => c.junctionId));
    return { ...core, roads: core.roads.map((r) => widths.has(r.id) ? { ...r, widthM: widths.get(r.id)!.widthM, status: { ...r.status, width: widths.get(r.id)!.dimensionStatus ?? 'provisional' as const } } : r), junctions: core.junctions.map((j) => signals.has(j.id) ? { ...j, signalled: true } : j) };
  }
}

export async function loadStreetSurvey(core: WorldCore | WorldCoreV2, url = './research/street-survey.json', signal?: AbortSignal): Promise<StreetSurvey> {
  const response = await fetch(url, { signal, cache: 'no-cache' });
  if (!response.ok) throw new Error(`Street survey could not load: HTTP ${response.status}`);
  return new StreetSurvey(await response.json() as StreetSurveyData, core, { worldVersion: core.manifestVersion });
}
