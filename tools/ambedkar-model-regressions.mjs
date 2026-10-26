// Source-feature guards for the actual emitted model. Fine portrait likeness
// remains a visual review task; these checks catch the old below-head hand.
import assert from 'node:assert/strict';
import {build} from '../game/node_modules/esbuild/lib/main.js';
const bundled=await build({stdin:{contents:"export * from './game/src/world/landmarks';export * from './game/src/world/ambedkar-monument';export * from './game/src/core/util';",resolveDir:new URL('..',import.meta.url).pathname},bundle:true,format:'esm',platform:'node',write:false,logLevel:'error'});
const m=await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);m.initTemplates();
for(const bearing of [0,37,180]) {
 const B=Object.fromEntries(['st','wall','park','water','roof','lit','glow','road','marks','foot','kerb','shop'].map(name=>[name,new m.TiledBatch()]));
 const solids=[],K=new m.Kit(123,-245,bearing,{B,solid:(ring,h)=>solids.push({ring,h}),obstacle(){},road:()=>false,roadY:()=>null},7);
 m.drawAmbedkarMonument(K);assert.equal(K.y0,7,'model restores its caller elevation');
 const points=[];for(const batch of B.st.tiles.values())for(let i=0;i<batch.pos.length;i+=3){const[x,y,z]=batch.pos.slice(i,i+3);assert.ok([x,y,z].every(Number.isFinite));const[u,v]=K.L(x,z);points.push([u,y-7,v]);}
 const top=Math.max(...points.map(p=>p[1]));
 assert.ok(Math.abs(top-53.34)<.002,`published125ft statue+50ft pedestal: ${top}`);
 const raised=points.filter(p=>p[1]>15.24+36.8);
 assert.ok(raised.length>100,'the raised pointing arm extends above the head');
 assert.ok(raised.every(p=>p[0]<-8),'only the subject-right hand reaches above the head');
 assert.ok(solids.some(s=>Math.abs(s.h-(7+15.24))<1e-5),'pedestal terrace collision matches the published base height');
 assert.ok(points.length<60000,'one merged low-poly sculpture keeps bounded geometry');
}
console.log('Ambedkar model: actual53.34m top, above-head subject-right pointing hand,15.24m terrace, finite rotated geometry and bounded vertex budget pass.');
