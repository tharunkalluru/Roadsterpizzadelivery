import * as THREE from 'three';
import {initTemplates,TPL} from '../../core/util';
import {drawPerson,legsVisible,type PersonSpec} from '../../world/people';
import {HumanSkinBatch} from '../../world/human-skin';
import {makeHumanWalkRig} from '../../world/human-gait';

const COUNT=16,VARIANTS=4;
const LOOKS:readonly PersonSpec[]=[
 {kind:'sari',age:'adult',s:.95,walk:0,build:'average',skin:'#8d5a3b',hair:'#211b18',a:'#9d3562',b:'#dcac45',c:'#ffe2a0',sleeve:'short',bindi:true,hairstyle:0},
 {kind:'kurta_cap',age:'adult',s:1.03,walk:0,build:'broad',skin:'#6e452f',hair:'#201917',a:'#f0dcb9',b:'#b79862',c:'#e2b15d',sleeve:'long',hairstyle:1},
 {kind:'salwar',age:'teen',s:.90,walk:0,build:'slim',skin:'#b97f55',hair:'#261b19',a:'#4c8b91',b:'#ead9bf',c:'#ca6485',sleeve:'short',hairstyle:1},
 {kind:'shirt',age:'elder',s:.98,walk:0,build:'average',skin:'#9c6644',hair:'#b8b5ac',a:'#8497bd',b:'#484954',c:'#e3cfab',sleeve:'long',facialHair:true,hairstyle:2},
];

/** Bake four restrained celebratory poses from the approved continuous,
 * weighted low-detail humans. No runtime skeleton, bone texture or per-frame
 * geometry update is required by an instanced background procession. */
function dancerGeometry(spec:PersonSpec,variant:number,material:THREE.Material){
 const batch=new HumanSkinBatch();drawPerson(batch,{...spec,s:1},0,0,0,true,0,true);
 const rest=batch.geometry(),skin=batch.skinAttributes();rest.setAttribute('skinIndex',skin.index);rest.setAttribute('skinWeight',skin.weight);
 const rig=makeHumanWalkRig(rest,material,spec,!legsVisible(spec.kind));rig.update(0,false,0);
 const poses=[[-1.75,.8,-.6,-1.0],[-.9,2.0,-.9,-.45],[-1.4,1.4,-.65,-.65],[-.65,1.6,-1.1,-.7]],pose=poses[variant];
 rig.bones[5].rotation.z=pose[0];rig.bones[8].rotation.z=pose[1];rig.bones[6].rotation.x=pose[2];rig.bones[9].rotation.x=pose[3];
 rig.mesh.updateMatrixWorld(true);rig.mesh.skeleton.update();
 const geometry=rest.clone(),p=geometry.getAttribute('position'),n=geometry.getAttribute('normal'),sourceP=rest.getAttribute('position'),sourceN=rest.getAttribute('normal'),v=new THREE.Vector3(),matrix=new THREE.Matrix4(),bone=new THREE.Matrix4();
 for(let i=0;i<p.count;i++){
  rig.mesh.applyBoneTransform(i,v.fromBufferAttribute(sourceP,i));p.setXYZ(i,v.x,v.y,v.z);matrix.elements.fill(0);
  for(let j=0;j<4;j++){bone.fromArray(rig.mesh.skeleton.boneMatrices,skin.index.getComponent(i,j)*16);const w=skin.weight.getComponent(i,j);for(let k=0;k<16;k++)matrix.elements[k]+=bone.elements[k]*w;}
  matrix.premultiply(rig.mesh.bindMatrixInverse).multiply(rig.mesh.bindMatrix);v.fromBufferAttribute(sourceN,i).transformDirection(matrix);n.setXYZ(i,v.x,v.y,v.z);
 }
 geometry.deleteAttribute('skinIndex');geometry.deleteAttribute('skinWeight');geometry.scale(spec.s,spec.s,spec.s);geometry.computeBoundingBox();geometry.computeBoundingSphere();
 geometry.userData.npcDemographic={kind:spec.kind,age:spec.age,build:spec.build,scale:spec.s};
 rig.dispose();rest.dispose();return geometry;
}

/** Exactly sixteen existing procession slots, four shared coloured templates.
 * Route, sway, bob and phase formulas are the previous WeddingHandoff schedule.
 * The helper owns all four meshes/geometries and its one opaque material. */
export class WeddingCrowd {
 readonly group=new THREE.Group();
 readonly meshes:readonly THREE.InstancedMesh[];
 readonly count=COUNT;
 private matrix=new THREE.Matrix4();private position=new THREE.Vector3();
 private rotation=new THREE.Quaternion();private euler=new THREE.Euler();
 private scale=new THREE.Vector3(1,1,1);private disposed=false;private time=0;
 private material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.82,metalness:0});
 constructor(){
  if(!TPL.sphL||!TPL.cyl6)initTemplates();
  this.group.name='delivery-wedding-crowd';
  this.meshes=LOOKS.map((look,i)=>{const mesh=new THREE.InstancedMesh(dancerGeometry(look,i,this.material),this.material,COUNT/VARIANTS);mesh.name=`delivery-wedding-dancers-${i}`;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;mesh.castShadow=false;mesh.receiveShadow=false;this.group.add(mesh);return mesh;});
  this.update(0);
 }
 /** Absolute scene time avoids a second integration clock or invalid-dt ease. */
 update(time:number){
  if(this.disposed)return;if(Number.isFinite(time))this.time=Math.max(0,time);
  const t=this.time,centerZ=-4-Math.sin(t*.085)*9;
  for(let i=0;i<COUNT;i++){
   const side=i%2?1:-1;
   this.position.set(side*(4.6+i%3*.8)+Math.sin(t*2.3+i)*.32,Math.abs(Math.sin(t*3.2+i))*.12,centerZ+6-Math.floor(i/2)*2.2);
   this.rotation.setFromEuler(this.euler.set(0,Math.sin(t*2+i)*.45,Math.sin(t*2.3+i)*.08));
   this.matrix.compose(this.position,this.rotation,this.scale);this.meshes[i%VARIANTS].setMatrixAt(Math.floor(i/VARIANTS),this.matrix);
  }
  for(const mesh of this.meshes)mesh.instanceMatrix.needsUpdate=true;
 }
 getMatrixAt(index:number,target:THREE.Matrix4){if(index<0||index>=COUNT||!Number.isInteger(index))throw new RangeError('Wedding crowd index');this.meshes[index%VARIANTS].getMatrixAt(Math.floor(index/VARIANTS),target);return target;}
 dispose(){if(this.disposed)return;this.disposed=true;for(const mesh of this.meshes){mesh.dispose();mesh.geometry.dispose();}this.material.dispose();this.group.removeFromParent();this.group.clear();}
}
