import type { DeliveryModule, DeliveryModuleName } from './types';
import { MatchAndLand } from './match-and-land';
import { ThreadGap } from './thread-gap';
import { BeatDrop } from './beat-drop';
import { Underwater } from './underwater';
import { ChainDrop } from './chain-drop';

const constructors = { matchAndLand: MatchAndLand, threadGap: ThreadGap, beatDrop: BeatDrop, underwater: Underwater, chainDrop: ChainDrop } satisfies Record<DeliveryModuleName, new () => DeliveryModule>;
const registry = new Map<string, new () => DeliveryModule>(Object.entries(constructors));
/** A genuinely unique future setpiece plugs in without changing the content schema. */
export function registerDeliveryModule(name: string, Constructor: new () => DeliveryModule) {
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name) || registry.has(name)) throw new Error(`Invalid or duplicate delivery mechanic: ${name}`);
  registry.set(name, Constructor);
}
export function createDeliveryModule(name: string): DeliveryModule {
  const Constructor = registry.get(name);
  if (!Constructor) throw new Error(`Unknown delivery mechanic: ${name}`);
  return new Constructor();
}
export type { DeliveryModule, DeliveryModuleContext, DeliveryModuleName, ModuleParams, ModuleMovement, ModuleStatus, ModuleArrival, DeliveryPoint, DeliveryPlayer } from './types';
