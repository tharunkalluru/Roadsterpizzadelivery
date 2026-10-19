import type { Building,Storefront,Vec2,WorldCore } from './schema';
import type { ResearchedFrontProfile } from './buildingProfile';
import { profileFacades,type ProfileFacade } from './buildingProfileFaces';
import { RoadIndex } from './roadIndex';
import type { AccessPit } from './accessPits';

export interface AccessBox {
  id:string;kind:'landing'|'step'|'post'|'rail'|'opening'|'planter'|'foliage';
  centre:Vec2;widthM:number;depthM:number;yaw:number;bottom:number;top:number;color:number;solid:boolean;
}
export interface AccessBeam {id:string;a:[number,number,number];b:[number,number,number];radius:number;color:number}
export interface BuildingAccessPlan {
  boxes:AccessBox[];beams:AccessBeam[];pits:AccessPit[];
  recesses:{facade:[Vec2,Vec2];heading:number;depthM:number;topM:number;lipM:number;ceilingId?:string}[];
  adjustments:{front:string;recessM:number;depthScale:number;status:'authored_estimate'|'recessed_for_road_clearance'|'omitted_no_clearance'}[];
}
interface Rect {a:number;b:number;n0:number;n1:number}
interface Stair {at:number;widthM:number;risers:number;runM:number;startM?:number}
interface Opening {at:number;widthM:number;depthM:number;grille?:boolean}
interface AccessSpec {level:number;depth:number;topM:number;landingWidthM?:number;stairs:Stair[];openings:Opening[];railings:boolean;planters?:number[];}
interface Frame {W:number;nx:number;nz:number;tx:number;tz:number;cx:number;cz:number;yaw:number}
const indexes=new WeakMap<WorldCore,RoadIndex>();
export function accessRoadIndex(core:WorldCore):RoadIndex{let r=indexes.get(core);if(!r){r=new RoadIndex(core);indexes.set(core,r);}return r;}

function frameOf(face:ProfileFacade):Frame{
  const [a,b]=face.facade,dx=b[0]-a[0],dz=b[1]-a[1],W=Math.hypot(dx,dz);let nx=dz/W,nz=-dx/W;
  if(nx*-Math.sin(face.heading)+nz*-Math.cos(face.heading)<0){nx=-nx;nz=-nz;}
  return {W,nx,nz,tx:nz,tz:-nx,cx:(a[0]+b[0])/2,cz:(a[1]+b[1])/2,yaw:Math.atan2(nx,nz)};
}
const at=(f:Frame,u:number,n:number):Vec2=>[f.cx+f.tx*u+f.nx*n,f.cz+f.tz*u+f.nz*n];
function split(ranges:[number,number][],gaps:[number,number][]):[number,number][]{
  let out=ranges;for(const [a,b]of gaps)out=out.flatMap(([x,y])=>b<=x||a>=y?[[x,y]as[number,number]]:[[x,Math.min(y,a)],[Math.max(x,b),y]].filter(([l,r])=>r-l>.06)as[number,number][]);return out;
}
function groundRoadAt(roads:RoadIndex,x:number,z:number,top:number,margin=.7):boolean{
  for(const s of roads.segmentsNear(x,z)){
    if(s.road.tunnel||/^(footway|pedestrian|path|steps|cycleway|track)$/.test(s.road.highway))continue;
    const dx=s.bx-s.ax,dz=s.bz-s.az,t=Math.max(0,Math.min(1,((x-s.ax)*dx+(z-s.az)*dz)/(s.len*s.len)));
    const y=s.ay+(s.by-s.ay)*t;if(y<-.5||y>top+.75)continue;
    if(Math.hypot(x-s.ax-dx*t,z-s.az-dz*t)<s.halfWidth+margin)return true;
  }return false;
}
function clearRects(f:Frame,rects:Rect[],shift:number,roads:RoadIndex,top:number):boolean{
  for(const r of rects){
    const nu=Math.max(1,Math.ceil((r.b-r.a)/.3)),nn=Math.max(1,Math.ceil((r.n1-r.n0)/.3));
    for(let i=0;i<=nu;i++)for(let j=0;j<=nn;j++){
      const [x,z]=at(f,r.a+(r.b-r.a)*i/nu,r.n0+(r.n1-r.n0)*j/nn+shift);
      if(groundRoadAt(roads,x,z,top))return false;
    }
  }return true;
}

