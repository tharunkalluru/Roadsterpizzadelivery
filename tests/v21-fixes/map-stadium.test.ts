import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { FullMap } from '../../src/ui/map';
import { createStadiumRoadMask } from '../../src/ui/map-stadium';
import { stadiumExclusions } from '../../src/world/stadium-roads';
import { DESTINATION_HERO_PLANS } from '../../src/world/destination-hero-data';

class Path {
  static created = 0;
  commands: (string | number)[][] = [];
  constructor() { Path.created++; }
  rect(x:number,y:number,w:number,h:number) { this.commands.push(['R',x,y,w,h]); }
  moveTo(x:number,y:number) { this.commands.push(['M',x,y]); }
  lineTo(x:number,y:number) { this.commands.push(['L',x,y]); }
  ellipse(x:number,y:number,rx:number,ry:number) { this.commands.push(['E',x,y,rx,ry]); }
  closePath() { this.commands.push(['Z']); }
}
function permits(path:Path,x:number,z:number) {
  let parity=0;
  for(const [kind,a,b,c,d] of path.commands) {
    if(kind==='R'&&x>=Number(a)&&z>=Number(b)&&x<=Number(a)+Number(c)&&z<=Number(b)+Number(d))parity++;
    if(kind==='E'&&((x-Number(a))/Number(c))**2+((z-Number(b))/Number(d))**2<1)parity++;
  }
  return parity%2===1;
}
function withPaths(run:()=>void) {
  const oldPath=globalThis.Path2D,oldDpr=globalThis.devicePixelRatio;
  Object.assign(globalThis,{Path2D:Path,devicePixelRatio:1});
  try{run();}finally{Object.assign(globalThis,{Path2D:oldPath,devicePixelRatio:oldDpr});}
}
const bounds={minX:-30000,maxX:30000,minZ:-30000,maxZ:30000};
test('stadium map mask uses the current city origin and the exact playable bowl dimensions',()=>withPaths(()=>{
  const anchor=DESTINATION_HERO_PLANS.uppal_stadium.anchor;
  const first=createStadiumRoadMask(anchor,bounds) as unknown as Path;
  const ellipse=first.commands.find(c=>c[0]==='E')!;
  assert.ok(Math.abs(Number(ellipse[1]))<1e-9&&Math.abs(Number(ellipse[2]))<1e-9);
  const otherOrigin={lat:anchor.lat-.01,lon:anchor.lon+.01};
  const other=createStadiumRoadMask(otherOrigin,bounds) as unknown as Path,second=other.commands.find(c=>c[0]==='E')!;
  const x=-.01*Math.cos(otherOrigin.lat*Math.PI/180)*6380050.094*Math.PI/180,z=-.01*6341141.9*Math.PI/180;
  assert.ok(Math.abs(Number(second[1])-x)<1e-6);assert.ok(Math.abs(Number(second[2])-z)<1e-6);
  const world=stadiumExclusions(otherOrigin)[0];
  assert.deepEqual(second.slice(1),[world.x,world.z,world.rx,world.rz]);
  assert.equal(permits(other,world.x,world.z),false);assert.equal(permits(other,world.x+world.rx+10,world.z),true);
}));

test('the shipped cached map still has interior source roads and the mask retains every exterior sample',()=>withPaths(()=>{
  const core=JSON.parse(gunzipSync(readFileSync('public/city/core.pack.wasm')).toString());
  const data=JSON.parse(gunzipSync(readFileSync('public/city/map.pack.wasm')).toString());
  const s=stadiumExclusions(core.origin)[0],mask=createStadiumRoadMask(core.origin,core.bounds) as unknown as Path;
  let interior=0,exterior=0;
  for(const lines of Object.values(data.roads) as number[][][])for(const line of lines)for(let i=2;i<line.length;i+=2){
    const ax=line[i-2],az=line[i-1],bx=line[i],bz=line[i+1];
    if(Math.max(ax,bx)<s.x-s.rx-80||Math.min(ax,bx)>s.x+s.rx+80||Math.max(az,bz)<s.z-s.rz-80||Math.min(az,bz)>s.z+s.rz+80)continue;
    for(let u=0;u<=1;u+=.05){const x=ax+(bx-ax)*u,z=az+(bz-az)*u,inside=((x-s.x)/s.rx)**2+((z-s.z)/s.rz)**2<1;
      assert.equal(permits(mask,x,z),!inside);if(inside)interior++;else exterior++;
    }
  }
  assert.ok(interior>0,'the original cached map exercises the reported stadium crossing');assert.ok(exterior>0,'nearby access streets remain visible');
}));

