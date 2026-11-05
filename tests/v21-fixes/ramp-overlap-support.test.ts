import test from 'node:test';
import assert from 'node:assert/strict';
import { supportAt } from '../../src/game/physics';
const surface=(id:string,a:number,b:number,y0:number,y1:number)=>({e:{id,w:8,pts:[[a,0],[b,0]],from:null,to:null,elev:[y0,y1]},kind:'road',ax:a,az:0,bx:b,bz:0,ya:y0,yb:y1,hw:4,roadQuad:[[a,y0,-4],[b,y1,-4],[b,y1,4],[a,y0,4]]});
const city=(surfaces:any[])=>({surfaceGrid:new Map([['0,0',surfaces]]),buildingGrid:new Map(),obstacles:new Map(),waterGrid:new Map(),movingRail:[]}) as any;
test('overlapping lower pavement cannot steal climbing ramp contact',()=>{
 for(const hz of [30,60,120])for(const order of [false,true]){
  const ground=surface('ground',0,29,0,0),ramp=surface('ramp',0,29,0,2.9);
  const c=city(order?[ramp,ground]:[ground,ramp]);let x=0,y=0,road:any;
  for(let i=0;i<20;i++){
   const next=x+33.333333/hz,s=supportAt(c,next,0,y,false,{x,z:0,feet:y,road});
   assert.ok(Math.abs(s.y-next*.1)<1e-7,`lost ramp at ${hz} Hz x=${next}`);x=next;y=s.y;road=s.s?.e;
  }
 }
});
test('continuous pavement cannot teleport onto an overhead flyover',()=>{
 const ground=surface('ground',0,29,0,0),bridge=surface('bridge',0,29,6,6),c=city([bridge,ground]);
 assert.equal(supportAt(c,10,0,0,false,{x:9,z:0,feet:0,road:ground.e as any}).y,0);
 assert.equal(supportAt(c,10,0,6,false,{x:9,z:0,feet:6,road:bridge.e as any}).y,6);
});
test('descending ramp keeps its own contact above an overlapping ground road',()=>{
 const ramp=surface('ramp',0,29,2.9,0),c=city([surface('ground',0,29,0,0),ramp]);
 let x=1,y=2.8;
 for(let i=0;i<25;i++){const s=supportAt(c,x+1,0,y,false,{x,z:0,feet:y,road:ramp.e as any});x++;y=s.y;assert.ok(Math.abs(y-(2.9-x*.1))<1e-7);}
});
test('a shared local endpoint selects the rising ramp when the ground branch descends',()=>{
 const a=surface('approach',0,10,0,1),ramp=surface('ramp',10,29,1,2.9),ground=surface('branch',10,29,1,0);
 a.e.to='join' as any;ramp.e.from='join' as any;ground.e.from='join' as any;
 const c=city([a,ground,ramp]);
 assert.ok(Math.abs(supportAt(c,10.5,0,.95,false,{x:9.5,z:0,feet:.95,road:a.e as any}).y-1.05)<1e-7);
});
test('a source node shared elsewhere cannot pull the car onto another pavement',()=>{
 const a=surface('ground',0,29,0,0),b=surface('other',0,29,.1,.1);
 a.e.to='far' as any;b.e.to='far' as any;
 assert.equal(supportAt(city([b,a]),10,0,0,false,{x:9,z:0,feet:0,road:a.e as any}).y,0);
});
