/** Shared chunk-owned basement voids. Vertical dimensions remain authored estimates. */
import type { Vec2,WorldCore } from './schema';
export interface AccessPit {
  id:string;centre:Vec2;yaw:number;widthM:number;depthM:number;poly:Vec2[];
  rimM:number;floorM:number;ceilingM:number;ceilingId?:string;stepCount:number;landingDepthM:number;stairRunM:number;
  dimensionStatus:'provisional';verticalDropBasis:'authored_estimate_not_measured';
}
interface PitRegistry {chunks:Map<string,readonly AccessPit[]>;version:number;all:readonly AccessPit[]}
type PitCore=WorldCore&{accessPitRegistry?:PitRegistry};
function registry(core:WorldCore):PitRegistry {
  const c=core as PitCore;return c.accessPitRegistry??=( {chunks:new Map(),version:0,all:[]} );
}
export function getAccessPits(core:WorldCore):readonly AccessPit[]{return(core as PitCore).accessPitRegistry?.all??[];}
export function accessPitsVersion(core:WorldCore):number{return(core as PitCore).accessPitRegistry?.version??0;}
export function setAccessPitsForChunk(core:WorldCore,chunkId:string,pits:readonly AccessPit[]):void {
  if(!pits.length){removeAccessPitsForChunk(core,chunkId);return;}
  const r=registry(core);r.chunks.set(chunkId,pits);r.all=[...r.chunks.values()].flat();r.version++;
}
export function removeAccessPitsForChunk(core:WorldCore,chunkId:string):void {
  const r=(core as PitCore).accessPitRegistry;if(!r||!r.chunks.delete(chunkId))return;
  r.all=[...r.chunks.values()].flat();r.version++;
}
export function accessPitLocal(pit:AccessPit,x:number,z:number):Vec2 {
  const dx=x-pit.centre[0],dz=z-pit.centre[1],c=Math.cos(pit.yaw),s=Math.sin(pit.yaw);
  return[dx*c-dz*s,dx*s+dz*c];
}
/** Exact tread top under a wheel, including the lower landing. No teleport or roof support. */
export function accessPitSurfaceAt(core:WorldCore,x:number,z:number):{pit:AccessPit;height:number}|undefined {
  for(const pit of getAccessPits(core)){
    const[u,v]=accessPitLocal(pit,x,z);if(Math.abs(u)>pit.widthM/2||Math.abs(v)>pit.depthM/2)continue;
    const distance=v+pit.depthM/2;
    if(distance<=pit.landingDepthM)return{pit,height:pit.floorM};
    const step=Math.max(0,Math.min(pit.stepCount-1,Math.floor((distance-pit.landingDepthM)/pit.stairRunM*pit.stepCount)));
    return{pit,height:pit.floorM+(pit.rimM-pit.floorM)*(step+1)/pit.stepCount};
  }
}
