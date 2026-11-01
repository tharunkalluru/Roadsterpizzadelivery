import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { applySceneLamp, SCENE_READING_LIGHT, SCENE_PORCH_LIGHT, SCENE_LANTERN_LIGHT, SCENE_UNDERWATER_LIGHT, SCENE_STREET_LIGHT, SCENE_METRO_LIGHT, STREET_LAMP_DEFAULTS } from '../../src/game/scene-lamp-pool';

test('a cabin borrows one existing physical light without changing scene membership or light identities', () => {
  const scene = new THREE.Scene(), lights = Array.from({ length: 3 }, () => new THREE.PointLight('#ffcf8a', 0, 26, 1.6));
  scene.add(...lights);
  const children = scene.children.slice(), slot = lights[0], color = slot.color, position = slot.position, shadow = slot.shadow;
  slot.visible = false; // The helper never changes scene visibility, even for a hidden owner.
  const request = { position: new THREE.Vector3(2, 3, 4) };
  assert.equal(applySceneLamp(slot, request, null, 0, 0), true);
  assert.deepEqual(slot.position.toArray(), [2, 3, 4]);
  assert.equal(slot.color.getHexString(), 'ffe0b0');
  assert.equal(slot.intensity, SCENE_READING_LIGHT.intensity);
  assert.equal(slot.distance, 5.5); assert.equal(slot.decay, 2);
  assert.equal(slot.color, color); assert.equal(slot.position, position); assert.equal(slot.shadow, shadow);
  assert.equal(slot.visible, false); assert.equal(slot.parent, scene); assert.deepEqual(scene.children, children);
  assert.equal(scene.children.filter(child => (child as THREE.PointLight).isPointLight).length, 3);
  assert.equal(lights[1].intensity, 0); assert.equal(lights[2].intensity, 0);
  // Copy the request coordinates; the light never aliases a moving source vector.
  request.position.set(12, 13, 14);
  assert.deepEqual(slot.position.toArray(), [2, 3, 4]);
  applySceneLamp(slot, request, null, 0, 0);
  assert.deepEqual(slot.position.toArray(), [12, 13, 14]);
});

test('releasing or replacing a scene request restores street properties and the exact mood threshold', () => {
  const slot = new THREE.PointLight(), street = new THREE.Vector3(20, 8, 30);
  for (const [mood, index, intensity] of [[0, 0, 0], [0.49, 0, 0], [0.5, 0, 22], [2.49, 2, 0], [2.5, 2, 22], [6, 5, 22]]) {
    applySceneLamp(slot, { position: { x: 1, y: 2, z: 3 } }, street, mood, index);
    assert.equal(applySceneLamp(slot, null, street, mood, index), false);
    assert.deepEqual(slot.position.toArray(), [20, 8, 30]);
    assert.equal(slot.color.getHexString(), 'ffcf8a'); assert.equal(slot.intensity, intensity);
    assert.equal(slot.distance, STREET_LAMP_DEFAULTS.distance); assert.equal(slot.decay, STREET_LAMP_DEFAULTS.decay);
  }
  applySceneLamp(slot, null, null, 6, 0);
  assert.deepEqual(slot.position.toArray(), [0, -200, 0], 'unused pool slots retain the engine\'s underground parking location');
  assert.equal(slot.intensity, 22);
});

test('malformed scene or street positions cannot send nonfinite values into the renderer', () => {
  const slot = new THREE.PointLight(), street = { x: 9, y: 8, z: 7 };
  const invalid = [{ x: NaN, y: 2, z: 3 }, { x: 1, y: Infinity, z: 3 }, { x: 1, y: 2, z: -Infinity }];
  for (const position of invalid) {
    assert.equal(applySceneLamp(slot, { position }, street, 3, 0), false);
    assert.deepEqual(slot.position.toArray(), [9, 8, 7]);
    assert.equal(slot.intensity, 22); assert.equal(slot.distance, 26);
    applySceneLamp(slot, null, position, 0, 0);
    assert.deepEqual(slot.position.toArray(), [0, -200, 0]); assert.equal(slot.intensity, 0);
  }
  assert.equal(applySceneLamp(slot, {} as any, street, 0, 0), false);
  assert.deepEqual(slot.position.toArray(), [9, 8, 7]);
});

