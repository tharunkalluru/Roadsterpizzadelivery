import type { StoreGroup, Vec2 } from './schema';
import type { ResearchedBuildingProfile } from './buildingProfile';

/** A side is always relative to the stored road points, never the camera direction. */
export type StreetSide = 'left' | 'right';
export type ReviewStatus = 'unreviewed' | 'partial' | 'verified' | 'unavailable' | 'needs_revisit';

export interface StreetSource {
  id: string;
  kind: 'street_view' | 'street_photo' | 'satellite' | 'official_business' | 'field_survey' | 'map_listing';
  title: string;
  url: string;
  /** Date the imagery was captured; YYYY-MM is allowed when the provider shows month precision. */
  captureDate: string | null;
  observedDate: string;
  reviewer: string;
  position?: { lat: number; lon: number; headingDeg?: number; panoId?: string };
  notes: string;
  /** Factual observations only. Source imagery is not a licensed runtime texture. */
  assetPolicy: 'reference_only' | 'open_licensed';
  license?: string;
}

export interface ReviewedRange {
  startM: number;
  endM: number;
  sourceIds: string[];
  reviewedAt: string;
  reviewer: string;
  completeness: 'partial' | 'complete';
  /** True only after shops AND non-shop frontage have been inventoried without gaps.
   * This records visual inventory, not measured placement; completeness stays partial
   * until the ordered storefronts meet the verified evidence requirements. */
  allFrontagesRecorded: boolean;
  /** Ordered from road start to end. Empty only for an observed side with no storefronts. */
  storefrontIds: string[];
  notes: string;
}

export interface SideReview {
  status: ReviewStatus;
  reviewedRanges?: ReviewedRange[];
  notes?: string;
}

export interface StreetSegmentReview {
  roadId: string;
  left: SideReview;
  right: SideReview;
}

export interface StreetObservation {
  id: string;
  sourceIds: string[];
  captureDate: string | null;
  observedDate: string;
  name: string;
  category: string;
  roadId: string | null;
  /** Camera/observation point. It is NOT automatically the shop entrance. */
  position: { lat: number; lon: number; headingDeg?: number };
  placementStatus: 'pending' | 'exact';
  storefrontOverrideId?: string;
  notes: string;
}

export interface SurveyAppearance {
  facadeColor?: string;
  signColor?: string;
  signTextColor?: string;
  shutterColor?: string;
  awningColor?: string;
  displayName?: string;
  heightM?: number;
  signHeightM?: number;
  signBaseM?: number;
  /** Authored elevations and offsets, in metres; basement tenancy need not be below the road. */
  frontBaseM?: number;
  frontInsetM?: number;
  signWidthM?: number;
  signOutsetM?: number;
  /** Explicit photographed choices override category-based random decoration. */
  awning?: boolean;
  categoryProps?: boolean;
  frontStyle?: 'glazed' | 'shutter' | 'open_bay';
  /** Explicit photographed stock; never inferred from an unreviewed listing category. */
  observedDisplay?: 'electrical_goods' | 'medicines' | 'cement_bags' | 'appliances' | 'framed_art' | 'hardware_goods' | 'luggage_goods';
  /** Side of explicitly observed stock as viewed from the road; never inferred from business category. */
  displaySide?: 'left' | 'right' | 'both';
  frontOpening?: { at: number; widthM: number };
}

/** Independently authored geometry backed by explicit observation, never nearest-listing guessing. */
export interface SurveyStorefront {
  id: string;
  /** provisional permits a researched reconstruction while measured geometry is still incomplete. */
  placementStatus: 'provisional' | 'verified';
  chunkId: string;
  name: string;
  nameTe: string | null;
  category: string;
  group: StoreGroup;
  roadId: string;
  side: StreetSide;
  buildingId: string | null;
  /** null building is permitted only for an observed freestanding kiosk. */
  frontageKind: 'building' | 'kiosk';
  facade: [Vec2, Vec2];
  entrance: Vec2;
  /** 0 is ground; negative integers identify basement levels. Geometry is set separately. */
  floor: number;
  frontageWidthM: number;
  alongRoadM: number;
  facingHeading: number;
  lat: number;
  lon: number;
  captureDate: string;
  sourceIds: string[];
  reviewedAt: string;
  reviewer: string;
  /** Each dimension is independently checked; a business listing only proves identity. */
  evidence: {
    identity: string[]; position: string[]; side: string[];
    floor: string[]; facade: string[]; neighbours: string[];
  };
  /** Listing records displaced by this researched frontage, including those in another chunk. */
  replaceStorefrontIds?: string[];
  replacePlaceIds?: string[];
  /** Explicit nearby same-brand aliases only. Does not remove other branches citywide. */
  suppressAliases?: string[];
  suppressionRadiusM?: number;
  appearance?: SurveyAppearance;
  notes: string;
}