function frontsFor(building:Building,stores:Storefront[],front:ResearchedFrontProfile):ProfileFacade[]{
  if(front.facade&&front.facingHeading!==undefined)return [{facade:front.facade,heading:front.facingHeading,storefrontIds:front.storefrontIds??[]}];
  return profileFacades(building,stores.filter(s=>!front.storefrontIds||front.storefrontIds.includes(s.id)));
}

/** One deterministic plan for visible access and collision. Dimensions remain provisional;
 * a road conflict recesses the access into its building rather than placing stairs in traffic. */
export function buildingAccessPlan(building:Building,stores:Storefront[],roads:RoadIndex):BuildingAccessPlan{
  const plan:BuildingAccessPlan={boxes:[],beams:[],pits:[],recesses:[],adjustments:[]};
  const add=(face:ProfileFacade,spec:AccessSpec,key:string,setback=0)=>{
    const f=frameOf(face),W=f.W,landingW=spec.landingWidthM??W;
    const rectsOf=(s:AccessSpec):Rect[]=>[
      {a:-landingW/2-.08,b:landingW/2+.08,n0:0,n1:s.depth+.08},
      ...s.stairs.map(s=>{const u=(s.at-.5)*W;return {a:u-s.widthM/2-.08,b:u+s.widthM/2+.08,n0:s.startM??spec.depth,n1:(s.startM??spec.depth)+s.runM+.08};}),
      ...s.openings.map(o=>{const u=(o.at-.5)*W;return {a:u-o.widthM/2-.15,b:u+o.widthM/2+.15,n0:-.22,n1:o.depthM+.08};}),
    ];
    const scaled=(scale:number):AccessSpec=>({...spec,depth:Math.max(.25,spec.depth*scale),stairs:spec.stairs.map(s=>({...s,startM:s.startM===undefined?Math.max(.25,spec.depth*scale):s.startM*scale,runM:Math.max(s.risers*.16,s.runM*scale)})),openings:spec.openings.map(o=>({...o,depthM:Math.max(.4,o.depthM*scale)}))});
    let shift=-setback,clear=false,depthScale=1;
    // Dimensions are provisional. Fit the available pavement before cutting a visible entrance recess.
    for(const scale of [1,.85,.7,.55,.4]){const candidate=scaled(scale);if(clearRects(f,rectsOf(candidate),shift,roads,spec.topM)){spec=candidate;depthScale=scale;clear=true;break;}}
    if(!clear){
      const candidate=scaled(.4);depthScale=.4;
      for(let i=1;i<=60;i++){shift=-setback-i*.2;if(clearRects(f,rectsOf(candidate),shift,roads,spec.topM)){spec=candidate;clear=true;break;}}
    }
    plan.adjustments.push({front:key,recessM:Math.max(0,-shift),depthScale,status:!clear?'omitted_no_clearance':shift<-.01?'recessed_for_road_clearance':'authored_estimate'});if(!clear)return;
    const lip=Math.max(spec.depth,...spec.stairs.map(s=>(s.startM??spec.depth)+s.runM),...spec.openings.map(o=>o.depthM));
    const recess:BuildingAccessPlan['recesses'][number]|undefined=shift<-setback-.01?{facade:face.facade,heading:face.heading,depthM:-shift,topM:spec.topM,lipM:lip+shift}:undefined;
    if(recess)plan.recesses.push(recess);
    let seq=0;
    const box=(kind:AccessBox['kind'],w:number,h:number,d:number,u:number,y:number,n:number,color:number,solid=true)=>{const id=`access:${building.id}:${key}:${kind}:${seq++}`;plan.boxes.push({id,kind,centre:at(f,u,n+shift),widthM:w,depthM:d,yaw:f.yaw,bottom:y-h/2,top:y+h/2,color,solid});return id;};
    const beam=(u:number,y0:number,n0:number,y1:number,n1:number)=>{const a=at(f,u,n0+shift),b=at(f,u,n1+shift);plan.beams.push({id:`access:${building.id}:${key}:beam:${seq++}`,a:[a[0],y0,a[1]],b:[b[0],y1,b[1]],radius:.035,color:0xb9c2c5});};
    const holes=spec.openings.map(o=>[(o.at-.5)*W-o.widthM/2,(o.at-.5)*W+o.widthM/2]as[number,number]);
    for(const [a,b]of split([[-landingW/2,landingW/2]],holes))box('landing',b-a,.07,spec.depth,(a+b)/2,spec.level-.035,spec.depth/2,0xb3b9b6);
    for(const s of spec.stairs){
      const u=(s.at-.5)*W,start=s.startM??spec.depth;
      for(let k=0;k<s.risers;k++){const top=spec.level*(k+1)/s.risers,n=start+s.runM-(k+.5)*s.runM/s.risers;box('step',s.widthM,top,s.runM/s.risers,u,top/2,n,0xa8b0af);}
      if(spec.railings)for(const side of [-1,1]){
        const x=u+side*(s.widthM/2-.08);beam(x,spec.level+.98,start,.98,start+s.runM);
        for(const t of [0,.5,1])box('post',.045,.95,.045,x,spec.level*(1-t)+.475,start+s.runM*t,0xb7c1c3);
      }
    }
    for(const o of spec.openings){
      const u=(o.at-.5)*W,landingDepthM=.2,stepCount=6;
      const mouth=at(f,u,o.depthM+shift),rimM=roads.groundHeight(mouth[0],mouth[1],null,0,.5);
      // Existing profiles have no measured vertical drop. Keep the former six 0.11m
      // assumed risers explicit, now descending instead of painting a black ground patch.
      const floorM=rimM-stepCount*.11,pitDepth=o.depthM+landingDepthM;
      const centre=at(f,u,(o.depthM-landingDepthM)/2+shift);
      const pit:AccessPit={id:`access:${building.id}:${key}:pit:${seq++}`,centre,yaw:f.yaw,widthM:o.widthM,depthM:pitDepth,
        poly:[at(f,u-o.widthM/2,-landingDepthM+shift),at(f,u+o.widthM/2,-landingDepthM+shift),at(f,u+o.widthM/2,o.depthM+shift),at(f,u-o.widthM/2,o.depthM+shift)],
        rimM,floorM,ceilingM:spec.level-.07,stepCount,landingDepthM,stairRunM:o.depthM,dimensionStatus:'provisional',verticalDropBasis:'authored_estimate_not_measured'};
      plan.pits.push(pit);
      pit.ceilingId=box('opening',o.widthM,.07,landingDepthM,u,spec.level-.035,-landingDepthM/2,0xb6bbb2);
      pit.ceilingM=plan.boxes[plan.boxes.length-1].bottom;
      box('opening',o.widthM,.07,pitDepth,u,floorM-.035,(o.depthM-landingDepthM)/2,0x626b67);
      // Back and side retaining walls enclose the cut earth; the street mouth remains open.
      const wallTop=Math.max(rimM+.06,spec.level),wallHeight=wallTop-floorM;
      box('opening',o.widthM,.06,.06,u,wallTop-.03,-landingDepthM-.03,0xb5b9b0);
      box('opening',o.widthM,wallHeight,.08,u,(floorM+wallTop)/2,-landingDepthM-.04,0x35413f);
      for(const side of [-1,1])box('opening',.12,wallHeight,pitDepth,u+side*(o.widthM/2+.06),(floorM+wallTop)/2,(o.depthM-landingDepthM)/2,0xb8bdb3);
      for(let k=0;k<stepCount;k++){
        const top=floorM+(rimM-floorM)*(k+1)/stepCount,height=top-floorM+.07;
        box('step',o.widthM,height,o.depthM/stepCount,u,floorM-.07+height/2,(k+.5)*o.depthM/stepCount,0x828c86);
      }
      if(o.grille)for(let x=u-o.widthM/2+.12;x<u+o.widthM/2;x+=.16)box('post',.025,spec.level*.8,.025,x,spec.level*.4,-landingDepthM-.1,0xbbc4bf);
    }
    if(spec.railings){
      const gaps=[...holes,...spec.stairs.map(s=>[(s.at-.5)*W-s.widthM/2-.12,(s.at-.5)*W+s.widthM/2+.12]as[number,number])];
      for(const [a,b]of split([[-W/2+.08,W/2-.08]],gaps)){
        for(const y of [.46,.79,1.08])box('rail',b-a,.035,.035,(a+b)/2,spec.level+y,spec.depth-.03,0xb7c1c3);
        const count=Math.max(1,Math.ceil((b-a)/1.1));for(let k=0;k<=count;k++)box('post',.045,1.12,.045,a+(b-a)*k/count,spec.level+.56,spec.depth-.03,0xb7c1c3);
      }
    }
    if(shift<-setback-.01){
      // The access stays visible inside an open ground-floor bay, with no opaque wall in front.
      for(const side of [-1,1])box('opening',.1,spec.topM,lip,side*(landingW/2-.05),spec.topM/2,lip/2,0xb5b6ac);
      const ceilingId=box('opening',landingW,.1,lip,0,spec.topM-.05,lip/2,0xc1c2b8);if(recess)recess.ceilingId=ceilingId;
    }
    for(const atValue of spec.planters??[]){const u=(atValue-.5)*W,n=Math.min(1,Math.max(.22,spec.depth-.23));box('planter',.8,.34,.42,u,spec.level+.17,n,0x99694c);box('foliage',.72,.42,.32,u,spec.level+.53,n,0x496443,false);}
  };
  if(building.researchedProfile&&!building.researchedProfile.signageOnly){
    for(const [index,front]of building.researchedProfile.fronts.entries())if(front.access)for(const [part,face]of frontsFor(building,stores,front).entries()){
      const a=front.access;add(face,{level:a.landingHeightM,depth:a.landingDepthM,topM:Math.min(building.heightM,Math.min(...front.floors.map(f=>f.baseM))+front.floors[0].heightM),stairs:a.stairs,openings:a.basementOpenings??[],railings:a.railings??false},`profile-${index}-${part}`,front.setbackM??0);
    }
    return plan;
  }
  if(building.surveyStyle==='madhapur_commercial'){
    const med=stores.find(s=>s.id==='survey-madhapur-medplus'),east=stores.find(s=>s.id==='survey-madhapur-just-for-u');
    if(med?.facade){const W=Math.hypot(med.facade[1][0]-med.facade[0][0],med.facade[1][1]-med.facade[0][1]),entry=W/2-1.25;add({facade:med.facade,heading:med.facingHeading,storefrontIds:[med.id]},{level:med.appearance?.frontBaseM??1.25,depth:1.5,topM:4.55,stairs:[{at:entry/W+.5,widthM:2.4,risers:8,runM:2.24,startM:.6}],openings:[{at:(entry-2)/W+.5,widthM:1.4,depthM:1.65}],railings:true},'medplus');}
    if(east?.facade){const W=Math.hypot(east.facade[1][0]-east.facade[0][0],east.facade[1][1]-east.facade[0][1]);add({facade:east.facade,heading:east.facingHeading,storefrontIds:[east.id]},{level:1.2,depth:1.5,topM:4.55,stairs:[{at:1-1.2/W,widthM:2.1,risers:6,runM:1.8,startM:.6}],openings:[],railings:true,planters:[.18,.38,.64]},'medplus-east');}
  }
  if(building.surveyStyle==='madhapur_brown_commercial'){
    const face=profileFacades(building,stores)[0];if(face){const W=frameOf(face).W;add(face,{level:1.2,depth:1.5,topM:4.55,stairs:[{at:.27,widthM:2.2,risers:6,runM:1.8,startM:.6},{at:1-1.03/W,widthM:1.8,risers:6,runM:1.8,startM:.6}],openings:[{at:.695,widthM:1.65,depthM:1.5,grille:true}],railings:true},'brown');}
  }
  if(building.surveyStyle==='habsiguda_gatsi_block'){
    const face=profileFacades(building,stores)[0];if(face)add(face,{level:.48,depth:.25,topM:3.8,landingWidthM:2.8,stairs:[{at:.5,widthM:2.6,risers:3,runM:.78,startM:.25}],openings:[],railings:false},'gatsi');
  }
  return plan;
}

