import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {InstancePreparation} from '../../src/delivery/art/instance-preparation';
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};

test('all four independently skinned platform actors prepare serially before being exposed, without replacing their owned assets',async()=>{
  const actors=Array.from({length:4},()=>new THREE.Group()),calls:THREE.Group[]=[],resolvers:(()=>void)[]=[];
  const gate=new InstancePreparation({now:()=>0,warm:root=>{calls.push(root);return new Promise(resolve=>resolvers.push(resolve));}});
  const material=new THREE.MeshStandardMaterial(),mesh=new THREE.Mesh(new THREE.BoxGeometry(),material);actors[0].add(mesh);
  actors.forEach(actor=>gate.add(actor));await flush();assert.deepEqual(calls,[actors[0]]);assert.equal(gate.ready,false);assert.ok(actors.every(actor=>!actor.visible));
  for(let i=0;i<4;i++){resolvers[i]();await flush();assert.equal(actors[i].visible,true);assert.equal(calls.length,Math.min(4,i+2));}
  assert.equal(gate.ready,true);assert.equal(mesh.material,material);assert.equal(actors[0].children[0],mesh);assert.equal(mesh.parent,actors[0]);
});

test('a failed actor remains hidden, retries after five active seconds and does not hold preparation of other actors',async()=>{
  let time=0,calls=0;const first=new THREE.Group(),second=new THREE.Group();
  const gate=new InstancePreparation({now:()=>time,warm:async root=>{calls++;if(root===first&&calls===1)throw Error('interrupted graphics');}});
  gate.add(first);gate.add(second);await flush();assert.equal(calls,2);assert.equal(first.visible,false);assert.equal(second.visible,true);assert.equal(gate.ready,false);
  time=4.99;gate.tick();await flush();assert.equal(calls,2);time=5;gate.tick();await flush();assert.equal(calls,3);assert.equal(first.visible,true);assert.equal(gate.ready,true);
});

test('scene teardown invalidates pending work and cannot reveal a retired actor or prepare queued obsolete actors',async()=>{
  let resolve!:()=>void,valid!:()=>boolean,calls=0;const first=new THREE.Group(),second=new THREE.Group();
  const gate=new InstancePreparation({now:()=>0,warm:async(_root,current)=>{calls++;valid=current;await new Promise<void>(done=>resolve=done);}});
  gate.add(first);gate.add(second);await flush();assert.equal(valid(),true);gate.dispose();assert.equal(valid(),false);resolve();await flush();assert.equal(calls,1);assert.equal(first.visible,false);assert.equal(second.visible,false);assert.equal(gate.ready,false);
  const unused=new THREE.Group();gate.add(unused);assert.equal(unused.visible,true);
});

test('a hidden authored instance remains intentionally hidden after preparation; disposal before its task never invokes the renderer',async()=>{
  const hidden=new THREE.Group();hidden.visible=false;let calls=0;
  const prepared=new InstancePreparation({now:()=>0,warm:async()=>{calls++;}});prepared.add(hidden);await flush();assert.equal(prepared.ready,true);assert.equal(hidden.visible,false);
  const cancelled=new InstancePreparation({now:()=>0,warm:async()=>{calls++;}});cancelled.add(new THREE.Group());cancelled.dispose();await flush();assert.equal(calls,1);
});
