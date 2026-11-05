import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Batch } from '../../src/core/util';
import { rickshawCanopy } from '../../src/world/traffic-coachwork';

test('rickshaw canopy has opaque crown/ends but does not fill the passenger doorways',()=>{
  const b=new Batch();rickshawCanopy(b,'#17161b');
  const geometry=b.geometry(),material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),mesh=new THREE.Mesh(geometry,material);
  mesh.updateMatrixWorld(true);
  const hit=(from:number[],direction:number[])=>new THREE.Raycaster(new THREE.Vector3(...from),new THREE.Vector3(...direction),0,5).intersectObject(mesh).length>0;
  for(const x of [-.4,0,.4]){
    assert.ok(hit([x,1.69,2],[0,0,-1]),'rear curved crown cannot expose the open half-cylinder end');
    assert.ok(hit([x,2.1,0],[0,-1,0]),'solid roof above occupants');
  }
  assert.ok(hit([0,1.76,-2],[0,0,1]),'front curved header closes above windscreen');
  for(const side of [-1,1])assert.equal(hit([side*2,1.15,.35],[-side,0,0]),false,'real passenger entrance stays open');
  const positions=geometry.getAttribute('position');for(let i=0;i<positions.count;i++)for(const axis of ['getX','getY','getZ']as const)assert.ok(Number.isFinite(positions[axis](i)));
  geometry.dispose();material.dispose();
});