export function accessBoxPolygon(box:AccessBox):Vec2[]{
  const c=Math.cos(box.yaw),s=Math.sin(box.yaw);return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,n])=>[box.centre[0]+c*u*box.widthM/2+s*n*box.depthM/2,box.centre[1]-s*u*box.widthM/2+c*n*box.depthM/2]);
}
/** Conservative solid volumes for the same visible pieces. No support surface or teleport climb is added. */
export function buildingAccessObstacles(plan:BuildingAccessPlan):{id:string;poly:Vec2[];bottom:number;top:number}[]{
  const out=plan.boxes.filter(b=>b.solid).map(b=>({id:b.id,poly:accessBoxPolygon(b),bottom:b.kind==='landing'||b.kind==='step'?Math.min(0,b.bottom):b.bottom,top:b.top}));
  for(const b of plan.beams){
    const dx=b.b[0]-b.a[0],dz=b.b[2]-b.a[2],L=Math.hypot(dx,dz);if(L<.001)continue;
    const rx=-dz/L*b.radius,rz=dx/L*b.radius;
    out.push({id:b.id,poly:[[b.a[0]+rx,b.a[2]+rz],[b.b[0]+rx,b.b[2]+rz],[b.b[0]-rx,b.b[2]-rz],[b.a[0]-rx,b.a[2]-rz]],bottom:Math.min(b.a[1],b.b[1])-b.radius,top:Math.max(b.a[1],b.b[1])+b.radius});
  }return out;
}

