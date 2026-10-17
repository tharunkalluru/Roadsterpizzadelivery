/**
 * Canonical world-package schema (shared contract between the import pipeline,
 * runtime world builder, navigation, physics and art). Owned by the lead.
 *
 * Coordinate convention (MASTER §8): local metric frame with a FIXED origin
 * (WORLD_ORIGIN). X = east metres, Y = up metres, Z = south metres.
 * Source lat/lon are always retained for audit and map display.
 *
 * Every geographic property that can be uncertain carries a FidelityStatus.
 */

export type FidelityStatus = 'verified' | 'provisional' | 'missing' | 'scenario_overlay';

/** Fixed local origin, midway along the Uppal–Tarnaka Blue Line corridor. Never change within a world version. */
export const WORLD_ORIGIN = { lat: 17.4146, lon: 78.5484 } as const;

export type Vec2 = [number, number]; // [x, z] metres
export type LatLon = [number, number]; // [lat, lon]

export interface Provenance {
  source: 'osm' | 'authored' | 'derived';
  /** e.g. "way/123456", "node/42", "relation/8826295" */
  sourceIds: string[];
  /** Source snapshot file name(s) inside the handoff resources. */
  snapshot?: string[];
  note?: string;
}

export interface PropertyStatus {
  geometry: FidelityStatus;
  name?: FidelityStatus;
  width?: FidelityStatus;
  direction?: FidelityStatus;
  level?: FidelityStatus;
  height?: FidelityStatus;
  turnRestrictions?: FidelityStatus;
}

