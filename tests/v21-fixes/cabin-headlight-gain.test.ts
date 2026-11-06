import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PlayerLights, stepSceneHeadlightGain } from '../../src/game/player-lights';
import { TruckInterior } from '../../src/delivery/modules/truck-interior';

test('enclosed parking dims only existing beam intensities smoothly and restores the exact road calibration',()=>{
 const mount=new THREE.Group(),tail=new THREE.MeshBasicMaterial(),reverse=new THREE.MeshBasicMaterial(),lights=new PlayerLights(mount,tail,reverse);
 const positions=lights.headlights.map(light=>light.position.clone()),targets=lights.headlights.map(light=>light.target.position.clone());
 let gain=1;lights.update(1,0,0,gain);assert.equal(lights.headlights[0].intensity,1000);
 for(let i=0;i<60;i++){const old=gain;gain=stepSceneHeadlightGain(gain,.02,1/60);assert.ok(gain<=old&&gain>=.02);}
 lights.update(1,1,0,gain);assert.ok(lights.headlights[0].intensity<20.05);assert.equal(lights.braking,true);
 for(let i=0;i<60;i++){const old=gain;gain=stepSceneHeadlightGain(gain,undefined,1/60);assert.ok(gain>=old&&gain<=1);}
 lights.update(1,0,-2,gain);assert.ok(lights.headlights[0].intensity>999.95);assert.equal(lights.reversing,true);
 lights.headlights.forEach((light,i)=>{assert.ok(light.position.equals(positions[i]));assert.ok(light.target.position.equals(targets[i]));});
 assert.equal(mount.children.filter(node=>node instanceof THREE.Light).length,3);assert.equal(stepSceneHeadlightGain(1,undefined,1/60),1);
 assert.equal(stepSceneHeadlightGain(undefined,NaN,.1),1);assert.equal(stepSceneHeadlightGain(.4,0,NaN),.4);
});
test('the dim request follows real container occupancy and releases on the road, independent of a completed story',()=>{
 const scene=new THREE.Scene(),player={x:.55,y:.55,z:-25,yaw:Math.PI,speed:0},module=new TruckInterior();
 module.setup({scene,destination:{x:0,y:0,z:0},route:[{x:0,y:0,z:0},{x:0,y:0,z:300}],player:()=>player,vehicleSpeedLimit:()=>0,emit(){}},{speed:6});
 assert.equal(module.headlightGain,undefined);
 for(let t=0;t<2;t+=.05)module.update(.05);
 player.y=2.1;player.z=-8.5;module.update(.05);player.z=-7.5;module.update(.05);player.z=2;module.update(.05);
 assert.equal(module.headlightGain,.02);
 player.z=-20;player.y=.55;module.update(.05);assert.equal(module.headlightGain,undefined);module.teardown();
});
