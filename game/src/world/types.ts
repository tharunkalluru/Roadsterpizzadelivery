export type XZ = [number, number];
export interface RoadEdge { id: string; seg: string; name: string | null; cls: string; w: number; lanes: number; oneway: 'forward' | 'backward' | null; from: string | null; to: string | null; pts: XZ[]; elev: number[] | null; maxspeed: number | null;
  expressway?: { controlled: boolean; ramp: boolean; throughLanes: number; laneWidth?: number; shoulders?: [number, number]; sources: string[]; sourceDate: string; uncertainty: string };
}
export interface Building { id: string; name: string | null; cls: string | null; h: number; hs: string; ring: XZ[]; fc: string | null; rc: string | null; sourceId?: string }
export interface Board { id: string; text: string; full: string; group: string; tier: string; conf: number; a: XZ; b: XZ; t: number; slot: { floor: number; index: number; of: number; overflow?: boolean }; building: string; road: string | null; seen?: number | null; seen_year?: number | null }
export interface Furniture {
  kind: string; name: string | null; p: XZ; id?: string; synth?: number;
  source?: string; sourceURL?: string; retrievedAt?: string; sourceTimestamp?: string; sourceVersion?: number;
  tags?: Record<string, string>; sourceWayIds?: string[];
  mappedDirections?: { wayId: string; forwardHeading: XZ; backwardHeading?: XZ; nodeRole?: 'start' | 'end' | 'interior'; tags?: Record<string, string> }[];
}
export interface Area { kind: 'landuse' | 'water'; sub: string; cls: string; name: string | null; ring: XZ[] }
export interface Station { id: string; name: string; te: string | null; lines: string[]; p: XZ }
export interface Poi { id: string; name: string; board: string; a: XZ; b: XZ; t: number; conf: number; pizza?: boolean }
export interface Zone {
  id: string; name: string; origin: { lat: number; lon: number }; bbox: number[]; attribution: string[];
  roads: RoadEdge[]; nodes: Record<string, XZ>; buildings: Building[]; boards: Board[]; furniture: Furniture[]; areas: Area[];
  metro: { lines: { id: string; color: string; pts: XZ[] }[]; stations: Station[]; pillars: { p: XZ; h: number; line: string }[]; deckHeight: number };
  theatres: Poi[]; food: Poi[]; places?: { name: string; kind: string; p: XZ }[];
}

// ---- whole-city data (core.pack.wasm) ----
export type StopTuple = [number, number, number, string];        // x, z, y, road name (kerb point already snapped)
export interface CityPoi { id: string; name: string; board: string; stop: StopTuple; tile: [number, number]; pizza?: boolean; a?: XZ; b?: XZ; t?: number; category?: string | null; source_ids?: string[]; sources?: string[]; pickupEligible?: boolean }
export interface PackInfo { p: [number, number]; file: string; bytes: number; tiles: [number, number][] }
export interface CoreData {
  origin: { lat: number; lon: number }; tile: number; pack: number; packs: PackInfo[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  roads: RoadEdge[]; nodes: Record<string, XZ>;
  trafficSignals?: Furniture[];
  metro: { lines: { id: string; color: string; name?: string; pts: XZ[] }[]; stations: Station[]; pillars: { p: XZ; h: number; line: string }[]; deckHeight: number };
  places: { name: string; kind: string; p: XZ }[];
  theatres: CityPoi[]; food: CityPoi[]; drops: StopTuple[]; attribution: string[];
}
