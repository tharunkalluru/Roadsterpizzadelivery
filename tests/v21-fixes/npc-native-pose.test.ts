import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import source from '../../src/world/npc-human-v4.json';
import {Batch,initTemplates} from '../../src/core/util';
import {drawPerson,drawSeatedPerson,walkerGeometry,trimWalkerGeometryCache,type PersonSpec,type PersonSeat} from '../../src/world/people';
import {HUMAN_BONES as B,humanSeatMatrices,poseHumanPositions} from '../../src/world/human-skin';
import {makeHumanWalkRig} from '../../src/world/human-gait';
initTemplates();
const spec:PersonSpec={kind:'shirt',s:1,walk:1.2,age:'adult',skin:'#9c6644',hair:'#211b18',a:'#91acbf',b:'#353d4a',c:'#d6d3c7',sleeve:'short',face:0,build:'average'};

test('both production native human meshes remain closed and manifold after reduction, including the joined neck',()=>{
 for(const data of [source.human,source.humanLow]){
  const edges=new Map<string,number>();for(let i=0;i<data.indices.length;i+=3){const tri=data.indices.slice(i,i+3);for(let j=0;j<3;j++){const a=tri[j],b=tri[(j+1)%3],key=a<b?`${a}:${b}`:`${b}:${a}`;edges.set(key,(edges.get(key)??0)+1);}}
  assert.ok([...edges.values()].every(n=>n===2),'edge-cluster holes or cut head/neck rings must never enter the native mesh');
  for(let i=0;i<data.skinWeight.length;i+=4){assert.ok(Math.abs(data.skinWeight.slice(i,i+4).reduce((s,w)=>s+w,0)-1)<1e-6);for(const id of data.skinIndex.slice(i,i+4))assert.ok(id>=0&&id<17);}
 }
});

test('front-facing production seated shins and pelvis remain visible, not inverted or assigned to an arm',()=>{
 const mat=new THREE.MeshBasicMaterial({side:THREE.FrontSide});
 for(const seat of ['bike','scooter','auto','bench','pillion','scooterPillion'] as PersonSeat[]){
  const batch=new Batch();drawSeatedPerson(batch,spec,0,.8,0,seat);const geometry=batch.geometry(),mesh=new THREE.Mesh(geometry,mat);mesh.updateMatrixWorld(true);
  const matrices=humanSeatMatrices(seat),positions=poseHumanPositions(source.humanLow.positions['male-young'],source.humanLow.skinIndex,source.humanLow.skinWeight,matrices);
  for(const bone of [B.kneeL,B.kneeR]){
   const points:THREE.Vector3[]=[];for(let i=0;i<source.humanLow.vertexCount;i++){let w=0;for(let j=0;j<4;j++)if(source.humanLow.skinIndex[i*4+j]===bone)w+=source.humanLow.skinWeight[i*4+j];const y=source.humanLow.positions['male-young'][i*3+1];if(w>.55&&y>.12&&y<.36)points.push(new THREE.Vector3(positions[i*3],positions[i*3+1]+.8,positions[i*3+2]));}
   assert.ok(points.length>=3,`${seat}: real shin influences remain represented`);
   const point=points.reduce((s,p)=>s.add(p),new THREE.Vector3()).multiplyScalar(1/points.length);
   // Use the anatomical shin's own x/y, with a ray from in front of its surface.
   const ray=new THREE.Raycaster(new THREE.Vector3(point.x,point.y,-2),new THREE.Vector3(0,0,1),0,4);
   assert.ok(ray.intersectObject(mesh).length,`${seat}: shin surface must be front-facing and actually drawn`);
  }
  const pelvis=new THREE.Raycaster(new THREE.Vector3(0,.8,-2),new THREE.Vector3(0,0,1),0,4);assert.ok(pelvis.intersectObject(mesh).length,`${seat}: no open crotch/pelvis hole`);geometry.dispose();
 }
 mat.dispose();
});

