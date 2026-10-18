export type MissionTemplate = 'MT01' | 'MT02' | 'MT03' | 'MT04' | 'MT05' | 'MT06' | 'MT07' | 'MT08' | 'MT09' | 'MT10' | 'MT11' | 'MT12' | 'PRACTICE';

export interface MissionDef {
  id: string;
  version: number;
  templates: MissionTemplate[];
  title: string;
  brief: string;
  /** staging pose: start at this delivery location's curb (a real validated entrance) */
  pickupId: string;
  /** ordered stop delivery ids */
  stops: string[];
  flightSeconds: 20 | 25 | 30;
  deadlineSeconds: number;
  cargo: { label: string; fragility: number; failThreshold: number };
  traffic: 'light' | 'normal' | 'busy';
  seed: number;
  /** measured/estimated basis of the deadline */
  deadlineBasis: string;
  practice?: boolean;
  routeLengthM?: number;
  /** progression level 1..5 (v2 network); unlocked by completing a mission of the previous level */
  level?: number;
  /** station areas the contract starts and ends in (display) */
  fromArea?: string;
  toArea?: string;
}

export type Outcome =
  | { success: true; reason: 'Delivered' }
  | { success: false; reason: string; code: 'deadline' | 'cargo' | 'abandoned' | 'technical' };

export interface ResultSummary {
  missionId: string;
  runId: string;
  seed: number;
  outcome: Outcome;
  activeSeconds: number;
  penaltySeconds: number;
  chargedSeconds: number;
  deadlineSeconds: number;
  cargo: number;
  routeDistanceM: number;
  flightInitialSeconds: number;
  flightUsedSeconds: number;
  flightLeftSeconds: number;
  launches: number;
  recoveries: number;
  penalties: { reason: string; seconds: number; cargo: number }[];
  score: number;
  scoreBreakdown: { label: string; value: number }[];
  resumed: boolean;
  debugUsed: boolean;
  comparableKey: string;
}
