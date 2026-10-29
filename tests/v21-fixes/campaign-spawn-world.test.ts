import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import * as THREE from 'three';
import { Game } from '../../src/game/game';
import { Player } from '../../src/game/player';
import { Traffic } from '../../src/game/traffic';
import { sampleTruckRoute } from '../../src/delivery/truck-route';
import { DeliveryRuntime } from '../../src/delivery/runtime';
import type { DeliveryPoint, DeliveryModuleContext } from '../../src/delivery/modules/types';
import { campaignSpawn } from '../../src/delivery/campaign';
import { loadLevels } from '../../src/delivery/content/levels';
import { initTemplates } from '../../src/core/util';
import { RoadGraph } from '../../src/game/roadgraph';
import { buildTile, type TileZone } from '../../src/world/city';
import { prepareRoadGrades, roadGradePatches, currentRoadGradePatches, applyRoadGradePatches } from '../../src/world/road-grades';
import { prepareRoadUnderpasses } from '../../src/world/road-underpasses';
import { planConstruction, applyConstructionRoads } from '../../src/world/construction';
import { prepareRailwayTransport } from '../../src/world/railway-geometry';
import { RAILWAY_UNDERPASS_EVIDENCE } from '../../src/world/railway-evidence';
import { excludeStadiumRoads, stadiumExclusions } from '../../src/world/stadium-roads';
import { placeLandmarks } from '../../src/world/landmarks';
import { placeAirfields } from '../../src/world/airfields';
import { DESTINATION_IDENTITIES } from '../../src/world/destination-data';
import { supportAt, collideWalls } from '../../src/game/physics';
import { streetFootprintClear } from '../../src/game/spatial-safety';

const unpack=(file:string)=>JSON.parse(gunzipSync(readFileSync(`public/city/${file}`)).toString());
function worldFixture(target:{x:number;z:number}, extraFocus?:(graph:RoadGraph)=>{x:number;z:number}[]) {
  initTemplates();
  const core=unpack('core.pack.wasm');
  let roads=prepareRoadGrades(core.roads),patches=new Map(roadGradePatches(roads).map(p=>[p.id,p]));
  const underpasses=prepareRoadUnderpasses(roads);roads=underpasses.roads;
  for(const patch of underpasses.changes)patches.set(patch.id,patch);
  roads=excludeStadiumRoads(roads,stadiumExclusions(core.origin));
  const construction=planConstruction(roads,core.origin);roads=applyConstructionRoads(roads,construction);
  const previous=roads,transport=prepareRailwayTransport(roads,{underpasses:RAILWAY_UNDERPASS_EVIDENCE});roads=transport.roads;
  roads.forEach((road,i)=>{if(road!==previous[i])patches.set(road.id,{id:road.id,pts:road.pts,elev:road.elev});});
  const gradePatches=currentRoadGradePatches(roads,[...patches.values()]);
  const graph=new RoadGraph(roads),start=campaignSpawn(graph,target);assert.ok(start,'main road campaign anchor must exist');
  const city:any={group:new THREE.Group(),movingRail:[],railwayWalls:[],surfaceGrid:new Map(),buildingGrid:new Map(),walls:new Map(),obstacles:new Map(),landmarkSurfaceGrid:new Map(),waterGrid:new Map()};
  const packs=new Map<string,any>(),landmarks=placeLandmarks(core.origin,core.packs.flatMap((p:any)=>p.tiles)),airfields=placeAirfields(core.origin);
  const focus=extraFocus?.(graph)||[];
  const minX=Math.min(start.x-900,...focus.map(p=>p.x-40)),maxX=Math.max(start.x+900,...focus.map(p=>p.x+40));
  const minZ=Math.min(start.z-900,...focus.map(p=>p.z-40)),maxZ=Math.max(start.z+900,...focus.map(p=>p.z+40));
  for(let i=Math.floor(minX/1000);i<=Math.floor(maxX/1000);i++)for(let j=Math.floor(minZ/1000);j<=Math.floor(maxZ/1000);j++) {
    const pack=core.packs.find((p:any)=>p.tiles.some((t:number[])=>t[0]===i&&t[1]===j));if(!pack)continue;
    if(!packs.has(pack.file))packs.set(pack.file,unpack(pack.file));const zone:TileZone=packs.get(pack.file).tiles[`${i}_${j}`];if(!zone)continue;
    const localRoads=applyConstructionRoads(applyRoadGradePatches(zone.roads,gradePatches),construction);
    const furniture=core.trafficSignals===undefined?zone.furniture.filter(f=>f.kind!=='traffic_signals'||!f.synth):
      [...zone.furniture.filter(f=>f.kind!=='traffic_signals'),...core.trafficSignals.filter((f:any)=>f.p[0]>=i*1000-80&&f.p[0]<(i+1)*1000+80&&f.p[1]>=j*1000-80&&f.p[1]<(j+1)*1000+80)];
    const built=buildTile({...zone,roads:localRoads,furniture},{lowQ:true,metro:core.metro,landmarks,airfields,construction,railway:transport.railway,destinations:DESTINATION_IDENTITIES.filter(d=>d.tile[0]===i&&d.tile[1]===j)});
    graph.addRoads(built.roads,built.signals);
    for(const key of ['surfaceGrid','buildingGrid','walls','obstacles','landmarkSurfaceGrid','waterGrid'] as const)
      for(const [cell,list] of built[key]||[])city[key].set(cell,[...(city[key].get(cell)||[]),...list]);
    built.buffers.length=0;
  }
  return {graph,city,start,roads};
}
function playerFor(city:any):any {
  return Object.assign(Object.create(Player.prototype),{
    city,pos:new THREE.Vector3(),yaw:0,speed:0,vy:0,steerVis:0,flying:false,descending:false,onRoad:false,lastSupport:0,lastKind:'ground',lastElevRoad:false,
    hitCooldown:0,bump:0,flyAlt:24,altT:0,kerbT:0,glide:null,jumpActive:false,jumpHeld:false,jumpCooldown:0,jumpBodyTop:2.4,jumpStartY:0,jumpElapsed:0,
    jumpForcedFall:false,jumpCooldownPendingLanding:false,jumpCollisionMeshes:[],jumpBoundsDirty:true,jumpBounds:{bottom:0,top:0},placementRevision:0,
    group:new THREE.Group(),glow:new THREE.Group(),light:new THREE.Group(),wheels:[],wheelRollers:[],animateThrusters(){},
  });
}

