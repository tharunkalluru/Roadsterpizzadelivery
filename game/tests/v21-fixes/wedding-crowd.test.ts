import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {WeddingCrowd} from '../../src/delivery/art/wedding-crowd';

test('wedding crowd keeps sixteen anatomical, internally coloured people in four bounded instanced draws',()=>{
 const crowd=new WeddingCrowd();assert.equal(crowd.count,16);assert.equal(crowd.meshes.length,4);assert.equal(crowd.meshes.reduce((n,m)=>n+m.count,0),16);
 const ages=new Set<string>(),kinds=new Set<string>();let triangles=0;
 for(const mesh of crowd.meshes){const g=mesh.geometry,p=g.getAttribute('position'),n=g.getAttribute('normal'),c=g.getAttribute('color');assert.ok(p.count>6500&&p.count<12000,'reduced native anatomy, not primitive stick bodies');assert.equal(mesh.instanceColor,null,'preserve skin/hair/clothes colours within each person');assert.equal(g.getAttribute('skinWeight'),undefined,'baked background dancers have no runtime bone uploads');const colours=new Set<string>();
  for(let i=0;i<p.count;i++){assert.ok(Number.isFinite(p.getX(i)+p.getY(i)+p.getZ(i)+n.getX(i)+n.getY(i)+n.getZ(i)));colours.add([c.getX(i),c.getY(i),c.getZ(i)].map(v=>Math.round(v*100)).join(':'));}assert.ok(colours.size>=4,'separate face, hair, top and lower costume colours');
  const bounds=g.boundingBox!;assert.ok(bounds.min.y>-.10&&bounds.max.y<2.25&&bounds.min.x>-.8&&bounds.max.x<.8,'dancing anatomy stays in a plausible local envelope');ages.add(g.userData.npcDemographic.age);kinds.add(g.userData.npcDemographic.kind);triangles+=p.count/3*mesh.count;
 }
 assert.ok(ages.has('teen')&&ages.has('adult')&&ages.has('elder'));assert.equal(kinds.size,4);assert.ok(triangles<60000,'whole sixteen-person crowd stays below its bounded local budget');crowd.dispose();
});

test('wedding procession preserves every existing route, bob and sway slot across time and invalid clock input',()=>{
 const crowd=new WeddingCrowd(),m=new THREE.Matrix4(),v=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();
 for(const t of [0,.7,4,37]){crowd.update(t);for(let i=0;i<16;i++){crowd.getMatrixAt(i,m).decompose(v,q,s);const side=i%2?1:-1;assert.ok(Math.abs(v.x-(side*(4.6+i%3*.8)+Math.sin(t*2.3+i)*.32))<1e-6);assert.ok(Math.abs(v.y-Math.abs(Math.sin(t*3.2+i))*.12)<1e-6);assert.ok(Math.abs(v.z-(-4-Math.sin(t*.085)*9+6-Math.floor(i/2)*2.2))<2e-6);assert.ok(s.distanceTo(new THREE.Vector3(1,1,1))<1e-6);}}
 const before=crowd.getMatrixAt(3,m).clone();crowd.update(NaN);assert.deepEqual(crowd.getMatrixAt(3,m).elements,before.elements);crowd.update(Infinity);assert.deepEqual(crowd.getMatrixAt(3,m).elements,before.elements);crowd.dispose();
});

test('wedding crowd owns and disposes exactly its four geometries, four instance buffers and one material',()=>{
 const crowd=new WeddingCrowd(),scene=new THREE.Scene();scene.add(crowd.group);let geometries=0,instances=0,materials=0;const material=crowd.meshes[0].material as THREE.Material;
 material.addEventListener('dispose',()=>materials++);for(const mesh of crowd.meshes){mesh.addEventListener('dispose',()=>instances++);mesh.geometry.addEventListener('dispose',()=>geometries++);}
 crowd.dispose();crowd.dispose();crowd.update(5);assert.equal(geometries,4);assert.equal(instances,4);assert.equal(materials,1);assert.equal(scene.children.length,0);
});
