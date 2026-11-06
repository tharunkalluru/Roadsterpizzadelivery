import test from 'node:test';import assert from 'node:assert/strict';
import {excludeStadiumRoads,stadiumExclusionsAt,insideStadium,stadiumExclusions} from '../../src/world/stadium-roads';
import {RoadGraph} from '../../src/game/roadgraph';import type {RoadEdge} from '../../src/world/types';
import {readFileSync} from 'node:fs';import {gunzipSync} from 'node:zlib';
const road=(id:string,pts:[number,number][],elev:number[]|null=null):RoadEdge=>({id,seg:id,name:'Street',cls:'residential',w:8,lanes:2,oneway:null,from:id+'a',to:id+'b',pts,elev,maxspeed:40});
test('stadium clips through-roads even with both original endpoints outside; traffic graph has no pitch crossing',()=>{
 const s=stadiumExclusionsAt(0,0),r=road('through',[[-400,0],[400,0]]),clipped=excludeStadiumRoads([r],s);
 assert.equal(clipped.length,2);assert.equal(clipped[0].from,r.from);assert.equal(clipped[0].to,null);assert.equal(clipped[1].from,null);assert.equal(clipped[1].to,r.to);
 for(const e of clipped)for(let i=1;i<e.pts.length;i++)for(let u=0;u<=1;u+=.05){const a=e.pts[i-1],b=e.pts[i];assert.equal(insideStadium(s[0],a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u),false);}
 const g=new RoadGraph(clipped);assert.equal(g.edges.length,2);assert.equal(g.nodes.get(r.from!)!.out.length,1);assert.ok(!g.nodes.get(r.to!)!.out.some(o=>o.edge.e.id===r.id));
});
test('interior road is removed but perimeter road, elevated crossing, source and context data are retained',()=>{
 const s=stadiumExclusionsAt(0,0),inside=road('inside',[[-20,0],[20,0]]),outside=road('outer',[[-400,400],[400,400]]),bridge=road('bridge',[[-400,0],[400,0]],[8,8]);
 const result=excludeStadiumRoads([inside,outside,bridge],s);assert.deepEqual(result,[outside,bridge]);assert.deepEqual(inside.pts,[[-20,0],[20,0]]);
 assert.equal(excludeStadiumRoads([outside],s)[0],outside);
});
test('actual stadium coordinates use the same catalogue anchor and model-sized exclusion',()=>{
 const s=stadiumExclusions({lat:17.4,lon:78.48})[0];assert.ok(s.x>7000&&s.x<8000);assert.ok(s.z<0&&s.z>-1000);assert.ok(s.rx>150&&s.rx<190);assert.ok(s.rz>200&&s.rz<240);
});
test('shipped Uppal core and streamed streets contain no remaining at-grade route through the bowl',()=>{
 const core=JSON.parse(gunzipSync(readFileSync('public/city/core.pack.wasm')).toString()),s=stadiumExclusions(core.origin),center=s[0],keys=new Set<string>();
 for(let x=Math.floor((center.x-center.rx)/1000);x<=Math.floor((center.x+center.rx)/1000);x++)for(let z=Math.floor((center.z-center.rz)/1000);z<=Math.floor((center.z+center.rz)/1000);z++)keys.add(`${x}_${z}`);
 const original:RoadEdge[]=[...core.roads];
 for(const pack of core.packs.filter((p:any)=>p.tiles.some(([x,z]:number[])=>keys.has(`${x}_${z}`)))){
  const data=JSON.parse(gunzipSync(readFileSync('public/city/'+pack.file)).toString());
  for(const [key,tile] of Object.entries(data.tiles) as [string,any][])if(keys.has(key))original.push(...tile.roads);
 }
 const crosses=(e:RoadEdge)=>e.pts.slice(1).some((b,i)=>{const a=e.pts[i];for(let u=0;u<=1;u+=.05)if((e.elev?.[i]||0)+((e.elev?.[i+1]||0)-(e.elev?.[i]||0))*u<1.5&&insideStadium(center,a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u))return true;return false;});
 assert.ok(original.some(crosses),'real input exercises the reported interior roads');
 const fixed=excludeStadiumRoads(original,s);assert.equal(fixed.filter(crosses).length,0);
});
