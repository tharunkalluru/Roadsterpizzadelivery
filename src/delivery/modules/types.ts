import type * as THREE from 'three';
import type { MovingRailBody } from '../../game/moving-rail';
import type { MetroStationDwell } from '../../game/metro';
import type { SceneCharacter } from './character';
import type { ReleasedCharacterResources } from '../art/released-gltf';

export interface DeliveryPoint { x: number; y: number; z: number; label?: string }
export interface DeliveryPlayer extends DeliveryPoint {
  yaw: number; speed: number; flying?: boolean; descending?: boolean; jumping?: boolean;
  /** Undefined only for standalone scenes without the game's contact solver. */
  railSupportId?: string | null; verticalSpeed?: number;
}
export interface ModuleStatus {
  instruction: string;
  canDrop: boolean;
  actionLabel: string;
  progress?: string;
  timing?: { phase: number; start: number; end: number; ready: boolean };
  failure?: string;
}
export interface ModuleMovement { mode: 'normal' | 'underwater' | 'approach'; center?: DeliveryPoint; radius?: number; depth?: number; altitude?: number }
/** Optional close interaction framing; road/flight camera remains host-owned. */
export interface ModuleCameraFocus {
  position:DeliveryPoint;target:DeliveryPoint;context?:'stationary-handoff';
  /** Checked collinear camera pivot outside a subject's invisible player
   * keep-out. Optical aim remains on the actual subject; ordinary shots omit it. */
  clearanceTarget?:DeliveryPoint;
  /** Actual moving subject origin. Translate the whole shot with its carrier
   * before damping the relative framing; ordinary static shots omit this. */
  translationAnchor?:DeliveryPoint;
}
export interface ModuleArrival extends DeliveryPoint { hx: number; hz: number; side: 'rear'; radius: number }
/** Authored local story motion. Entry is separate from proximity/call gates:
 * trains only grant it after a genuine player-controlled roof landing. */
export interface DeliveryRoadVehicle {
  id:string;group:THREE.Group;x:number;y:number;z:number;hx:number;hz:number;speed:number;size:readonly number[];approachValid?:boolean;
}
export interface ModuleStoryFrame {
  /** Explicit exception for side-by-side road scenes; never grants airborne entry. */
  allowMovingEntry?:boolean;