function fixture(){
  const nodes=new Map<string,any>(),root:any={hidden:false,dataset:{},setAttribute(){},querySelector:(id:string)=>nodes.get(id)||nodes.set(id,{hidden:false}).get(id)};
  const calls:{op:string;path?:Path;clip:Path|null;text?:string}[]=[],stack:(Path|null)[]=[];
  let clip:Path|null=null;
  const ctx:any={save(){stack.push(clip);},restore(){clip=stack.pop()??null;},clip(path:Path,rule:string){assert.equal(rule,'evenodd');clip=path;calls.push({op:'clip',path,clip});},
    fill(path?:Path){calls.push({op:'fill',path,clip});},stroke(path?:Path){calls.push({op:'stroke',path,clip});},fillText(text:string){calls.push({op:'text',text,clip});},measureText:(text:string)=>({width:text.length*7})};
  for(const name of ['setTransform','fillRect','setLineDash','beginPath','arc','moveTo','lineTo','closePath','translate','rotate','drawImage','strokeRect','strokeText'])ctx[name]=()=>{};
  const road=new Path(),minor=new Path(),metro=new Path(),bld=new Path(),park=new Path(),water=new Path();
  const buildings:any[]=[];
  const m:any=Object.assign(Object.create(FullMap.prototype),{root,cv:{clientWidth:800,clientHeight:500,width:800,height:500,getContext:()=>ctx,hasPointerCapture:()=>false},
    open:true,dirty:true,focus:{show(){},hide(){}},cx:0,cz:0,scale:.5,t:0,bld,layers:{park,water,roads:[{p:road,w:12,col:'#aaa',min:0}],minor:new Map([['0,0',minor]]),metro:[{p:metro,color:'#f00'}]},
    loading:false,loadError:false,buildP:Promise.resolve(),mapData:{},outlineBuildings:buildings,outlineJob:null,minorPaths:null,
    labelWidths:new Map(),markerView:'',areaLabelView:'',areaLabels:[],places:[],placeCategory:'',selectedPlace:null,markers:[],pointers:new Map(),pinch0:0,gesture:null,pick:null,
    openStarted:0,firstBaseDrawForOpen:false,mapStats:{source:'worker',slices:0,preparationMs:0,maxStepMs:0,sourcePolylines:0,sourcePoints:0,draws:0,firstBaseDrawMs:null},
    zone:{origin:DESTINATION_HERO_PLANS.uppal_stadium.anchor,bounds,roads:[],places:[{name:'Exterior access label',kind:'locality',p:[250,0]}],metro:{lines:[]}},
    src:{mapUrl:'/city/map.pack.wasm',buildings:()=>buildings},state:()=>({player:{x:0,z:0,yaw:0},canMove:true,route:[[0,0,0],[20,0,0]],target:{x:0,z:0,label:'Stadium target'},pickups:[]}),onClose(){}});
  return {m,calls,road,minor,metro,bld};
}
test('actual map drawing clips only road/building layers and reuses the mask after pan, zoom and close/reopen',()=>withPaths(()=>{
  const {m,calls,road,minor,metro,bld}=fixture(),before=Path.created;
  m.draw();const mask=m.stadiumRoadMask as Path;
  assert.equal(Path.created,before+1,'one cached mask is created without rebuilding road paths');
  for(const path of [road,minor,bld])assert.ok(calls.some(c=>c.path===path&&c.clip===mask));
  assert.ok(calls.some(c=>c.op==='stroke'&&c.path===metro&&c.clip===null));
  assert.ok(calls.some(c=>c.op==='stroke'&&c.path===undefined&&c.clip===null),'route and player strokes are outside the road clip');
  assert.ok(calls.some(c=>c.op==='text'&&c.text==='Exterior access label'&&c.clip===null));
  assert.ok(calls.some(c=>c.op==='text'&&c.text==='Stadium target'&&c.clip===null));
  for(let i=0;i<50;i++){m.cx=i;m.scale=.5+i*.01;m.draw();}
  m.close();assert.equal(m.open,false);assert.equal(m.root.hidden,true);const created=Path.created;
  m.show({x:0,z:0,scale:1});m.draw();assert.equal(m.open,true);assert.equal(m.root.hidden,false);assert.equal(m.stadiumRoadMask,mask);assert.equal(Path.created,created);
  assert.equal(m.stadiumRoadMask.commands.filter((c:any)=>c[0]==='E').length,1);
}));
