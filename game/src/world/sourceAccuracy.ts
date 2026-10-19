/** Frozen-source audit layer. Spatial association and satellite estimates are never verification. */
import type { Building, Storefront, WorldChunk, WorldChunkV2, WorldCore } from './schema';

export interface FrontagePlacement {
  association: 'source_contained' | 'nearby_ambiguous' | 'unmatched';
  display: 'facade' | 'listing_only';
  floorBasis: 'unknown' | 'street_review';
  displacementM: number;
  roadSide: 'supported' | 'conflict' | 'unknown';
  reasons: string[];
}
export interface SourceBuildingProperties {
  class?: string; subtype?: string; heightM?: number; numFloors?: number; minHeightM?: number;
  facadeColor?: string; facadeMaterial?: string; roofColor?: string; roofMaterial?: string; roofShape?: string;
}
export interface SatelliteHeightEstimate {
  heightM: number; samplePixels: number; footprintPixels: number; validFraction: number; iqrM: number; presenceMedian: number;
  year: 2023; effectiveResolutionM: 4;
}
export type BuildingHeightBasis = 'source_height' | 'source_floors' | 'satellite_estimate' | 'class_fallback' | 'street_review';
export interface BuildingGeometryReconciliation {
  status:'clipped'|'clearance_checked'|'unresolved'; geometryStatus:'provisional';
  method:'source_footprint_minus_carriageway'; clearanceM:number; sourceAreaM2:number;
  retainedAreaM2:number; retainedFraction:number; roadIds:string[]; sourceIds:string[]; notes:string;
  parts:{footprint:[number,number][];holes:[number,number][][];centroid:[number,number];areaM2:number}[];
  /** Runtime audit reference; original frozen outline is never overwritten in its source file. */
  sourceFootprint?:[number,number][]; sourceHoles?:[number,number][][]; parentBuildingId?:string; componentIndex?:number;
}
export interface RoadSourceProperties {
  widthBasis: 'source_rule' | 'class_default' | 'footprint_clearance';
  sourceWidthM?: number;
  classificationBasis: 'overture_class';
  sourceIds?:string[]; laneCountBasis?:'unavailable'|'source_rule';
  elevationBasis?:'authored_relative_level'|'flat_placeholder'|'source_metric_grade';
  surface?:string; maxSpeedKph?:number; relativeLayer?:number;
  /** Raw conditional/ranged rules retained; scalar metadata is sampled on the selected piece. */
  sourceRules?:Record<string,unknown[]>;
}
export interface SourceAccuracySummary {
  roads: { total: number; sourceWidth: number; inferredWidth: number; sourceSurface?:number; sourceSpeed?:number; sourceLayer?:number; sourceLanes?:number; sourceMetricGrade?:number; metadataMatched?:number };
  buildings: { total: number; sourceHeight: number; sourceFloors: number; satelliteEstimate: number; classFallback: number; sourceClass: number; sourceFacadeColour: number; sourceFacadeMaterial: number };
  frontages: { total: number; sourceContained: number; nearbyAmbiguous: number; unmatched: number; facadeEligible: number; listingOnly: number; reasonCounts: Record<string, number> };
  geometry?:Record<string,number>;
}
export interface SourceAccuracyData {
  version: 1; worldId: string; worldVersion: string; coreSha256: string;
  chunkDigest: string; sources: { title: string; url: string; year?: number; license?: string }[];
  summary: SourceAccuracySummary;
  roads?:Record<string,RoadSourceProperties>;
  buildings: Record<string, { source?: SourceBuildingProperties; satellite?: SatelliteHeightEstimate; geometry?:BuildingGeometryReconciliation }>;
  frontages: Record<string, FrontagePlacement>;
  limitations: string[];
}
export interface SourcePlaceListing {
  id: string; name: string; x: number; z: number; category: string;
  confidence: number | null; operatingStatus: string; roadId: string; distanceToRoadM: number;
  positionStatus: 'source_listing'; sources: string[]; licenses: string[]; frontageId: string | null;
}
export interface SourcePlaceListingIndex {
  version: 1; worldId: string; worldVersion: string; sourceSnapshot: string;
  positionStatus: string; roadAssociation: string; count: number; places: SourcePlaceListing[];
}

