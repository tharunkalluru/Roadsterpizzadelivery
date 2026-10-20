import { NavGraph } from '../world/nav';
import { RoadIndex } from '../world/roadIndex';
import type { DeliveryLocation, Vec2, WorldCore } from '../world/schema';
import type { StreetSurveyData } from '../world/streetSurveyTypes';
import type { MissionDef } from '../missions/types';
import { isPizzaPickup } from '../missions/catalog';

export interface PilotZoneDefinition {
  schemaVersion: 1;
  id: string;
  label: string;
  surveyRevision: number;
  surveySha256: string;
  qualificationReceipt: string;
  /** First implementation deliberately supports a simple convex boundary only. */
  polygon: Vec2[];
  roadIds: string[];
  spawn: { x: number; z: number; heading: number; roadId: string };
  entrances: { deliveryId: string; storefrontId: string }[];
  jobs: { id: string; pickupId: string; stops: string[] }[];
  maxHeightM: number;
}

/** No nearest-listing inference or fallback to the unrestricted catalogue. */
export class PilotZone {
  readonly mode = 'verified' as const;
  readonly nav: NavGraph;
  readonly missions: MissionDef[];
  private orientation: number;
  readonly roadIds: ReadonlySet<string>;

  constructor(readonly definition: PilotZoneDefinition, core: WorldCore, survey: StreetSurveyData, actualSurveySha256: string) {
    const d = definition;
    const require = (ok: unknown, message: string): void => { if (!ok) throw new Error(`Pilot qualification: ${message}`); };
    require(d.schemaVersion === 1 && !!d.id && !!d.label, 'invalid identity');
    require(/^[a-f0-9]{64}$/.test(d.surveySha256) && actualSurveySha256 === d.surveySha256 && survey.revision === d.surveyRevision, 'survey pin mismatch');
    require(!!d.qualificationReceipt?.trim(), 'missing reviewed qualification receipt');
    require(Array.isArray(d.polygon) && d.polygon.length >= 3 && d.polygon.every(p => p.length === 2 && p.every(Number.isFinite)), 'invalid boundary');
    const area = d.polygon.reduce((s, a, i) => { const b = d.polygon[(i + 1) % d.polygon.length]; return s + a[0] * b[1] - a[1] * b[0]; }, 0);
    require(Number.isFinite(area) && Math.abs(area) > 1, 'degenerate boundary');
    this.orientation = Math.sign(area);
    // Every vertex must be on the interior side of EVERY edge: rejects concave, crossed and repeated-edge boundaries.
    for (let i = 0; i < d.polygon.length; i++) {
      const a = d.polygon[i], b = d.polygon[(i + 1) % d.polygon.length];
      require(Math.hypot(b[0] - a[0], b[1] - a[1]) > .01, 'duplicate boundary vertex');
      for (const p of d.polygon) require(this.side(a, b, p) >= -1e-7, 'boundary must be simple and convex');
    }
    require(Number.isFinite(d.maxHeightM) && d.maxHeightM >= 2 && d.maxHeightM <= 100, 'invalid height limit');
    this.roadIds = new Set(d.roadIds);
    require(this.roadIds.size > 0 && this.roadIds.size === d.roadIds.length, 'empty or duplicate roads');
    const sources = new Set(survey.sources.filter(s => !!s.captureDate && !!s.url && !!s.reviewer).map(s => s.id));
    for (const id of this.roadIds) {
      const road = core.roads.find(r => r.id === id);
      require(road, `unknown road ${id}`);
      require(road!.points.every(p => this.contains(p[0], p[1], road!.widthM / 2 + 3)), `road envelope leaves boundary: ${id}`);
      const review = survey.roads.find(r => r.roadId === id);
      for (const side of ['left', 'right'] as const) {
        const evidence = review?.[side];
        require(evidence?.status === 'verified', `${id} ${side} is not verified`);
        const ranges = [...(evidence?.reviewedRanges ?? [])].sort((a, b) => a.startM - b.startM);
        let through = 0;
        for (const range of ranges) {
          require(Number.isFinite(range.startM) && Number.isFinite(range.endM) && range.startM >= 0 && range.endM > range.startM && range.endM <= road!.lengthM + .001, 'invalid coverage interval');
          require(range.completeness === 'complete' && range.allFrontagesRecorded && range.sourceIds.length > 0 && range.sourceIds.every(id => sources.has(id)), 'incomplete/source-less coverage');
          require(range.storefrontIds.every(id => survey.storefrontOverrides.some(s => s.id === id && s.roadId === road!.id && s.side === side && s.placementStatus === 'verified')), 'unverified frontage in coverage');
          require(range.startM <= through + .001, `${id} ${side} has a coverage gap`);
          through = Math.max(through, range.endM);
        }
        require(through >= road!.lengthM - .001, `${id} ${side} incomplete extent`);
      }
    }
    const directed = core.directed.filter(e => this.roadIds.has(e.roadId));
    const edgeIds = new Set(directed.map(e => e.id));
    this.nav = new NavGraph({ ...core, directed: directed.map(e => ({ ...e, next: e.next.filter(id => edgeIds.has(id)) })) }, new RoadIndex(core));
    require(directed.length > 0 && this.nav.core_.size === directed.length, 'roads are not a connected returnable directed zone');
    require([d.spawn.x, d.spawn.z, d.spawn.heading].every(Number.isFinite) && this.roadIds.has(d.spawn.roadId) && this.contains(d.spawn.x, d.spawn.z, 3), 'invalid spawn');
    const spawnSurface = this.nav.roads.surface(d.spawn.x, d.spawn.z, { preferRoadId: d.spawn.roadId, margin: 0 });
    require(spawnSurface?.roadId === d.spawn.roadId, 'spawn is not on its declared road');
    const bound = new Map<string, DeliveryLocation>();
    for (const entry of d.entrances) {
      const delivery = core.deliveries.find(p => p.id === entry.deliveryId);
      const frontage = survey.storefrontOverrides.find(s => s.id === entry.storefrontId);
      require(delivery && frontage?.placementStatus === 'verified' && frontage.sourceIds.length > 0 && frontage.sourceIds.every(id => sources.has(id)), 'entrance lacks verified source-supported frontage');
      require(!bound.has(entry.deliveryId), 'duplicate entrance');
      require(this.roadIds.has(delivery!.roadId) && frontage!.roadId === delivery!.roadId && frontage!.side === delivery!.side && frontage!.floor === delivery!.level, 'entrance correspondence mismatch');
      require(Math.hypot(frontage!.entrance[0] - delivery!.entrance[0], frontage!.entrance[1] - delivery!.entrance[1]) < .01, 'entrance position differs from verified record');
      require(this.contains(...delivery!.entrance) && delivery!.stopPolygon.length >= 3 && delivery!.stopPolygon.every(p => this.contains(...p, 3)), 'entrance/stop leaves boundary');
      require(delivery!.approachEdges.length > 0 && delivery!.approachEdges.every(id => edgeIds.has(id) && this.nav.edges.get(id)!.roadId === delivery!.roadId), 'outside/wrong-road approach');
      bound.set(entry.deliveryId, delivery!);
    }
    require(d.jobs.length > 0 && new Set(d.jobs.map(j => j.id)).size === d.jobs.length, 'empty or duplicate jobs');
    const spawnEdge = this.nav.directedFor(spawnSurface!, d.spawn.heading);
    this.missions = d.jobs.map<MissionDef>((job, i) => {
      require(job.stops.length > 0 && bound.has(job.pickupId) && job.stops.every(id => id !== job.pickupId && bound.has(id)), 'job has unknown/outside stop');
      require(isPizzaPickup(core, bound.get(job.pickupId)!), 'pickup is not a source-supported pizza outlet');
      let edge = spawnEdge.id, along = spawnEdge.along, length = 0;
      for (const id of [job.pickupId, ...job.stops]) {
        const stop = bound.get(id)!;
        const stopAlong = this.deliveryAlong(stop, edge);
        const route = this.nav.route(edge, stop.approachEdges, along, stop.approachEdges.includes(edge) && along > stopAlong);
        require(route && route.path.every(id => edgeIds.has(id)), 'job route disconnected or outside zone');
        length += route!.lengthM;
        edge = route!.path[route!.path.length - 1];
        along = this.deliveryAlong(stop, edge);
      }
      return { id: `pilot_${d.id}_${job.id}`, version: 1, templates: ['MT01'], title: 'Pizza delivery', brief: `${d.label}: collect pizza, then deliver inside the verified boundary.`, pickupId: job.pickupId, stops: [...job.stops], flightSeconds: 25, deadlineSeconds: Math.max(180, Math.ceil((length / 3 + 30 * (job.stops.length + 1)) * 2)), cargo: { label: 'Hot pizza', fragility: 1, failThreshold: 0 }, traffic: 'light', seed: 13300 + i, deadlineBasis: 'Qualified in-zone route at 3 m/s, interactions and 2x margin.' };
    });
  }

