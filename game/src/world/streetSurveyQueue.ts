import type { RoadEdge, Vec2, WorldCore } from './schema';
import type { StreetSurveyData } from './streetSurveyTypes';

const round = (n: number): number => Math.round(n * 100) / 100;
function covered(ranges: { startM: number; endM: number; completeness: string; allFrontagesRecorded: boolean }[], length: number, verified = false): number {
  const intervals = ranges.filter((r) => !verified || (r.completeness === 'complete' && r.allFrontagesRecorded)).map((r) => [Math.max(0, r.startM), Math.min(length, r.endM)]).sort((a, b) => a[0] - b[0]);
  let end = 0, total = 0;
  for (const [a, b] of intervals) { total += Math.max(0, b - Math.max(end, a)); end = Math.max(end, b); }
  return total;
}
function midpoint(road: RoadEdge): { point: Vec2; bearing: number } {
  let remaining = road.lengthM / 2;
  for (let i = 1; i < road.points.length; i++) {
    const a = road.points[i - 1], b = road.points[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (remaining <= len || i === road.points.length - 1) {
      const t = len ? Math.min(1, remaining / len) : 0;
      return { point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], bearing: (Math.atan2(b[0] - a[0], a[1] - b[1]) * 180 / Math.PI + 360) % 360 };
    }
    remaining -= len;
  }
  return { point: road.points[0], bearing: 0 };
}
// Same WGS84 local tangent projection as world/geo.ts and scripts/lib/geo.mjs.
const phi0 = 17.4146 * Math.PI / 180, s2 = Math.sin(phi0) ** 2;
const kx = Math.cos(phi0) * (6378137 / Math.sqrt(1 - .00669437999014 * s2)) * Math.PI / 180;
const kz = (6378137 * (1 - .00669437999014) / (1 - .00669437999014 * s2) ** 1.5) * Math.PI / 180;
const coordinates = ([x, z]: Vec2): [number, number] => [17.4146 - z / kz, 78.5484 + x / kx];

