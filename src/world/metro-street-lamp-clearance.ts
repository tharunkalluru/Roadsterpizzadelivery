import { metroCorridors, metroPlatformAssemblies, metroDeckHeight, sampleMetroPath, projectMetroPath,
  METRO_PLATFORM_HALF_LENGTH, METRO_PLATFORM_OFFSET, METRO_PLATFORM_HALF_WIDTH, METRO_PLATFORM_OUTER_EDGE, type MetroLineInput } from './metro-geometry';
import { streetLampVolumes, type StreetLampSite, type StreetLampVolume } from './street-lamps';
import type { StructureFootprint, StructureSupport } from './structure-clearance';
import type { XZ } from './types';
import { stationVaultHeight } from './station-presentation';

interface MetroFixtureData {
  lines: MetroLineInput[]; stations: { id: string; p: XZ; lines?: string[] }[]; deckHeight: number;
  pillars?: { p: XZ; h: number; line?: string }[];
}
interface Volume { id: string; footprint: StructureFootprint; bottom: number; top: number }
const CELL = 50, GAP = .03;
const cache = new WeakMap<MetroFixtureData, ReturnType<typeof createClearance>>();
function bounds(p: StructureFootprint) {
  if ('r' in p) return [p.x - p.r, p.x + p.r, p.z - p.r, p.z + p.r];
  const x = Math.abs(p.hx) * p.hl + Math.abs(p.hz) * p.hw, z = Math.abs(p.hz) * p.hl + Math.abs(p.hx) * p.hw;
  return [p.x - x, p.x + x, p.z - z, p.z + z];
}
function overlap(a: StructureFootprint, b: StructureFootprint) {
  if ('r' in a && 'r' in b) return Math.hypot(a.x - b.x, a.z - b.z) <= a.r + b.r + GAP;
  if ('r' in a || 'r' in b) {
    const circle = 'r' in a ? a : b as Extract<StructureFootprint, {r:number}>;
    const box = 'r' in a ? b : a as Exclude<StructureFootprint, {r:number}>;
    if ('r' in box) return false;
    const dx = circle.x - box.x, dz = circle.z - box.z;
    const u = Math.max(0, Math.abs(dx * box.hx + dz * box.hz) - box.hl), v = Math.max(0, Math.abs(-dx * box.hz + dz * box.hx) - box.hw);
    return u * u + v * v <= (circle.r + GAP) ** 2;
  }
  const dx = b.x - a.x, dz = b.z - a.z;
  for (const [x,z] of [[a.hx,a.hz],[-a.hz,a.hx],[b.hx,b.hz],[-b.hz,b.hx]]) {
    const ra = Math.abs(x * a.hx + z * a.hz) * a.hl + Math.abs(-x * a.hz + z * a.hx) * a.hw;
    const rb = Math.abs(x * b.hx + z * b.hz) * b.hl + Math.abs(-x * b.hz + z * b.hx) * b.hw;
    if (Math.abs(dx * x + dz * z) > ra + rb + GAP) return false;
  }
  return true;
}
function createClearance(metro?: MetroFixtureData,supports:readonly StructureSupport[]=[]) {
  const grid = new Map<string, Volume[]>();
  const add = (id: string, footprint: StructureFootprint, bottom: number, top: number) => {
    const volume = { id, footprint, bottom, top }, [x0,x1,z0,z1] = bounds(footprint);
    for (let i = Math.floor((x0 - GAP) / CELL); i <= Math.floor((x1 + GAP) / CELL); i++) for (let j = Math.floor((z0 - GAP) / CELL); j <= Math.floor((z1 + GAP) / CELL); j++) {
      const key = `${i},${j}`; (grid.get(key) || grid.set(key, []).get(key)!).push(volume);
    }
  };
  if (metro) {
    const corridors = metroCorridors(metro.lines), baseline = metro.deckHeight || 11;
    // Match city.ts's <=40m pitched deck pieces and their complete end overlap.
    for (const corridor of corridors) for (let i = 1; i < corridor.center.pts.length; i++) {
      const a = corridor.center.pts[i - 1], b = corridor.center.pts[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length < .5) continue;
      const n = Math.ceil(length / 40), hx = (b[0] - a[0]) / length, hz = (b[1] - a[1]) / length;
      for (let k = 0; k < n; k++) {
        const u = (k + .5) / n, ya = metroDeckHeight(corridor, corridor.center.cum[i - 1] + length * k / n, baseline), yb = metroDeckHeight(corridor, corridor.center.cum[i - 1] + length * (k + 1) / n, baseline);
        add(`metro:${corridor.id}:deck`, { x: a[0] + (b[0] - a[0]) * u, z: a[1] + (b[1] - a[1]) * u, hx, hz, hw: 4.51, hl: length / n / 2 + .12 }, Math.min(ya,yb) - 1.2, Math.max(ya,yb) + 1.8);
      }
    }
    for (const assembly of metroPlatformAssemblies(metro.stations, corridors, baseline)) {
      const {cx,cz,hx,hz} = assembly.frame, DH = assembly.deckHeight, floor = DH - 4.2, L = METRO_PLATFORM_HALF_LENGTH * 2;
      const P = (u:number,v:number) => ({x:cx+hx*u-hz*v,z:cz+hz*u+hx*v});
      // This is only a street-fixture exclusion. It does not add any floor,
      // collision wall or occupancy bypass to the open station. Keep its real
      // concourse floor, ribs, parapets and pedestrian headroom free of masts.
      add(`station:${assembly.key}:concourse`, {...P(0,0),hx,hz,hw:10.14,hl:L*.31}, floor-.85, floor+3.2);
      const s = projectMetroPath(assembly.corridor.center,[cx,cz]).s;
      const Q = (u:number,v:number) => {const p=sampleMetroPath(assembly.corridor.center,s+u);return{x:p.x-p.hz*v,z:p.z+p.hx*v};};
      for (const side of [-1,1]) for (let u=-L/2;u<L/2;u+=10) {
        const v=side*(METRO_PLATFORM_OFFSET-METRO_PLATFORM_HALF_WIDTH+METRO_PLATFORM_OUTER_EDGE)/2;
        const a=Q(u,v),b=Q(Math.min(L/2,u+10),v),length=Math.hypot(b.x-a.x,b.z-a.z);if(length<.01)continue;
        add(`station:${assembly.key}:platform`,{x:(a.x+b.x)/2,z:(a.z+b.z)/2,hx:(b.x-a.x)/length,hz:(b.z-a.z)/length,hw:(METRO_PLATFORM_OUTER_EDGE-(METRO_PLATFORM_OFFSET-METRO_PLATFORM_HALF_WIDTH))/2+.15,hl:length/2+.03},DH+.7,DH+8.4);
      }
      for(let k=0;k<7;k++) {
        const a0=-1+2*k/7,a1=-1+2*(k+1)/7,v0=a0*13,v1=a1*13,h0=DH+9.2-2.4*a0*a0,h1=DH+9.2-2.4*a1*a1;
        const width=Math.hypot(v1-v0,h1-h0)+.05,tilt=Math.atan2(h1-h0,v1-v0),vertical=width/2*Math.abs(Math.sin(tilt))+.15*Math.abs(Math.cos(tilt));
        const outerTop=Math.max(stationVaultHeight(v0,DH),stationVaultHeight(v1,DH),v0<=0&&v1>=0?stationVaultHeight(0,DH):-Infinity)+.2;
        add(`station:${assembly.key}:canopy`,{...P(0,(v0+v1)/2),hx,hz,hw:width/2*Math.abs(Math.cos(tilt))+.15*Math.abs(Math.sin(tilt)),hl:(L+4)/2},(h0+h1)/2-vertical,Math.max((h0+h1)/2+vertical,outerTop));
      }
      for(const side of [-1,1])add(`station:${assembly.key}:eave`,{...P(0,side*13.02),hx,hz,hw:.17,hl:67},DH+6.515,DH+7.04);
    }
    for(const pillar of metro.pillars||[]) {
      const [x,z]=pillar.p,nearest=corridors.filter(c=>!pillar.line||c.lineId===pillar.line).map(c=>({c,p:projectMetroPath(c.center,pillar.p)})).sort((a,b)=>a.p.d-b.p.d)[0];
      const DH=nearest?metroDeckHeight(nearest.c,nearest.p.s,baseline):baseline;
      add(`metro:pillar:${x},${z}`,{x,z,r:1.0},0,DH-1.2);
      add(`metro:pillar:${x},${z}:cap`,{x,z,hx:Math.sin(-pillar.h),hz:Math.cos(-pillar.h),hw:3.1,hl:1.2},DH-2.2,DH-1);
    }
  }
  for(const support of supports)if(['station_concourse','station_stairs','metro_pillar'].includes(support.part)){
    add(`${support.part}:${support.source}`,support.footprint,support.bottom,support.top);
    if(support.cap)add(`${support.part}:${support.source}:cap`,support.cap.footprint,support.cap.bottom,support.cap.top);
  }
  const conflictsVolumes = (parts: readonly StreetLampVolume[]) => {
    const conflicts = new Set<string>();
    for(const part of parts) {
      const [x0,x1,z0,z1]=bounds(part.footprint),seen=new Set<Volume>();
      for(let i=Math.floor(x0/CELL);i<=Math.floor(x1/CELL);i++)for(let j=Math.floor(z0/CELL);j<=Math.floor(z1/CELL);j++)for(const volume of grid.get(`${i},${j}`)||[]) {
        if(seen.has(volume))continue;seen.add(volume);
        if(part.top>volume.bottom-GAP&&part.bottom<volume.top+GAP&&overlap(part.footprint,volume.footprint))conflicts.add(`${part.part}:${volume.id}`);
      }
    }
    return [...conflicts];
  };
  return { conflicts: (site: StreetLampSite) => conflictsVolumes(streetLampVolumes(site)),
    clear: (site: StreetLampSite) => conflictsVolumes(streetLampVolumes(site)).length===0,
    clearVolumes: (parts: readonly StreetLampVolume[]) => conflictsVolumes(parts).length===0 };
}
/** Static worker-time lookup, shared by tiles using this immutable metro data.
 * Nothing is scanned or allocated by the render/simulation loop. */
export function metroStreetLampClearance(metro?: MetroFixtureData) {
  if(!metro)return createClearance();
  let result=cache.get(metro);if(!result){result=createClearance(metro);cache.set(metro,result);}return result;
}
/** Tile-local access depends on corrected neighboring buildings. Check only
 * the stairs/lifts/landings actually retained after that geometry is built. */
export const metroAccessStreetLampClearance=(supports:readonly StructureSupport[])=>createClearance(undefined,supports);
