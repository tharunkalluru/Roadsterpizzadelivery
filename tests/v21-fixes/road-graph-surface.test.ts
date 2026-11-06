import test from 'node:test';import assert from 'node:assert/strict';
import {RoadGraph}from'../../src/game/roadgraph';import{RoadGraphSurfaceCache}from'../../src/game/road-graph-surface';
import{roadRibbon}from'../../src/world/bridge-clearance';import{roadQuadHeight}from'../../src/world/road-surface';import{buildTile}from'../../src/world/city';import{initTemplates}from'../../src/core/util';
import{EmittedPlayerGeometry}from'../fixtures/emitted-player-contact';import{legacyPointAt}from'../fixtures/legacy-roadgraph-point-at';import type{RoadEdge}from'../../src/world/types';
const fixture=(id='curve',height=0):RoadEdge=>({id,seg:id,cls:'primary',name:null,w:9.6,lanes:3,oneway:'backward',from:id+'a',to:id+'b',pts:[[100,100],[130,100],[150,110],[180,110]],elev:[height,height+2.25,height+3.4,height+5.6],maxspeed:40});
test('lane roots match actual emitted triangles on a changing-grade curve with exact old XZ/heading',()=>{
 initTemplates();const e=fixture(),graph=new RoadGraph([e]),g=graph.byId.get(e.id)!;
 const built=buildTile({i:0,j:0,roads:[e],nodes:{},buildings:[],boards:[],furniture:[],areas:[],osm:[]},{lowQ:true});const emitted=new EmittedPlayerGeometry({minX:80,maxX:200,minZ:80,maxZ:140});emitted.collect(built);
 let maxLegacyError=0,maxCorrectedError=0,samples=0;
 for(const dir of[1,-1]as const)for(const lateral of[-3.2,0,3.2])for(let s=.75;s<g.len-.75;s+=.45){const actual=graph.pointAt(g,s,dir,lateral),old=legacyPointAt(g,s,dir,lateral);for(const key of['x','z','hx','hz']as const)assert.ok(Object.is(actual[key],old[key]),key+' changed');const surface=emitted.frame(actual.x,actual.z).nearestSupport(actual.x,actual.z,actual.y);assert.ok(surface,'missing actual finite asphalt');maxLegacyError=Math.max(maxLegacyError,Math.abs(old.y-surface.y));maxCorrectedError=Math.max(maxCorrectedError,Math.abs(actual.y-surface.y));samples++;}
 assert.ok(maxLegacyError>.01,'negative control must reproduce old scalar lane-Y mismatch');assert.ok(maxCorrectedError<.001,'new root must match independently emitted Float32 asphalt');assert.ok(samples>900);assert.equal(emitted.counts.missingLift,0);
});
test('flat and overhead layers stay exact; off-own-road and remote loop sheets cannot supply another height',()=>{
 const e={...fixture(),elev:[0,0,0,0]},upper={...fixture('upper'),elev:[6.8,6.8,6.8,6.8]},graph=new RoadGraph([e,upper]);
 for(const id of[e.id,upper.id]){const g=graph.byId.get(id)!;for(const dir of[1,-1]as const)for(const lateral of[-100,-3.2,0,3.2,100])for(let s=0;s<=g.len;s+=.37)assert.deepEqual(graph.pointAt(g,s,dir,lateral),legacyPointAt(g,s,dir,lateral));}
 const variable=fixture('variable'),far={...fixture('foreign'),pts:variable.pts.map(([x,z])=>[x,z+100]as[number,number]),elev:[20,20,20,20]},other=new RoadGraph([variable,far]),g=other.byId.get(variable.id)!;assert.equal(other.pointAt(g,20,1,-100).y,legacyPointAt(g,20,1,-100).y);
 const loop:RoadEdge={...fixture('loop'),pts:[[0,0],[10,0],[20,20],[0,20],[0,0],[10,0]],elev:[0,.5,2,4,6,6.5]},lg=new RoadGraph([loop]),le=lg.byId.get(loop.id)!;assert.ok(lg.pointAt(le,5,1,0).y<1,'a later part of the same source road is not the selected segment');
});
test('only attached ramps invalidate ORR cached ribbons when added, removed or replaced',()=>{
 const own={...fixture('orr'),cls:'motorway',name:'Outer Ring Road',w:13,expressway:{controlled:true}}as RoadEdge,graph=new RoadGraph([own]),g=graph.byId.get(own.id)!;
 graph.pointAt(g,12,1,7.2);const cache=(graph as any).roadSurfaces,before=cache.entries.get(own).quads;
 const ramp:RoadEdge={...fixture('ramp'),cls:'motorway_link',from:own.from,to:'exit',pts:[[100,100],[120,80]],elev:null};graph.addRoads([ramp]);assert.equal(cache.entries.has(own),false);graph.pointAt(g,12,1,7.2);const after=cache.entries.get(own).quads;assert.notEqual(after,before);assert.deepEqual(after,roadRibbon(own,[own,ramp]).quads);
 const unrelated={...ramp,id:'unrelated',from:'other-start',to:'other-end'};graph.addRoads([unrelated]);assert.equal(cache.entries.get(own).quads,after,'a distant edge must not flush a warm road');graph.removeRoads([ramp.id]);assert.equal(cache.entries.has(own),false);graph.pointAt(g,12,1,7.2);assert.deepEqual(cache.entries.get(own).quads,before);
 const replacement={...ramp,to:own.to,from:'entry'};graph.addRoads([replacement]);assert.equal(cache.entries.has(own),false);graph.pointAt(g,12,1,7.2);assert.deepEqual(cache.entries.get(own).quads,roadRibbon(own,[own,replacement]).quads);
});
test('ribbon residency stays inside both edge and point budgets during a long drive',()=>{
 const cache=new RoadGraphSurfaceCache();for(let n=0;n<180;n++){const e:RoadEdge={...fixture('long'+n),pts:Array.from({length:501},(_,i)=>[i*.5,n*12]as[number,number]),elev:Array.from({length:501},(_,i)=>i*.01)};cache.add(e);cache.height(e,0,.25,n*12,.005);assert.ok((cache as any).entries.size<=RoadGraphSurfaceCache.MAX_EDGES);assert.ok((cache as any).pointCount<=RoadGraphSurfaceCache.MAX_POINTS);}
 assert.ok((cache as any).entries.size<180);
});

