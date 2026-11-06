import test from 'node:test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import * as THREE from 'three';
import { Player } from '../../src/game/player';
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

const unpack=(file:string)=>JSON.parse(gunzipSync(readFileSync(`public/city/${file}`)).toString());
export function packedDriveWorld(target:{x:number;z:number}, lowQ=true) {
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
  const graph=new RoadGraph(roads),start={...target};
  const city:any={group:new THREE.Group(),movingRail:[],railwayWalls:[],surfaceGrid:new Map(),buildingGrid:new Map(),walls:new Map(),obstacles:new Map(),landmarkSurfaceGrid:new Map(),waterGrid:new Map()};
  const packs=new Map<string,any>(),landmarks=placeLandmarks(core.origin,core.packs.flatMap((p:any)=>p.tiles)),airfields=placeAirfields(core.origin);
  const focus:{x:number;z:number}[]=[];
  const minX=Math.min(start.x-900,...focus.map(p=>p.x-40)),maxX=Math.max(start.x+900,...focus.map(p=>p.x+40));
  const minZ=Math.min(start.z-900,...focus.map(p=>p.z-40)),maxZ=Math.max(start.z+900,...focus.map(p=>p.z+40));
  for(let i=Math.floor(minX/1000);i<=Math.floor(maxX/1000);i++)for(let j=Math.floor(minZ/1000);j<=Math.floor(maxZ/1000);j++) {
    const pack=core.packs.find((p:any)=>p.tiles.some((t:number[])=>t[0]===i&&t[1]===j));if(!pack)continue;
    if(!packs.has(pack.file))packs.set(pack.file,unpack(pack.file));const zone:TileZone=packs.get(pack.file).tiles[`${i}_${j}`];if(!zone)continue;
    const localRoads=applyConstructionRoads(applyRoadGradePatches(zone.roads,gradePatches),construction);
    const furniture=core.trafficSignals===undefined?zone.furniture.filter(f=>f.kind!=='traffic_signals'||!f.synth):
      [...zone.furniture.filter(f=>f.kind!=='traffic_signals'),...core.trafficSignals.filter((f:any)=>f.p[0]>=i*1000-80&&f.p[0]<(i+1)*1000+80&&f.p[1]>=j*1000-80&&f.p[1]<(j+1)*1000+80)];
    const built=buildTile({...zone,roads:localRoads,furniture},{lowQ,metro:core.metro,landmarks,airfields,construction,railway:transport.railway,destinations:DESTINATION_IDENTITIES.filter(d=>d.tile[0]===i&&d.tile[1]===j)});
    graph.addRoads(built.roads,built.signals);
    for(const key of ['surfaceGrid','buildingGrid','walls','obstacles','landmarkSurfaceGrid','waterGrid'] as const)
      for(const [cell,list] of built[key]||[])city[key].set(cell,[...(city[key].get(cell)||[]),...list]);
    built.buffers.length=0;
  }
  return {graph,city,start,roads};
}
export function testDriver(city:any):Player {
  return Object.assign(Object.create(Player.prototype),{
    city,pos:new THREE.Vector3(),yaw:0,speed:0,vy:0,steerVis:0,flying:false,descending:false,onRoad:false,lastSupport:0,lastKind:'ground',lastElevRoad:false,
    hitCooldown:0,bump:0,flyAlt:24,altT:0,kerbT:0,glide:null,jumpActive:false,jumpHeld:false,jumpCooldown:0,jumpBodyTop:2.4,jumpStartY:0,jumpElapsed:0,
    jumpForcedFall:false,jumpCooldownPendingLanding:false,jumpCollisionMeshes:[],jumpBoundsDirty:true,jumpBounds:{bottom:0,top:0},placementRevision:0,
    group:new THREE.Group(),glow:new THREE.Group(),light:new THREE.Group(),wheels:[],wheelRollers:[],animateThrusters(){},
  }) as Player;
}

