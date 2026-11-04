import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import * as THREE from 'three';
import {initTemplates} from '../../src/core/util';
import {buildTile,type CityData,type TileBuilt} from '../../src/world/city';
import {prepareRoadGrades,currentRoadGradePatches,applyRoadGradePatches} from '../../src/world/road-grades';
import type {CoreData,Building} from '../../src/world/types';
import {Game} from '../../src/game/game';
import {Player} from '../../src/game/player';
import {RopeBucket} from '../../src/delivery/modules/street-scenes';
import {clearCameraPosition,staticSolidAt} from '../../src/game/spatial-safety';
import {loadLevels} from '../../src/delivery/content/levels';
import {StoryDirector,stepStoryPose} from '../../src/delivery/systems/story-director';
import type {DeliveryPoint,DeliveryPlayer,ModuleParams} from '../../src/delivery/modules/types';

function actualParadise(){
  const core:CoreData=JSON.parse(gunzipSync(readFileSync('public/city/core.pack.wasm')).toString()),patches=currentRoadGradePatches(prepareRoadGrades(core.roads));
  const tiles:TileBuilt[]=[];initTemplates();
  const packs=new Map<string,any>();
  for(const i of [-2,-1]){
    const j=-4,key=`${i}_${j}`,pack=core.packs.find(p=>p.tiles.some(([x,z])=>x===i&&z===j))!;
    let data=packs.get(pack.file);if(!data){data=JSON.parse(gunzipSync(readFileSync(`public/city/${pack.file}`)).toString());packs.set(pack.file,data);}
    const zone=data.tiles[key];tiles.push(buildTile({...zone,roads:applyRoadGradePatches(zone.roads,patches)},{lowQ:true,metro:core.metro}));
  }
  const merge=(key:'buildingGrid'|'surfaceGrid'|'walls'|'obstacles')=>{
    const out=new Map<string,any[]>();for(const tile of tiles)for(const[cell,values]of tile[key])out.set(cell,[...(out.get(cell)??[]),...values]);return out;
  };
  const buildingGrid=merge('buildingGrid'),byBuilding=new Map<string,Building>();for(const list of buildingGrid.values())for(const b of list)byBuilding.set(b.id,b);
  const city={group:new THREE.Group(),signs:{update(){}},lit:null,glow:null,buildingGrid,byBuilding,surfaceGrid:merge('surfaceGrid'),walls:merge('walls'),obstacles:merge('obstacles'),movingRail:[],waterGrid:new Map(),landmarkSurfaceGrid:new Map(),bounds:core.bounds,signals:[],lamps:[],busStops:[],walkPaths:[],centroid:()=>[0,0]} as unknown as CityData;
  // Bind the frontage actually observed in frozen19 to its exact packed edge.
  // Re-running the general placement search against this two-tile subset is
  // not equivalent to the runtime's full streamed/corrected neighborhood.
  const level=loadLevels()[3],building=byBuilding.get('5b496a6d-84b')!;assert.ok(building);
  const a=building.ring.at(-1)!,b=building.ring[0],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),nx=-dz/length,nz=dx/length;
  const t=Math.max(.15,Math.min(.85,((level.destination.x-a[0])*dx+(level.destination.z-a[1])*dz)/(length*length))),bx=a[0]+dx*t,bz=a[1]+dz*t;
  const destination={x:bx+nx*4.2,y:.02,z:bz+nz*4.2},placement={destination,moduleParams:{useExistingFacade:true,roofHeight:building.h-.02,winchAnchorX:-nx*5.2,winchAnchorZ:-nz*5.2,rooftopActorX:-nx*6.5-nz*1.8,rooftopActorZ:-nz*6.5+nx*1.8,rooftopCameraSide:1,facadeNormalX:nx,facadeNormalZ:nz},reusedBuilding:building.id};
  const meshGroup=new THREE.Group(),material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  const d=placement.destination;
  for(const tile of tiles)for(const buffer of tile.buffers){
    const positions:number[]=[];for(let i=0;i<buffer.pos.length;i+=9){const p=buffer.pos;
      if(Math.max(p[i],p[i+3],p[i+6])<d.x-40||Math.min(p[i],p[i+3],p[i+6])>d.x+40||Math.max(p[i+2],p[i+5],p[i+8])<d.z-40||Math.min(p[i+2],p[i+5],p[i+8])>d.z+40)continue;
      positions.push(...p.slice(i,i+9));
    }
    if(positions.length)meshGroup.add(new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(positions,3)),material));
  }
  return{city,placement,meshGroup,dispose(){meshGroup.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});material.dispose();}};
}
function fixture(destination:DeliveryPoint,params:ModuleParams,city?:CityData,aspect=932/430){
  const scene=new THREE.Scene(),director=new StoryDirector(),module=new RopeBucket(),events:string[]=[];
  const actor=new THREE.Group(),leftArm=new THREE.Group(),rightArm=new THREE.Group(),catchPoint=new THREE.Object3D();actor.add(leftArm,rightArm,catchPoint);actor.userData.characterRelease='geometry-camera-fixture';
  const p:DeliveryPlayer={x:destination.x,y:destination.y+.55,z:destination.z,yaw:43*Math.PI/180,speed:0};
  module.setup({scene,destination,player:()=>p,emit:type=>{events.push(type);if(type==='done')director.complete();},automaticStories:true,storyActive:()=>director.captured,canInteract:()=>true,
    characterFactory:()=>({group:actor,leftArm,rightArm,catchPoint,catchPose(){}})},params);
  const player=Object.assign(Object.create(Player.prototype),{pos:new THREE.Vector3(p.x,p.y,p.z),yaw:p.yaw,speed:0,lastSupport:destination.y,placementRevision:0,flying:false,descending:false,jumpActive:false,bump:0});
  const g:any=Object.assign(Object.create(Game.prototype),{player,cameraPlacementRevision:0,camPos:new THREE.Vector3(),camLook:new THREE.Vector3(),orbitYaw:1.2,orbitPitch:.9,orbitDist:3,airOrbitPitch:.62,airOrbitDist:0,dragging:true,
    city:city??{signs:{update(){}}},story:{cinematic:false,supports:module.supports,cameraFocus:undefined},engine:{camera:new THREE.PerspectiveCamera(55,aspect,.1,900),placeSun(){}},traffic:{hideNear(){}},placeLampLights(){}});
  if(!city){g.clearCamera=(_from:THREE.Vector3,to:THREE.Vector3)=>to.clone();g.insideSolid=()=>false;}
  // Begin in the actual ordinary chase/orbit view, rather than a zero camera
  // that snaps directly to an authored cinematic position.
  g.updateCamera(.05);g.engine.camera.updateMatrixWorld(true);
  const step=()=>{
    module.update(.05);director.tryStart(module.story,true);
    if(director.captured&&module.story)Object.assign(p,stepStoryPose(p,module.story,.05));
    if(director.actionReady(.05,module.status.canDrop))module.onDrop();
    player.pos.set(p.x,p.y,p.z);player.yaw=p.yaw;g.story.cinematic=director.captured;g.story.cameraFocus=module.cameraFocus;g.updateCamera(.05);g.engine.camera.updateMatrixWorld(true);
    scene.updateMatrixWorld(true);
  };
  return{module,scene,actor,p,g,director,events,step};
}
function viewChecks(f:ReturnType<typeof fixture>,world?:THREE.Group){
  const bucket=f.scene.getObjectByName('delivery-rope-bucket')!,camera=f.g.engine.camera as THREE.PerspectiveCamera;
  const box=new THREE.Box3().setFromObject(bucket);
  for(const x of[box.min.x,box.max.x])for(const y of[box.min.y,box.max.y])for(const z of[box.min.z,box.max.z]){
    const p=new THREE.Vector3(x,y,z).project(camera);assert.ok(Math.abs(p.x)<.97&&Math.abs(p.y)<.97&&p.z>-1&&p.z<1,`complete actual basket and lifting rig remain inside the phone/desktop camera ${JSON.stringify({p:p.toArray(),height:bucket.position.y,params:(f.module as any).params,focus:f.module.cameraFocus})}`);
  }
  const hx=-Math.sin(f.p.yaw),hz=-Math.cos(f.p.yaw);
  for(const along of[-2.4,2.4])for(const side of[-1.15,1.15])for(const y of[.1,1.6]){
    const point=new THREE.Vector3(f.p.x+hx*along-hz*side,f.p.y-.55+y,f.p.z+hz*along+hx*side).project(camera);
    assert.ok(Math.abs(point.x)<.97&&Math.abs(point.y)<.97&&point.z>-1&&point.z<1,'the beside-basket Roadster remains framed as real delivery context');
  }
  const pizza=f.scene.getObjectByName('delivery-scene-pizza')!;
  if(!pizza.visible)return;
  const phase=(f.module as any).phase,transfer=(f.module as any).transfer;
  if(phase==='passing'&&transfer?.elapsed<.15)return; // The existing physical throw starts inside the carried carton position.
  const occluders:THREE.Object3D[]=[];f.scene.traverse(o=>{if(o instanceof THREE.Mesh&&o.parent!==pizza)occluders.push(o);});world?.traverse(o=>{if(o instanceof THREE.Mesh)occluders.push(o);});
  let visible=0;
  for(const x of[-.15,0,.15])for(const z of[-.15,0,.15]){
    const top=pizza.localToWorld(new THREE.Vector3(x,.037,z)),projected=top.clone().project(camera);
    assert.ok(Math.abs(projected.x)<.95&&Math.abs(projected.y)<.95,'the actual visible carton remains in frame');
    const delta=top.clone().sub(camera.position),distance=delta.length(),ray=new THREE.Raycaster(camera.position,delta.normalize(),.03,distance-.02);
    const hits=ray.intersectObjects(occluders,false);
    const opaque=hits.filter(hit=>hit.object.name!=='delivery-bucket-shell'||bucket.worldToLocal(hit.point.clone()).y<=1.75);
    assert.deepEqual(opaque.map(h=>h.object.name),[],'no real basket panel or packed city surface may cover the carton lid');
    if(!hits.length)visible++;
  }
  // The real thin A-frame can briefly cross a corner/lid strip. Preserve that
  // physical foreground, while requiring the bulk of the40cm box to stay clear.
  assert.ok(visible>=5,`most actual carton-top samples remain visible (${visible}/9); limited thin-handle crossings do not waive opaque-panel coverage`);
}

