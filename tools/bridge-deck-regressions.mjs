// Independent checks of actual production road/deck draw buffers and vehicle
// geometry. Offline component coverage is not normal-world browser driving.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '../game/node_modules/esbuild/lib/main.js';
const root=fileURLToPath(new URL('../',import.meta.url)),temp=await mkdtemp(join(tmpdir(),'roadster-decks-'));
let passed=0;const test=async(name,run)=>{await run();passed++;console.log(`PASS ${name}`);};
// Barycentric interpolation and polygon intersection deliberately do not use the
// production roadQuadHeight or boundary clipper.
function height(t,x,z){const[a,b,c]=t,dx=b[0]-a[0],dz=b[2]-a[2],ex=c[0]-a[0],ez=c[2]-a[2],det=dx*ez-dz*ex;if(Math.abs(det)<1e-10)return null;const px=x-a[0],pz=z-a[2],u=(px*ez-pz*ex)/det,v=(dx*pz-dz*px)/det;return u>=-1e-6&&v>=-1e-6&&u+v<=1.000001?a[1]+u*(b[1]-a[1])+v*(c[1]-a[1]):null;}
const cross=(a,b,p)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
function intersection(poly,tri){const q=tri.map(p=>[p[0],p[2]]),sign=Math.sign(cross(q[0],q[1],q[2]));if(!sign)return[];for(let i=0;i<3&&poly.length;i++){const out=[],a=q[i],b=q[(i+1)%3];for(let j=0;j<poly.length;j++){const p=poly[j],r=poly[(j+1)%poly.length],u=sign*cross(a,b,p),v=sign*cross(a,b,r);if(u>=-1e-8)out.push(p);if((u>=0)!==(v>=0)){const t=u/(u-v);out.push([p[0]+(r[0]-p[0])*t,p[1]+(r[1]-p[1])*t]);}}poly=out;}return poly;}
const triangles=q=>[[q[0],q[1],q[2]],[q[0],q[2],q[3]]];
const unique=g=>[...new Set([...g.values()].flat())];
try{
 await build({stdin:{contents:`export{prepareRoadGrades,roadGradePatches,applyRoadGradePatches,roadGradeReport}from'./src/world/road-grades';export{buildTile}from'./src/world/city';export{trafficPoseClear}from'./src/game/traffic-path';export{RoadGraph}from'./src/game/roadgraph';export{bus,busRouteBoards}from'./src/world/traffic_models';export{initTemplates,rng}from'./src/core/util';export{BoxGeometry,RingGeometry,Color}from'three';`,resolveDir:join(root,'game'),loader:'ts'},outfile:join(temp,'production.mjs'),bundle:true,platform:'node',format:'esm',logLevel:'error'});
 const{prepareRoadGrades,roadGradePatches,applyRoadGradePatches,roadGradeReport,buildTile,trafficPoseClear,RoadGraph,bus,busRouteBoards,initTemplates,rng,BoxGeometry,RingGeometry,Color}=await import(pathToFileURL(join(temp,'production.mjs')));
 initTemplates({rbox:new BoxGeometry(1,1,1),ring:new RingGeometry(1,1.35,20)});
 const ctx=new Proxy({measureText:text=>({width:text.length*8}),createLinearGradient:()=>({addColorStop(){}})},{get:(o,k)=>k in o?o[k]:()=>{}});globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>ctx})};
 const prototype=bus(rng(71)),geometries=[prototype.body.geometry(),prototype.lights.geometry(),...prototype.decals.map(d=>d.geo),...busRouteBoards('QA','CLEARANCE SCALE').map(d=>d.geo)];
 let busTop=-Infinity,busHalfWidth=0;for(const g of geometries){g.computeBoundingBox();busTop=Math.max(busTop,g.boundingBox.max.y);busHalfWidth=Math.max(busHalfWidth,Math.abs(g.boundingBox.min.x),Math.abs(g.boundingBox.max.x));}
 const road=(id,pts,elev,extra={})=>({id,seg:id,name:id,cls:'primary',w:14,lanes:4,oneway:'backward',from:id+'-a',to:id+'-b',pts,elev,maxspeed:null,...extra});
 const zone=roads=>({i:0,j:0,roads,nodes:{},buildings:[],boards:[],furniture:[],areas:[],osm:[]});
 await test('ordinary coplanar deck crossings retain exterior parapets and remove actual visible/collidable road-blocking blades',()=>{
  const a=road('east',[[100,500],[900,500]],[6.8,6.8]),b=road('north',[[500,100],[500,900]],[6.8,6.8]),city=buildTile(zone([a,b]),{lowQ:true}),walls=unique(city.walls).filter(w=>w.kind==='parapet');assert.ok(walls.length>10);
  for(const w of walls)for(let j=0;j<=10;j++){const u=j/10,x=w.ax+(w.bx-w.ax)*u,z=w.az+(w.bz-w.az)*u;assert.ok(!(x>494&&x<506&&z>100&&z<900)&&!(z>494&&z<506&&x>100&&x<900),'no blade enters either through carriageway');}
  const color=new Color('#d4d0dc').toArray();let faces=0;
  for(const buffer of city.buffers.filter(b=>b.mat==='st'))for(let i=0;i<buffer.pos.length;i+=9){if(!color.every((v,k)=>Math.abs(v-buffer.col[i+k])<1e-6))continue;faces++;const p=buffer.pos;for(let j=0;j<=10;j++){const u=j/10,x=p[i]+(p[i+3]-p[i])*u,z=p[i+2]+(p[i+5]-p[i+2])*u;assert.ok(!(x>494&&x<506&&z>100&&z<900)&&!(z>494&&z<506&&x>100&&x<900));}}
  assert.equal(faces,walls.length*2,'each retained collider has exactly two front draw triangles');
 });
 await test('independent low estimated deck crossings get real bus headroom and retain source XY/IDs',()=>{
  const raw=[road('unsafe-upper',[[100,500],[900,500]],[3.4,3.4]),road('lower',[[500,100],[500,900]],null)],model=prepareRoadGrades(raw),r=roadGradeReport(model);
  assert.ok(model[0].elev.every(h=>h>=5.85-1e-8));assert.equal(model[1],raw[1]);assert.equal(raw[0].elev[0],3.4);assert.ok(raw[0].pts.every(p=>model[0].pts.includes(p)));assert.ok(r.bridgeClearance.minimumModelSeparation>=5.84999);assert.ok(5.85-.9>busTop+.4);
 });
 const original=JSON.parse(gunzipSync(await readFile(join(root,'game/public/city/core.pack.wasm')))),before=JSON.stringify(original.roads),model=prepareRoadGrades(original.roads),patches=roadGradePatches(model),graph=new RoadGraph(model),report=roadGradeReport(model);
 await test('city grade controls converge, retain immutable source evidence and explicitly keep unresolved classifications',()=>{
  assert.equal(JSON.stringify(original.roads),before);assert.ok(report.maxModelGrade<.1);assert.ok(model.reduce((v,e)=>Math.max(v,...(e.elev||[0])),0)<35);assert.ok(report.bridgeClearance.relaxationRounds<24);assert.ok(report.bridgeClearance.minimumModelSeparation>=5.84999);assert.ok(report.bridgeClearance.ambiguousJoins>0);assert.ok(report.bridgeClearance.ambiguities.every(a=>a.roads.length===2&&a.reason));assert.equal(report.mappedLevelRoads,8);
 });
 const p=original.packs.find(p=>p.tiles.some(([i,j])=>i===-15&&j===-4)),pack=JSON.parse(gunzipSync(await readFile(join(root,'game/public/city',p.file)))),raw=pack.tiles['-15_-4'],built=buildTile({...raw,roads:applyRoadGradePatches(raw.roads,patches)},{lowQ:true,metro:original.metro});
 const sourceSurfaces=unique(built.surfaceGrid).filter(s=>s.roadQuad&&s.e),upper=sourceSurfaces.filter(s=>s.e.id==='0929bcb7-462_0').flatMap(s=>triangles(s.roadQuad));
 const actualSoffits=[],color=new Color('#a9a4b5').toArray();
 for(const buffer of built.buffers.filter(b=>b.mat==='st'))for(let i=0;i<buffer.pos.length;i+=9){if(!color.every((v,k)=>Math.abs(v-buffer.col[i+k])<1e-6))continue;const t=[0,3,6].map(j=>[buffer.pos[i+j],buffer.pos[i+j+1],buffer.pos[i+j+2]]);if(t.every(p=>upper.some(q=>{const y=height(q,p[0],p[2]);return y!==null&&Math.abs(p[1]-y+.9)<.025;})))actualSoffits.push(t);}
 await test('actual sourced PJR soffit meshes clear the full Gachibowli road intersections and the production bus roof',()=>{
  assert.ok(actualSoffits.length>10);let pairs=0,minGap=Infinity;
  for(const id of ['c898d540-669_0','ac6bc470-258_0'])for(const s of sourceSurfaces.filter(s=>s.e.id===id))for(const lower of triangles(s.roadQuad))for(const upper of actualSoffits){
   const points=intersection(lower.map(p=>[p[0],p[2]]),upper);if(points.length<3)continue;const area=Math.abs(points.reduce((v,p,i)=>{const q=points[(i+1)%points.length];return v+p[0]*q[1]-q[0]*p[1];},0))/2;if(area<.02)continue;pairs++;
   for(const[x,z]of points){const a=height(upper,x,z),b=height(lower,x,z);if(a!==null&&b!==null)minGap=Math.min(minGap,a-b);}
  }
  assert.ok(pairs>10);assert.ok(minGap>=4.8,`rendered PJR headroom ${minGap}m`);assert.ok(minGap-busTop>.4,`actual bus roof ${busTop}m`);
  console.log('PJR_RENDERED_BUS_CLEARANCE',JSON.stringify({tile:'-15_-4',pack:p.file,upper:'0929bcb7-462_0',lower:['c898d540-669_0','ac6bc470-258_0'],intersectedTrianglePairs:pairs,minimumPhysicalSoffitHeadroom:minGap,actualBusRoof:busTop,actualBusWidth:busHalfWidth*2,roofMargin:minGap-busTop}));
 });
 await test('actual bus and car collision footprints remain clear on both source Gachibowli approaches',()=>{
  for(const id of ['c898d540-669_0','ac6bc470-258_0']){const e=graph.byId.get(id);assert.ok(e);const hits=graph.nearestEdges(-14125.757,-3592.763,2).filter(g=>g.e.id===id);assert.ok(hits.length);let best={d:Infinity,s:0},acc=0;
   for(let i=1;i<e.e.pts.length;i++){const a=e.e.pts[i-1],b=e.e.pts[i],dx=b[0]-a[0],dz=b[1]-a[1],L=Math.hypot(dx,dz),u=Math.max(0,Math.min(1,((-14125.757-a[0])*dx+(-3592.763-a[1])*dz)/(L*L||1))),d=Math.hypot(-14125.757-a[0]-dx*u,-3592.763-a[1]-dz*u);if(d<best.d)best={d,s:acc+u*L};acc+=L;}
   for(const offset of [-12,-6,0,6,12]){const pose=graph.pointAt(e,best.s+offset,1,2.2);assert.equal(trafficPoseClear(built,pose,[busHalfWidth*2,prototype.size[1],prototype.size[2]]),true,`${id} actual bus pose ${offset}m`);assert.equal(trafficPoseClear(built,pose,[2,1.5,4.9]),true);}
  }
 });
 await test('actual tile-only pedestrian landing surface cannot retain the two low approach panels from the full source audit',async()=>{
  const pack=JSON.parse(gunzipSync(await readFile(join(root,'game/public/city/packs/p-2_-1.pack.wasm')))),raw=pack.tiles['-4_-3'];
  const city=buildTile({...raw,roads:applyRoadGradePatches(raw.roads,patches),buildings:[],boards:[],furniture:[],areas:[],osm:[]},{lowQ:true});
  const surfaces=unique(city.surfaceGrid).filter(s=>s.e?.id==='eef067f9-d2b_0'&&s.roadQuad);assert.ok(surfaces.length>0);assert.equal(surfaces[0].e.cls,'pedestrian');
  let probes=0;for(const wall of unique(city.walls).filter(w=>w.kind==='parapet')){if(Math.hypot((wall.ax+wall.bx)/2+3551,(wall.az+wall.bz)/2+2695)>35)continue;
   for(let j=0;j<=12;j++){const u=j/12,x=wall.ax+(wall.bx-wall.ax)*u,z=wall.az+(wall.bz-wall.az)*u,bottom=wall.y0a+(wall.y0b-wall.y0a)*u,top=wall.y1a+(wall.y1b-wall.y1a)*u;
    for(const s of surfaces){const q=s.roadQuad.map((p,i)=>{const o=s.roadQuad[[3,2,1,0][i]],dx=o[0]-p[0],dz=o[2]-p[2],L=Math.hypot(dx,dz)||1;return[p[0]+dx/L*.35,p[1],p[2]+dz/L*.35];});const y=height([q[0],q[1],q[2]],x,z)??height([q[0],q[2],q[3]],x,z);if(y===null)continue;probes++;assert.ok(!(top>y+.12&&bottom<y+4.8),'panel intrudes into the low pedestrian ramp landing surface');}
   }
  }
  console.log('PEDESTRIAN_APPROACH_CLEARANCE',JSON.stringify({tile:'-4_-3',source:'eef067f9-d2b_0',sourceClass:'pedestrian',roadQuads:surfaces.length,remainingPanelInteriorProbes:probes}));
 });
 console.log(`${passed} bridge deck/vehicle regression groups passed (actual source meshes; no browser driving claimed).`);
}finally{delete globalThis.document;await rm(temp,{recursive:true,force:true});}
