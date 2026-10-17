/**
 * Art module contract (owned by lead; implemented by the art worker in src/art/*).
 * All builders are pure: they create Three.js objects from canonical world data
 * and never move geometry away from the canonical positions (G04).
 */
import type * as THREE from 'three';
import type { WorldCore, WorldChunk } from '../world/schema';

export type Quality = 'low' | 'standard' | 'high';

export interface HeroCar {
  root: THREE.Group; // origin at ground-contact centre; forward is -Z (Three.js convention); length ~4.0 m
  /** wheel pivots: [FL, FR, RL, RR]; rotate x for spin, y for steer on front */
  wheels: THREE.Object3D[];
  /** 0..1 thruster/vapor intensity (flight presentation) */
  setThruster(intensity: number): void;
  setBrakeLights(on: boolean): void;
  setReverseLights(on: boolean): void;
  /** per-frame visual update: wheel spin from speed (m/s), steer angle (rad), dt seconds */
  animate(dt: number, speedMps: number, steerRad: number): void;
  dispose(): void;
}

export type TrafficKind = 'car' | 'auto' | 'bus' | 'bike' | 'truck';

export interface TrafficTemplate {
  kind: TrafficKind;
  /** a template object to clone (forward = -Z, origin at ground centre) */
  object: THREE.Object3D;
  length: number;
  width: number;
  height: number;
}

export interface LandingMarker {
  object: THREE.Object3D;
  /** state is conveyed by shape/icon AND colour (U04) */
  setState(state: 'clear' | 'uncertain' | 'blocked' | 'hidden'): void;
}

export interface ArtApi {
  createHeroCar(quality: Quality): HeroCar;
  createTrafficTemplates(quality: Quality): Record<TrafficKind, TrafficTemplate>;
  createPedestrianTemplate(quality: Quality): THREE.Object3D;
  /** road surfaces, markings, medians/kerbs, built exactly from RoadEdge.points/widthM/pointElevM */
  buildRoads(core: WorldCore, quality: Quality): THREE.Group;
  /** metro viaduct deck, pillars, station boxes along core.metroLines[*].local and core.metro */
  buildMetro(core: WorldCore, quality: Quality): THREE.Group;
  /** buildings + storefront ground floors + roof clutter for one chunk; merged per material */
  buildChunk(chunk: WorldChunk, core: WorldCore, quality: Quality): THREE.Group;
  /** sky, sun, hemisphere/ambient, fog, shadow camera that follows target */
  buildEnvironment(scene: THREE.Scene, renderer: THREE.WebGLRenderer, quality: Quality): {
    update(target: THREE.Vector3): void;
    dispose(): void;
  };
  /** destination marker (stop polygon + entrance beacon) */
  createDeliveryMarker(polygon: [number, number][], elevation: number): THREE.Object3D;
  createLandingMarker(): LandingMarker;
  /** shaped text (English and/or Telugu) to a canvas texture; waits for fonts first */
  createSignTexture(lines: { text: string; lang: 'en' | 'te' }[], opts?: { bg?: string; fg?: string; width?: number; height?: number }): Promise<THREE.CanvasTexture>;
}
