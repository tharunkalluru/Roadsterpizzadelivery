import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { packedDriveWorld, testDriver } from '../fixtures/packed-drive-world';
import { UnderpassTerrainIndex } from '../../src/world/underpass-terrain';
import { buildTile } from '../../src/world/city';
import { initTemplates } from '../../src/core/util';
import { makeRailwayNetwork } from '../../src/world/railway-geometry';
import { collideWalls, collideBuildings } from '../../src/game/physics';
import type { RoadEdge } from '../../src/world/types';

const input={throttle:1,brake:0,steer:0,flyPressed:false,boost:false,jumpPressed:false};
const signed=(a:number)=>((a+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;
const ikeaWorlds=new Map<boolean,ReturnType<typeof packedDriveWorld>>();
const ikeaWorld=(lowQ:boolean)=>{let world=ikeaWorlds.get(lowQ);if(!world){world=packedDriveWorld({x:-12884.44,z:-3633.53},lowQ);ikeaWorlds.set(lowQ,world);}return world;};

function drive(city:any,start:{x:number;y:number;z:number;hx:number;hz:number},metres:number,hz:number,cruise=false) {
  const player=testDriver(city),yaw=Math.atan2(-start.hx,-start.hz);player.place(start.x,start.z,yaw,start.y);
  let frames=0,travel=0,bodyBlocked=0,minFeet=Infinity,maxFeet=-Infinity;
  while(travel<metres&&frames<hz*12) {
    player.update(1/hz,{...input,throttle:cruise?(player.speed<7?1:0):1},frames/hz);
    travel=(player.pos.x-start.x)*start.hx+(player.pos.z-start.z)*start.hz;
    minFeet=Math.min(minFeet,player.pos.y-.55);maxFeet=Math.max(maxFeet,player.pos.y-.55);
    // Check nose/body/tail against real vertical obstacles. Shallow pavement
    // pads under a wheel are drive support, not a collision with bodywork.
    for(const along of[-1.25,0,1.25]) {
      const point={x:player.pos.x+player.forward.x*along,z:player.pos.z+player.forward.z*along},bottom=player.pos.y-.4;
      if(collideWalls(city,point,{...point},1.15,bottom,player.pos.y+.8).hit>.02||collideBuildings(city,{...point},1.15,bottom,player.pos.y+.8)>.02)bodyBlocked++;
    }
    frames++;
  }
  return {player,travel,seconds:frames/hz,bodyBlocked,minFeet,maxFeet,yawError:Math.abs(signed(player.yaw-yaw))};
}

test('real IKEA southern join and short connector no longer stop ordinary Player driving in either direction',t=>{
  for(const lowQ of[true,false]) {
    const f=ikeaWorld(lowQ);
    for(const hz of[30,60])for(const cruise of[false,true])for(const reverse of[false,true])for(const id of['2030c448-606_0','70f8fde2-79a_0']) {
      const edge=f.graph.byId.get(id)!;assert.ok(edge,'retain the shipped source road');
      const connector=id==='70f8fde2-79a_0',source=reverse?(connector?edge.len:18):(connector?0:3);
      const start=f.graph.pointAt(edge,reverse?edge.len-source:source,reverse?-1:1,0),goal=connector?6:reverse?15:20;
      const result=drive(f.city,start,goal,hz,cruise);
      const label=`${id} lowQ=${lowQ} hz=${hz} cruise=${cruise} reverse=${reverse}`;
      assert.ok(result.travel>=goal,`stuck at ${result.travel.toFixed(2)}m: ${label}`);
      assert.ok(result.seconds<9,`slow scrape instead of an open join: ${label}`);
      assert.ok(result.minFeet>-.1&&result.maxFeet<.16,`cannot fall into the neighboring road cut: ${label}`);
      assert.equal(result.player.flying,false);assert.equal(result.player.jumping,false);assert.equal(result.player.glide,null);
      assert.ok(result.yawError<.06,`an invisible side wall steered the car: ${label}`);
      // Three overlapping circles cover the whole coupe. A pass may not be
      // obtained by letting its nose/side visibly travel through a real median.
      assert.equal(result.bodyBlocked,0,`full body must clear visible barriers/buildings: ${label}`);
      t.diagnostic(JSON.stringify({road:id,lowQ,hz,cruise,reverse,metres:result.travel,seconds:result.seconds,speed:result.player.speed}));
    }
  }
});

const road=(id:string,pts:[number,number][],elev:number[]|null):RoadEdge=>({id,seg:id,name:id,cls:'primary',w:12,lanes:2,oneway:'backward',from:id+'-a',to:id+'-b',pts,elev,maxspeed:40});

test('only actual upper asphalt covers a retaining lip; the deep wall and uncovered caps remain rendered and solid',()=>{
  const below=road('verified-lower-road',[[500,100],[500,900]],[-6.5,-6.5]);
  const upper=road('mapped-upper-road',[[400,500],[600,500]],null);
  const terrain=new UnderpassTerrainIndex([below,upper]).build(0,0)!;
  const city:any={walls:new Map(),railwayWalls:[]};
  for(const wall of terrain.walls)for(let x=12;x<=20;x++)for(let z=12;z<=20;z++){const k=`${x},${z}`,list=city.walls.get(k)||[];list.push(wall);city.walls.set(k,list);}
  assert.equal(collideWalls(city,{x:507,z:500},{x:512,z:500},1.05,0,1.2).hit,0,'ground road tyres pass over their own pavement');
  assert.ok(collideWalls(city,{x:507,z:500},{x:512,z:500},1.05,-6.5,-5).hit>0,'the retaining structure below pavement is still solid');
  assert.ok(collideWalls(city,{x:507,z:550},{x:512,z:550},1.05,0,1.2).hit>0,'no road at this point means no invented opening');
  const mesh=new THREE.Mesh(terrain.wall,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.updateMatrixWorld(true);
  const visibleAt=(z:number,y:number)=>new THREE.Raycaster(new THREE.Vector3(508,y,z),new THREE.Vector3(1,0,0),0,5).intersectObject(mesh).length;
  assert.equal(visibleAt(500,.08),0,'the rendered lip is clipped with its collision shape');
  assert.ok(visibleAt(500,-2)>0&&visibleAt(550,.08)>0,'both the deep concrete and ordinary uncrossed cap stay visible');
  const raised=new UnderpassTerrainIndex([below,{...upper,elev:[6,6]}]).build(0,0)!;
  assert.ok(raised.walls.every(w=>w.y1a===.12&&w.y1b===.12),'a flyover cannot remove a ground retaining wall');
  const shallow=new UnderpassTerrainIndex([{...below,elev:[-.05,-.05]},{...upper,elev:[-.25,-.25]}]).build(0,0)!;
  assert.ok(shallow.walls.every(w=>w.y0a<=w.y1a&&w.y0b<=w.y1b),'overlapping shallow ramps cannot invert a retaining face');
  assert.ok([...shallow.wall.attributes.position.array,...shallow.wall.attributes.normal.array].every(Number.isFinite));
  terrain.ground.dispose();terrain.wall.dispose();mesh.material.dispose();raised.ground.dispose();raised.wall.dispose();shallow.ground.dispose();shallow.wall.dispose();
});

test('production Player crosses the upper road while negative-level retaining walls stay separate',()=>{
  initTemplates();
  const below=road('verified-lower-road',[[500,100],[500,900]],[-6.5,-6.5]),upper=road('mapped-upper-road',[[400,500],[600,500]],null);
  for(const lowQ of[true,false]) {
    const built=buildTile({i:0,j:0,roads:[below,upper],nodes:{},buildings:[],boards:[],furniture:[],areas:[],osm:[]},{lowQ,railway:makeRailwayNetwork([])});
    const city:any={group:new THREE.Group(),surfaceGrid:built.surfaceGrid,buildingGrid:built.buildingGrid,walls:built.walls,obstacles:built.obstacles,movingRail:[],landmarkSurfaceGrid:new Map(),waterGrid:new Map()};
    for(const hz of[30,60])for(const direction of[-1,1]) {
      const result=drive(city,{x:500-direction*30,y:0,z:500,hx:direction,hz:0},60,hz);
      assert.ok(result.travel>=60,`upper road still catches trench lip: ${lowQ}/${hz}/${direction}`);
      assert.equal(result.player.flying,false);assert.equal(result.player.jumping,false);assert.ok(Math.abs(result.player.pos.y-.55)<.03);
    }
  }
});


test('input-only Player driving follows the full four-edge IKEA continuation beyond the repaired lip',t=>{
  for(const lowQ of[true,false]){
    const f=ikeaWorld(lowQ),source:[number,number][]=[];
    for(const id of['2030c448-606_0','aa22a4a9-9ce_0','5e43d7a9-ead_0','3104fde8-b8a_0']){
      const edge=f.graph.byId.get(id)!;assert.ok(edge);source.push(...edge.e.pts.filter((_,i)=>i>0||source.length===0));
    }
    for(const hz of[30,60])for(const reverse of[false,true]){
      const points=reverse?[...source].reverse():source,along=[0];
      for(let i=1;i<points.length;i++)along.push(along[i-1]+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));
      const total=along[along.length-1];assert.ok(total>175);
      const at=(distance:number)=>{let i=1;while(i<along.length-1&&along[i]<distance)i++;const a=points[i-1],b=points[i],u=Math.max(0,Math.min(1,(distance-along[i-1])/(along[i]-along[i-1])));return{x:a[0]+(b[0]-a[0])*u,z:a[1]+(b[1]-a[1])*u};};
      const start=at(3),heading=at(4),player=testDriver(f.city);player.place(start.x,start.z,Math.atan2(-(heading.x-start.x),-(heading.z-start.z)),0);
      let progress=3,frames=0,solidContacts=0,minFeet=Infinity,maxFeet=-Infinity;
      while(progress<total-3&&frames<hz*60){
        let best=Infinity,nearest=progress;
        for(let d=Math.max(0,progress-2);d<=Math.min(total,progress+10);d+=.2){const p=at(d),error=Math.hypot(p.x-player.pos.x,p.z-player.pos.z);if(error<best){best=error;nearest=d;}}
        progress=nearest;const target=at(Math.min(total,progress+4)),yaw=Math.atan2(-(target.x-player.pos.x),-(target.z-player.pos.z));
        player.update(1/hz,{...input,throttle:player.speed<6?1:0,brake:player.speed>7.5?1:0,steer:Math.max(-1,Math.min(1,-signed(yaw-player.yaw)*2.7))},frames/hz);
        minFeet=Math.min(minFeet,player.pos.y-.55);maxFeet=Math.max(maxFeet,player.pos.y-.55);
        for(const offset of[-1.25,0,1.25]){const p={x:player.pos.x+player.forward.x*offset,z:player.pos.z+player.forward.z*offset},bottom=player.pos.y-.4;if(collideWalls(f.city,p,{...p},1.15,bottom,player.pos.y+.8).hit>.02||collideBuildings(f.city,{...p},1.15,bottom,player.pos.y+.8)>.02)solidContacts++;}
        frames++;
      }
      assert.ok(progress>=total-3,`full continuation blocked ${lowQ}/${hz}/${reverse}: ${progress.toFixed(2)}m of ${total.toFixed(2)}`);
      assert.equal(solidContacts,0,'the nose, body and tail must never pass through a genuine median/building');
      assert.ok(minFeet>-.1&&maxFeet<.16,'upper street driving cannot fall into the separate underpass');
      assert.equal(player.flying,false);assert.equal(player.jumping,false);assert.equal(player.glide,null);
      t.diagnostic(JSON.stringify({lowQ,hz,reverse,total,progress,seconds:frames/hz,solidContacts}));
    }
  }
});