test('allocation-free shared quad sampler retains exact triangle order, tolerance and numerical results',()=>{
 const legacy=(q:any,x:number,z:number)=>{for(const[a,b,c]of[[q[0],q[1],q[2]],[q[0],q[2],q[3]]]){const bx=b[0]-a[0],bz=b[2]-a[2],cx=c[0]-a[0],cz=c[2]-a[2],det=bx*cz-bz*cx;if(Math.abs(det)<1e-9)continue;const px=x-a[0],pz=z-a[2],u=(px*cz-pz*cx)/det,v=(bx*pz-bz*px)/det;if(u>=-1e-6&&v>=-1e-6&&u+v<=1.000001)return a[1]+u*(b[1]-a[1])+v*(c[1]-a[1]);}return null;};
 for(const scale of[1e-6,.5,1,10000])for(let n=0;n<70;n++){const q:any=[[0,Math.sin(n),0],[scale,Math.cos(n),.1*scale],[1.1*scale,Math.sin(n+1),scale],[-.1*scale,Math.cos(n+1),.9*scale]];for(const u of[-1e-6,0,.5,1,1.000001])for(const v of[-1e-6,0,.5,1,1.000001])assert.ok(Object.is(roadQuadHeight(q,u*scale,v*scale),legacy(q,u*scale,v*scale)));}
 const collapsed:any=[[0,0,0],[1e-12,1,0],[0,2,1e-12],[0,3,1e-12]];assert.equal(roadQuadHeight(collapsed,0,0),null);
});
