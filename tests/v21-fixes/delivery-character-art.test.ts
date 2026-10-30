import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSceneCharacter, prewarmSceneCharacterAssets, sceneCharacterAssetStats, type CharacterStyle } from '../../src/delivery/modules/character';
import { CharacterSculpt } from '../../src/delivery/modules/character-sculpt';

const styles:CharacterStyle[]=['pushpa','simhadri','trainHero','gabbar','jersey','imax','director','extra','unknown'];
function actor(style:CharacterStyle,seated=false){
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.MeshBasicMaterial>();
  const character=createSceneCharacter(style,seated,{geometry:g=>{geometries.add(g);return g;},material:(_,m)=>materials.add(m)});
  return{character,geometries,materials,dispose(){geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}};
}

test('all scene actors remain a bounded set of opaque merged draws with physical facial surfaces',()=>{
  for(const style of styles){
    const f=actor(style),meshes:THREE.Mesh[]=[];f.character.group.traverse(n=>{if(n instanceof THREE.Mesh)meshes.push(n);});
    assert.ok(meshes.length>=3&&meshes.length<=4,`${style} actor and prop draws`);
    assert.equal(f.materials.size,1,'body, hands and costume use one owned vertex-lit material');
    let triangles=0;
    for(const mesh of meshes){
      const g=mesh.geometry,p=g.getAttribute('position'),c=g.getAttribute('color');
      assert.ok(f.geometries.has(g),'every merged geometry belongs to the module lifecycle');
      assert.equal(mesh.material,[...f.materials][0]);triangles+=(g.index?.count??p.count)/3;
      assert.ok(p.count>0&&c.count===p.count);assert.ok(g.boundingBox&&g.boundingSphere);
      for(let i=0;i<p.count;i++)assert.ok(Number.isFinite(p.getX(i))&&Number.isFinite(p.getY(i))&&Number.isFinite(p.getZ(i)));
    }
    assert.ok(triangles>7500&&triangles<16000,`${style}: detail stays within the actor geometry budget`);
    const material=[...f.materials][0];assert.equal(material.transparent,false);assert.equal(material.opacity,1);assert.equal(material.map,null);assert.equal(material.vertexColors,true);
    f.dispose();
  }
});

test('adult body and head proportions replace the oversized primitive head',()=>{
  for(const style of styles){
    const f=actor(style),bounds=new THREE.Box3().setFromObject(f.character.group),size=bounds.getSize(new THREE.Vector3());
    assert.ok(size.y>1.8&&size.y<2.03,`${style}: adult height`);
    const body=f.character.group.getObjectByName(`delivery-character-${style}-body`) as THREE.Mesh;
    const positions=body.geometry.getAttribute('position');let lo=Infinity,hi=-Infinity;
    for(let i=0;i<positions.count;i++)if(positions.getY(i)>1.61){lo=Math.min(lo,positions.getX(i));hi=Math.max(hi,positions.getX(i));}
    assert.ok(hi-lo>.18&&hi-lo<.29,`${style}: natural head width, including hair/ears`);
    assert.ok(size.x>2*(hi-lo),'shoulders and arms remain wider than the head');f.dispose();
  }
});

test('sculpted ring surfaces face outward and include directional vertex shading',()=>{
  const sculpt=new CharacterSculpt();sculpt.rings([[0,.2,.1,0],[1,.2,.1,0]],'#AD7956',24);
  const g=sculpt.finish(),p=g.getAttribute('position'),n=g.getAttribute('normal'),colors=g.getAttribute('color');let front=0,back=0;
  for(let i=0;i<p.count;i++){
    if(p.getZ(i)>.095){assert.ok(n.getZ(i)>.8,'front surface is not culled from outside');front++;}
    if(p.getZ(i)<-.095){assert.ok(n.getZ(i)<-.8,'rear surface is not inside out');back++;}
  }
  assert.ok(front>0&&back>0);
  let min=Infinity,max=-Infinity;for(let i=0;i<colors.count;i++){min=Math.min(min,colors.getX(i));max=Math.max(max,colors.getX(i));}
  assert.ok(max-min>.05,'baked directional form remains legible without actor lights');g.dispose();
});