test('normal campaign starts on a real wide ground road with a legal heading and 40m of collision-free forward driving',t=>{
  const target=loadLevels()[0].destination;
  const f=worldFixture(target),player=playerFor(f.city);
  const game:any=Object.assign(Object.create(Game.prototype),{graph:f.graph,city:f.city,player,carrierPickupMode:true,opts:{}});
  assert.equal(game.placeNear(f.start.x,f.start.z),true,'normal startup must find a main road without service/elevated fallback');
  const origin={x:player.pos.x,y:player.pos.y-.55,z:player.pos.z},hx=-Math.sin(player.yaw),hz=-Math.cos(player.yaw);
  const road=supportAt(f.city,origin.x,origin.z,origin.y+.5,true).s?.e;
  assert.ok(road&&['primary','secondary','trunk','motorway'].includes(road.cls),`spawn selected ${road?.cls}`);
  assert.ok(road.w>=9&&!road.workZone,'wide, open main road rather than a narrowed construction lane');
  t.diagnostic(JSON.stringify({target:[target.x,target.z],spawn:[origin.x,origin.z],road:road.id,roadClass:road.cls,width:road.w,yaw:player.yaw}));
  const edge=f.graph.byId.get(road.id)!;
  const legal=road.oneway==='forward'?-1:road.oneway==='backward'?1:null;
  if(legal) {
    let aligned=false;
    for(let s=0;s<=edge.len;s+=2){const p=f.graph.pointAt(edge,s,legal);if(Math.hypot(p.x-origin.x,p.z-origin.z)<10&&p.hx*hx+p.hz*hz>.98)aligned=true;}
    assert.ok(aligned,'spawn yaw must agree with the legal one-way direction');
  }
  let previous={x:origin.x,z:origin.z};
  for(let ahead=0;ahead<=40;ahead+=.5){
    const point={x:origin.x+hx*ahead,y:origin.y,z:origin.z+hz*ahead};
    const support=supportAt(f.city,point.x,point.z,origin.y+.5,true);
    assert.ok(support.onRoad&&Math.abs(support.y-origin.y)<.6,`road ends or steps at ${ahead}m`);
    assert.ok(streetFootprintClear(f.city,point,hx,hz),`full car footprint blocked at ${ahead}m`);
    const next={x:point.x,z:point.z};const contact=collideWalls(f.city,previous,next,1.05,origin.y,origin.y+1.15,{hx,hz,halfLength:2.4,halfWidth:1.1});
    assert.ok(contact.hit<.02,`physical car nose hits a barrier ${ahead}m after spawn`);previous=next;
  }
  for(const hzRate of [30,60]){
    player.place(origin.x,origin.z,Math.atan2(-hx,-hz),origin.y);
    for(let frame=0;frame<hzRate*5;frame++){
      const travelled=(player.pos.x-origin.x)*hx+(player.pos.z-origin.z)*hz;if(travelled>=38)break;
      player.update(1/hzRate,{throttle:1,brake:0,steer:0,flyPressed:false,boost:false,jumpPressed:false},frame/hzRate);
    }
    const travelled=(player.pos.x-origin.x)*hx+(player.pos.z-origin.z)*hz;
    assert.ok(travelled>=38,`${hzRate}Hz GO-only start got stuck after ${travelled.toFixed(1)}m`);
    assert.ok(player.onRoad&&!player.flying&&!player.jumping,'starting motion stays on the road');
  }
});