/** Stable visual placeholder only where both source dimensions and masked satellite evidence fail.
 * A class is evidence for building use, never for these assumed floor counts. */
export function inferredBuildingHeight(kind: string): number {
  if (/^(shed|roof|garage|garages|retail|kiosk|outbuilding)$/.test(kind)) return 3.8;
  if (/^(warehouse|industrial|factory|hangar)$/.test(kind)) return 6.5;
  if (kind === 'apartments') return 13.4;
  if (/^(office|commercial|hospital|hotel)$/.test(kind)) return 10.2;
  return 7;
}

export class SourceAccuracyLayer {
  readonly data: SourceAccuracyData;
  constructor(data: SourceAccuracyData) {
    if (data.version !== 1 || !data.summary || !data.buildings || !data.frontages) throw new Error('Invalid source accuracy layer');
    this.data = data;
  }
  applyCore<T extends WorldCore>(core: T): T {
    return { ...core, roads: core.roads.map(r => ({ ...r, sourceProperties: {
      classificationBasis: 'overture_class' as const,
      widthBasis: /width_rules/.test(r.provenance.note ?? '') ? 'source_rule' as const : /clamped/.test(r.provenance.note ?? '') ? 'footprint_clearance' as const : 'class_default' as const,
      ...(/width_rules/.test(r.provenance.note ?? '') ? { sourceWidthM: r.widthM } : {}),
      ...this.data.roads?.[r.id],
    } })) };
  }
  applyChunk(chunk: WorldChunk | WorldChunkV2): WorldChunkV2 {
    const buildings = chunk.buildings.map((b): Building => {
      const facts = this.data.buildings[b.id], source = facts?.source ?? {}, satellite = facts?.satellite;
      // Survey overlays are applied last by App; retaining this guard also makes explicit reuse safe.
      if (b.heightBasis === 'street_review' || b.heightStatus === 'verified') return b;
      const kind = source.class || source.subtype || b.kind;
      const basis: BuildingHeightBasis = source.heightM && source.heightM > 0 ? 'source_height' : source.numFloors && source.numFloors > 0 ? 'source_floors' : satellite ? 'satellite_estimate' : 'class_fallback';
      const heightM = basis === 'source_height' ? source.heightM! : basis === 'source_floors' ? source.numFloors! * 3.2 + .6 : satellite?.heightM ?? inferredBuildingHeight(kind);
      return { ...b, kind, heightM: Math.round(heightM * 100) / 100, heightStatus: 'provisional', heightBasis: basis,
        levels: source.numFloors && source.numFloors > 0 ? source.numFloors : null,
        sourceProperties: source, ...(satellite ? { satelliteHeight: satellite } : {}),
        ...(facts?.geometry ? { geometryReconciliation: { ...facts.geometry, sourceFootprint:b.footprint, sourceHoles:b.holes } } : {}),
        ...(source.minHeightM && source.minHeightM > 0 && source.minHeightM < heightM ? { baseHeightM: source.minHeightM } : {}),
        ...(source.facadeColor ? { facadeColor: source.facadeColor } : {}),
      };
    });
    const storefronts = (('storefronts' in chunk ? chunk.storefronts : []) ?? []).map((sf): Storefront => {
      if (sf.placeId.startsWith('survey:')) return sf;
      const placement = this.data.frontages[sf.id] ?? { association: 'unmatched', display: 'listing_only', floorBasis: 'unknown', displacementM: 0, roadSide: 'unknown', reasons: ['missing_source_audit'] } as FrontagePlacement;
      return { ...sf, placement, floor: 0 }; // remove the old category-guessed upper-floor claim
    });
    return { ...chunk, buildings, storefronts };
  }
}
