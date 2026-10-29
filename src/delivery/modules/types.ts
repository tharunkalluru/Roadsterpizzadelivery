import type * as THREE from 'three';
import type { MovingRailBody } from '../../game/moving-rail';

export interface DeliveryPoint { x: number; y: number; z: number; label?: string }
export interface DeliveryPlayer extends DeliveryPoint { yaw: number; speed: number; flying?: boolean; descending?: boolean; jumping?: boolean }
export interface ModuleStatus {
  instruction: string;
  canDrop: boolean;
  actionLabel: string;
  progress?: string;
  timing?: { phase: number; start: number; end: number; ready: boolean };
  failure?: string;
}
export interface ModuleMovement { mode: 'normal' | 'underwater' | 'approach'; center?: DeliveryPoint; radius?: number; depth?: number; altitude?: number }
export interface ModuleArrival extends DeliveryPoint { hx: number; hz: number; side: 'rear'; radius: number }
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
  /** Highest real roof/road/deck at a footprint sample; used once for static set placement. */
  surfaceHeightAt?: (x: number, z: number) => number | null;
  /** Existing traffic owns nearby following/overlap rules for the delivery truck. */
  vehicleSpeedLimit?: (body: MovingRailBody) => number;
  vehiclePoseClear?: (body: MovingRailBody) => boolean;
  /** Train surface from the existing railway simulation, not a replacement train. */
  existingTrain?: () => MovingRailBody | null;
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
  readonly target: DeliveryPoint;
  readonly status: ModuleStatus;
  readonly supports: readonly MovingRailBody[];
  readonly movement: ModuleMovement;
  readonly arrival?: ModuleArrival;
  readonly trafficBodies?: readonly MovingRailBody[];
}
export type DeliveryModuleName = 'matchAndLand' | 'threadGap' | 'beatDrop' | 'underwater' | 'chainDrop';