export interface SurveySuppression {
  id: string;
  storefrontId: string;
  sourceIds: string[];
  reason: string;
}

interface CorrectionEvidence { id: string; sourceIds: string[]; notes: string }
export type SurveyCorrection =
  | (CorrectionEvidence & { kind: 'traffic_signal'; junctionId: string; timingStatus?: 'provisional' | 'verified' })
  | (CorrectionEvidence & { kind: 'road_width'; roadId: string; widthM: number; dimensionStatus?: 'provisional' | 'verified' })
  | (CorrectionEvidence & { kind: 'building_height'; buildingId: string; heightM: number; levels: number | null; facadeColor?: string; dimensionStatus?: 'provisional' | 'verified' })
  | (CorrectionEvidence & { kind: 'building_profile'; buildingId: string; retainPresence?: boolean; heightM?: number; levels?: number | null; dimensionStatus: 'provisional' | 'verified'; facadeColor?: string; style?: string; profile?: ResearchedBuildingProfile })
  | (CorrectionEvidence & { kind: 'landmark_anchor'; buildingId: string; name: string });

export interface StreetSurveyData {
  schemaVersion: 1;
  revision: number;
  worldId: string;
  worldVersion: string;
  generatedAt: string;
  referencePolicy: string;
  sources: StreetSource[];
  roads: StreetSegmentReview[];
  observations: StreetObservation[];
  storefrontOverrides: SurveyStorefront[];
  suppressions: SurveySuppression[];
  corrections: SurveyCorrection[];
  /** Content-addressed receipts make reviewed-block imports repeatable without duplicate evidence. */
  appliedBatches?: SurveyBatchReceipt[];
  retractionHistory?: { batchId: string; collection: string; id: string; recordHash: string; record: unknown; reason: string; sourceIds: string[]; reviewedAt: string }[];
}

export interface SurveyBatchReceipt { id: string; contentHash: string; reviewedAt: string; reviewer: string }
export interface StreetSurveyBatch {
  schemaVersion: 1;
  id: string;
  worldId: string;
  worldVersion: string;
  reviewedAt: string;
  reviewer: string;
  notes: string;
  sources?: StreetSource[];
  observations?: StreetObservation[];
  storefrontOverrides?: SurveyStorefront[];
  suppressions?: SurveySuppression[];
  corrections?: SurveyCorrection[];
  roadReviews?: { roadId: string; side: StreetSide; status: ReviewStatus; reviewedRanges?: ReviewedRange[]; notes?: string; replace?: boolean; sourceIds?: string[] }[];
  /** Existing records can change only with their exact previous SHA-256, keyed collection:id. */
  expectedPrevious?: Record<string, string>;
  retractions?: { collection: 'sources' | 'observations' | 'storefrontOverrides' | 'suppressions' | 'corrections'; id: string; expectedHash: string; reason: string; sourceIds: string[] }[];
}

export interface SurveySummary {
  totalRoads: number;
  totalSides: number;
  verifiedSides: number;
  partialSides: number;
  unreviewedSides: number;
  unavailableSides: number;
  needsRevisitSides: number;
  verifiedStorefronts: number;
  provisionalStorefronts: number;
  positionedStorefronts: number;
  evidenceObservations: number;
  totalRoadLengthM: number;
  reviewedSideLengthM: number;
  visuallyInventoriedSides: number;
  visuallyInventoriedSideLengthM: number;
  visualInventoryPercent: number;
  verifiedSideLengthM: number;
  /** Denominator is BOTH sides of every road, including short/service/boundary edges. */
  coveragePercent: number;
}