export interface WorldManifest {
  worldId: string; // "hyd-uppal-tarnaka"
  version: string; // semver of generated package
  generatedAt: string;
  referenceDate: string; // OSM snapshot date
  origin: { lat: number; lon: number };
  projection: string; // documented projection description
  corridors: string[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  chunkSizeM: number;
  chunks: ChunkRef[];
  sourceManifest: { file: string; sha256: string }[];
  core: { file: string; sha256: string; bytes: number };
  counts: Record<string, number>;
}

export interface ChunkRef {
  id: string; // "c_<ix>_<iz>"
  ix: number;
  iz: number;
  file: string;
  sha256: string;
  bytes: number;
  buildingCount: number;
}

/** Physical road (carriageway) edge between two graph nodes, preserving the OSM centreline shape. */
export interface RoadEdge {
  id: string; // "r_<wayId>_<segIndex>" stable
  wayId: number;
  name: string | null;
  nameId: string | null; // name-registry id
  highway: string; // OSM highway class
  oneway: boolean; // true => only forward (points order) travel allowed
  lanes: number | null;
  widthM: number; // render/collision width (provisional default by class unless tagged)
  level: number; // relative stacking from OSM layer (NOT metres)
  bridge: boolean;
  tunnel: boolean;
  /** representative surface elevation in metres (max of pointElevM; 0 at grade; provisional for bridges) */
  elevationM: number;
  /** per-point surface elevation in metres, same length as points (ramps interpolated, provisional) */
  pointElevM: number[];
  surfaceId: string; // "s_<level>_<roadId>"
  fromNode: string;
  toNode: string;
  points: Vec2[]; // centreline, includes both end nodes
  lengthM: number;
  status: PropertyStatus;
  provenance: Provenance;
  /** false = drivable boundary road weakly (not strongly) connected to the routable core; leads out of the acquired area */
  routable?: boolean;
}

export interface GraphNode {
  id: string; // "n_<osmNodeId>"
  osmNodeId: number;
  x: number;
  z: number;
  level: number;
  /** road edge ids touching this node */
  edges: string[];
  isJunction: boolean; // degree >= 3
}

/** Directed traversal of a RoadEdge. id = `${roadId}:f` or `${roadId}:b`. */
export interface DirectedEdge {
  id: string;
  roadId: string;
  forward: boolean;
  fromNode: string;
  toNode: string;
  lengthM: number;
  /** allowed next directed edges at toNode (U-turn onto own reverse excluded unless dead end) */
  next: string[];
}

export interface Junction {
  id: string; // "j_<osmNodeId>"
  nodeId: string;
  incoming: string[]; // directed edge ids
  outgoing: string[];
  /** movement rule status: OSM had 0 turn-restriction relations -> provisional */
  movementStatus: FidelityStatus;
  signalled: boolean; // OSM highway=traffic_signals on node
}

export interface Building {
  id: string; // "b_<wayId>"
  osmId: string; // "way/123"
  footprint: Vec2[]; // CCW, not closed (first != last)
  holes?: Vec2[][];
  heightM: number;
  heightStatus: FidelityStatus; // provisional unless height/levels tagged
  levels: number | null;
  name: string | null;
  kind: string; // building tag value
  /** nearest selected road edge id and side ('left'|'right' relative to edge forward direction) */
  frontRoadId: string | null;
  frontSide: 'left' | 'right' | null;
  centroid: Vec2;
  /** footprint still overlaps the minimum-width carriageway (source conflict, see CONTENT_GAPS.md) */
  intrudesCarriageway?: boolean;
}

export interface Poi {
  id: string; // "p_<type>_<id>"
  osmId: string;
  name: string | null;
  nameTe: string | null;
  nameId: string | null;
  category: string; // shop=*, amenity=*, etc. "shop:bakery"
  x: number;
  z: number;
  lat: number;
  lon: number;
  nearestRoadId: string | null;
  roadSide: 'left' | 'right' | null;
  distanceToRoadM: number | null;
  buildingId: string | null;
  status: PropertyStatus;
}

export interface MetroLine {
  id: 'red' | 'blue' | 'green';
  name: string;
  color: string;
  osmRouteMasterId: number;
  /** full geographic alignment for map display (all ways, lat/lon), may be multiple polylines */
  geo: LatLon[][];
  /** alignment within the local corridor package in local metres (for 3D viaduct) */
  local: Vec2[][];
}

export interface MetroStation {
  id: string; // "st_<slug>"
  name: string; // chosen display name
  sourceName: string; // original OSM spelling
  nameTe: string | null;
  lines: string[];
  lat: number;
  lon: number;
  x: number;
  z: number;
  osmIds: string[];
  /** never a road delivery entrance (Q04) */
  isDeliveryEntrance: false;
  inCorridor: boolean;
  status: PropertyStatus;
}

export interface MetroStructure {
  /** viaduct pillar positions along the local alignment (authored spacing, provisional) */
  pillars: { x: number; z: number; heading: number; lineId: string }[];
  deckHeightM: number; // provisional
  deckWidthM: number; // provisional
  heightStatus: FidelityStatus;
}

export interface DeliveryLocation {
  id: string; // "d_<slug>"
  poiId: string | null;
  label: string; // display name (registry-backed if real)
  nameId: string | null;
  roadId: string;
  /** directed edges from which a valid approach arrives (correct carriageway/side) */
  approachEdges: string[];
  side: 'left' | 'right';
  level: number;
  /** stop polygon in local metres */
  stopPolygon: Vec2[];
  entrance: Vec2;
  facingHeading: number; // radians, heading of valid approach travel
  status: PropertyStatus;
}

export interface NameRecord {
  id: string;
  kind: 'road' | 'station' | 'poi' | 'neighbourhood' | 'landmark' | 'line';
  sourceName: string;
  displayName: string;
  language: string; // "en"
  aliases: { lang: string; value: string }[];
  sourceIds: string[];
  sourceDate: string;
  verification: FidelityStatus;
  runtimeRefs: string[];
}

export interface PlayableBoundary {
  /** polygon in local metres enclosing the selected network (+ margin) */
  polygon: Vec2[];
  warningMarginM: number;
  /** road edges that leave the selected network (dead-ended exits) */
  exits: string[];
}

/** Core package: everything needed for routing/physics; chunks carry buildings and decor. */
export interface WorldCore {
  manifestVersion: string;
  roads: RoadEdge[];
  nodes: GraphNode[];
  directed: DirectedEdge[];
  junctions: Junction[];
  pois: Poi[];
  metroLines: MetroLine[];
  stations: MetroStation[];
  metro: MetroStructure;
  deliveries: DeliveryLocation[];
  names: NameRecord[];
  boundary: PlayableBoundary;
}

export interface WorldChunk {
  id: string;
  ix: number;
  iz: number;
  buildings: Building[];
}