test('the actual Paradise story frames lowering, transfer and raising through production Game clearance at phone and desktop aspects',t=>{
  const real=actualParadise();
  t.diagnostic(JSON.stringify(real.placement));
  assert.ok(Math.hypot(real.placement.destination.x+1021.4,real.placement.destination.z+3917.9)<.1,'reproduce the actual frozen19 Paradise frontage');
  for(const aspect of[932/430,16/9]){
    const f=fixture(real.placement.destination,real.placement.moduleParams,real.city,aspect),phases=new Set<string>();
    for(let frame=0;frame<280&&!f.director.viewing;frame++){
      f.step();if(f.director.viewing)break;
      assert.ok(f.module.cameraFocus,'active story shows the physical bucket before completion');assert.equal(f.module.sceneLamp,undefined,'the approved rooftop lamp remains off until the held actor shot');
      const focus=f.module.cameraFocus!,eye=f.g.engine.camera.position,clear=clearCameraPosition(real.city,focus.target,eye,{deliverySolids:f.module.supports});
      assert.ok(new THREE.Vector3().copy(clear).distanceTo(eye)<.01&&!staticSolidAt(real.city,eye),'real Game keeps a collision-clear street-side eye');
      if(frame>=12&&frame%4===0){viewChecks(f,real.meshGroup);phases.add((f.module as any).phase);}
    }
    assert.equal(f.director.viewing,true);assert.equal(f.events.filter(e=>e==='done').length,1);assert.ok(phases.has('lowering')&&phases.has('passing')&&phases.has('raising'));
    const actor=f.actor.position,nx=Number(real.placement.moduleParams.facadeNormalX),nz=Number(real.placement.moduleParams.facadeNormalZ),side=Number(real.placement.moduleParams.rooftopCameraSide),root=(f.module as any).root as THREE.Group;
    const expected=root.localToWorld(new THREE.Vector3(actor.x+nx*2.7-nz*side*.9,actor.y+1.6,actor.z+nz*2.7+nx*side*.9));
    assert.ok(new THREE.Vector3().copy(f.module.cameraFocus!.position).distanceTo(expected)<1e-8,'the approved held actor close-up is byte-equivalent in behavior');
    f.module.teardown();
  }
  real.dispose();
});

test('active bucket carton clears its actual unrotated tall panels for all facade normals and both sides, without changing ordinary camera or lamps',()=>{
  for(const[nx,nz]of[[0,1],[1,0],[0,-1],[-1,0],[Math.SQRT1_2,Math.SQRT1_2]])for(const side of[-1,1]){
    const f=fixture({x:100,y:0,z:200},{useExistingFacade:true,roofHeight:16.6,winchAnchorX:-nx*5.2,winchAnchorZ:-nz*5.2,facadeNormalX:nx,facadeNormalZ:nz,rooftopCameraSide:side});
    assert.equal(f.module.cameraFocus,undefined,'ordinary approach does not capture the camera');
    for(let frame=0;frame<280&&!f.director.viewing;frame++){f.step();if(!f.director.viewing&&frame>=12&&frame%4===0)viewChecks(f);}
    assert.equal(f.director.viewing,true);assert.ok(f.module.sceneLamp);
    f.director.reset();assert.equal(f.module.cameraFocus,undefined);assert.equal(f.module.sceneLamp,undefined);f.module.teardown();
  }
});
