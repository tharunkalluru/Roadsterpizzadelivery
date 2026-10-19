import * as THREE from 'three';
import type { Building, Storefront } from '../world/schema';
import type { ResearchedBuildingProfile,ResearchedFrontProfile } from '../world/buildingProfile';
import type { Quality } from './api';
import { GeoBuilder,addBox,boxMatrix,hex } from './geo';
import { profileFacades,type ProfileFacade } from './profileFacades';
import { accessRecessForFacade,type BuildingAccessPlan } from '../world/buildingAccess';

export interface SurveyFront {
  W:number;
  box:(builder:GeoBuilder,w:number,h:number,d:number,x:number,y:number,z:number,c:number)=>void;
  world:(x:number,y:number,z:number)=>THREE.Vector3;
}

/** Local x follows the photographed left-to-right facade; local z points to the street. */
export function surveyFront(facade:[[number,number],[number,number]],heading:number,recess?:{depthM:number;topM:number}):SurveyFront{
  const [a,b]=facade,dx=b[0]-a[0],dz=b[1]-a[1],W=Math.hypot(dx,dz);
  let nx=dz/W,nz=-dx/W;
  if(nx*-Math.sin(heading)+nz*-Math.cos(heading)<0){nx=-nx;nz=-nz;}
  const transform=boxMatrix((a[0]+b[0])/2,0,(a[1]+b[1])/2,Math.atan2(nx,nz));
  return {
    W,
    box:(builder,w,h,d,x,y,z,c)=>{
      const emit=(height:number,cy:number,n:number)=>addBox(builder,w,height,d,new THREE.Matrix4().multiplyMatrices(transform,boxMatrix(x,cy,n)),1,hex(c));
      if(!recess||y-h/2>=recess.topM){emit(h,y,z);return;}
      const low=y-h/2,split=Math.min(y+h/2,recess.topM);
      if(split>low)emit(split-low,(low+split)/2,z-recess.depthM);
      if(y+h/2>split)emit(y+h/2-split,(y+h/2+split)/2,z);
    },
    world:(x,y,z)=>new THREE.Vector3(x,y,z-(recess&&y<recess.topM?recess.depthM:0)).applyMatrix4(transform),
  };
}

export interface ResearchedBuilders {cladding:GeoBuilder;glazing:GeoBuilder;details:GeoBuilder}

export function researchedFacesOf(building:Building,front:ResearchedFrontProfile,stores:Storefront[]|null):ProfileFacade[]{
  if(front.facade&&front.facingHeading!==undefined)return [{facade:front.facade,heading:front.facingHeading,storefrontIds:front.storefrontIds??[]}];
  const ids=front.storefrontIds?new Set(front.storefrontIds):null;
  return profileFacades(building,(stores??[]).filter(s=>!ids||ids.has(s.id)));
}

