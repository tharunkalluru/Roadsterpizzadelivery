import type { CallKind, CelebrityCard, DeliveryState, Destination, LevelConfig } from './types';

/** Synchronous, typed delivery events. Systems own their unsubscribe callbacks. */
export class EventBus<Events extends object> {
  private listeners = new Map<keyof Events, Set<(payload: any) => void>>();

  on<K extends keyof Events>(type: K, handler: (payload: Events[K]) => void): () => void {
    let handlers = this.listeners.get(type);
    if (!handlers) this.listeners.set(type, handlers = new Set());
    handlers.add(handler);
    return () => {
      handlers!.delete(handler);
      if (!handlers!.size && this.listeners.get(type) === handlers) this.listeners.delete(type);
    };
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const handlers = this.listeners.get(type);
    if (!handlers) return;
    // A handler may unsubscribe or clear the system during delivery.
    for (const handler of [...handlers]) handler(payload);
  }

  clear(): void { this.listeners.clear(); }
}

export interface OrderPicked {
  carrierId: string;
  position: { x: number; y: number; z: number };
}

/** No customer/celebrity fields cross the pickup boundary. */
export interface DeliveryEvents {
  orderPicked: OrderPicked;
  locationSet: { levelId: string; destination: Destination };
  arrived: { levelId: string };
  callStarted: { kind: CallKind };
  callEnded: { kind: CallKind; completed: boolean };
  callRinging: { kind: CallKind };
  celebrityRevealed: CelebrityCard;
  setpieceStarted: { level: LevelConfig };
  setpieceDone: { levelId: string };
  setpieceFailed: { levelId: string; reason: string };
  levelComplete: { levelId: string; level: number; total: number; restaurantStage: string; finished: boolean };
  stateChanged: { state: DeliveryState; previous: DeliveryState };
}
