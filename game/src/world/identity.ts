import type { WorldManifest } from './schema';
import { hashString } from '../core/rng';

/** Change this stamp when collision interpretation changes without a data revision. */
export const PHYSICS_LAYOUT_VERSION='safe-footprints-station-envelopes-basement-pits-v3';

export function worldCompatibilityKey(manifest:WorldManifest,surveyRevision:number|null,streetscape:unknown=null,layers:Record<string,unknown>={}):string {
  return `${manifest.worldId}@v${manifest.version}|core:${manifest.core.sha256}|accuracy:${manifest.sourceAccuracy?.sha256??'none'}|survey:${surveyRevision??'none'}|streetscape:${hashString(JSON.stringify(streetscape)).toString(16)}|layers:${hashString(JSON.stringify(Object.entries(layers).sort(([a],[b])=>a.localeCompare(b)))).toString(16)}|physics:${PHYSICS_LAYOUT_VERSION}`;
}
