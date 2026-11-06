import type { RailwayTrack } from './railway-flow';

type MappedTrack = RailwayTrack & { id: string; service?: boolean };
const inventories = new WeakMap<readonly MappedTrack[], Map<string, RailwayTrack>>();

/** Train routes use the complete mapped network, independently of city-tile residency. */
export function runningRailwayTracks(profiles: readonly MappedTrack[]) {
  let tracks = inventories.get(profiles);
  if (!tracks) {
    tracks = new Map(profiles.filter(track => !track.service).map(track => [track.id, track]));
    inventories.set(profiles, tracks);
  }
  return tracks;
}
