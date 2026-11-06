import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { packedDriveWorld } from '../fixtures/release-packed-drive-world';
import { actualPlayer } from '../fixtures/actual-player';
import { roadQuadHeight } from '../../src/world/road-surface';
import { supportAt } from '../../src/game/physics';
import { repairReviewedFlyoverTerminals } from '../../src/world/flyover-terminals';

const ids=['c74bed09-107_0','d0978a06-15a_0','8a2c3f45-5c3_0','51be01ba-57f_0'];
test('all eight reviewed flyover mouths meet continuous, level source ground roads',()=>{
 const raw=JSON.parse(gunzipSync(readFileSync('public/city/core.pack.wasm')).toString()).roads;
 const {roads,city}=packedDriveWorld({x:-500,z:-4090});let groundSamples=0;
 for(const id of ids){const ramp=roads.find(r=>r.id===id)!;
  for(const start of [true,false]){const end=start?0:ramp.pts.length-1,node=start?ramp.from:ramp.to;
   assert.ok(Math.abs(ramp.elev![end])<.001,`${id} has a suspended mouth`);
   const branches=raw.filter((e:any)=>e.id!==id&&(e.from===node||e.to===node)&&!e.elev?.some((y:number)=>y>.01));
   assert.ok(branches.length>=2,`${id} must retain its mapped through-road connections`);
   for(const b of branches){const e=roads.find(r=>r.id===b.id)!;
    const points=e.pts.filter(p=>Math.hypot(p[0]-ramp.pts[end][0],p[1]-ramp.pts[end][1])<180);
    for(const p of points){const s=supportAt(city,p[0],p[1],0,true);assert.ok(Math.abs(s.y)<.04,`${b.id}: ground branch became a ramp or ended`);assert.ok(s.onRoad);groundSamples++;
      const index=e.pts.indexOf(p),a=e.pts[Math.max(0,index-1)],ahead=e.pts[Math.min(e.pts.length-1,index+1)],length=Math.hypot(ahead[0]-a[0],ahead[1]-a[1])||1;
      for(const side of [-2.9,0,2.9]){
       const x=p[0]-(ahead[1]-a[1])/length*side,z=p[1]+(ahead[0]-a[0])/length*side;
       const nearby=new Set<any>();for(let u=-1;u<=1;u++)for(let v=-1;v<=1;v++)for(const surface of city.surfaceGrid.get(`${Math.floor(x/30)+u},${Math.floor(z/30)+v}`)||[])nearby.add(surface);
       for(const surface of nearby){if(!ids.includes(surface.e?.id)||!surface.roadQuad)continue;const y=roadQuadHeight(surface.roadQuad,x,z);assert.ok(y===null||y<.12||y>=5.84999,`ramp slab cuts through ground traffic at ${x},${z}: ${y}`);}
      }
     }
   }
  }
 }
 assert.ok(groundSamples>100);console.log({groundSamples});
});
test('the main road beside the eastern Sardar Patel ramp stays drivable at 120 km/h',()=>{
 const {city}=packedDriveWorld({x:480,z:-4040});
 for(const hz of [30,60,120]){
  const {player:p,dispose}=actualPlayer(city);p.place(480,-4037.72,Math.atan2(1,.005));p.speed=120/3.6;
  let maxHeight=0;
  for(let n=0;n<4*hz;n++){
   p.update(1/hz,{throttle:1,brake:0,steer:0,flyPressed:false,boost:false},n/hz);
   maxHeight=Math.max(maxHeight,p.pos.y-.55);
  }
  assert.ok(p.pos.x<370,`blocked main road at ${hz}Hz: ${p.pos.x}`);
  assert.ok(maxHeight<.04,`main road pulled onto flyover: ${maxHeight}`);dispose();
 }
});
test('unreviewed flyovers and surveyed/explicit road profiles are left intact',()=>{
 const e:any={id:'unreviewed',name:'Other Flyover',pts:[[0,0],[100,0]],elev:[0,6.8],from:'a',to:'b',cls:'primary',w:9.4};
 const list=[e];assert.equal(repairReviewedFlyoverTerminals(list,list),list);
});