test('moving cabin updates preserve position/color resources and day-to-night release works immediately', () => {
  const slot = new THREE.PointLight(), position = slot.position, color = slot.color;
  const source = { position: { x: 0, y: 2.8, z: 0 } };
  for (let frame = 0; frame < 120; frame++) {
    source.position.x = frame * 0.25; source.position.z = frame * -0.5;
    assert.equal(applySceneLamp(slot, source, null, frame < 60 ? 0 : 6, 0), true);
    assert.equal(slot.position, position); assert.equal(slot.color, color);
    assert.equal(slot.intensity, SCENE_READING_LIGHT.intensity); assert.equal(slot.position.x, source.position.x); assert.equal(slot.position.z, source.position.z);
  }
  applySceneLamp(slot, null, { x: 5, y: 8, z: 10 }, 0, 0); assert.equal(slot.intensity, 0);
  applySceneLamp(slot, null, { x: 5, y: 8, z: 10 }, 6, 0); assert.equal(slot.intensity, 22);
});
test('an underwater worklight uses the same pool identity, its bounded preset and the ordinary release path',()=>{
 const scene=new THREE.Scene(),slot=new THREE.PointLight();scene.add(slot);const position=slot.position,color=slot.color;
 applySceneLamp(slot,{position:{x:1,y:-4,z:2},kind:'underwater'},null,6,0);
 assert.equal(slot.color.getHexString(),'b9dde1');assert.equal(slot.intensity,SCENE_UNDERWATER_LIGHT.intensity);assert.equal(slot.distance,8);assert.equal(slot.decay,2);
 assert.equal(slot.position,position);assert.equal(slot.color,color);assert.equal(scene.children.length,1);
 applySceneLamp(slot,null,{x:2,y:8,z:1},6,0);assert.equal(slot.color.getHexString(),'ffcf8a');assert.equal(slot.intensity,22);assert.equal(slot.distance,26);
});
test('pedestrian-route lighting borrows the existing slot and releases the ordinary street calibration',()=>{
 const scene=new THREE.Scene(),slot=new THREE.PointLight();scene.add(slot);const color=slot.color,position=slot.position;
 applySceneLamp(slot,{position:{x:4,y:4.01,z:-12},kind:'street-scene'},null,6,0);
 assert.equal(slot.intensity,SCENE_STREET_LIGHT.intensity);assert.equal(slot.color.getHexString(),'ffe6c2');assert.equal(slot.distance,26);assert.equal(slot.decay,1.6);
 assert.equal(slot.position,position);assert.equal(slot.color,color);assert.equal(scene.children.length,1);
 applySceneLamp(slot,null,{x:0,y:8,z:20},6,0);assert.equal(slot.intensity,22);assert.equal(slot.distance,26);assert.equal(slot.color.getHexString(),'ffcf8a');
});

test('a villa porch can illuminate a dark-clothed customer without changing other reading fixtures or adding lights',()=>{
 const scene=new THREE.Scene(),slot=new THREE.PointLight();scene.add(slot);const position=slot.position,color=slot.color;
 applySceneLamp(slot,{position:{x:-2.6,y:2.91,z:-1.9},kind:'porch'},null,6,0);
 assert.equal(slot.intensity,SCENE_PORCH_LIGHT.intensity);assert.equal(slot.distance,7);assert.equal(slot.decay,2);assert.equal(slot.color.getHexString(),'ffe0b0');
 assert.equal(slot.position,position);assert.equal(slot.color,color);assert.equal(scene.children.length,1);
 applySceneLamp(slot,{position:{x:0,y:3,z:0},kind:'reading'},null,6,0);assert.equal(slot.intensity,SCENE_READING_LIGHT.intensity);assert.equal(slot.distance,5.5);
 applySceneLamp(slot,null,{x:0,y:8,z:4},6,0);assert.equal(slot.intensity,22);assert.equal(slot.distance,26);
});

test('the haunted lantern borrows the existing pool slot and restores its ordinary street role',()=>{
 const scene=new THREE.Scene(),slot=new THREE.PointLight();scene.add(slot);const position=slot.position,color=slot.color;
 applySceneLamp(slot,{position:{x:-4.95,y:6.1,z:-2.0625},kind:'lantern'},null,6,0);
 assert.equal(slot.intensity,SCENE_LANTERN_LIGHT.intensity);assert.equal(slot.distance,12);assert.equal(slot.decay,2);assert.equal(slot.color.getHexString(),'ffd49a');
 assert.equal(slot.position,position);assert.equal(slot.color,color);assert.equal(scene.children.length,1);assert.equal(slot.castShadow,false);
 applySceneLamp(slot,null,{x:0,y:8,z:4},6,0);assert.equal(slot.intensity,22);assert.equal(slot.distance,26);assert.equal(slot.decay,1.6);assert.equal(slot.color.getHexString(),'ffcf8a');
});

test('a real platform diffuser borrows the existing slot and restores street lighting without adding lights or shadows',()=>{
 const scene=new THREE.Scene(),slot=new THREE.PointLight();scene.add(slot);const position=slot.position,color=slot.color;
 applySceneLamp(slot,{position:{x:10,y:16.7,z:20},kind:'metro-platform'},null,6,0);
 assert.equal(slot.intensity,SCENE_METRO_LIGHT.intensity);assert.equal(slot.distance,18);assert.equal(slot.decay,2);assert.equal(slot.color.getHexString(),'e7f2ff');
 assert.equal(slot.position,position);assert.equal(slot.color,color);assert.equal(scene.children.length,1);assert.equal(slot.castShadow,false);
 applySceneLamp(slot,null,{x:0,y:8,z:4},6,0);assert.equal(slot.intensity,22);assert.equal(slot.distance,26);assert.equal(slot.decay,1.6);assert.equal(slot.color.getHexString(),'ffcf8a');
});
