/**
 * Central gameplay tuning. All values are fictional game rules / proposed starting
 * settings (MASTER §3, §11–13), not Tesla specifications or measured Hyderabad data.
 */
import flightBudget from '../../config/flight-budget.json';

export const SIM_HZ = 60;
export const DEFAULT_FLIGHT_SECONDS = flightBudget.default_budget_seconds as 25;
export const ALLOWED_FLIGHT_SECONDS = flightBudget.allowed_budget_seconds as readonly number[];
export const flightTicksFor = (seconds: number): number => {
  if (!ALLOWED_FLIGHT_SECONDS.includes(seconds)) throw new Error(`Unsupported flight allocation ${seconds}s`);
  return Math.round(seconds * SIM_HZ);
};

export const VEHICLE = {
  wheelbase: 2.45,
  length: 4.0,
  width: 2.0,
  height: 1.15,
  collisionRadius: 1.05, // two circles front/back
  circleOffset: 1.0,
  cruiseSpeed: 45 / 3.6, // automatic cruise
  maxSpeed: 120 / 3.6,
  accel: 4.5,
  brakeDecel: 11.0,
  coastDecel: 0.6,
  idleDecel: 4.0, // no ▲/▼ input: slow down and hold (user-requested control model)
  reverseMaxSpeed: 3.0,
  reverseEnableSpeed: 0.6,
  maxSteerLow: 0.6, // rad at walking speed
  maxSteerHigh: 0.07, // stable steering at 120 km/h
  steerRate: 3.2, // rad/s visual/control slew
  offRoadMaxSpeed: 6.0,
};

export const FLIGHT = {
  minFlightAltitude: 4.0, // clears buses; fast ascent makes a 2.5-second hop usable
  cruiseAltitude: 4.8,
  ascentAccel: 32.0,
  maxClimbRate: 9.0,
  descentRate: 7.0,
  flareTicks: 6,
  airSteerScale: 0.7,
  airBrakeDecel: 5.0,
  airAccel: 6.0,
  airMaxSpeed: 150 / 3.6,
  airDrag: 0.15,
  carHeight: 1.15,
  overheadMargin: 0.6,
  uncertaintyMarginTicks: flightBudget.landing_reserve.initial_uncertainty_margin_ticks as number, // 30
  autoDescentLeadTicks: 6,
  groundConfirmTicks: flightBudget.touchdown.initial_ground_confirmation_ticks as number, // 15
  takeoffProgressTimeoutTicks: 45,
  takeoffMinProgressM: 0.5,
  maxTouchdownVy: 6.5,
  hardLandingVy: 4.0,
  maxTouchdownTilt: 0.35,
  airEnvelopeMarginM: 3.5, // beyond road half-width (over footpath)
  initialChargeSeconds: 2.5,
  rechargeMinSpeed: 2.0,
  rechargeFlightTicksPerRoadTick: 0.25, // 10 s moving on the road earns 2.5 s
  protectedLandingTicks: 240, // descent only; never reusable flight or free hover
};

export const MISSION = {
  holdSpeed: 0.6, // must deliberately stop before collecting / handing over
  holdTicks: 60, // ≈1 s
  countdownSeconds: 3,
  recoveryPenaltyTicks: 180, // 3 s added to mission ledger
  recoveryPresentationSeconds: 1.2, // simulation frozen during it (no hidden time charge)
  cargoFailThreshold: 0,
  outOfAreaWarnM: 12,
  outOfAreaRecoverM: 28,
  anchorIntervalTicks: 60,
};

export const CONTACT = {
  lightSpeedLoss: 0.35,
  lightCargo: 2,
  severeSpeed: 9.0, // m/s closing speed for severe crash → recovery
  severeCargo: 10,
  hardLandingCargo: 6,
  pedestrianCargo: 5,
  contactCooldownTicks: 45,
};

export const TRAFFIC = {
  maxActors: 64,
  maxPedestrians: 26,
  spawnRadius: 300,
  despawnRadius: 380,
  minSpawnDistance: 70,
  maxConflictEvents: 2,
};
