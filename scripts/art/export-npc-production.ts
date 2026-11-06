/** Offline producer QA uses the exact production Batch geometry. It does not
 * replace the browser/gameplay or independent visual acceptance gates. */
import {mkdirSync,writeFileSync} from 'node:fs';
import {Batch,initTemplates} from '../../src/core/util';
import {drawPerson,drawSeatedPerson,walkerGeometry,legsVisible,trimWalkerGeometryCache,type PersonSpec,type PersonSeat} from '../../src/world/people';
import {makeHumanWalkRig} from '../../src/world/human-gait';
import * as THREE from 'three';
initTemplates();
const out=process.argv[2]??'/tmp/roadster-npc-production-v6';mkdirSync(out,{recursive:true});
const base:PersonSpec={kind:'shirt',s:1,walk:1.2,skin:'#9c6644',hair:'#201916',a:'#91acbf',b:'#353d4a',c:'#ece9dd',sleeve:'short',pattern:'plain',age:'adult',build:'average',face:0,hairstyle:0};
const specs:PersonSpec[]=[
 {...base,kind:'schoolboy',age:'child',s:.73,a:'#eeeeea',b:'#283955',face:2},
 {...base,kind:'teen_m',age:'teen',s:.94,build:'slim',a:'#993d36',b:'#324359',face:3},
 {...base,kind:'teen_f',age:'teen',s:.91,build:'slim',a:'#487c80',b:'#343944',face:2},
 {...base,kind:'shirt',s:1.06,build:'broad',face:1,facialHair:true,sleeve:'long'},
 {...base,kind:'sari',s:.95,skin:'#6e452f',a:'#754471',b:'#b69559',c:'#d6bc82',bindi:true,face:4},
 {...base,kind:'salwar',s:.98,a:'#987b98',b:'#dfd4be',c:'#684c65',face:2,hairstyle:1},
 {...base,kind:'elder_m',age:'elder',s:.98,skin:'#7d5135',hair:'#b7b5ac',a:'#d8d6c7',b:'#b6b7ac',face:5,facialHair:true},
 {...base,kind:'elder_f',age:'elder',s:.92,hair:'#a8a59e',skin:'#b97f55',a:'#9bacae',b:'#e1dece',face:1},
 {...base,kind:'burqa',s:.95,a:'#24262a',b:'#24262a',c:'#3e4046',face:2},
];
for(const view of ['front','profile','faces','seated','seated-side','seated-quarter','stride-a','stride-b','stride-start']){
 const seated=view.startsWith('seated'),walking=view.startsWith('stride'),selected=view==='faces'?[specs[1],specs[3],specs[5],specs[6]]:seated?[specs[3],specs[5],specs[4],specs[1],specs[5],specs[4],specs[2]]:specs,objects=[];
 for(let i=0;i<selected.length;i++){
  const spec=selected[i],batch=new Batch(),x=(i-(selected.length-1)/2)*(view==='faces'?.70:seated?1.05:.72);
  let g:THREE.BufferGeometry;
  if(walking){
   const lease=walkerGeometry(spec,true),material=new THREE.MeshBasicMaterial(),rig=makeHumanWalkRig(lease.rigged!,material,spec,!legsVisible(spec.kind)),phase=(view==='stride-b'?3.84:.7)+i*.39,ticks=view==='stride-start'?5:90;
   // Include the formerly fatal first-delta sequence in every exported walk.
   for(let tick=0;tick<ticks;tick++)rig.update(phase,true,tick?1/60:-.8);
   rig.mesh.updateMatrixWorld(true);rig.mesh.skeleton.update();g=lease.rigged!.clone();const src=lease.rigged!,p=g.getAttribute('position'),n=g.getAttribute('normal'),sourceP=src.getAttribute('position'),sourceN=src.getAttribute('normal'),ids=src.getAttribute('skinIndex'),weights=src.getAttribute('skinWeight'),v=new THREE.Vector3(),skin=new THREE.Matrix4(),bone=new THREE.Matrix4();
   for(let j=0;j<p.count;j++){rig.mesh.applyBoneTransform(j,v.fromBufferAttribute(sourceP,j));p.setXYZ(j,v.x,v.y,v.z);skin.elements.fill(0);for(let k=0;k<4;k++){bone.fromArray(rig.mesh.skeleton.boneMatrices,ids.getComponent(j,k)*16);const w=weights.getComponent(j,k);for(let e=0;e<16;e++)skin.elements[e]+=bone.elements[e]*w;}skin.premultiply(rig.mesh.bindMatrixInverse).multiply(rig.mesh.bindMatrix);v.fromBufferAttribute(sourceN,j).transformDirection(skin);n.setXYZ(j,v.x,v.y,v.z);}
   g.scale(spec.s,spec.s,spec.s);rig.dispose();lease.release();material.dispose();
  }else {if(seated)drawSeatedPerson(batch,spec,0,.60,0,(['bike','scooter','bench','auto','pillion','pillionSide','scooterPillion'] as PersonSeat[])[i]);else drawPerson(batch,view==='faces'?{...spec,s:1}:spec,0,0,0);g=batch.geometry();}
  const rot=view==='profile'||view==='seated-side'||walking?Math.PI/2:view==='seated-quarter'?.60:0;g.applyMatrix4(new THREE.Matrix4().makeRotationY(rot));g.translate(x,0,0);
  objects.push({name:spec.kind,position:Array.from(g.getAttribute('position').array),normal:Array.from(g.getAttribute('normal').array),color:Array.from(g.getAttribute('color').array)});g.dispose();
 }
 writeFileSync(`${out}/${view}.json`,JSON.stringify({view,objects,width:view==='faces'?3.1:seated?8:7.7,targetY:view==='faces'?1.55:seated?.7:.83,height:view==='faces'?.9:3.1}));
}
console.log(out);
trimWalkerGeometryCache(true);
