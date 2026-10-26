import type { XZ } from './types';

// Planar anchors retained in landmark-osm-shipped-source-2026-10-26.json.
// Platform heights are above road/ground, never relative to another platform.
// Unmeasured heights and the smooth approaches below are explicit game geometry.
export interface InterchangeAnchor { p: XZ; sourceId: string; platformHeight?: number; gameLift?: number; name?: string }
export const METRO_INTERCHANGES: Readonly<Record<string, Readonly<Record<string, InterchangeAnchor>>>> = {
  st_ameerpet: {
    red: { p: [-5504.7, -3256.2], sourceId: 'n6447191882', platformHeight: 30 },
    blue: { p: [-5505.7, -3208], sourceId: 'n6700511122' },
  },
  st_mahatma_gandhi_bus_station: {
    red: { p: [-1104.8, 2926.5], sourceId: 'n7208768626' },
    green: { p: [-1140.8, 2944.5], sourceId: 'n7208768627', platformHeight: 75 * .3048 },
  },
  st_parade_grounds: {
    blue: { p: [92.3, -4083.2], sourceId: 'n7052069758', name: 'Parade Grounds' },
    green: { p: [104.6, -4225.2], sourceId: 'n7195061310', gameLift: 11.2, name: 'JBS Parade Ground' },
  },
};
export const METRO_STATION_ALIASES = { st_jbs: { stationId: 'st_parade_grounds', lineId: 'green', sourceId: 'n7195061310', reason: 'Legacy extra Green anchor; official service has nine stations and the retained separate Green station node supplies the actual JBS/Parade platform.' } } as const;
export function metroRuntimeStations<T extends { id?: string; p: XZ; lines?: string[] }>(stations: readonly T[]): T[] {
  return stations.filter(s => s.id !== 'st_jbs' || !stations.some(p => p.id === 'st_parade_grounds' && p.lines?.includes('green')));
}
export const METRO_INTERCHANGE_EVIDENCE = {
  retrievedOn: '2026-10-26',
  planarSource: 'pipeline/evidence/landmark-osm-shipped-source-2026-10-26.json',
  primary: [
    'https://ltmetro.com/wp-content/uploads/2025/01/press-release-13th-november-2017-1.pdf',
    'https://hmrl.co.in/wp-content/uploads/2025/06/2020-02-06-MGBS-Interchange-Station-Write-up.pdf',
    'https://www.ltmetro.in/about-us/project-highlights/stations',
    'https://ltmetro.com/stations/ameerpet/',
    'https://ltmetro.com/stations/jbs-parade-ground/',
  ],
  uncertainty: 'Ameerpet Red platform 30m and MGBS Green platform 75ft above ground are published reference levels. Other levels retain the baseline game deck; JBS Green uses an illustrative 11.2m lift. Flat 160m station reaches and 800m smooth approaches are game transitions, not surveyed rail gradients or complete architectural replicas.',
};
