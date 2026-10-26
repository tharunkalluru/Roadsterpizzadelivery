import assert from 'node:assert/strict';
import { build } from '../game/node_modules/esbuild/lib/main.js';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
const temp = mkdtempSync(path.join(tmpdir(), 'roadster-landmarks-'));
try {
  const entry = path.join(temp, 'landmarks.mjs');
  await build({ stdin: { contents: "export * from './game/src/world/landmarks.ts'; export * from './game/src/world/landmark_catalog.ts'; export * from './game/src/world/indian_flag.ts'; export * from './game/src/world/landmark_symbols.ts'; export * from './game/src/ui/landmark-icons.ts'; export * from './game/src/core/util.ts'; export * from './game/src/ui/map.ts';", resolveDir: new URL('..', import.meta.url).pathname }, outfile: entry, bundle: true, platform: 'node', format: 'esm' });
  const { placeLandmarks, placeCatalogue, assignRenderTiles, layoutPlaceMarkers, hitPlaceMarker, INDIAN_FLAG, chakraFaces, drawIndianFlag, drawNilaChakra, JAGANNATH_HEIGHT, NILA_CHAKRA_SPOKES, initTemplates, TiledBatch, drawLandmark, TPL, FullMap } = await import(entry);
  const core = JSON.parse(gunzipSync(readFileSync(new URL('../game/public/city/core.pack.wasm', import.meta.url))));
  const tiles = core.packs.flatMap((p) => p.tiles), keys = new Set(tiles.map(([i,j]) => `${i}_${j}`));
  const places = placeCatalogue(core.origin), models = placeLandmarks(core.origin, tiles);
  assert.equal(places.length, 191); assert.equal(new Set(places.map((p) => p.id)).size, 191);
  assert.equal(models.length, 191); assert.deepEqual(new Set(models.map((p) => p.id)), new Set(places.map((p) => p.id)));
  for (const p of places) { assert.ok([p.lat,p.lon,p.x,p.z].every(Number.isFinite), p.name); assert.ok(p.icon && p.category); assert.ok(p.x >= core.bounds.minX && p.x <= core.bounds.maxX && p.z >= core.bounds.minZ && p.z <= core.bounds.maxZ, p.name); }
  const byId = new Map(models.map((p) => [p.id,p]));
  for (const p of places) { const m=byId.get(p.id); assert.equal(p.x,m.x); assert.equal(p.z,m.z); assert.ok(keys.has(m.renderTile.join('_')),p.name); }
  const osman = byId.get('osman_sagar'); assert.equal(osman.lat,17.375261); assert.equal(osman.lon,78.303112); assert.deepEqual(osman.renderTile,[-20,3]);
  assert.deepEqual(assignRenderTiles([{x:1200,z:1300}],[[1,1],[0,1]])[0].renderTile,[1,1]);
  assert.deepEqual(assignRenderTiles([{x:1000,z:1000}],[[0,1],[1,0]])[0].renderTile,[0,1]);
  // City-wide clustering never drops a catalogue ID; selected landmarks lead their cluster at any zoom.
  const view = {cx:-4500,cz:0,scale:0.012,width:1200,height:1000};
  const markers=layoutPlaceMarkers(places,view,'charminar');
  assert.equal(markers.flatMap((p)=>p.members).length,191); assert.equal(new Set(markers.flatMap((p)=>p.members.map((x)=>x.id))).size,191);
  assert.ok(markers.length<191); assert.ok(markers.some((p)=>p.place.id==='charminar'));
  for (const p of places) assert.ok(layoutPlaceMarkers([p],{cx:p.x,cz:p.z,scale:1,width:390,height:844})[0].place.id===p.id);
  const marker=markers[0]; assert.equal(hitPlaceMarker([marker],marker.x+21,marker.y+21),marker); assert.equal(hitPlaceMarker([marker],marker.x+23,marker.y),undefined);
  // Specification and actual emitted model geometry, including both outward-facing normals and arbitrary Kit frame.
  assert.equal(INDIAN_FLAG.ratio,1.5); assert.equal(INDIAN_FLAG.spokes,24);
  const faces=chakraFaces(3), spokes=faces.filter((f)=>f.kind==='spoke'); assert.equal(spokes.length,24);
  for (let i=0;i<24;i++) { const [a,,,b]=spokes[i].points; const angle=Math.atan2(b[1]-a[1],b[0]-a[0]); assert.ok(Math.abs(Math.sin(angle-i*Math.PI/12))<1e-10); }
  const boxes=[],quads=[];
  drawIndianFlag({ y0:7, P:(u,v)=>[u,-v], box:(...args)=>boxes.push(args), k:{B:{st:{quad:(...args)=>quads.push(args)}}}},1,0,88,30);
  assert.equal(boxes.length,3); assert.equal(boxes[0][3]/(boxes[0][4]*3),1.5);
  assert.deepEqual(boxes.map((b)=>b[6]),['#ff9933','#ffffff','#138808']);
  for (let i=0;i<3;i++) { assert.equal(boxes[i][3],30); assert.equal(boxes[i][4],20/3); assert.ok(Math.abs(boxes[i][2]-(88-(i+1)*20/3))<1e-10); }
  assert.equal(quads.length,faces.length*2);
  for (const [index,q] of quads.entries()) { const [a,b,c]=q, nz=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]); assert.ok(nz*a[2]>0,'every wheel face, including spokes, must face away from cloth'); for(const v of q.slice(0,4)) assert.ok(Math.abs(v[2])>.15); }
  const ys=quads.flatMap((q)=>q.slice(0,4).map((v)=>v[1])); assert.ok(Math.abs((Math.min(...ys)+Math.max(...ys))/2-(7+78))<1e-9);
  assert.equal(NILA_CHAKRA_SPOKES,8); assert.ok(Math.abs(JAGANNATH_HEIGHT-21.9456)<1e-10);
  const nila=[]; drawNilaChakra({y0:0,P:(u,v)=>[u,-v],k:{B:{st:{quad:(...args)=>nila.push(args)}}}},0,0,1,1);
  assert.equal(nila.length,(32+8+16)*2);
  for(const q of nila) {const[a,b,c]=q;const nz=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);assert.ok(nz*a[2]>0,'Nilachakra faces must point outward');}
  assert.equal(byId.get('jagannath').rot,90,'Temple trust documents east-facing front');
  // Every registered recipe emits finite actual geometry. This is a rendering guard, not visual/source verification.
  initTemplates();
  for (const m of models) {
    const B=Object.fromEntries(['st','wall','park','water','roof','lit','glow','road','marks','foot','kerb','shop'].map((k)=>[k,new TiledBatch()]));
    const solids=[]; drawLandmark(m,{B,obstacle(){},solid:(ring,h)=>solids.push([ring,h]),road:()=>false,roadY:()=>null,roadNear:()=>null,sign(){}});
    let emitted=0;
    for (const batch of Object.values(B)) for (const part of batch.tiles.values()) { assert.ok(part.pos.every(Number.isFinite),m.name); emitted+=part.pos.length; }
    assert.ok(emitted>0,m.name);
    if(m.id==='charminar') {let top=-Infinity; for(const batch of Object.values(B)) for(const part of batch.tiles.values()) for(let i=1;i<part.pos.length;i+=3) top=Math.max(top,part.pos[i]); assert.ok(Math.abs(top-48.7)<1e-4,'Charminar max rendered tower height follows both official references');}
    assert.ok(solids.every(([ring,h])=>Number.isFinite(h)&&ring.flat().every(Number.isFinite)),m.name);
  }
  // Charminar's four great openings = archBig(55%) ×20m panel =11m.
  const widths=[]; const noop=()=>{}; const fake=new Proxy({add:(t,x,y,z,sx)=>{if(t===TPL.archBig)widths.push(sx);}}, {get:(o,k)=>o[k]||noop});
  drawLandmark(byId.get('charminar'),{B:{st:fake,park:fake},obstacle:noop,solid:noop,road:()=>false,roadY:()=>null});
  assert.equal(widths.length,4); assert.ok(widths.every((w)=>Math.abs(w*.55-11)<1e-10));
  const statueColors=new Set(); const colorBatch={box:(...args)=>statueColors.add(args[6]),add:(...args)=>statueColors.add(args[7])};
  drawLandmark(byId.get('thalli'),{B:{st:colorBatch},obstacle:()=>{},solid:()=>{},road:()=>false,roadY:()=>null,sign:()=>{}});
  assert.ok(statueColors.has('#287540')&&statueColors.has('#ac3038'),'Official Thalli reference has green sari and red blouse, not generic gold');
  // Subject-right is positive u in the Kit frame, hence viewer-left in a direct front view.
  const thalliBoxes=[],buddhaBoxes=[],buddhaAdds=[];const poseBatch=(out,adds)=>({box:(...args)=>out.push(args),add:(...args)=>adds?.push(args)}),poseCtx=(out,adds)=>({B:{st:poseBatch(out,adds),park:poseBatch(out,adds)},obstacle:()=>{},solid:()=>{},road:()=>false,roadY:()=>null,sign:()=>{}});
  drawLandmark({...byId.get('thalli'),x:0,z:0,rot:0},poseCtx(thalliBoxes));
  drawLandmark({...byId.get('buddha'),x:0,z:0,rot:0},poseCtx(buddhaBoxes,buddhaAdds));
  assert.ok(thalliBoxes.some((b)=>b[0]>1.5&&b[1]>13&&b[3]===.6&&b[5]===.25),'Thalli raised right palm must be subject-right');
  const cropStems=thalliBoxes.filter((b)=>b[3]===.06&&b[4]>=2.5); assert.equal(cropStems.length,5); assert.ok(cropStems.every((b)=>b[0]<0),'Thalli crop bundle must be in subject-left hand');
  assert.ok(buddhaBoxes.some((b)=>b[0]>1.5&&b[1]>20&&b[3]===.5),'Buddha raised right palm must be subject-right');
  assert.ok(buddhaBoxes.some((b)=>b[0]<-1&&b[1]>19&&b[3]===.8),'Buddha left hand holds the robe near the collar');
  assert.ok(buddhaAdds.some((a)=>a[0]===TPL.box&&a[1]<0&&a[5]>3.5&&a[8]?.rz<0),'Buddha left forearm must bend towards the collar');
  const m=Object.assign(Object.create(FullMap.prototype),{close:()=>{throw Error('typing must not close');}});
  for (const code of ['KeyM','KeyP','Equal','Minus']) m.handleKey({code,key:code==='Equal'?'+':'m',target:{closest:()=>({})}});
  const audit=JSON.parse(readFileSync(new URL('../docs/landmark-audit.json',import.meta.url))); assert.deepEqual(new Set(audit.entries.map((p)=>p.id)),new Set(places.map((p)=>p.id))); assert.equal(audit.summary.renderOwnersIndexed,191);
  console.log('Landmark regressions: all 191 catalogue/model identities, bounds/ownership, cluster discoverability, touch hit regions, flag specification/two-sided wheel, finite 191-model geometry, 48.7m towers, 8-spoke Nilachakra, 11m Charminar arches subject-right statue poses and map search keyboard guards passed.');
} finally { rmSync(temp,{recursive:true,force:true}); }
