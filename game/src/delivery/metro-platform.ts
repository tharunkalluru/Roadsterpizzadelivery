import { METRO_PLATFORM_HALF_LENGTH, METRO_PLATFORM_HALF_WIDTH, METRO_PLATFORM_OFFSET, projectMetroPath, sampleMetroPath, type MetroPlatformAssembly } from '../world/metro-geometry';

interface Point { x:number; z:number }
interface Pad { a:Point; b:Point; hx:number; hz:number; length:number; u:number; end:number; polygon:Point[] }
const HALF_LENGTH=2.4,HALF_WIDTH=1.15,EPS=1e-8;
// Stop clear of the train edge, leaving a real front-view strip inside the
// outer guard. Parking clearance and passenger choreography share this value.
export const METRO_DELIVERY_WALK_DISTANCE=1.65;
const cross=(a:Point,b:Point,p:Point)=>(b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x);
const area=(p:Point[])=>{const origin=p[0];return !origin?0:Math.abs(p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+(a.x-origin.x)*(b.z-origin.z)-(b.x-origin.x)*(a.z-origin.z);},0))/2;};

function clip(polygon:Point[],a:Point,b:Point,inside:boolean):Point[]{
  const out:Point[]=[];if(!polygon.length)return out;
  let previous=polygon[polygon.length-1],prior=cross(a,b,previous)*(inside?1:-1),wasInside=prior>=-EPS;
  for(const current of polygon){
    const value=cross(a,b,current)*(inside?1:-1),isInside=value>=-EPS;
    if(isInside!==wasInside){const t=prior/(prior-value);out.push({x:previous.x+(current.x-previous.x)*t,z:previous.z+(current.z-previous.z)*t});}
    if(isInside)out.push(current);previous=current;prior=value;wasInside=isInside;
  }
  return out;
}
function rectangle(center:Point,hx:number,hz:number,halfLength:number,halfWidth:number):Point[]{
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([along,side])=>({x:center.x+hx*along*halfLength-hz*side*halfWidth,z:center.z+hz*along*halfLength+hx*side*halfWidth}));
}
function segmentRectangle(a:Point,b:Point,halfWidth:number,pad=0){
  const length=Math.hypot(b.x-a.x,b.z-a.z);if(length<EPS)return [];
  return rectangle({x:(a.x+b.x)/2,z:(a.z+b.z)/2},(b.x-a.x)/length,(b.z-a.z)/length,length/2+pad,halfWidth);
}
function overlaps(a:Point[],b:Point[]){
  let intersection=a;for(let i=0;i<b.length&&intersection.length;i++)intersection=clip(intersection,b[i],b[(i+1)%b.length],true);
  return intersection.length>2&&area(intersection)>EPS;
}
/** Subtract each actual rectangular pad from the car polygon. Checking the
 * remaining area also catches a narrow bend gap between supported corners. */
function fullySupported(car:Point[],pads:Pad[]){
  let remaining=[car];
  for(const pad of pads){
    const next:Point[][]=[];
    for(const part of remaining){
      let inside=part;
      for(let i=0;i<pad.polygon.length&&inside.length;i++){
        const a=pad.polygon[i],b=pad.polygon[(i+1)%pad.polygon.length],outside=clip(inside,a,b,false);
        if(outside.length>2&&area(outside)>EPS)next.push(outside);
        inside=clip(inside,a,b,true);
      }
    }
    remaining=next;if(!remaining.length)return true;
  }
  return remaining.reduce((sum,part)=>sum+area(part),0)<1e-6;
}

/** A parking marker on the existing station, never an invented platform.
 * Geometry follows City's same10m offset pad chords, including curved stops.
 * Called once on station arrival, not from the driving or rendering loop. */
