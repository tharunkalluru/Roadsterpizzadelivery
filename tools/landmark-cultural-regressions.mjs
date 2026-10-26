// Offline production geometry and Player simulation. This is deliberately not
// described as a normal-browser landing or complete architectural verification.
import assert from 'node:assert/strict';
import { build } from '../game/node_modules/esbuild/lib/main.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const dir=mkdtempSync(path.join(tmpdir(),'roadster-cultural-'));
try {
  await build({stdin:{contents:"export * from './game/src/world/landmarks'; export * from './game/src/world/landmark_symbols'; export * from './game/src/world/golconda-summit'; export * from './game/src/world/landmark-support'; export * from './game/src/world/landmark-support-capture'; export * from './game/src/core/util'; export {Player} from './game/src/game/player'; export {supportAt} from './game/src/game/physics'; export {Vector3,Group} from './game/node_modules/three/build/three.module.js';",resolveDir:new URL('..',import.meta.url).pathname},outfile:path.join(dir,'m.mjs'),bundle:true,format:'esm',platform:'node'});
  const m=await import(path.join(dir,'m.mjs'));m.initTemplates();
  const names=['st','wall','park','water','roof','lit','glow','road','marks','foot','kerb','shop'];
  const batches=()=>Object.fromEntries(names.map(n=>[n,new m.TiledBatch()]));
  const ctx=B=>({B,obstacle(){},solid(){},road:()=>false,roadY:()=>null});
  // Inspect transformed emitted geometry at a nonzero world anchor, including
  // the wheel winding on all four outward cardinal sides.
  const B=batches(),K=new m.Kit(130,-240,37,ctx(B),12),heads=[],quads=[];
  const originalAdd=B.st.add.bind(B.st),originalQuad=B.st.quad.bind(B.st);
  B.st.add=(...a)=>{if(a[0]===m.TPL.sph&&Math.abs(a[5]/a[4]-1.125)<1e-8)heads.push(a);originalAdd(...a);};
  B.st.quad=(...a)=>{quads.push(a);originalQuad(...a);};
  m.drawLionCapital(K,3,-4,9);
  assert.equal(m.LION_CAPITAL.lions,4);assert.equal(m.LION_CAPITAL.wheelSpokes,24);
  assert.equal(heads.length,4,'four distinct lion heads, not gold boxes');
  assert.equal(quads.length,4*(48+24+24),'one complete24-spoke abacus wheel per lion');
  const centre=K.P(3,-4);
  for(const q of quads){const[a,b,c]=q,ab=b.map((v,i)=>v-a[i]),ac=c.map((v,i)=>v-a[i]),nx=ab[1]*ac[2]-ab[2]*ac[1],nz=ab[0]*ac[1]-ab[1]*ac[0],cx=q.slice(0,4).reduce((s,p)=>s+p[0],0)/4,cz=q.slice(0,4).reduce((s,p)=>s+p[2],0)/4;assert.ok(nx*(cx-centre[0])+nz*(cz-centre[1])>0,'every wheel rim/spoke faces away from the abacus');}
  let low=Infinity,high=-Infinity,verts=0;
  for(const part of B.st.tiles.values()){assert.ok(part.pos.every(Number.isFinite));for(let i=1;i<part.pos.length;i+=3){low=Math.min(low,part.pos[i]);high=Math.max(high,part.pos[i]);}verts+=part.pos.length/3;}
  assert.ok(Math.abs(low-21)<1e-5);assert.ok(Math.abs(high-25.6)<.03,`capital top ${high}`);assert.ok(verts<100000,'two rooftop capitals remain inexpensive merged geometry');
  // Furled cloth must not fabricate the old broad rectangular plain flag.
  const FB=batches(),cloth=[];FB.st.tri=(...a)=>cloth.push(a);m.drawFurledNishanSahib(new m.Kit(0,0,0,ctx(FB)),13,6,18);
  assert.equal(cloth.length,12);for(const q of cloth)assert.ok(q.slice(0,3).flat().every(Number.isFinite));
  const clothX=cloth.flatMap(q=>q.slice(0,3).map(p=>p[0]));assert.ok(Math.max(...clothX)-Math.min(...clothX)<.6,'fold stays close to the flag mast');
  // Actual Golconda model at its catalogue orientation; support/collision are
  // derived from the same emitted geometry used by the streaming city builder.
  const landmark=m.placeLandmarks({lat:17.4063,lon:78.4966}).find(p=>p.id==='golconda');
  const grid=new Map(),buildings=new Map(),GB=batches(),solids=[],gctx={...ctx(m.captureLandmarkBatches(GB,grid,'golconda')),solid:(ring,h)=>solids.push({id:`fort${solids.length}`,cls:'landmark',h,ring})};
  m.drawLandmark(landmark,gctx);
  for(const b of solids){const xs=b.ring.map(p=>p[0]),zs=b.ring.map(p=>p[1]);for(let i=Math.floor(Math.min(...xs)/50);i<=Math.floor(Math.max(...xs)/50);i++)for(let j=Math.floor(Math.min(...zs)/50);j<=Math.floor(Math.max(...zs)/50);j++){const key=`${i},${j}`;if(!buildings.has(key))buildings.set(key,[]);buildings.get(key).push(b);}}
  const frame=new m.Kit(landmark.x,landmark.z,landmark.rot,gctx),roof=m.GOLCONDA_SUMMIT.roof;
  for(const u of [-8,-3,3,8])for(const v of [-6,-4,-2]){const[x,z]=frame.P(u,v);assert.ok(Math.abs(m.landmarkHeightAt(grid,x,z,roof+.1)-roof)<1e-4,'roof support matches the visible slab at every wheel contact');}
  const[ax,az]=frame.P(0,3.35);assert.ok(Math.abs(m.landmarkHeightAt(grid,ax,az,83)-82.5)<1e-4,'upper great opening does not become an invisible full-volume roof');
  const city={surfaceGrid:new Map(),buildingGrid:buildings,landmarkSurfaceGrid:grid,walls:new Map(),obstacles:new Map()},[x,z]=frame.P(-8,-4);
  const player=Object.assign(Object.create(m.Player.prototype),{city,pos:new m.Vector3(x,roof+8.55,z),yaw:Math.atan2(-frame.c,-frame.s),speed:0,vy:0,steerVis:0,flying:true,descending:false,onRoad:false,lastSupport:0,lastKind:'ground',lastElevRoad:false,lastEdge:null,hitCooldown:0,bump:0,flyAlt:roof+8,altT:0,kerbT:0,glide:null,placementRevision:0,roadPitch:0,group:new m.Group(),glow:new m.Group(),light:new m.Group(),wheels:[],wheelRollers:[],animateThrusters(){}});
  const input={throttle:0,brake:0,steer:0,flyPressed:false,boost:false};let tick=0;
  const step=(count,change={})=>{for(let i=0;i<count;i++)player.update(1/60,{...input,...change},tick++/60);};
  step(1,{flyPressed:true});step(240);
  assert.equal(player.flying,false);assert.equal(player.descending,false);assert.equal(player.lastKind,'landmark');assert.ok(Math.abs(player.pos.y-(roof+.55))<1e-4,'Player lands on the visible upper terrace');
  const parkedAt=player.pos.clone();step(78,{throttle:1});step(50,{brake:1});step(120);
  assert.ok(player.pos.distanceTo(parkedAt)>8,'car genuinely drives before parking');assert.ok(Math.abs(player.speed)<.05);assert.ok(Math.abs(player.pos.y-(roof+.55))<1e-4);
  assert.equal(m.supportAt(city,player.pos.x,player.pos.z,roof).kind,'landmark');
  const stopped=player.pos.clone();step(300);assert.ok(player.pos.distanceTo(stopped)<1e-5,'parked car stays supported instead of sinking to ground');
  console.log(`Cultural/Golconda checks passed: four articulated lion heads and four outward24-spoke abacus wheels (${verts}vertices), folded Nishan cloth/spear, visible91.5m roof contacts and production Player landing/9m drive/brake/5s park. Offline simulation, not browser acceptance.`);
} finally {rmSync(dir,{recursive:true,force:true});}
