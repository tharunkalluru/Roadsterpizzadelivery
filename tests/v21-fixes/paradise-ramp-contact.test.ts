import test from 'node:test';
import assert from 'node:assert/strict';
import { packedDriveWorld } from '../fixtures/release-packed-drive-world';
import { actualPlayer } from '../fixtures/actual-player';
import { roadQuadHeight } from '../../src/world/road-surface';

const ids=['c74bed09-107_0','d0978a06-15a_0','8a2c3f45-5c3_0','51be01ba-57f_0'];
test('Paradise actual packed entrances: continuous tyre contact at 120 km/h',()=>{
 const {city,roads}=packedDriveWorld({x:-500,z:-4090});
 const rows:any[]=[];
 for(const id of ids){
  const e=roads.find(r=>r.id===id)!;assert.ok(e);
  // Test every end in both directions, sampling the real finite pavement.
  const surfaces=[...new Set([...city.surfaceGrid.values()].flat())].filter((s:any)=>s.e?.id===id) as any[];
  for(const reverse of [false,true])for(const hz of [30,60,120]){
   const pts=reverse?[...e.pts].reverse():e.pts;
   const fixture=actualPlayer(city),p=fixture.player;
   const dx=pts[1][0]-pts[0][0],dz=pts[1][1]-pts[0][1],L=Math.hypot(dx,dz);
   const x=pts[0][0]+dx/L*2,z=pts[0][1]+dz/L*2;
   const pavement=(x:number,z:number)=>surfaces.map(s=>s.roadQuad?roadQuadHeight(s.roadQuad,x,z):null).filter(y=>y!==null) as number[];
   p.place(x,z,Math.atan2(-dx,-dz),Math.min(...pavement(x,z)));p.speed=120/3.6;
   let maxError=0,peak=0,frames=0,witness:any;
   for(let n=0;n<hz*8;n++){
    // Follow the actual centreline using the existing steering input.
    let best=Infinity,tx=0,tz=0;
    for(let j=0;j<pts.length-1;j++){
     const a=pts[j],b=pts[j+1],vx=b[0]-a[0],vz=b[1]-a[1],len2=vx*vx+vz*vz;
     const u=Math.max(0,Math.min(1,((p.pos.x-a[0])*vx+(p.pos.z-a[1])*vz)/len2));
     const d=Math.hypot(p.pos.x-a[0]-u*vx,p.pos.z-a[1]-u*vz);
     if(d<best){best=d;tx=vx;tz=vz;}
    }
    const desired=Math.atan2(-tx,-tz),delta=Math.atan2(Math.sin(desired-p.yaw),Math.cos(desired-p.yaw));
    p.update(1/hz,{throttle:1,brake:0,steer:Math.max(-1,Math.min(1,-delta*2)),flyPressed:false,boost:false},n/hz);
    const ys=pavement(p.pos.x,p.pos.z);if(!ys.length)break;
    const err=Math.min(...ys.map(y=>Math.abs(p.pos.y-.55-y)));if(err>maxError){maxError=err;witness={x:p.pos.x,z:p.pos.z,feet:p.pos.y-.55,ys,road:p.lastEdge?.id,n};}peak=Math.max(peak,p.pos.y-.55);frames++;
   }
   rows.push({id,reverse,hz,maxError,peak,frames,witness});fixture.dispose();
   assert.ok(maxError<.25,JSON.stringify(rows.at(-1)));
   assert.ok(peak>1,`never climbed ${JSON.stringify(rows.at(-1))}`);
  }
 }
 console.log(JSON.stringify(rows));
});

test('Sardar Patel eastern approach crosses the ground-to-flyover join without falling through',()=>{
 const {city,roads}=packedDriveWorld({x:480,z:-4040});
 const approach=roads.find(e=>e.id==='5ad84346-6af_0')!,ramp=roads.find(e=>e.id==='c74bed09-107_0')!;
 const pts=[...approach.pts,...ramp.pts.slice(1)];
 const surfaces=[...new Set([...city.surfaceGrid.values()].flat())] as any[];
 for(const hz of [30,60,120]){
  const {player:p,dispose}=actualPlayer(city);p.place(555,-4034,Math.atan2(80.5,4.3));p.speed=120/3.6;
  let peak=0,minGap=0;
  for(let n=0;n<12*hz;n++){
   let best=Infinity,tx=0,tz=0;
   for(let j=0;j<pts.length-1;j++){const a=pts[j],b=pts[j+1],vx=b[0]-a[0],vz=b[1]-a[1],l=vx*vx+vz*vz,u=Math.max(0,Math.min(1,((p.pos.x-a[0])*vx+(p.pos.z-a[1])*vz)/l));const d=Math.hypot(p.pos.x-a[0]-u*vx,p.pos.z-a[1]-u*vz);if(d<best){best=d;tx=vx;tz=vz;}}
   const delta=Math.atan2(Math.sin(Math.atan2(-tx,-tz)-p.yaw),Math.cos(Math.atan2(-tx,-tz)-p.yaw));
   p.update(1/hz,{throttle:1,brake:0,steer:Math.max(-1,Math.min(1,-delta*2)),flyPressed:false,boost:false},n/hz);
   const own=surfaces.filter(s=>s.e?.id===p.lastEdge?.id&&s.roadQuad).map(s=>roadQuadHeight(s.roadQuad,p.pos.x,p.pos.z)).filter(y=>y!==null) as number[];
   if(own.length)minGap=Math.min(minGap,p.pos.y-.55-Math.min(...own));peak=Math.max(peak,p.pos.y-.55);
  }
  console.log({hz,peak,minGap,end:p.pos.toArray()});assert.ok(peak>6.5);assert.ok(p.pos.x<300,'must actually cross ramp join');assert.ok(minGap>-.04);dispose();
 }
});
