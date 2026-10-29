import { projectMetroPath, type MetroCorridor } from './metro-geometry';
import type { XZ } from './types';

export const METRO_SERVICE_SOURCE = {
  retrievedOn: '2026-10-26',
  urls: ['https://hmrl.co.in/train-timings/', 'https://hmrl.co.in/services/', 'https://ltmetro.com/wp-content/uploads/2025/01/HMRRouteMap_new.pdf'],
};
export interface MetroStationSource { id?: string; name?: string; p: XZ; lines?: string[] }
export interface MetroService { lineId: string; origin: string; destination: string; text: string }
interface Terminus { id: string; name: string }
// Official service names; legacy city data uses one Parade Grounds anchor for
// the interchange. This mapping does not invent or relocate a station.
export const METRO_TERMINI: Readonly<Record<string, readonly [Terminus, Terminus]>> = {
  red: [{ id: 'st_miyapur', name: 'Miyapur' }, { id: 'st_l_b_nagar', name: 'L B Nagar' }],
  blue: [{ id: 'st_nagole', name: 'Nagole' }, { id: 'st_raidurg', name: 'Raidurg' }],
  green: [{ id: 'st_parade_grounds', name: 'JBS Parade Ground' }, { id: 'st_mahatma_gandhi_bus_station', name: 'MG Bus Station' }],
};

export function metroServiceForRun(corridor: MetroCorridor, direction: 1 | -1, stations: readonly MetroStationSource[]): MetroService | null {
  const ends = METRO_TERMINI[corridor.lineId]; if (!ends) return null;
  const a = stations.find(s => s.id === ends[0].id), b = stations.find(s => s.id === ends[1].id);
  // Production uses the sourced terminal positions. The fallback matches the
  // normalizer's deterministic west-to-east ordering for isolated test scenes.
  let positiveOrigin = corridor.lineId === 'red' ? 0 : 1;
  if (a && b) positiveOrigin = projectMetroPath(corridor.center, a.p).s <= projectMetroPath(corridor.center, b.p).s ? 0 : 1;
  const from = direction === 1 ? positiveOrigin : 1 - positiveOrigin;
  const origin = ends[from].name, destination = ends[1 - from].name;
  return { lineId: corridor.lineId, origin, destination, text: `${origin} → ${destination}` };
}

export function metroMarqueeOffset(textWidth: number, viewport: number, seconds: number) {
  if (textWidth <= viewport) return 0;
  const hold = 1.4, speed = 42, travel = textWidth - viewport, cycle = hold * 2 + travel * 2 / speed;
  const t = ((seconds % cycle) + cycle) % cycle;
  if (t < hold) return 0;
  if (t < hold + travel / speed) return (t - hold) * speed;
  if (t < hold * 2 + travel / speed) return travel;
  return Math.max(0, travel - (t - hold * 2 - travel / speed) * speed);
}

export const STATION_CROWD_MODEL = 'Heuristic game crowd simulation; not measured passenger usage.';
export function metroCrowdDemand(minutes: number, lowQ = false) {
  const hour = (((minutes / 60) % 24) + 24) % 24;
  // HMRL lists 08:00–11:00 and 17:00–20:00 as peak windows. Counts below
  // are bounded artistic simulation choices, not actual station ridership.
  const peak = hour >= 8 && hour < 11 || hour >= 17 && hour < 20;
  const late = hour < 6 || hour >= 23.5;
  return { band: late ? 'late' : peak ? 'peak' : 'off_peak', waitingPerSide: late ? 2 : peak ? (lowQ ? 8 : 12) : 4,
    boarding: late ? 1 : peak ? (lowQ ? 5 : 8) : 3, alighting: late ? 1 : peak ? (lowQ ? 5 : 8) : 3, heuristic: true as const };
}