  entry: boolean;
  point: DeliveryPoint;
  /** Manual arrival area before authored motion. Moving services can retain
   * their actual landed coach rather than demanding an automatic transfer. */
  landing?: ModuleStoryLandingZone;
  yaw?: number;
  speed?: number;
  maxSpeed?: number;
  verticalSpeed?: number;
  water?: boolean;
}
export interface ModuleStoryLandingZone {
  /** Roadster root at the safe stopped approach, not the later handoff. */
  point: DeliveryPoint;
  radius: number;
  /** Water markers sit on the water surface, above the car's drafted tyres. */
  markerHeight?: number;
}
/** Evidence from the selected train's actual route and mapped overpass geometry. */
export interface VerifiedTrainPassage { id: string; trainId: string; x: number; z: number; radius: number; ceiling: number; distanceAhead: number }
export interface DeliveryModuleContext {
  scene: THREE.Scene;
  player: () => DeliveryPlayer;
  destination: DeliveryPoint;
  emit: (type: 'done' | 'failed', detail?: { reason?: string; step?: number }) => void;
  onTarget?: (target: DeliveryPoint) => void;
  /** Real road or railway samples supplied by the host. Never invent city tracks. */
  route?: readonly DeliveryPoint[];
  /** Set only for a continuous circuit on mapped carriageways. */
  routeLoop?: boolean;
  /** Story call gate. Scenery may move while delivery interaction is locked. */
  canInteract?: () => boolean;
  automaticStories?: boolean;
  storyActive?: () => boolean;
  /** Prepare authored actors against this fully built scene's actual lights. */
  prepareCharacterGraphics?: (instance?:THREE.Group,valid?:()=>boolean) => Promise<void>;
  /** Host-owned isolated art review only; normal runtime uses the release gate. */
  characterFactory?: (style:string,seated:boolean,resources:ReleasedCharacterResources)=>SceneCharacter;
  /** Highest real roof/road/deck at a footprint sample; used once for static set placement. */
  surfaceHeightAt?: (x: number, z: number) => number | null;
  /** Read-only production camera clearance, including current delivery solids.
   * Undefined means streaming is not ready, rather than a rejected station.
   * Static scene shots may probe a few candidates once; never a driving loop. */
  cameraPathClear?: (from: DeliveryPoint, to: DeliveryPoint) => boolean | undefined;
  /** Full Roadster volume against current static geometry, with y at the
   * player's root (tyre support is y-.55). Undefined means streaming pending. */
  storyPoseClear?: (pose: DeliveryPoint & {yaw:number}) => boolean | undefined;
  /** Existing traffic owns nearby following/overlap rules for the delivery truck. */
  vehicleSpeedLimit?: (body: MovingRailBody) => number;
  vehiclePoseClear?: (body: MovingRailBody) => boolean;
  /** Train surface from the existing railway simulation, not a replacement train. */
  existingRoadVehicle?: (kind:'auto'|'bus', currentId?:string) => DeliveryRoadVehicle|null;
  releaseRoadVehicle?:(id:string)=>void;
  waitingRoadTarget?:()=>DeliveryPoint|null;
  storyDialogueComplete?:()=>boolean;
  /** Host restores controls and restages the same active order after an invalidated carrier. */
  storyCarrierLost?:()=>void;
  storySpeechEnvelope?:()=>number;
  /** Presentation anchor only; never advances player simulation. */
  playerObject?:()=>THREE.Group;
  existingTrain?: (exactBodyId?: string) => MovingRailBody | null;
  trainBodies?: () => readonly MovingRailBody[];
  metroService?: () => { bodies: readonly MovingRailBody[]; dwells: readonly MetroStationDwell[] };
  trainPassage?: () => VerifiedTrainPassage | null;
  /** Underside of a real bridge/tunnel above a route point, when available. */
  clearanceAt?: (point: DeliveryPoint) => number | null;
  cue?: (kind: 'beat' | 'throw' | 'success' | 'retry') => void;
  sceneEvent?: (kind: 'interiorEntered' | 'characterEmerged' | 'catchStarted', detail?: { character: string }) => void;
}
export type ModuleParams = Record<string, unknown>;
export interface DeliveryModule {
  setup(ctx: DeliveryModuleContext, params: ModuleParams): void;
  update(dt: number): void;
  onDrop(): void;
  teardown(): void;
  setStoryPresentation?(active:boolean,landing?:ModuleStoryLandingZone):void;
  /** A genuine marked-rake roof touchdown satisfies arrival even when its
   * customer is several coaches beyond the ordinary destination radius. */
  readonly storyArrivalReady?:boolean;
  readonly storyDialogueReady?:boolean;
  readonly target: DeliveryPoint;
  readonly status: ModuleStatus;
  readonly supports: readonly MovingRailBody[];
  readonly movement: ModuleMovement;
  readonly arrival?: ModuleArrival;
  readonly trafficBodies?: readonly MovingRailBody[];
  /** Empty NPC approach space, used only for traffic planning/spawn exclusion.
   * Never part of player collisions, roof support or story landing surfaces. */
  readonly trafficReservations?: readonly MovingRailBody[];
  /** A completed physical scene remains until the whole car has left it. */
  readonly exitPending?: boolean;
  /** Completed scenery may remain visible after it is safe to pick up again. */
  readonly sceneryPending?: boolean;
  /** A deliberate, physically valid parked delivery position, including a
   * retained completed set. Never suppresses recovery while trying to leave. */
  readonly intentionalStop?: boolean;
  readonly cameraFocus?: ModuleCameraFocus;
  readonly charactersReady?:boolean;
  /** Enclosed parking scenes can dim existing beams without changing light counts. */
  readonly headlightGain?:number;
  /** A nearby fixture may borrow an existing engine light, keeping its count fixed. */
  readonly sceneLamp?: {position:Pick<DeliveryPoint,'x'|'y'|'z'>;kind?:'reading'|'porch'|'lantern'|'underwater'|'street-scene'|'stadium'|'metro-platform'};
  /** Suppress only world-space ribbons/target rings in an occupied interior. */
  readonly hideWorldGuidance?: boolean;
  readonly story?: ModuleStoryFrame;
}
export type DeliveryModuleName = 'matchAndLand' | 'threadGap' | 'beatDrop' | 'underwater' | 'chainDrop';
