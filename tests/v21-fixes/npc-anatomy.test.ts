import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Batch,initTemplates,rng,TPL} from '../../src/core/util';
import {drawPerson,drawSeatedPerson,randomPerson,personProportions,personAge,legsVisible,walkerGeometry,trimWalkerGeometryCache,walkerGeometryCacheStats,type PersonSpec} from '../../src/world/people';
import {drawHumanHead,humanAnatomyStats} from '../../src/world/human-anatomy';
import {makeHumanWalkRig} from '../../src/world/human-gait';
initTemplates();
const spec:PersonSpec={kind:'shirt',s:1,walk:1.2,skin:'#8d5a3b',hair:'#201916',a:'#9aafc4',b:'#343b44',c:'#d5d3c7',age:'adult',face:0,build:'average',sleeve:'short',facialHair:false};

test('NPCs include visibly distinct life stages and body proportions, not a scaled adult-only pool',()=>{
 const r=rng(9917),ages=new Map<string,number>(),kinds=new Set<string>(),skins=new Set<string>(),builds=new Set<string>();
 for(let i=0;i<1500;i++){const p=randomPerson(r);ages.set(personAge(p),(ages.get(personAge(p))??0)+1);kinds.add(p.kind);skins.add(p.skin);builds.add(p.build!);if(p.age==='teen')assert.equal(p.facialHair,false);}
 for(const age of ['child','teen','adult','elder'])assert.ok((ages.get(age)??0)>35,`${age} must actually spawn`);
 assert.ok(kinds.has('teen_f')&&kinds.has('teen_m'));assert.equal(skins.size,10);assert.equal(builds.size,3);
 const adult=personProportions(spec),teen=personProportions({...spec,kind:'teen_m',age:'teen'}),child=personProportions({...spec,kind:'schoolboy',age:'child'});
 assert.ok(teen.width<adult.width&&teen.head<child.head&&child.head>adult.head);
});

test('continuous human head stays front-facing, detailed and finite under the gameplay front-face material',()=>{
 const b=new Batch();drawHumanHead((...args)=>b.add(...args),{skin:spec.skin,hair:spec.hair,face:0},0,0,TPL.sphL);const g=b.geometry(),p=g.getAttribute('position'),n=g.getAttribute('normal');
 assert.ok(humanAnatomyStats.sourceTriangles>=2000&&humanAnatomyStats.sourceTriangles<=2600);
 let frontNormals=0,frontCount=0;const front=Math.min(...Array.from(p.array).filter((_,i)=>i%3===2));
 for(let i=0;i<p.count;i++){assert.ok(Number.isFinite(p.getX(i)+p.getY(i)+p.getZ(i)));if(p.getZ(i)<front+.016&&Math.abs(p.getX(i))<.027&&p.getY(i)>-.055&&p.getY(i)<.07){frontNormals+=n.getZ(i);frontCount++;}}
 assert.ok(frontCount>12,'nose and central face must have geometry');assert.ok(frontNormals/frontCount<-.25,'face normals must point toward the viewer, not inside the mirrored head');g.dispose();
});

test('walking anatomy bends knees and elbows in one draw; buffer and skeleton ownership stay bounded',()=>{
 trimWalkerGeometryCache(true);const geo=walkerGeometry(spec,true),shared=walkerGeometry({...spec,s:.94},true),mat=new THREE.MeshStandardMaterial({vertexColors:true});
 assert.equal(geo.rigged,shared.rigged);assert.ok(geo.rigged!.getAttribute('skinIndex'));const rig=makeHumanWalkRig(geo.rigged!,mat,spec,!legsVisible(spec.kind));
 const count=rig.mesh.geometry.getAttribute('position').count;assert.ok(count/3<6500,`NPC triangle budget ${count/3}`);assert.equal(rig.bones.length,17);
 for(let i=0;i<600;i++)rig.update(i/60*6,true,1/60);
 assert.ok(rig.bones.some(b=>b.name.includes('knee')&&Math.abs(b.rotation.x)>.1));assert.ok(rig.bones.some(b=>b.name.includes('elbow')&&Math.abs(b.rotation.x)>.1));
 assert.equal(rig.mesh.children.filter(c=>(c as THREE.Mesh).isMesh).length,0,'limbs are not separate draws');
 const weights=geo.rigged!.getAttribute('skinWeight');for(let i=0;i<weights.count;i++)assert.ok(Math.abs(weights.getX(i)+weights.getY(i)+weights.getZ(i)+weights.getW(i)-1)<1e-6);
 let disposals=0;geo.rigged!.addEventListener('dispose',()=>disposals++);rig.dispose();rig.dispose();geo.release();trimWalkerGeometryCache(true);assert.equal(disposals,0);shared.release();trimWalkerGeometryCache(true);assert.equal(disposals,1);assert.equal(walkerGeometryCacheStats.activeReferences,0);mat.dispose();
});

test('pedestrian and seated appearances are complete finite human geometry within a bounded budget',()=>{
 for(const kind of ['shirt','teen_m','teen_f','sari','salwar','burqa','schoolboy','elder_m','elder_f'] as const){const b=new Batch();drawPerson(b,{...spec,kind},0,0,0);const g=b.geometry();g.computeBoundingBox();assert.ok(g.boundingBox!.max.y>1.5);assert.ok(g.boundingBox!.min.y<.1);assert.ok(g.getAttribute('position').count/3<6500);g.dispose();}
 for(const seat of ['bike','scooter','auto','bench','pillion','pillionSide'] as const){const b=new Batch();drawSeatedPerson(b,spec,0,.8,0,seat);const g=b.geometry();g.computeBoundingBox();assert.ok(g.boundingBox!.max.y>1.6);assert.ok(g.boundingBox!.min.y<.45);assert.ok(g.getAttribute('position').count/3<6500);for(const v of g.getAttribute('position').array)assert.ok(Number.isFinite(v));g.dispose();}
});