export function supportedMetroHandoffParking(platform:MetroPlatformAssembly,door:{x:number;y:number;z:number;hx:number;hz:number},outward:Point):{x:number;y:number;z:number;hx:number;hz:number}|null{
  if(![door.x,door.y,door.z,door.hx,door.hz,outward.x,outward.z,platform.deckHeight,platform.frame.cx,platform.frame.cz].every(Number.isFinite))return null;
  const path=platform.corridor.center;if(path.pts.length<2||!Number.isFinite(path.len))return null;
  const stationS=projectMetroPath(path,[platform.frame.cx,platform.frame.cz]).s,projection=projectMetroPath(path,[door.x,door.z]);
  const doorU=projection.s-stationS,h=Math.hypot(door.hx,door.hz),o=Math.hypot(outward.x,outward.z);
  if(h<EPS||o<EPS||projection.d>METRO_PLATFORM_OFFSET+METRO_PLATFORM_HALF_WIDTH+2||Math.abs(doorU)>METRO_PLATFORM_HALF_LENGTH+4)return null;
  const dhx=door.hx/h,dhz=door.hz/h,ox=outward.x/o,oz=outward.z/o,tangent=sampleMetroPath(path,projection.s);
  const lateral=-tangent.hz*ox+tangent.hx*oz;if(Math.abs(lateral)<.5)return null;
  const side=lateral>0?1:-1;
  const point=(u:number,v:number):Point=>{const p=sampleMetroPath(path,stationS+u);return{x:p.x-p.hz*v,z:p.z+p.hx*v};};
  const pads:Pad[]=[],guards:Point[][]=[];
  for(let u=-METRO_PLATFORM_HALF_LENGTH;u<METRO_PLATFORM_HALF_LENGTH;u+=10){
    const end=Math.min(METRO_PLATFORM_HALF_LENGTH,u+10),a=point(u,side*METRO_PLATFORM_OFFSET),b=point(end,side*METRO_PLATFORM_OFFSET),length=Math.hypot(b.x-a.x,b.z-a.z);
    if(length>EPS)pads.push({a,b,hx:(b.x-a.x)/length,hz:(b.z-a.z)/length,length,u,end,polygon:segmentRectangle(a,b,METRO_PLATFORM_HALF_WIDTH)});
    const guard=segmentRectangle(point(u,side*7.4),point(end,side*7.4),.125,.01);if(guard.length)guards.push(guard);
  }
  const receiver={x:door.x+ox*METRO_DELIVERY_WALK_DISTANCE-dhx*.975,z:door.z+oz*METRO_DELIVERY_WALK_DISTANCE-dhz*.975};
  const row=Array.from({length:4},(_,i)=>({x:door.x+ox*METRO_DELIVERY_WALK_DISTANCE+dhx*(i-1.5)*.65,z:door.z+oz*METRO_DELIVERY_WALK_DISTANCE+dhz*(i-1.5)*.65}));
  const benches=[-32,32].map(u=>({u,polygon:rectangle(point(u,side*6.6),platform.frame.hx,platform.frame.hz,2.18,.43)}));
  // The first pair is the shortest clear approach. Small bounded alternatives
  // handle a chord join or an existing bench without moving either structure.
  const offsets=[-4.8,4.8,-6,6,-7.5,7.5,-8.5,8.5];
  for(const pad of pads){
    // At a curved butt join, all four corners can look supported while a
    // small interior wedge is not. Try a pose fully inside an existing chord.
    const margin=HALF_LENGTH/pad.length*(pad.end-pad.u);
    if(margin*2>pad.end-pad.u)continue;
    for(const u of [pad.u+margin,pad.end-margin,(pad.u+pad.end)/2]){
      const offset=u-doorU;if(Math.abs(offset)>=4.2-EPS&&Math.abs(offset)<=8.5+EPS)offsets.push(offset);
    }
  }
  for(const offset of offsets){
    const u=doorU+offset,pad=pads.find(p=>u>=p.u-EPS&&u<=p.end+EPS);if(!pad)continue;
    if(benches.some(bench=>Math.abs(u-bench.u)<4.5))continue;
    const t=(u-pad.u)/(pad.end-pad.u),center={x:pad.a.x+(pad.b.x-pad.a.x)*t,z:pad.a.z+(pad.b.z-pad.a.z)*t};
    if(Math.hypot(center.x-receiver.x,center.z-receiver.z)>7-EPS)continue;
    const car=rectangle(center,pad.hx,pad.hz,HALF_LENGTH,HALF_WIDTH);
    if(!fullySupported(car,pads)||guards.some(guard=>overlaps(car,guard))||benches.some(bench=>overlaps(car,bench.polygon)))continue;
    if(row.some(actor=>{const dx=actor.x-center.x,dz=actor.z-center.z,along=Math.abs(dx*pad.hx+dz*pad.hz),across=Math.abs(-dx*pad.hz+dz*pad.hx);return Math.hypot(Math.max(0,along-HALF_LENGTH),Math.max(0,across-HALF_WIDTH))<.4;}))continue;
    return {...center,y:platform.deckHeight+1.2,hx:pad.hx,hz:pad.hz};
  }
  return null;
}