test('wrapped walkers genuinely move their weighted feet through distinct phases',()=>{
 const mat=new THREE.MeshBasicMaterial();
 for(const kind of ['sari','elder_f','burqa','lungi'] as const){
  const p={...spec,kind},lease=walkerGeometry(p,true),rig=makeHumanWalkRig(lease.rigged!,mat,p,true),geometry=rig.mesh.geometry,positions=geometry.getAttribute('position'),weights=geometry.getAttribute('skinWeight'),ids=geometry.getAttribute('skinIndex');let foot=-1;
  for(let i=0;i<positions.count;i++){let w=0;for(let j=0;j<4;j++)if(ids.getComponent(i,j)===B.ankleL)w+=weights.getComponent(i,j);if(w>.7&&positions.getY(i)<.11){foot=i;break;}}
  assert.ok(foot>=0,`${kind}: feet must keep ankle influences under the garment`);
  const at=(phase:number)=>{for(let j=0;j<120;j++)rig.update(phase,true,1/60);rig.mesh.updateMatrixWorld(true);rig.mesh.skeleton.update();return rig.mesh.applyBoneTransform(foot,new THREE.Vector3().fromBufferAttribute(positions,foot));};
  const a=at(.7),b=at(.7+Math.PI);assert.ok(Math.abs(a.z-b.z)>.08,`${kind}: no fixed-foot sliding column`);rig.dispose();lease.release();
 }
 trimWalkerGeometryCache(true);mat.dispose();
});

test('rear passenger sole targets meet their own supports at varied human scales',()=>{
 for(const scale of [.75,.95,1.05])for(const seat of ['pillion','scooterPillion'] as const){
  const matrices=humanSeatMatrices(seat,scale),scooter=seat==='scooterPillion';
  for(const side of [-1,1]){const bone=side<0?B.ankleL:B.ankleR,sole=new THREE.Vector3(side*.085,.015,-.085).applyMatrix4(matrices[bone]).multiplyScalar(scale);assert.ok(Math.abs(sole.x-side*(scooter?.24:.23))<1e-6);assert.ok(Math.abs(sole.y+(scooter?.49:.47))<1e-6);assert.ok(Math.abs(sole.z+(scooter?.12:.10))<1e-6);}
 }
});

test('a long sleeve covers both anatomical upper arms and forearms, while the short-sleeve forearm remains exposed',()=>{
 for(const sleeve of ['long','short'] as const){const batch=new Batch();drawPerson(batch,{...spec,sleeve},0,0,0);const geometry=batch.geometry(),p=geometry.getAttribute('position'),c=geometry.getAttribute('color'),skin=new THREE.Color(spec.skin);let bareUpper=0,bareForearm=0;
  for(let i=0;i<p.count;i++)if(Math.abs(p.getX(i))>.20&&p.getY(i)>.91&&p.getY(i)<1.26){const bare=Math.abs(c.getX(i)-skin.r)+Math.abs(c.getY(i)-skin.g)+Math.abs(c.getZ(i)-skin.b)<1e-5;if(bare){if(p.getY(i)>1.16)bareUpper++;else bareForearm++;}}
  assert.equal(bareUpper,0,`${sleeve}: upper arms must stay inside the sleeve`);if(sleeve==='long')assert.equal(bareForearm,0,'long-sleeve forearms cannot switch to skin colour');else assert.ok(bareForearm>12,'short sleeves must actually expose the forearms');geometry.dispose();
 }
});

test('rickshaw-specific lowered seats keep soles on the existing floor without moving generic car and bus poses',()=>{
 for(const scale of [.75,.95,1.05])for(const [seat,hip] of [['rickshawDriver',.76],['rickshawPassenger',.78]] as const){
  for(const side of [-1,1]){const matrices=humanSeatMatrices(seat,scale),bone=side<0?B.ankleL:B.ankleR,sole=new THREE.Vector3(side*.085,.015,-.085).applyMatrix4(matrices[bone]).multiplyScalar(scale);assert.ok(Math.abs(sole.y+hip-.33)<1e-6,`${seat}: physical sole must meet .33m auto floor`);}
 }
 const generic=new THREE.Vector3(.085,.015,-.085).applyMatrix4(humanSeatMatrices('auto',1)[B.ankleR]);assert.ok(Math.abs(generic.y+.53)<1e-6);
});

