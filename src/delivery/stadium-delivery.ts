import { landmarkTriangleHeight,type LandmarkSurfaceGrid } from '../world/landmark-support';
import type { DeliveryPoint } from './modules/types';
import { uppalStadiumFloodlights } from '../world/stadium-lighting';

/** The rendered oval is a triangle fan: its repeated central turf vertex
 * identifies the real stadium center without assuming the delivery pin is it. */
function existingFieldCenter(grid:LandmarkSurfaceGrid){
  const votes=new Map<string,{x:number;z:number;count:number}>(),seen=new Set<object>();
  for(const surfaces of grid.values())for(const t of surfaces){
    if(seen.has(t)||!/(?:^|_)uppal_stadium(?:$|:)/.test(t.id))continue;seen.add(t);
    if(![t.a,t.b,t.c].every(v=>Math.abs(v[1]-.035)<1e-4))continue;
    const area=Math.abs((t.b[0]-t.a[0])*(t.c[2]-t.a[2])-(t.b[2]-t.a[2])*(t.c[0]-t.a[0]))/2;
    if(area<40)continue;
    for(const v of[t.a,t.b,t.c]){const key=`${v[0].toFixed(3)},${v[2].toFixed(3)}`,entry=votes.get(key);if(entry)entry.count++;else votes.set(key,{x:v[0],z:v[2],count:1});}
  }
  const center=[...votes.values()].sort((a,b)=>b.count-a.count)[0];return center&&center.count>=6?center:null;
}

/** Bind the scene to the rendered Uppal field/pavilion walking surface. Never
 * substitute the bowl's high seating/canopy roof or create a replacement pitch.
 * null means the owning landmark tile still needs to stream. */
export function resolveUppalStadiumDelivery(grid:LandmarkSurfaceGrid|undefined,destination:DeliveryPoint):{
  destination:DeliveryPoint;moduleParams:{useExistingStadium:true;radius:6;stadiumLight?:{x:number;y:number;z:number}};
}|null{
  if(!grid||![destination.x,destination.z].every(Number.isFinite))return null;
  const height=(x:number,z:number)=>{
    let best:number|null=null;
    for(const surface of grid.get(`${Math.floor(x/30)},${Math.floor(z/30)}`)??[]){
      if(!/(?:^|_)uppal_stadium(?:$|:)/.test(surface.id))continue;
      const y=landmarkTriangleHeight(surface,x,z);
      if(y!==null&&Number.isFinite(y)&&y>=-.1&&y<=1.5&&(best===null||y>best))best=y;
    }
    return best;
  };
  const candidates=[{x:destination.x,z:destination.z}];
  for(const radius of[8,16,32,48,72,96])for(let i=0;i<12;i++)candidates.push({x:destination.x+Math.cos(i*Math.PI/6)*radius,z:destination.z+Math.sin(i*Math.PI/6)*radius});
  for(const point of candidates){
    const floor=height(point.x,point.z);if(floor===null)continue;
    const footprint=[[0,0],[-3,0],[3,0],[0,-3],[0,3],[-2,-2],[-2,2],[2,-2],[2,2]];
    if(!footprint.every(([dx,dz])=>{const y=height(point.x+dx,point.z+dz);return y!==null&&Math.abs(y-floor)<=.18;}))continue;
    const center=existingFieldCenter(grid);
    // The actor faces the positive-Z side of the wicket. Select an existing
    // front-side tower so its light reaches the face, rather than inventing a
    // close light in the playing field. Selection runs once at placement.
    const light=center?uppalStadiumFloodlights(center).sort((a,b)=>b.z-a.z)[0]:undefined;
    return{destination:{...destination,x:point.x,z:point.z,y:floor},moduleParams:{useExistingStadium:true,radius:6,...light?{stadiumLight:light}:{}}};
  }
  return null;
}
