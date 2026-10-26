import assert from 'node:assert/strict';
import {build} from '../game/node_modules/esbuild/lib/main.js';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
const temp=mkdtempSync(path.join(tmpdir(),'roadster-landmark-source-'));
try{
  const file=path.join(temp,'source.mjs');
  await build({stdin:{contents:"export * from './game/src/world/landmarks.ts';export * from './game/src/world/landmark_catalog.ts';export * from './game/src/world/landmark-corrections.ts';export * from './game/src/world/landmark-source-plans.ts';export * from './game/src/core/util.ts';",resolveDir:new URL('..',import.meta.url).pathname},outfile:file,bundle:true,format:'esm',platform:'node'});
  const m=await import(file),root=new URL('..',import.meta.url);
  const core=JSON.parse(gunzipSync(readFileSync(new URL('game/public/city/core.pack.wasm',root))));
  const snapshot=JSON.parse(readFileSync(new URL('pipeline/evidence/landmark-osm-source-2026-10-26.json',root)));
  const ledger=JSON.parse(readFileSync(new URL('pipeline/evidence/landmark-source-decisions-2026-10-26.json',root)));
  const models=m.placeLandmarks(core.origin),byId=new Map(models.map(l=>[l.id,l])),places=m.placeCatalogue(core.origin);
  assert.equal(models.length,191);assert.equal(places.length,191);
  for(const row of ledger.entries.filter(r=>r.applicationChange)){
    const l=byId.get(row.id),p=places.find(p=>p.id===row.id);
    for(const[k,v]of Object.entries(row.applicationChange.after))assert.equal(m.LANDMARK_CORRECTIONS[row.id][k],v,`${row.id} ${k}: app patch must match recorded review`);
    assert.equal(l.x,p.x);assert.equal(l.z,p.z);assert.equal(l.name,p.name);
  }
  assert.equal(byId.get('purana_pul').name,'Purana Pul Darwaza');assert.equal(places.find(p=>p.id==='purana_pul').icon,'palace');
  assert.equal(byId.get('tcs_synergy').name,'TCS Deccan Park');
  assert.ok(Math.hypot(byId.get('nalsar').lat-17.589392,byId.get('nalsar').lon-78.542882)>.01);
  const expected={tcs_synergy:68883415,dlf:413274269};m.initTemplates();
  for(const[id,way]of Object.entries(expected)){
    const plan=m.MAPPED_LANDMARK_PLANS[id],source=snapshot.elements.find(e=>e.type==='way'&&e.id===way),l=byId.get(id);
    assert.equal(plan.ring.length,source.geometry.length-1);assert.match(plan.heightBasis,/illustrative/);
    const kx=Math.cos(plan.anchor.lat*Math.PI/180)*6380050.094*Math.PI/180,kz=6341141.9*Math.PI/180;
    source.geometry.slice(0,-1).forEach((p,i)=>{assert.ok(Math.abs(plan.ring[i][0]-(p.lon-plan.anchor.lon)*kx)<.0001);assert.ok(Math.abs(plan.ring[i][1]+(p.lat-plan.anchor.lat)*kz)<.0001);});
    // A source concavity inside the bounding rectangle must not clear neighbours.
    const xs=plan.ring.map(p=>p[0]),zs=plan.ring.map(p=>p[1]);let outside=null,inside=null;
    for(let x=Math.min(...xs)+1;x<Math.max(...xs);x+=2)for(let z=Math.min(...zs)+1;z<Math.max(...zs);z+=2){const hit=m.mappedLandmarkClearAt(l,l.x+x,l.z+z);if(hit)inside=[x,z];else outside=[x,z];}
    assert.ok(inside&&outside,'Mapped plans must keep both real footprint and concavities');
    assert.equal(m.inClear(l,l.x+outside[0],l.z+outside[1]),false);assert.equal(m.inClear(l,l.x+inside[0],l.z+inside[1]),true);
    const B=Object.fromEntries(['st','wall','park','water','roof','lit','glow','road','marks','foot','kerb','shop'].map(n=>[n,new m.TiledBatch()]));
    m.drawLandmark(l,{B,solid(){},obstacle(){},road:()=>false,roadY:()=>null,roadNear:()=>({d:0})});
    const emitted=[...B.st.tiles.values()];assert.ok(emitted.some(p=>p.pos.length>1000));
    for(const part of emitted){assert.ok(part.pos.every(Number.isFinite));for(let i=0;i<part.pos.length;i+=3){assert.ok(part.pos[i]>=l.x+Math.min(...xs)-.001&&part.pos[i]<=l.x+Math.max(...xs)+.001);assert.ok(part.pos[i+2]>=l.z+Math.min(...zs)-.001&&part.pos[i+2]<=l.z+Math.max(...zs)+.001);}}
  }
  console.log('Landmark sources: 191 explicit decisions; seven shared map/model corrections; two exact named outlines, bounded geometry and concavity-safe clearance passed.');
}finally{rmSync(temp,{recursive:true,force:true});}
