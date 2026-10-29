import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Player } from '../../src/game/player';
function fixture(water=false):any {
 const city:any={surfaceGrid:new Map(),buildingGrid:new Map(),walls:new Map(),obstacles:new Map(),movingRail:[],waterGrid:new Map()};
 if(water)for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++)city.waterGrid.set(`${x},${z}`,[{ring:[[-100,-100],[100,-100],[100,100],[-100,100]],level:0}]);
 return Object.assign(Object.create(Player.prototype),{city,pos:new THREE.Vector3(0,24,0),yaw:0,speed:0,vy:0,steerVis:0,flying:true,descending:false,onRoad:false,lastSupport:0,lastKind:'ground',lastElevRoad:false,hitCooldown:0,bump:0,flyAlt:24,altT:0,kerbT:0,glide:null,jumpActive:false,jumpHeld:false,jumpCooldown:0,jumpBodyTop:2.4,jumpCollisionMeshes:[],jumpBoundsDirty:true,placementRevision:0,group:new THREE.Group(),glow:new THREE.Group(),light:new THREE.Group(),wheels:[],wheelRollers:[],animateThrusters(){},updateWaterWake(){}});
}
const idle={throttle:0,brake:0,steer:0,flyPressed:false,boost:false};
test('delivery approach changes altitude only inside its local radius and restores ordinary flight outside',()=>{
 const p=fixture();p.deliveryMotion={mode:'approach',x:0,z:0,radius:100,altitude:5};
 for(let i=0;i<300;i++)p.update(1/60,idle,i/60);assert.ok(p.pos.y>4.9&&p.pos.y<5.1);
 p.pos.x=200;for(let i=0;i<300;i++)p.update(1/60,idle,i/60);assert.ok(p.pos.y>23.9);
});
test('delivery dive cannot apply on land and ordinary flight is unchanged without a scene',()=>{
 const a=fixture(),b=fixture();b.deliveryMotion={mode:'underwater',x:0,z:0,radius:100,altitude:-4};
 for(let i=0;i<120;i++){a.update(1/60,idle,i/60);b.update(1/60,idle,i/60);}
 assert.deepEqual(a.pos.toArray(),b.pos.toArray());assert.equal(a.speed,b.speed);
});
test('underwater delivery descends smoothly and bounds propulsion in actual water',()=>{
 const p=fixture(true);p.pos.y=1;p.deliveryMotion={mode:'underwater',x:0,z:0,radius:100,altitude:-4};
 let lowest=1,maximumStep=0;
 for(let i=0;i<600;i++){const y=p.pos.y;p.update(1/60,idle,i/60);maximumStep=Math.max(maximumStep,Math.abs(y-p.pos.y));lowest=Math.min(lowest,p.pos.y);}
 assert.ok(lowest< -3.8&&lowest> -4.5,`depth ${lowest}`);assert.ok(maximumStep<=.051,'no vertical teleport');
 for(let i=0;i<60;i++)p.update(1/60,{...idle,throttle:1},i/60);assert.ok(p.speed<=8);
});