/** Match lower frontage geometry to the same source face as its fitted entrance. */
export function accessRecessForFacade(plan:BuildingAccessPlan,facade:[Vec2,Vec2],heading:number):{depthM:number;topM:number}|undefined{
  const [a,b]=facade,dx=b[0]-a[0],dz=b[1]-a[1],L=Math.hypot(dx,dz),mx=(a[0]+b[0])/2,mz=(a[1]+b[1])/2;
  return plan.recesses.find(r=>{
    if(Math.cos(r.heading-heading)<.95)return false;
    const [p,q]=r.facade,vx=q[0]-p[0],vz=q[1]-p[1],R=Math.hypot(vx,vz);
    const u=((mx-p[0])*vx+(mz-p[1])*vz)/R;
    return Math.abs((mx-p[0])*vz-(mz-p[1])*vx)/R<1.5&&u>=-L/2&&u<=R+L/2;
  });
}

/** Low front openings are separate from source courtyard holes and stop at the visible recessed wall. */
export function buildingAccessCutouts(plan:BuildingAccessPlan):{poly:Vec2[];bottom:number;top:number;ceilingId?:string}[]{
  const recesses=plan.recesses.map(r=>{
    const f=frameOf({facade:r.facade,heading:r.heading,storefrontIds:[]});
    const bottom=Math.min(0,...plan.pits.map(p=>p.floorM-.08));
    return {poly:[at(f,-f.W/2,.3),at(f,f.W/2,.3),at(f,f.W/2,-r.depthM-.12),at(f,-f.W/2,-r.depthM-.12)],bottom,top:r.topM-.1,ceilingId:r.ceilingId};
  });
  return [...recesses,...plan.pits.map(p=>({poly:p.poly,bottom:p.floorM-.08,top:p.ceilingM,ceilingId:p.ceilingId}))];
}
