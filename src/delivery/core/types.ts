export type CallMode = 'PLAYER_CALLS' | 'CUSTOMER_CALLS' | 'CUSTOMER_NAGS_EN_ROUTE';
export type DeliveryState = 'ROAMING' | 'EN_ROUTE' | 'ARRIVED' | 'CALL' | 'SETPIECE' | 'REVEAL' | 'LEVEL_COMPLETE';
export type CallButtonState = 'hidden' | 'disabled' | 'enabled' | 'ringing';
export type CallKind = 'arrival' | 'nag' | 'bonus';
export type DeliveryModuleName = 'matchAndLand' | 'threadGap' | 'beatDrop' | 'underwater' | 'chainDrop' | (string & {});

export interface Destination { label: string; x: number; z: number; y?: number; lat?: number; lon?: number }
export interface Celebrity { name: string; movie: string; image: string }
export interface ScriptLine { who: 'customer' | 'player'; text: string; replies?: string[]; reveal?: boolean }
export interface LevelVariant {
  celebrity?: Partial<Celebrity>;
  destination?: Destination;
  script?: ScriptLine[];
  module?: DeliveryModuleName;
  moduleParams?: Record<string, unknown>;
}
export interface LevelConfig {
  id: string;
  level: number;
  celebrity: Celebrity;
  destination: Destination;
  callMode: CallMode;
  revealAt: 'callLine' | 'afterDelivery';
  script: ScriptLine[];
  nagScript?: ScriptLine[];
  bonusScript?: ScriptLine[];
  module: DeliveryModuleName;
  moduleParams: Record<string, unknown>;
  arrivalRadius?: number;
  restaurantStage: string;
  completionLine: string;
  failureLine?: string;
  defaultVariant?: string;
  variants?: Record<string, LevelVariant>;
}
export interface CelebrityCard extends Celebrity { id: string; level: number; completionLine: string }
export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem?(key: string): void }