/** Inventory is a research plan, not a claim that imagery exists or any frontage was reviewed. */
export function buildStreetWorkQueue(core: WorldCore, survey: StreetSurveyData, options: { maxRoadsPerBlock?: number; targetRoadLengthM?: number } = {}) {
  const maxRoads = options.maxRoadsPerBlock ?? 12, targetLength = options.targetRoadLengthM ?? 500;
  const roads = core.roads.slice().sort((a, b) => a.id.localeCompare(b.id, 'en'));
  const roadMap = new Map(roads.map((r) => [r.id, r]));
  const reviews = new Map(survey.roads.map((r) => [r.roadId, r]));
  const nodes = new Map<string, string[]>();
  for (const r of roads) for (const n of [r.fromNode, r.toNode]) { const list = nodes.get(n) ?? []; list.push(r.id); nodes.set(n, list); }
  const neighbours = (r: RoadEdge): string[] => [...new Set([...(nodes.get(r.fromNode) ?? []), ...(nodes.get(r.toNode) ?? [])])].filter((id) => id !== r.id).sort();
  const sourceMap = new Map(survey.sources.map((s) => [s.id, s]));
  const inventory = roads.map((r) => {
    const m = midpoint(r), [lat, lon] = coordinates(m.point);
    const station = core.stations.slice().sort((a, b) => Math.hypot(a.x - m.point[0], a.z - m.point[1]) - Math.hypot(b.x - m.point[0], b.z - m.point[1]) || a.id.localeCompare(b.id))[0];
    const observationSourceIds = survey.observations.filter((o) => o.roadId === r.id).flatMap((o) => o.sourceIds);
    return { roadId: r.id, name: r.name, roadLengthM: r.lengthM, nearestStationId: station?.id ?? null, corridor: station ? `${station.lines.slice().sort().join('+')}:${station.name}` : 'unassigned', contextSourceIds: [...new Set(observationSourceIds)].sort(), contextUrls: [...new Set(observationSourceIds)].map((id) => sourceMap.get(id)?.url).filter((url): url is string => !!url),
      sides: (['left', 'right'] as const).map((side) => {
        const review = reviews.get(r.id)?.[side], ranges = review?.reviewedRanges ?? [];
        const sourceIds = [...new Set([...ranges.flatMap((range) => range.sourceIds), ...survey.storefrontOverrides.filter((s) => s.roadId === r.id && s.side === side).flatMap((s) => s.sourceIds)])].sort();
        return { side, status: review?.status ?? 'unreviewed', observationWindowM: round(covered(ranges, r.lengthM)), verifiedLengthM: round(covered(ranges, r.lengthM, true)), remainingObservationM: round(Math.max(0, r.lengthM - covered(ranges, r.lengthM))), remainingVerificationM: round(Math.max(0, r.lengthM - covered(ranges, r.lengthM, true))), sourceIds, evidenceUrls: sourceIds.map((id) => sourceMap.get(id)?.url).filter((url): url is string => !!url),
          researchUrl: `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat.toFixed(7)},${lon.toFixed(7)}&heading=${((m.bearing + (side === 'left' ? 270 : 90)) % 360).toFixed(1)}`, mapUrl: `https://www.openstreetmap.org/#map=19/${lat.toFixed(7)}/${lon.toFixed(7)}` };
      }) };
  });
  const entries = new Map(inventory.map((r) => [r.roadId, r]));
  const unassigned = new Set(roads.map((r) => r.id));
  const rankedSeeds = roads.slice().sort((a, b) => {
    const aa = entries.get(a.id)!, bb = entries.get(b.id)!;
    const partial = (id: string): number => entries.get(id)!.sides.some((s) => s.status === 'partial') ? 0 : 1;
    return partial(a.id) - partial(b.id) || aa.corridor.localeCompare(bb.corridor, 'en') || a.id.localeCompare(b.id, 'en');
  });
  const blocks = [];
  for (const seed of rankedSeeds) {
    if (!unassigned.has(seed.id)) continue;
    const pending = [seed.id], queued = new Set(pending), roadIds: string[] = []; let length = 0;
    while (pending.length && roadIds.length < maxRoads) {
      const id = pending.shift()!, road = roadMap.get(id)!;
      if (!unassigned.has(id) || (roadIds.length && length + road.lengthM > targetLength)) continue;
      unassigned.delete(id); roadIds.push(id); length += road.lengthM;
      for (const next of neighbours(road)) if (unassigned.has(next) && !queued.has(next)) { queued.add(next); pending.push(next); }
    }
    const sides = roadIds.flatMap((id) => entries.get(id)!.sides);
    blocks.push({ id: `block-${String(blocks.length + 1).padStart(5, '0')}`, order: blocks.length + 1, corridor: entries.get(seed.id)!.corridor, stationId: entries.get(seed.id)!.nearestStationId, connectedBy: 'canonical shared road graph nodes', roadIds, roadLengthM: round(length), sideLengthM: round(length * 2), observationWindowM: round(sides.reduce((n, s) => n + s.observationWindowM, 0)), remainingObservationM: round(sides.reduce((n, s) => n + s.remainingObservationM, 0)), remainingVerificationM: round(sides.reduce((n, s) => n + s.remainingVerificationM, 0)), evidenceSourceIds: [...new Set(sides.flatMap((s) => s.sourceIds))].sort() });
  }
  return { schemaVersion: 1, revision: survey.revision, worldId: survey.worldId, worldVersion: survey.worldVersion, disclaimer: 'Complete work inventory only. Generated research URLs do not prove available imagery. Partial observation windows do not imply all frontage within them is reconstructed or verified. Blocks are connected subsets of the canonical road graph; corridor labels are nearest-station work regions, not source verification.',
    summary: { totalRoads: roads.length, totalSides: roads.length * 2, blocks: blocks.length, corridors: new Set(blocks.map((b) => b.corridor)).size, inventoriedRoadLengthM: round(roads.reduce((n, r) => n + r.lengthM, 0)), remainingObservationM: round(inventory.flatMap((r) => r.sides).reduce((n, s) => n + s.remainingObservationM, 0)), remainingVerificationM: round(inventory.flatMap((r) => r.sides).reduce((n, s) => n + s.remainingVerificationM, 0)), observedSources: survey.sources.length, positionedStorefronts: survey.storefrontOverrides.length }, blocks, roads: inventory };
}
