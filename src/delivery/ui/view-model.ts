export interface DeliveryPortrait { name: string; movie: string; image?: string; level?: number }
export interface DeliveryView {
  level: number;
  total: number;
  stage: string;
  restaurantStage: number;
  restaurantLabel: string;
  nav?: { label: string; distance: number; angle: number } | null;
  call: { state: 'hidden' | 'disabled' | 'enabled' | 'ringing'; label?: string };
  phone?: {
    name?: string; image?: string; revealed: boolean; elapsed: number;
    who: 'customer' | 'player'; text: string; replies?: string[]; canAdvance?: boolean;
  } | null;
  action?: { label: string; enabled: boolean; hint?: string; progress?: number } | null;
  completion?: DeliveryPortrait & { restaurantLabel: string; final: boolean; bonusAvailable?: boolean } | null;
  collection: DeliveryPortrait[];
  notice?: string;
  noticeContext?: 'scene-exit';
}

export interface DeliveryUIActions {
  call(): void;
  advanceCall(replyIndex?: number): void;
  endCall(): void;
  drop(): void;
  continue(): void;
  bonusCall?(): void;
  collectionOpen?(): void;
  collectionClose?(): void;
}

export function deliveryDistance(metres: number) {
  const n = Math.max(0, Math.round(Number.isFinite(metres) ? metres : 0));
  return n >= 1000 ? `${(n / 1000).toFixed(1)} km` : `${n} m`;
}
export function callTimer(seconds: number) {
  const n = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
}
/** Local asset paths and HTTPS images only. Never execute content-provided URLs. */
export function portraitUrl(value?: string) {
  if (!value) return '';
  if (/^\/(?!\/)[^\s]*$/.test(value)) return value;
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
}

