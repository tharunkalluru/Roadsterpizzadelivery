import type { MetroData } from './city';
import { metroCorridors, metroDeckHeight, metroPlatformAssemblies } from './metro-geometry';
import { STATION_PRESENTATION, stationVaultHeight } from './station-presentation';
import { stationAccessEnvelope } from './metro-station-access';

export interface MetroFlightClearance { heightAt(x: number, z: number): number }
interface Span { ax: number; az: number; bx: number; bz: number; top: number }
const CELL = 50;

/** Static flight clearance is separate from tyre support. Canopies and wires
 * must lift a hovering car without becoming invented landing platforms. This
 * core-data index also exists before a neighbouring render tile is streamed. */
export function metroFlightClearance(metro: MetroData): MetroFlightClearance {
  const corridors = metroCorridors(metro.lines), baseline = metro.deckHeight || 11;
  const spans = new Map<string, Span[]>(), stations = new Map<string, ReturnType<typeof metroPlatformAssemblies>>();
  const transfers=new Map<string,{x:number;z:number;radius:number;top:number}[]>();
  const accessEnvelopes=new Map<ReturnType<typeof metroPlatformAssemblies>[number],ReturnType<typeof stationAccessEnvelope>>();
  const cells = (x0: number, x1: number, z0: number, z1: number, add: (key: string) => void) => {
    for (let x = Math.floor(x0 / CELL); x <= Math.floor(x1 / CELL); x++) for (let z = Math.floor(z0 / CELL); z <= Math.floor(z1 / CELL); z++) add(`${x},${z}`);
  };
  for (const corridor of corridors) for (let i = 1; i < corridor.center.pts.length; i++) {
    const a = corridor.center.pts[i - 1], b = corridor.center.pts[i];
    // Highest catenary cross-arm/post in city.ts; present in the high-detail
    // scene. Use the same envelope for both qualities to keep flight consistent.
    const span: Span = { ax: a[0], az: a[1], bx: b[0], bz: b[1], top: Math.max(metroDeckHeight(corridor, corridor.center.cum[i - 1], baseline), metroDeckHeight(corridor, corridor.center.cum[i], baseline)) + 7.8 };
    cells(Math.min(a[0], b[0]) - 5, Math.max(a[0], b[0]) + 5, Math.min(a[1], b[1]) - 5, Math.max(a[1], b[1]) + 5, key => (spans.get(key) || spans.set(key, []).get(key)!).push(span));
  }
  const assemblies=metroPlatformAssemblies(metro.stations,corridors,baseline);
  for(const stationId of ['st_ameerpet','st_mahatma_gandhi_bus_station']){
    const pair=assemblies.filter(a=>a.stationId===stationId);if(pair.length!==2)continue;
    const region={x:(pair[0].frame.cx+pair[1].frame.cx)/2,z:(pair[0].frame.cz+pair[1].frame.cz)/2,radius:70,top:Math.max(...pair.map(a=>a.deckHeight))-1.3};
    cells(region.x-region.radius,region.x+region.radius,region.z-region.radius,region.z+region.radius,key=>(transfers.get(key)||transfers.set(key,[]).get(key)!).push(region));
  }
  for (const station of assemblies) {
    const { cx, cz, hx, hz } = station.frame;
    const access=stationAccessEnvelope(station),halfLength=Math.max(STATION_PRESENTATION.halfLength,access.halfLength),halfWidth=Math.max(STATION_PRESENTATION.halfSpan,access.halfWidth);
    accessEnvelopes.set(station,access);
    const dx = Math.abs(hx) * halfLength + Math.abs(hz) * halfWidth;
    const dz = Math.abs(hz) * halfLength + Math.abs(hx) * halfWidth;
    cells(cx - dx, cx + dx, cz - dz, cz + dz, key => (stations.get(key) || stations.set(key, []).get(key)!).push(station));
  }
  return { heightAt(x, z) {
    const key = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`; let top = 0;
    for (const span of spans.get(key) || []) {
      const dx = span.bx - span.ax, dz = span.bz - span.az, u = Math.max(0, Math.min(1, ((x - span.ax) * dx + (z - span.az) * dz) / (dx * dx + dz * dz || 1)));
      if (Math.hypot(x - span.ax - dx * u, z - span.az - dz * u) <= 5) top = Math.max(top, span.top);
    }
    for (const station of stations.get(key) || []) {
      const { cx, cz, hx, hz } = station.frame, u = (x - cx) * hx + (z - cz) * hz, v = -(x - cx) * hz + (z - cz) * hx;
      if (Math.abs(u) <= STATION_PRESENTATION.halfLength && Math.abs(v) <= STATION_PRESENTATION.halfSpan) top = Math.max(top, stationVaultHeight(v, station.deckHeight) + .2);
      const access=accessEnvelopes.get(station)!;
      if(Math.abs(u)<=access.halfLength&&Math.abs(v)<=access.halfWidth)top=Math.max(top,access.top);
    }
    for(const region of transfers.get(key)||[])if(Math.hypot(x-region.x,z-region.z)<=region.radius)top=Math.max(top,region.top);
    return top;
  } };
}