  private side(a: Vec2, b: Vec2, p: Vec2): number { return this.orientation * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])); }
  contains(x: number, z: number, margin = 0): boolean {
    if (![x, z, margin].every(Number.isFinite)) return false;
    const p: Vec2 = [x, z], poly = this.definition.polygon;
    return poly.every((a, i) => { const b = poly[(i + 1) % poly.length]; return this.side(a, b, p) >= margin * Math.hypot(b[0] - a[0], b[1] - a[1]) - 1e-7; });
  }
  allowsPose(p: { x: number; z: number; y?: number; roadId?: string | null }): boolean {
    return this.contains(p.x, p.z, 3) && (p.y === undefined || Number.isFinite(p.y) && p.y >= -1 && p.y <= this.definition.maxHeightM) && (!p.roadId || this.roadIds.has(p.roadId));
  }
  private deliveryAlong(d: DeliveryLocation, edgeId: string): number {
    const p = d.stopPolygon.reduce((a, p) => [a[0] + p[0] / d.stopPolygon.length, a[1] + p[1] / d.stopPolygon.length] as Vec2, [0, 0] as Vec2);
    const surface = this.nav.roads.surface(...p, { preferRoadId: d.roadId, margin: 30 });
    const e = this.nav.edges.get(edgeId);
    return surface && e ? e.forward ? surface.along : e.lengthM - surface.along : 0;
  }
}
