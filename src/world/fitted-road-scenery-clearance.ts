import type { RoadEdge } from './types';
import { roadClearanceWidth, roadPavementWidth } from './road-pavement';

/** Scenery and furniture clear the actual fitted pavement. This does not
 * change transport preparation, native support, capacity or source heights. */
export const roadSceneryClearanceWidth = (road: RoadEdge) =>
  Math.max(roadClearanceWidth(road), roadPavementWidth(road, 0));