test('actual runtime opening truck route keeps its complete body clear of packed-city furniture in every lane draw',t=>{
  const level=loadLevels()[0];
  const f=worldFixture(level.destination,graph=>{
    const edge=graph.byId.get('2f777906-0dd_0')!;
    assert.ok(edge,'verified opening highway exists in prepared city');
    const dir=edge.e.oneway==='forward'?-1:1,opts={width:6,halfLength:10,centerOffset:2};
    return [...sampleTruckRoute(graph,edge,dir,2.1,opts).points,...sampleTruckRoute(graph,edge,dir,0,opts).points];
  });
  for(const random of [.1,.5,.99]){
    const traffic:any=Object.assign(Object.create(Traffic.prototype),{city:f.city,cars:[],r:()=>random});
    let route:DeliveryPoint[]=[];
    const runtime:any=Object.assign(Object.create(DeliveryRuntime.prototype),{
      game:{graph:f.graph,city:f.city,traffic,engine:{scene:new THREE.Scene()}},
      controller:{activeLevel:level,canDrop:false},
      moduleFactory:()=>({setup(ctx:DeliveryModuleContext){route=ctx.route!;}}),
    });
    // Exercise production selection instead of copying its lane choice here.
    runtime.prepareModule();
    assert.ok(route.length>2,'production selector must create the truck scene');
    let length=0,samples=0;const blocked:{index:number;x:number;z:number}[]=[];
    for(let i=0;i<route.length-1;i++){
      const p=route[i],next=route[i+1],n=Math.hypot(next.x-p.x,next.z-p.z)||1,hx=(next.x-p.x)/n,hz=(next.z-p.z)/n;
      length+=n;
      for(let distance=0;distance<n;distance+=.8){
        const fraction=distance/n,x=p.x+hx*distance,z=p.z+hz*distance,y=p.y+(next.y-p.y)*fraction;
        const body={id:'delivery-log-truck',x:x+hx*2,y,z:z+hz*2,hx,hz,bottom:y+.2,roof:y+5.8,halfWidth:3,halfLength:10,previous:{x,y,z,hx,hz}};
        samples++;
        if(!traffic.kinematicPoseClear(body))blocked.push({index:i,x,z});
      }
    }
    t.diagnostic(JSON.stringify({laneRandom:random,length,samples,blocked:blocked.slice(0,3),blockedCount:blocked.length}));
    assert.ok(length>1300,'wide-body route must continue across real shared nodes for over a kilometre');
    assert.equal(blocked.length,0,'complete truck body must not clip sidewalks, walls or buildings anywhere on its mapped route');
  }
});
