import type { CityData, Surface, Wall } from '../world/city';
import type { Building } from '../world/types';

interface Bounds { minX:number; maxX:number; minZ:number; maxZ:number }
interface SegmentBounds extends Bounds { dx:number; dz:number; length2:number; minY:number; maxY:number }
export const staticQueryStats={neighborhoodBuilds:0,boundsRejects:0,polygonTests:0,segmentTests:0};
const buildingBoundsCache=new WeakMap<Building,Bounds>();
const segmentBoundsCache=new WeakMap<Surface|Wall,SegmentBounds>();

/** Source geometry is immutable; streamed replacements have distinct identities. */
export function buildingBounds(b:Building):Bounds {
  let v=buildingBoundsCache.get(b);if(v)return v;
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for(const p of b.ring){minX=Math.min(minX,p[0]);maxX=Math.max(maxX,p[0]);minZ=Math.min(minZ,p[1]);maxZ=Math.max(maxZ,p[1]);}
  v={minX,maxX,minZ,maxZ};buildingBoundsCache.set(b,v);return v;
}
export function segmentBounds(s:Surface|Wall):SegmentBounds {
  let v=segmentBoundsCache.get(s);if(v)return v;
  const dx=s.bx-s.ax,dz=s.bz-s.az;
  let minX=Math.min(s.ax,s.bx),maxX=Math.max(s.ax,s.bx),minZ=Math.min(s.az,s.bz),maxZ=Math.max(s.az,s.bz);
  let minY:number,maxY:number;
  if('hw' in s){
    minX-=s.hw;maxX+=s.hw;minZ-=s.hw;maxZ+=s.hw;minY=Math.min(s.ya,s.yb);maxY=Math.max(s.ya,s.yb);
    // Exact road quads can extend beyond a source centreline's nominal width.
    for(const p of s.roadQuad||[]){minX=Math.min(minX,p[0]);maxX=Math.max(maxX,p[0]);minZ=Math.min(minZ,p[2]);maxZ=Math.max(maxZ,p[2]);minY=Math.min(minY,p[1]);maxY=Math.max(maxY,p[1]);}
    if(s.roadQuad){
      // roadQuadHeight accepts barycentric weights down to -1e-6. Include
      // their small exterior envelope, including interpolated sloping height.
      const ex=(maxX-minX)*3e-6+1e-8,ez=(maxZ-minZ)*3e-6+1e-8,ey=(maxY-minY)*3e-6+1e-8;
      minX-=ex;maxX+=ex;minZ-=ez;maxZ+=ez;minY-=ey;maxY+=ey;
    }
  }else{minY=Math.min(s.y0a,s.y0b);maxY=Math.max(s.y1a,s.y1b);}
  v={minX,maxX,minZ,maxZ,minY,maxY,dx,dz,length2:dx*dx+dz*dz||1};segmentBoundsCache.set(s,v);return v;
}
export function outsideBounds(b:Bounds,x:number,z:number,padding=0){const e=padding+1e-7;return x<b.minX-e||x>b.maxX+e||z<b.minZ-e||z>b.maxZ+e;}

type Obstacle={x:number;z:number;r:number;top:number};
interface Neighborhood { buildings:Building[]; walls:Wall[]; surfaces:Surface[]; obstacles:Obstacle[] }
interface Cache {revision:number; cells:Map<string,Neighborhood>}
const caches=new WeakMap<CityData,Cache>();
/** Only lists are cached, never the point/height-dependent collision result. */
export function staticNeighborhood(city:CityData,x:number,z:number):Neighborhood {
  const revision=(city as CityData&{revision?:number}).revision;
  let cache=revision===undefined?undefined:caches.get(city);
  if(revision!==undefined&&(!cache||cache.revision!==revision)){cache={revision,cells:new Map()};caches.set(city,cache);}
  const x50=Math.floor(x/50),z50=Math.floor(z/50),x30=Math.floor(x/30),z30=Math.floor(z/30);
  const key=`${x50},${z50}:${x30},${z30}`,old=cache?.cells.get(key);if(old)return old;
  const buildings=new Set<Building>(),walls=new Set<Wall>(),surfaces=new Set<Surface>(),obstacles=new Set<Obstacle>();
  for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++){
    for(const b of city.buildingGrid.get(`${x50+i},${z50+j}`)||[])buildings.add(b);
    for(const o of city.obstacles?.get(`${x50+i},${z50+j}`)||[])obstacles.add(o);
    for(const w of city.walls?.get(`${x30+i},${z30+j}`)||[])walls.add(w);
    for(const s of city.surfaceGrid.get(`${x30+i},${z30+j}`)||[])if(s.kind!=='road')surfaces.add(s);
  }
  const value={buildings:[...buildings],walls:[...walls],surfaces:[...surfaces],obstacles:[...obstacles]};
  staticQueryStats.neighborhoodBuilds++;
  if(cache){if(cache.cells.size>=2048)cache.cells.delete(cache.cells.keys().next().value!);cache.cells.set(key,value);}
  return value;
}
