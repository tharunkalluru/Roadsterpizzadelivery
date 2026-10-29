import test from 'node:test';
import assert from 'node:assert/strict';
import { RailwayMapLayer, railwayMapLayer, drawRailways, type RailwayMapTrack } from '../../src/ui/railway-map';
import { railwayNetwork } from '../../src/world/railway-geometry';
import { Game } from '../../src/game/game';

class Path {
  static made = 0; static commands = 0;
  commands: [string,number,number][] = [];
  constructor() { Path.made++; }
  moveTo(x:number,z:number) { Path.commands++; this.commands.push(['M',x,z]); }
  lineTo(x:number,z:number) { Path.commands++; this.commands.push(['L',x,z]); }
}
const PathType = Path as unknown as typeof Path2D;
const tracks:RailwayMapTrack[] = [
  {pts:[[-800,0],[800,0]],service:false},
  {pts:[[10,-20],[10,20]],service:true},
  {pts:[[3000,3000],[3100,3000]],service:false},
];

test('full railway map retains every canonical line and separates yard paths without bridging different tracks',()=>{
  const source=railwayNetwork().profiles,layer=railwayMapLayer(source,PathType),paths=layer.all();
  assert.equal(layer.trackCount,source.length);assert.equal(paths.length,2);
  for(const service of [false,true]){
    const expected=source.filter(t=>t.service===service).flatMap(t=>t.pts.map((p,i)=>[i?'L':'M',p[0],p[1]]));
    assert.deepEqual((paths.find(p=>p.service===service)!.path as unknown as Path).commands,expected);
  }
  const made=Path.made;assert.equal(railwayMapLayer(source,PathType),layer);assert.equal(layer.all(),paths);assert.equal(Path.made,made);
});

test('nearby tracks include spans crossing the view with both endpoints outside, and native paths are reused while panning',()=>{
  const layer=new RailwayMapLayer(tracks,PathType),near=layer.nearby(0,0,100);
  assert.equal(near.length,2);assert.ok(near.some(p=>p.service));
  assert.deepEqual((near.find(p=>!p.service)!.path as unknown as Path).commands,[['M',-800,0],['L',800,0]]);
  const made=Path.made;assert.equal(layer.nearby(5,5,100),near);assert.equal(Path.made,made);
  const far=layer.nearby(3000,3000,100);assert.equal(far.length,1);assert.equal(far[0].service,false);
  assert.equal(layer.nearby(0,0,100)[0].path,near[0].path,'returning to a region retains native paths');
});

test('cold full-map railway preparation yields at most512 native path commands and shares partial work',()=>{
  const source:RailwayMapTrack[]=[{pts:Array.from({length:2050},(_,i)=>[i,i/2] as [number,number]),service:false}];
  const layer=new RailwayMapLayer(source,PathType),job=layer.prepareAll();let slices=0;
  while(true){const before=Path.commands,next=job.next();assert.ok(Path.commands-before<=512);if(next.done)break;slices++;}
  assert.ok(slices>=4);const paths=layer.all(),made=Path.made;
  assert.equal((paths[0].path as unknown as Path).commands.length,2050);assert.equal(layer.prepareAll().next().done,true);assert.equal(Path.made,made);
});

function context(){
  const calls:{path?:Path2D;dash:number[];width:number;color:string;alpha:number}[]=[],stack:any[]=[];
  const g:any={strokeStyle:'#f00',lineWidth:3,lineCap:'round',lineJoin:'miter',globalAlpha:.8,dash:[10,8],
    save(){stack.push({strokeStyle:this.strokeStyle,lineWidth:this.lineWidth,lineCap:this.lineCap,lineJoin:this.lineJoin,globalAlpha:this.globalAlpha,dash:[...this.dash]});},
    restore(){Object.assign(this,stack.pop());},setLineDash(d:number[]){this.dash=[...d];},
    stroke(path?:Path2D){calls.push({path,dash:[...this.dash],width:this.lineWidth,color:this.strokeStyle,alpha:this.globalAlpha});}};
  for(const name of ['clearRect','beginPath','arc','clip','fillRect','translate','rotate','scale','moveTo','lineTo','closePath','fill'])g[name]=()=>{};
  return {g,calls};
}
test('rail strokes stay screen-sized, distinguish yards and restore Metro/navigation canvas state',()=>{
  const layer=new RailwayMapLayer(tracks,PathType),{g,calls}=context();
  drawRailways(g,layer.all(),.5,false);assert.equal(calls.length,2,'wide views omit yard clutter');
  assert.deepEqual(calls[1].dash,[10,8]);assert.equal(calls[1].width*.5,2);
  assert.deepEqual(g.dash,[10,8]);assert.equal(g.strokeStyle,'#f00');assert.equal(g.lineWidth,3);assert.equal(g.globalAlpha,.8);assert.equal(g.lineCap,'round');
  calls.length=0;drawRailways(g,layer.all(),1,true);assert.equal(calls.length,4);assert.ok(calls.some(c=>c.alpha===.65));
});

test('actual minimap adds nearby conventional rail and reuses its paths across repeated driving HUD redraws',()=>{
  const previous=globalThis.Path2D;Object.assign(globalThis,{Path2D:PathType});
  try{
    const {g,calls}=context(),game:any=Object.assign(Object.create(Game.prototype),{
      hud:{el:{minimap:{width:336,getContext:()=>g}}},player:{pos:{x:0,z:0},yaw:.4},
      city:{railway:{profiles:tracks}},graph:{nearestEdges:()=>[]},zone:{metro:{lines:[]}},route:null,routeTarget:null,
    });
    game.drawMinimap();const first=calls.map(c=>c.path);assert.equal(first.length,4);const made=Path.made;
    for(let i=0;i<60;i++){game.player.pos.x=i;game.drawMinimap();}
    assert.equal(Path.made,made,'nearby native rail paths are not recreated per frame');
    assert.ok(calls.every(c=>first.includes(c.path)));
  }finally{Object.assign(globalThis,{Path2D:previous});}
});
