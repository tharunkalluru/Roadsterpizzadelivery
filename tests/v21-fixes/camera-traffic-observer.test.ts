import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { cameraTrafficMeshProbe, cameraTrafficSnapshot } from '../../src/delivery/qa/camera-traffic-observer';
import type { Game } from '../../src/game/game';

function fixture() {
  const camera=new THREE.PerspectiveCamera(60,844/390,.3,900);camera.position.set(0,2.4,6.8);camera.updateMatrixWorld(true);
  const truck=new THREE.Group();truck.position.set(1.5,.02,10.5);
  const geometry=new THREE.BoxGeometry(2.5,3.1,8.4),mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());mesh.position.y=1.55;truck.add(mesh);truck.updateMatrixWorld(true);
  const car={kind:'truck',group:'truck',edge:{e:{id:'straight'}},dir:1,lane:1.5,s:100,x:1.5,y:0,z:10.5,hx:0,hz:-1,size:[2.5,3.1,8.4],speed:0,g:truck};
  const game={t:4,paused:true,player:{pos:new THREE.Vector3(0,.55,0),yaw:0,forward:new THREE.Vector3(0,0,-1),speed:0,lastSupport:0,
    flying:false,jumping:false,descending:false,group:new THREE.Group()},engine:{camera},camPos:camera.position.clone(),camLook:new THREE.Vector3(0,1.6,-3.6),traffic:{cars:[car]}} as unknown as Game;
  return {game,camera,truck,geometry,mesh};
}

test('phone lens can cross a legally separated truck while the eye-only hide test remains false',()=>{
  const f=fixture();
  try{
    const snapshot=cameraTrafficSnapshot(f.game,{build:'test-build',source:'read-only-fixture'},true),c=snapshot.nearby[0];
    assert.equal(snapshot.build,'test-build');assert.equal(snapshot.paused,true);assert.equal(snapshot.nearby.length,1);
    assert.equal(c.nominalPlayerOverlap,false);assert.equal(c.sweptPlayerMarginOverlap,false);
    assert.ok(Math.abs(c.nominalAlignedBumperGap-3.9)<1e-10);
    assert.equal(c.eyeInsideHideVolume,false);assert.equal(c.display.visible,true);
    assert.ok(c.displayedMesh!.nearPlaneCrossings>0,'actual displayed triangles reach the phone near plane despite a clear eye point');
    f.camera.aspect=1;f.camera.updateProjectionMatrix();
    assert.equal(cameraTrafficMeshProbe(f.truck,f.camera).nearPlaneCrossings,0,'narrower lens is a meaningful negative control at the identical vehicle/eye pose');
  }finally{f.geometry.dispose();(f.mesh.material as THREE.Material).dispose();}
});

test('snapshot copies literal transforms and never mutates the paused scene or geometry caches',()=>{
  const f=fixture();
  try{
    f.truck.rotation.set(.08,.11,0,'YXZ');f.truck.updateMatrixWorld(true);
    const before={matrix:f.truck.matrixWorld.toArray(),camera:f.camera.matrixWorld.toArray(),inverse:f.camera.matrixWorldInverse.toArray(),projection:f.camera.projectionMatrix.toArray(),pose:f.truck.position.toArray(),rotation:f.truck.rotation.toArray(),bounds:f.geometry.boundingBox,index:f.geometry.index?.version};
    const snapshot=cameraTrafficSnapshot(f.game,{build:'copy-check',source:'fixture'},true);
    assert.deepEqual(snapshot.nearby[0].display.rotation,f.truck.rotation.toArray());
    snapshot.nearby[0].position[0]=999;snapshot.camera.matrixWorld[0]=999;snapshot.nearby[0].size[0]=999;
    assert.equal(f.game.traffic.cars[0].x,1.5);assert.equal(f.game.traffic.cars[0].size[0],2.5);
    assert.deepEqual({matrix:f.truck.matrixWorld.toArray(),camera:f.camera.matrixWorld.toArray(),inverse:f.camera.matrixWorldInverse.toArray(),projection:f.camera.projectionMatrix.toArray(),pose:f.truck.position.toArray(),rotation:f.truck.rotation.toArray(),bounds:f.geometry.boundingBox,index:f.geometry.index?.version},before);
    f.truck.visible=false;
    assert.equal(cameraTrafficMeshProbe(f.truck,f.camera).meshes,0,'hidden vehicle geometry cannot be reported as render-enabled');
  }finally{f.geometry.dispose();(f.mesh.material as THREE.Material).dispose();}
});
