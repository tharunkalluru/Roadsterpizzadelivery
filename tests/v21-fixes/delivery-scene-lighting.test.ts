import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Game} from '../../src/game/game';
import {TruckInterior} from '../../src/delivery/modules/truck-interior';

test('actual constructed truck borrows a fixed engine light, follows each frame and releases it without waiting for the street cadence',()=>{
  const scene=new THREE.Scene(),module=new TruckInterior(),player={x:0,y:.55,z:-25,yaw:Math.PI,speed:0};
  module.setup({scene,destination:{x:0,y:0,z:0},route:[{x:0,y:0,z:0},{x:0,y:0,z:1000}],player:()=>player,emit(){}},{speed:6});
  const lights=[0,1,2].map(()=>new THREE.PointLight('#ffcf8a',22,26,1.6));scene.add(...lights);
  const street=[new THREE.Vector3(2,10,4),new THREE.Vector3(4,10,5),new THREE.Vector3(6,10,7)];
  const story={get sceneLamp(){return module.sceneLamp;}};
  const game:any=Object.assign(Object.create(Game.prototype),{player:{pos:new THREE.Vector3(0,.55,-25)},story,engine:{lampLights:lights,mood:{lampLights:6}},city:{lamps:street},lampT:0,streetLampPositions:[],sceneLampReserved:false});
  game.placeLampLights();assert.equal(scene.getObjectsByProperty('isPointLight',true).length,3);assert.equal(lights[0].intensity,2.5);assert.equal(lights[0].distance,5.5);assert.equal(lights[1].intensity,22);
  const before=lights[0].position.clone();module.update(.1);game.placeLampLights();assert.ok(lights[0].position.z>before.z,'the moving source follows before the 20-frame street refresh');
  assert.equal(game.lampT,19);player.z=100;game.placeLampLights();assert.equal(lights[0].distance,26);assert.equal(lights[0].decay,1.6);assert.equal(lights[0].intensity,22);assert.ok(lights[0].position.equals(street[0]));
  player.z=-25;game.placeLampLights();assert.equal(lights[0].intensity,2.5);
  module.teardown();game.engine.mood.lampLights=0;game.placeLampLights();assert.equal(lights[0].intensity,0);assert.equal(lights[0].distance,26);assert.equal(scene.children.length,3,'module teardown never removes the engine-owned pool');
});