/** Appends all data-authored blocks to three shared chunk meshes, without per-shop draw calls. */
export function appendResearchedBuilding(building:Building,profile:ResearchedBuildingProfile,stores:Storefront[]|null,B:ResearchedBuilders,quality:Quality,access?:BuildingAccessPlan):void{
  if(profile.signageOnly)return;
  for(const rule of profile.fronts)for(const face of researchedFacesOf(building,rule,stores)){
    if(rule.accessOnly)continue;
    const setback=rule.setbackM??0,recess=access&&accessRecessForFacade(access,face.facade,face.heading);
    const base=surveyFront(face.facade,face.heading,recess?{depthM:Math.max(0,recess.depthM-setback),topM:recess.topM}:undefined),W=base.W;
    const front:SurveyFront={...base,box:(builder,w,h,d,x,y,z,c)=>base.box(builder,w,h,d,x,y,z-setback,c),world:(x,y,z)=>base.world(x,y,z-setback)};
    const wall=new THREE.Color(profile.wallColor).getHex();
    front.box(B.cladding,W,building.heightM,.08,0,building.heightM/2,-.12,wall);
    for(const floor of rule.floors){
      const y=floor.baseM,h=Math.min(floor.heightM,Math.max(0,building.heightM-y));if(h<=0)continue;
      if(floor.wallColor)front.box(B.cladding,W,h,.06,0,y+h/2,-.07,new THREE.Color(floor.wallColor).getHex());
      const band=Math.min(h,Math.max(0,floor.bandHeightM??.25));
      const bays=rule.bays??[{start:0,end:1}];
      for(const bay of bays){
        const a=Math.max(0,bay.start)*W-W/2,b=Math.min(1,bay.end)*W-W/2;
        const ratio=Math.max(0,Math.min(1,bay.glazingRatio??floor.glazingRatio)),width=(b-a)*ratio;
        const gh=Math.max(0,h-band)*(floor.glazingHeightRatio??.9),cy=y+band+(h-band)/2;
        if(width>.05&&gh>.05){
          const glass=new THREE.Color(bay.glassColor??floor.glassColor??'#36596b').getHex();
          if(floor.openingShape==='arched'){
            const rise=Math.min(width*.25,gh*.22),shape=new THREE.Shape();
            shape.moveTo(-width/2,-gh/2);shape.lineTo(width/2,-gh/2);shape.lineTo(width/2,gh/2-rise);
            shape.quadraticCurveTo(width*.32,gh/2,0,gh/2);shape.quadraticCurveTo(-width*.32,gh/2,-width/2,gh/2-rise);shape.closePath();
            const geo=new THREE.ShapeGeometry(shape,quality==='low'?5:8),centre=front.world((a+b)/2,cy,floor.outsetM??.025);
            B.glazing.appendGeometry(geo,boxMatrix(centre.x,centre.y,centre.z,Math.atan2(-Math.sin(face.heading),-Math.cos(face.heading))),hex(glass));geo.dispose();
          }else front.box(B.glazing,width,gh,.05,(a+b)/2,cy,floor.outsetM??.025,glass);
          if(floor.balustrade){
            const rail=floor.balustrade,rh=Math.min(rail.heightM,gh*.5),base=cy-gh/2,col=new THREE.Color(rail.color).getHex(),out=(floor.outsetM??.025)+.1;
            front.box(B.details,width,.07,.08,(a+b)/2,base+rh,out,col);front.box(B.details,width,.07,.08,(a+b)/2,base+.04,out,col);
            for(let x=(a+b-width)/2+.08;x<(a+b+width)/2-.04;x+=rail.spacingM??.22)front.box(B.details,.045,rh,.05,x,base+rh/2,out,col);
          }
          if(quality!=='low')for(let x=(a+b-width)/2+1.25;x<(a+b+width)/2-.2;x+=1.25)front.box(B.details,.025,gh,.04,x,cy,(floor.outsetM??.025)+.045,0x7b8b8e);
        }
      }
      if(band>0)front.box(B.cladding,W,band,.25,0,y+band/2,.08,new THREE.Color(floor.bandColor??profile.wallColor).getHex());
    }
    for(const pier of rule.piers??[])front.box(B.cladding,pier.widthM,building.heightM,pier.depthM??.35,(pier.at-.5)*W,building.heightM/2,.15,new THREE.Color(pier.color).getHex());
    if(rule.fascia){const f=rule.fascia;front.box(B.cladding,W,f.heightM,.4,0,f.baseM+f.heightM/2,f.outsetM??.2,new THREE.Color(f.color).getHex());}
    for(const a of rule.accents??[]){
      const width=(a.end-a.start)*W,cx=((a.start+a.end)/2-.5)*W,cy=a.baseM+a.heightM/2,col=new THREE.Color(a.color).getHex(),out=a.outsetM??.2;
      if(a.kind==='light_string'){
        const cable=Math.min(.012,Math.max(.006,width));
        front.box(B.details,cable,a.heightM,a.depthM??.012,cx,cy,out,col);
        if(quality!=='low')for(let y=a.baseM+.12;y<a.baseM+a.heightM;y+=.24)front.box(B.details,.022,.035,.022,cx,y,out+.008,0xe8d5a3);
        continue;
      }
      if(a.outlineM){
        for(const side of [-1,1]){
          front.box(B.cladding,width,a.outlineM,a.depthM??.25,cx,cy+side*(a.heightM-a.outlineM)/2,out,col);
          front.box(B.cladding,a.outlineM,a.heightM,a.depthM??.25,cx+side*(width-a.outlineM)/2,cy,out,col);
        }
      }else front.box(B.cladding,width,a.heightM,a.depthM??.25,cx,cy,out,col);
    }
    for(const screen of rule.screens??[]){
      const outline=screen.outline.map(([u,y])=>new THREE.Vector2((u-.5)*W,y));
      if(outline.length<3)continue;
      const shape=new THREE.Shape(outline);
      if(screen.pattern!=='solid'){
        const cell=Math.max(screen.cellM??.24,quality==='low'?.5:quality==='standard'?.28:.22);
        const inside=(x:number,y:number)=>{
          let hit=false;
          for(let i=0,j=outline.length-1;i<outline.length;j=i++){
            const a=outline[i],b=outline[j];
            if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)hit=!hit;
          }
          return hit;
        };
        const minX=Math.min(...outline.map(p=>p.x)),maxX=Math.max(...outline.map(p=>p.x)),minY=Math.min(...outline.map(p=>p.y)),maxY=Math.max(...outline.map(p=>p.y));
        const hole=cell*.58;
        for(let y=minY+cell;y<maxY-cell/2;y+=cell)for(let x=minX+cell;x<maxX-cell/2;x+=cell){
          const x0=x-hole/2,x1=x+hole/2,y0=y-hole/2,y1=y+hole/2;
          if(![[x0,y0],[x1,y0],[x1,y1],[x0,y1]].every(([px,py])=>inside(px,py)))continue;
          const cut=new THREE.Path();cut.moveTo(x0,y0);cut.lineTo(x0,y1);cut.lineTo(x1,y1);cut.lineTo(x1,y0);cut.closePath();shape.holes.push(cut);
        }
      }
      const geo=new THREE.ShapeGeometry(shape),origin=front.world(0,0,screen.outsetM??.32);
      B.cladding.appendGeometry(geo,boxMatrix(origin.x,origin.y,origin.z,Math.atan2(-Math.sin(face.heading),-Math.cos(face.heading))),hex(new THREE.Color(screen.color).getHex()));geo.dispose();
    }

  }
}


/** Render the same road-cleared pieces that WorldPhysics registers as solid access. */
export function appendBuildingAccess(plan:BuildingAccessPlan,B:ResearchedBuilders):void{
  for(const b of plan.boxes){
    const builder=b.kind==='landing'||b.kind==='step'||b.kind==='opening'?B.cladding:B.details;
    addBox(builder,b.widthM,b.top-b.bottom,b.depthM,boxMatrix(b.centre[0],(b.top+b.bottom)/2,b.centre[1],b.yaw),1,hex(b.color));
  }
  for(const beam of plan.beams){
    const a=new THREE.Vector3(...beam.a),b=new THREE.Vector3(...beam.b),delta=b.clone().sub(a);
    const geometry=new THREE.CylinderGeometry(beam.radius,beam.radius,delta.length(),7);
    const matrix=new THREE.Matrix4().compose(a.add(b).multiplyScalar(.5),new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()),new THREE.Vector3(1,1,1));
    B.details.appendGeometry(geometry,matrix,hex(beam.color));geometry.dispose();
  }
}
