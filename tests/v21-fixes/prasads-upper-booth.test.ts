import * as THREE from 'three';
import test from 'node:test';
import assert from 'node:assert/strict';
import {Kit,placeLandmarks} from '../../src/world/landmarks';
import {PRASADS_SOURCE_PLAN as PR,drawPrasadsSource} from '../../src/world/prasads-source-model';

test('Prasads upper booth is occluded from the parked roadster but the interior camera is clear',()=>{
 const l=placeLandmarks({lat:17.4063,lon:78.4966}).find(l=>l.id==='prasads')!,meshes:THREE.Mesh[]=[];
 const box=(x:number,y:number,z:number,w:number,h:number,d:number,_colour:string,rotation:{ry:number})=>{
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshBasicMaterial());
  mesh.position.set(x,y,z);mesh.rotation.y=rotation.ry;mesh.updateMatrixWorld();meshes.push(mesh);
 };
 const K=new Kit(l.x!,l.z!,PR.rotation,{B:{st:{box},roof:{tri(){}}},solid(){},obstacle(){},road:()=>false} as any);drawPrasadsSource(K);
 const root=new THREE.Object3D();root.position.set(PR.destination.x,0,PR.destination.z);root.rotation.y=PR.sceneYaw;root.updateMatrixWorld();
 const actor=root.localToWorld(new THREE.Vector3(-2,7.4,-15)),street=new THREE.Vector3(PR.destination.x,1.65,PR.destination.z);
 const occluded=(from:THREE.Vector3,to:THREE.Vector3)=>{const delta=to.clone().sub(from);return new THREE.Raycaster(from,delta.clone().normalize(),.01,delta.length()-.05).intersectObjects(meshes).length>0;};
 assert.equal(occluded(street,actor),true,'upper booth must not be visible through the theatre facade');
 assert.equal(occluded(root.localToWorld(new THREE.Vector3(-1.1,7.6,-13.2)),actor),false,'customer shot stays inside shell');
 const carton=root.localToWorld(new THREE.Vector3(10.5,.62,-8.5));
 const support=new THREE.Raycaster(carton.clone().add(new THREE.Vector3(0,.2,0)),new THREE.Vector3(0,-1,0),0,1).intersectObjects(meshes);
 assert.ok(support.length,JSON.stringify({destination:K.L(PR.destination.x,PR.destination.z),carton:K.L(carton.x,carton.z)}));assert.ok(Math.abs(support[0].point.y-.6)<.01,'carton sits on the exterior top step');
 for(const mesh of meshes){mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();}
});
