import type { NavGraph } from '../world/nav';
import type { Vec2 } from '../world/schema';
import type { MissionDef } from '../missions/types';

/** Gameplay containment contract; mode never grants or changes mapping qualification. */
export interface PlayZone {
  readonly mode: 'verified' | 'provisional';
  readonly definition: {
    id: string; label: string; surveyRevision: number; surveySha256: string;
    polygon: Vec2[]; roadIds: string[];
    spawn: { x: number; z: number; heading: number; roadId: string };
    entrances: { deliveryId: string }[];
    maxHeightM: number;
  };
  readonly nav: NavGraph;
  readonly missions: MissionDef[];
  allowsPose(p: { x: number; z: number; y?: number; roadId?: string | null }): boolean;
}
