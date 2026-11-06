import type { Area, XZ } from './types';

export const WATER_LEVEL = .02;
// Roadster model tyre-to-roof height is 1.28 m. Its body origin sits .55 m
// above the tyre contact plane. Float with the lower third below the water.
export const WATER_DRAFT = 1.28 / 3;
export interface WaterRegion { ring: XZ[]; level: number }
export type WaterGrid = Map<string, WaterRegion[]>;
const cell = (x: number, z: number) => `${Math.floor(x / 100)},${Math.floor(z / 100)}`;
export function waterGrid(areas: readonly Area[], tile?: { i: number; j: number }): WaterGrid {
  const grid: WaterGrid = new Map();
  for (const area of areas) {
    if (area.kind !== 'water' || area.ring.length < 3) continue;
    const region: WaterRegion = { ring: area.ring, level: WATER_LEVEL };
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x,z] of area.ring) { x0=Math.min(x0,x);x1=Math.max(x1,x);z0=Math.min(z0,z);z1=Math.max(z1,z); }
    if (tile) { x0=Math.max(x0,tile.i*1000);x1=Math.min(x1,(tile.i+1)*1000);z0=Math.max(z0,tile.j*1000);z1=Math.min(z1,(tile.j+1)*1000); }
    for(let x=Math.floor(x0/100);x<=Math.floor(x1/100);x++)for(let z=Math.floor(z0/100);z<=Math.floor(z1/100);z++){
      const key=`${x},${z}`; (grid.get(key)||grid.set(key,[]).get(key)!).push(region);
    }
  }
  return grid;
}
export function waterHeightAt(grid: WaterGrid | undefined, x: number, z: number): number | null {
  for (const region of grid?.get(cell(x,z)) || []) {
    let inside=false;
    for(let i=0,j=region.ring.length-1;i<region.ring.length;j=i++){
      const a=region.ring[i],b=region.ring[j];
      if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
    }
    if(inside)return region.level;
  }
  return null;
}
export function buoyantHeight(current: number, target: number, dt: number) {
  return current+(target-current)*(1-Math.exp(-Math.max(0,dt)*7));
}
