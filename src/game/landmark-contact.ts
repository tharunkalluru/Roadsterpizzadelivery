import type { LandmarkSurface, LandmarkSurfaceGrid } from '../world/landmark-support';
import { landmarkTriangleHeight } from '../world/landmark-support';

// The Roadster's real wheel-bottom coordinates in its outer group. Keep these
// in vehicle order (front left/right, rear left/right), including its -.55m
// model origin. Contact support and the rendered suspension share these points.
export const ROADSTER_WHEEL_CONTACTS = Object.freeze([
  [-.945, -.55, -1.4], [.945, -.55, -1.4],
  [-.945, -.55, 1.4], [.945, -.55, 1.4],
] as const);
export const LANDMARK_SUSPENSION_TRAVEL = .18;
const MAX_GRADIENT = 2, CONTACT_BAND = .8;
interface Plane { a: number; b: number; c: number }
export interface LandmarkCarContact {
  y: number; pitch: number; roll: number; id: string;
  suspension: number[]; supportedWheels: number;
}

// Rotate with the same YXZ order as Player.group; returns a wheel's offset
// relative to the car origin, not a horizontal approximation of its footprint.
export function rotatedWheelContact(x: number, y: number, z: number, yaw: number, pitch: number, roll: number) {
  const sr=Math.sin(roll),cr=Math.cos(roll),sp=Math.sin(pitch),cp=Math.cos(pitch),sy=Math.sin(yaw),cy=Math.cos(yaw);
  const u=cr*x-sr*y,v=cp*(sr*x+cr*y)-sp*z,w=sp*(sr*x+cr*y)+cp*z;
  return { x:cy*u+sy*w, y:v, z:-sy*u+cy*w };
}
function trianglePlane(t: LandmarkSurface, x: number, z: number): Plane | null {
  const a=t.a,b=t.b,c=t.c,ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
  const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
  if (ny<=0 || Math.hypot(nx,nz)/ny>MAX_GRADIENT) return null;
  return { a:-nx/ny,b:-nz/ny,c:a[1]-nx/ny*(x-a[0])-nz/ny*(z-a[2]) };
}
function angles(p: Plane, yaw: number) {
  const l=Math.hypot(p.a,1,p.b),nx=-p.a/l,ny=1/l,nz=-p.b/l,sy=Math.sin(yaw),cy=Math.cos(yaw);
  const localX=cy*nx-sy*nz,localZ=sy*nx+cy*nz;
  return {pitch:Math.atan2(localZ,ny),roll:Math.atan2(-localX,Math.hypot(ny,localZ))};
}
function nearbyHeight(grid: LandmarkSurfaceGrid,x: number,z: number,id: string,expected: number) {
  let best: number|null=null,error=CONTACT_BAND;
  for (const t of grid.get(`${Math.floor(x/30)},${Math.floor(z/30)}`)||[]) {
    if(t.id!==id) continue;
    const y=landmarkTriangleHeight(t,x,z);
    if(y===null || Math.abs(y-expected)>error+1e-7) continue;
    if(best===null || Math.abs(y-expected)<error) {best=y;error=Math.abs(y-expected);}
  }
  return best;
}
function fit(points: {x:number;z:number;y:number}[]): Plane|null {
  // Least squares in coordinates relative to the car, so city-sized world
  // coordinates never make a nearly flat roof numerically unstable.
  const n=points.length,mx=points.reduce((s,p)=>s+p.x,0)/n,mz=points.reduce((s,p)=>s+p.z,0)/n,my=points.reduce((s,p)=>s+p.y,0)/n;
  let xx=0,xz=0,zz=0,xy=0,zy=0;
  for(const p of points){const x=p.x-mx,z=p.z-mz,y=p.y-my;xx+=x*x;xz+=x*z;zz+=z*z;xy+=x*y;zy+=z*y;}
  const d=xx*zz-xz*xz;if(Math.abs(d)<1e-8)return null;
  const a=(xy*zz-zy*xz)/d,b=(zy*xx-xy*xz)/d;
  return Math.hypot(a,b)<=MAX_GRADIENT?{a,b,c:my-a*mx-b*mz}:null;
}

// A center support identifies the reachable layer first. The solver then uses
// only the same landmark and nearby layer, so low arcades, roads underneath,
// upper roofs and sheer cliff faces cannot pull a wheel through an overhang.
export function landmarkCarContact(grid: LandmarkSurfaceGrid|undefined,x:number,z:number,yaw:number,surfaceY:number,posture?:{pitch:number;roll:number}):LandmarkCarContact|null {
  if(!grid)return null;
  let plane:Plane|null=null,id='';
  for(const t of grid.get(`${Math.floor(x/30)},${Math.floor(z/30)}`)||[]){
    const y=landmarkTriangleHeight(t,x,z);
    if(y===null||Math.abs(y-surfaceY)>.025)continue;
    const p=trianglePlane(t,x,z);if(p){plane=p;id=t.id;break;}
  }
  if(!plane)return null;
  let postureNow=posture||angles(plane,yaw),samples:{x:number;z:number;y:number;offsetY:number}[]=[];
  for(let pass=0;pass<(posture?1:5);pass++){
    samples=[];
    for(const wheel of ROADSTER_WHEEL_CONTACTS){
      const q=rotatedWheelContact(wheel[0],wheel[1],wheel[2],yaw,postureNow.pitch,postureNow.roll),expected=plane.c+plane.a*q.x+plane.b*q.z;
      const y=nearbyHeight(grid,x+q.x,z+q.z,id,expected);
      if(y===null)return null; // edge contact is not a fictitious wheel on air
      samples.push({x:q.x,z:q.z,y,offsetY:q.y});
    }
    if(posture)break;
    const next=fit(samples);if(!next)return null;
    plane=next;postureNow=angles(next,yaw);
  }
  // Query once at the final orientation; fitting changes the actual wheel XY.
  samples=[];
  for(const wheel of ROADSTER_WHEEL_CONTACTS){
    const q=rotatedWheelContact(wheel[0],wheel[1],wheel[2],yaw,postureNow.pitch,postureNow.roll),expected=plane.c+plane.a*q.x+plane.b*q.z;
    const y=nearbyHeight(grid,x+q.x,z+q.z,id,expected);if(y===null)return null;
    samples.push({x:q.x,z:q.z,y,offsetY:q.y});
  }
  const demands=samples.map(p=>p.y-p.offsetY),up=rotatedWheelContact(0,1,0,yaw,postureNow.pitch,postureNow.roll);
  const suspensionResponse=Math.max(.25,up.y-plane.a*up.x-plane.b*up.z);
  let y=demands.reduce((sum,v)=>sum+v,0)/demands.length;
  // Suspension handles small facet seams. On a larger rock the chassis lifts
  // enough to prevent penetration while wheel extension remains bounded.
  y=Math.max(y,Math.max(...demands)-LANDMARK_SUSPENSION_TRAVEL*suspensionResponse);
  const suspension=demands.map(v=>Math.max(-LANDMARK_SUSPENSION_TRAVEL,Math.min(LANDMARK_SUSPENSION_TRAVEL,(v-y)/suspensionResponse)));
  return {y,pitch:postureNow.pitch,roll:postureNow.roll,id,suspension,supportedWheels:samples.length};
}