test('invalid first animation delta cannot create extreme walking poses during the first five ticks',()=>{
 const material=new THREE.MeshBasicMaterial();
 for(const kind of ['shirt','teen_f','schoolboy','elder_m','sari','burqa'] as const)for(const first of [-.8,-.05,NaN,Infinity,3,1e9]){
  const p={...spec,kind,age:kind==='schoolboy'?'child':kind==='elder_m'?'elder':kind==='teen_f'?'teen':'adult'} as PersonSpec,lease=walkerGeometry(p,true),rig=makeHumanWalkRig(lease.rigged!,material,p,kind==='sari'||kind==='burqa'),position=rig.mesh.geometry.getAttribute('position');
  for(let tick=0;tick<5;tick++){
   rig.update(.7+tick*.1,true,tick?1/60:first);rig.mesh.updateMatrixWorld(true);rig.mesh.skeleton.update();
   for(const bone of rig.bones){for(const angle of [bone.rotation.x,bone.rotation.y,bone.rotation.z])assert.ok(Number.isFinite(angle)&&Math.abs(angle)<=.70,`${kind}, first dt ${first}, tick ${tick}: joint angle stays inside a walking envelope`);}
   const box=new THREE.Box3();for(let i=0;i<position.count;i++){const v=rig.mesh.applyBoneTransform(i,new THREE.Vector3().fromBufferAttribute(position,i));assert.ok(Number.isFinite(v.x+v.y+v.z));box.expandByPoint(v);}
   assert.ok(box.min.y>-.15&&box.max.y<1.90&&box.min.z>-.65&&box.max.z<.65&&box.min.x>-.45&&box.max.x<.45,`${kind}, first dt ${first}, tick ${tick}: actual body/cloth vertices stay near the person, ${JSON.stringify(box)}`);
  }
  rig.dispose();lease.release();
 }
 trimWalkerGeometryCache(true);material.dispose();
});

test('uploaded float bone palettes match CPU deformation for independent scaled/rotated people sharing one material',()=>{
 const material=new THREE.MeshBasicMaterial(),people:[ReturnType<typeof walkerGeometry>,ReturnType<typeof makeHumanWalkRig>][]=[];
 for(const [i,kind] of (['shirt','sari'] as const).entries()){
  const p={...spec,kind},lease=walkerGeometry(p,true),rig=makeHumanWalkRig(lease.rigged!,material,p,kind==='sari'),parent=new THREE.Group();parent.scale.setScalar(i?.91:1.06);parent.rotation.y=i?Math.PI/2:-.6;parent.position.set(i*2,.12,0);parent.add(rig.mesh);
  for(let t=0;t<90;t++)rig.update(i?3.84:.7,true,1/60);rig.update(NaN,true,NaN);rig.update(Infinity,true,Infinity);parent.updateMatrixWorld(true);rig.mesh.skeleton.computeBoneTexture();rig.mesh.skeleton.update();people.push([lease,rig]);
  const g=rig.mesh.geometry,palette=rig.mesh.skeleton.boneMatrices,ids=g.getAttribute('skinIndex'),weights=g.getAttribute('skinWeight'),positions=g.getAttribute('position'),base=new THREE.Vector4(),gpu=new THREE.Vector4(),v=new THREE.Vector4(),m=new THREE.Matrix4(),cpu=new THREE.Vector3();
  for(let n=0;n<positions.count;n+=17){base.set(positions.getX(n),positions.getY(n),positions.getZ(n),1).applyMatrix4(rig.mesh.bindMatrix);gpu.set(0,0,0,0);for(let j=0;j<4;j++){m.fromArray(palette,ids.getComponent(n,j)*16);gpu.add(v.copy(base).applyMatrix4(m).multiplyScalar(weights.getComponent(n,j)));}gpu.applyMatrix4(rig.mesh.bindMatrixInverse);rig.mesh.applyBoneTransform(n,cpu.fromBufferAttribute(positions,n));assert.ok(cpu.distanceTo(new THREE.Vector3(gpu.x,gpu.y,gpu.z))<1e-6,'GPU palette matrix order, float storage and bind space match the same CPU vertex');}
 }
 assert.notEqual(people[0][1].mesh.skeleton.boneTexture,people[1][1].mesh.skeleton.boneTexture);assert.notEqual(people[0][1].mesh.skeleton.boneMatrices,people[1][1].mesh.skeleton.boneMatrices);
 for(const [lease,rig] of people){rig.dispose();lease.release();}trimWalkerGeometryCache(true);material.dispose();
});