test('the real catch anchor follows the geometric hand positions through standing and seated catches',()=>{
  for(const seated of[false,true]){
    const f=actor('pushpa',seated),c=f.character,handMidpoint=new THREE.Vector3(),point=new THREE.Vector3(),world=new THREE.Vector3();
    for(const amount of[0,.25,.5,.75,1]){
      c.catchPose(amount);c.group.updateMatrixWorld(true);handMidpoint.set(0,0,0);
      for(const arm of[c.leftArm,c.rightArm]){
        const mesh=arm.children.find(n=>n instanceof THREE.Mesh) as THREE.Mesh,p=mesh.geometry.getAttribute('position');let count=0;const average=new THREE.Vector3();
        for(let i=0;i<p.count;i++)if(seated?p.getY(i)<-.31&&p.getZ(i)>.18:p.getY(i)<-.47){point.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);average.add(point);count++;}
        assert.ok(count>30,'a shaped palm and separate fingers are present');handMidpoint.add(average.multiplyScalar(1/count));
      }
      handMidpoint.multiplyScalar(.5);c.catchPoint!.getWorldPosition(world);
      assert.ok(world.distanceTo(handMidpoint)<.035,`catch anchor is at hands, not elbows: ${seated}/${amount}`);
    }
    f.dispose();
  }
});

test('the seated reader holds an actual book near his hands and returns to the reading pose',()=>{
  const f=actor('pushpa',true),c=f.character;c.group.updateMatrixWorld(true);
  assert.ok(c.book instanceof THREE.Mesh);const book=new THREE.Box3().setFromObject(c.book!).getCenter(new THREE.Vector3()),hands=c.catchPoint!.getWorldPosition(new THREE.Vector3());
  assert.ok(Math.abs(hands.y-book.y)<.06&&Math.abs(hands.z-book.z)<.06,'book rests between the reading hands');
  const before=c.leftArm.rotation.x,restZ=c.catchPoint!.position.z;c.catchPose(1);assert.ok(c.catchPoint!.position.z>restZ+.07,'bent arms bring hands forward for the catch');c.catchPose(0);assert.equal(c.leftArm.rotation.x,before);
  const geometry=[...f.geometries],materials=[...f.materials];for(let frame=0;frame<1200;frame++)c.catchPose((frame%60)/59);
  assert.deepEqual([...f.geometries],geometry);assert.deepEqual([...f.materials],materials,'catch animation creates no geometry or material');
  c.catchPose(NaN);assert.ok(Number.isFinite(c.catchPoint!.position.y));f.dispose();
});

test('all registered actor resources release once under the owning lifecycle',()=>{
  const f=actor('director');let geo=0,mat=0;f.geometries.forEach(g=>g.addEventListener('dispose',()=>geo++));f.materials.forEach(m=>m.addEventListener('dispose',()=>mat++));
  f.dispose();assert.equal(geo,f.geometries.size);assert.equal(mat,1);
});


test('concurrent initial prewarming is idempotent and retains a bounded CPU asset pool',async()=>{
  const first=prewarmSceneCharacterAssets(),second=prewarmSceneCharacterAssets();assert.equal(first,second);await Promise.all([first,second]);
  const prepared=sceneCharacterAssetStats();assert.equal(prepared.productionTemplates,9);assert.ok(prepared.templates<=18);assert.ok(prepared.retainedTypedArrayBytes<7.5*1024*1024);
  await prewarmSceneCharacterAssets();assert.deepEqual(sceneCharacterAssetStats(),prepared);
});

test('two actors own independent GPU wrappers and poses while sharing immutable CPU arrays',()=>{
  const a=actor('pushpa',true),b=actor('pushpa',true),name='delivery-character-pushpa-body';
  const ga=(a.character.group.getObjectByName(name) as THREE.Mesh).geometry,gb=(b.character.group.getObjectByName(name) as THREE.Mesh).geometry;
  assert.notEqual(ga,gb);assert.notEqual(ga.getAttribute('position'),gb.getAttribute('position'));
  assert.equal(ga.getAttribute('position').array,gb.getAttribute('position').array,'only read-only CPU arrays are shared');
  assert.notEqual([...a.materials][0],[...b.materials][0]);
  const array=gb.getAttribute('position').array,before=Array.from(array.slice(0,48)),pose=b.character.leftArm.rotation.x;
  a.character.catchPose(1);assert.equal(b.character.leftArm.rotation.x,pose);assert.deepEqual(Array.from(array.slice(0,48)),before);
  let otherDisposals=0;b.geometries.forEach(g=>g.addEventListener('dispose',()=>otherDisposals++));b.materials.forEach(m=>m.addEventListener('dispose',()=>otherDisposals++));
  a.dispose();assert.equal(otherDisposals,0,'one delivery cannot dispose the other actor buffers or material');
  const c=actor('pushpa',true);assert.equal((c.character.group.getObjectByName(name) as THREE.Mesh).geometry.getAttribute('position').array,array,'the immutable template survives instance teardown');
  b.character.catchPose(.5);assert.ok(Number.isFinite(b.character.catchPoint!.position.y));b.dispose();c.dispose();
});
