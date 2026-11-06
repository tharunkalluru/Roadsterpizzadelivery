import test from 'node:test';
import assert from 'node:assert/strict';
import { packedDriveWorld } from '../fixtures/release-packed-drive-world';
import { actualPlayer } from '../fixtures/actual-player';
import { roadQuadHeight } from '../../src/world/road-surface';
import type { XZ } from '../../src/world/types';

// Two parallel through-roads diverge from each end of the bridge. Test at
// lane width, since checking only graph endpoint heights misses the soffit.
test('Masab Tank: both deck mouths meet the ground and leave traffic clearance on both bypasses', () => {
 const {roads,city}=packedDriveWorld({x:-4540,z:450});
 const deckIds=['72e2e384-7c5_0','4e324c1c-ae5_0'];
 const quads=[...new Set([...city.surfaceGrid.values()].flat())].filter((s:any)=>deckIds.includes(s.e?.id)&&s.roadQuad);
 for(const id of deckIds){
   const road=roads.find(e=>e.id===id)!;
   assert.equal(road.elev![0],0);assert.equal(road.elev!.at(-1),0);assert.ok(Math.max(...road.elev!)>=6.7);
   for(const node of [road.from,road.to]){
     const connected=roads.filter(e=>e.id!==id&&(node===e.from||node===e.to));
     assert.ok(connected.some(e=>e.name==='Masab Tank Road'));
     for(const e of connected)assert.equal(e.elev?.[node===e.from?0:e.pts.length-1]??0,0,e.id);
   }
 }
 let sampled=0;
 for(const e of roads.filter(e=>e.name==='Masab Tank Road')){
   for(let i=1;i<e.pts.length;i++){
     const a=e.pts[i-1],b=e.pts[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz)||1;
     for(let d=0;d<length;d+=2)for(const lateral of [-2.2,0,2.2]){
       const x=a[0]+(d*dx-lateral*dz)/length,z=a[1]+(d*dz+lateral*dx)/length;
       for(const s of quads){
         const height=roadQuadHeight(s.roadQuad,x,z);
         assert.ok(height===null||height<.12||height>=5.75,JSON.stringify({id:e.id,x,z,height}));
       }
       sampled++;
     }
   }
 }
 assert.ok(sampled>2000);
 // Replay from the same Mahavir Marg approach at the speed cap, steering
 // separately onto the level surface branch and the elevated carriageway.
 const approach=roads.find(e=>e.id==='b3b69c85-e8a_0')!;
 const mouth=roads.find(e=>e.id==='b3b69c85-e8a_1')!;
 for(const branch of ['72e2e384-7c5_0','cd18974b-973_0']){
   const target=roads.find(e=>e.id===branch)!;
   const points=[...approach.pts,...mouth.pts.slice(1),...target.pts.slice(1)];
   const marks=[0];for(let i=1;i<points.length;i++)marks.push(marks[i-1]+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));
   const pointAt=(d:number):XZ=>{const i=marks.findIndex(n=>n>d);if(i<1)return points.at(-1)!;const u=(d-marks[i-1])/(marks[i]-marks[i-1]);return [points[i-1][0]+u*(points[i][0]-points[i-1][0]),points[i-1][1]+u*(points[i][1]-points[i-1][1])];};
   for(const hz of [30,60]){
     const {player,dispose}=actualPlayer(city);
     const from=pointAt(0),to=pointAt(8);player.place(...from,Math.atan2(from[0]-to[0],from[1]-to[1]),0);player.speed=120/3.6;
     let bestIndex=0,maxHeight=0,biggestDrop=0;
     for(let i=0;i<9*hz;i++){
       const distance=(p:XZ)=>Math.hypot(player.pos.x-p[0],player.pos.z-p[1]);
       while(bestIndex+1<marks.length&&distance(points[bestIndex+1])<=distance(points[bestIndex]))bestIndex++;
       const target=pointAt(marks[bestIndex]+11),heading=Math.atan2(player.pos.x-target[0],player.pos.z-target[1]);
       const delta=Math.atan2(Math.sin(heading-player.yaw),Math.cos(heading-player.yaw)),before=player.pos.y;
       player.update(1/hz,{throttle:1,brake:0,steer:Math.max(-1,Math.min(1,-delta*4)),flyPressed:false,boost:false},i/hz);
       maxHeight=Math.max(maxHeight,player.pos.y-.55);biggestDrop=Math.max(biggestDrop,before-player.pos.y);
       if(marks[bestIndex]>=260)break;
     }
     console.log({branch,hz,progress:marks[bestIndex],maxHeight,biggestDrop});
     assert.ok(marks[bestIndex]>=260,'Roadster must actually pass through the pictured fork');
     assert.ok(branch===deckIds[0]?maxHeight>6.5:maxHeight<.04,'steered branch must carry Roadster at its own height');
     assert.ok(biggestDrop<.19,'Roadster fell through its chosen carriageway');dispose();
   }
 }
});
