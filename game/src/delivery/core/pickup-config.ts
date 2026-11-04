import defaults from '../content/pickup.json';

/** Pickup tuning is independent of traffic models and delivery content. Units: metres. */
export interface PickupConfig {
  boxHeightAboveRoof: number;
  grabRadius: number;
  carrierRange: number;
  maxCarriersNearby: number;
  /** Hysteresis keeps a carrier from switching at the selection boundary. */
  recycleRange: number;
}

const DEFAULTS: PickupConfig = defaults;

export function createPickupConfig(overrides: Partial<PickupConfig> = {}): Readonly<PickupConfig> {
  const value = { ...DEFAULTS, ...overrides };
  for (const key of ['boxHeightAboveRoof', 'grabRadius', 'carrierRange', 'recycleRange'] as const) {
    if (!Number.isFinite(value[key]) || value[key] <= 0) throw new RangeError(`Invalid pickup ${key}`);
  }
  if (!Number.isInteger(value.maxCarriersNearby) || value.maxCarriersNearby < 1 || value.maxCarriersNearby > 3)
    throw new RangeError('maxCarriersNearby must be an integer from 1 to 3');
  if (value.recycleRange < value.carrierRange) throw new RangeError('recycleRange must cover carrierRange');
  return Object.freeze(value);
}

export const PICKUP_CONFIG = createPickupConfig();
