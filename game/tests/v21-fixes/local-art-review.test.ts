import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { preparePushpaArtReview, prepareLocalCharacterArtReview, PUSHPA_ART_REVIEW, validateLocalArtDescriptor, type LocalArtReviewDependencies } from '../../src/delivery/qa/pushpa-art-review';
import { LocalSceneArtReview, sceneReviewCandidates } from '../../src/delivery/qa/scene-art-review';
import type { CharacterRigContract } from '../../src/delivery/art/released-gltf';
import { createDeliveryQA } from '../../src/delivery/qa';
import { CampaignQARecorder } from '../../src/delivery/qa/campaign-recorder';
import { loadLevels } from '../../src/delivery/content/levels';
import { campaignRequiredFacts, campaignScenario } from '../../src/delivery/qa/campaign-scenarios';

const bytes=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value)).buffer;
const hash=async(value:ArrayBuffer)=>createHash('sha256').update(new Uint8Array(value)).digest('hex');
const flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
function glb(document:unknown={asset:{version:'2.0'},buffers:[]}){
  const json=new TextEncoder().encode(JSON.stringify(document)),n=Math.ceil(json.length/4)*4,result=new ArrayBuffer(20+n),view=new DataView(result);
  view.setUint32(0,0x46546c67,true);view.setUint32(4,2,true);view.setUint32(8,result.byteLength,true);view.setUint32(12,n,true);view.setUint32(16,0x4e4f534a,true);
  new Uint8Array(result,20).fill(32);new Uint8Array(result,20,json.length).set(json);return result;
}
async function fixture(external=false){
  const root=new THREE.Group();root.name='ReaderScene';
  const geometry=new THREE.BoxGeometry(.6,1.8,.3);geometry.translate(0,.9,0);
  const n=geometry.attributes.position.count,indices=new Uint16Array(n*4),weights=new Float32Array(n*4);for(let i=0;i<n;i++)weights[i*4]=1;
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
  const material=new THREE.MeshBasicMaterial({color:'#a26e39'}),mesh=new THREE.SkinnedMesh(geometry,material);mesh.name='ReaderBody';
  const pelvis=new THREE.Bone();pelvis.name='Hips';const left=new THREE.Bone();left.name='LeftArm';left.position.set(-.2,1.4,0);
  const right=new THREE.Bone();right.name='RightArm';right.position.set(.2,1.4,0);pelvis.add(left,right);mesh.add(pelvis);mesh.bind(new THREE.Skeleton([pelvis,left,right]));root.add(mesh);
  const catchPoint=new THREE.Object3D();catchPoint.name='PizzaCatch';right.add(catchPoint);
  const book=new THREE.Mesh(new THREE.BoxGeometry(.3,.03,.2),new THREE.MeshBasicMaterial({color:'#d3c5a0'}));book.name='JapaneseBook';book.position.set(0,1.1,.2);root.add(book);root.updateMatrixWorld(true);
  const clip=(name:string,node:string,amount:number)=>new THREE.AnimationClip(name,1,[new THREE.QuaternionKeyframeTrack(node+'.quaternion',[0,1],[0,0,0,1,0,Math.sin(amount/2),0,Math.cos(amount/2)])]);
  const animations=[clip('Idle','LeftArm',.05),clip('Read','LeftArm',.3),clip('TakePizza','RightArm',.8)];
  const rig:CharacterRigContract={id:'local-fixture-reader',sceneName:'ReaderScene',requireSkin:true,nodes:{leftArm:'LeftArm',rightArm:'RightArm',catchPoint:'PizzaCatch',book:'JapaneseBook'},
    pose:{mode:'handoff-clip',clipName:'TakePizza',upperBodyNodes:['RightArm']},motions:{required:['idle','read'],clips:{idle:{clipName:'Idle'},read:{clipName:'Read'}}},height:{min:1,max:2.5},materialTreatment:'as-authored'};
  const model=glb(external?{asset:{version:'2.0'},buffers:[{uri:'https://invalid.example/body.bin'}]}:undefined),rigBytes=bytes(rig);
  const descriptor={schemaVersion:1,id:PUSHPA_ART_REVIEW.id,characterId:PUSHPA_ART_REVIEW.characterId,glb:{url:PUSHPA_ART_REVIEW.glb,sha256:await hash(model)},rig:{url:PUSHPA_ART_REVIEW.rig,sha256:await hash(rigBytes)}};
  const files=new Map<string,ArrayBuffer>([[PUSHPA_ART_REVIEW.descriptor,bytes(descriptor)],[PUSHPA_ART_REVIEW.glb,model],[PUSHPA_ART_REVIEW.rig,rigBytes]]),fetches:string[]=[];
  let parsed=0,gpu=0;
  const dependencies:LocalArtReviewDependencies={fetchBytes:async url=>{fetches.push(url);assert.ok(files.has(url));return files.get(url)!;},digest:hash,
    parse:async()=>{parsed++;return{scene:root,scenes:[root],animations} as GLTF;},prepareGpu:async supplied=>{assert.equal(supplied,root);gpu++;}};
  return{root,geometry,material,rig,descriptor,files,fetches,dependencies,counts:()=>({parsed,gpu})};
}

test('local comparison accepts only its fixed descriptor, model, rig and isolated developer query',async()=>{
  const f=await fixture();assert.equal(validateLocalArtDescriptor(f.descriptor).id,PUSHPA_ART_REVIEW.id);
  for(const url of ['https://example.com/asset.glb','file:///private/secret.glb',PUSHPA_ART_REVIEW.glb+'?other=1','/docs/../secret.glb'])assert.throws(()=>validateLocalArtDescriptor({...f.descriptor,glb:{...f.descriptor.glb,url}}),/allowlist/);
  for(const query of ['qaArt=other','qaArt=pushpa-reader-v1&qaCampaign=1&qaCampaignMode=full'])assert.throws(()=>createDeliveryQA('1',undefined,new URLSearchParams(query)),/allowlisted isolated/);
  assert.throws(()=>createDeliveryQA('2',undefined,new URLSearchParams('qaArt=pushpa-reader-v1')),/allowlisted isolated/);
  assert.equal(typeof createDeliveryQA('1',undefined,new URLSearchParams('qaArt=pushpa-reader-v1'))!.prepareArtReview,'function');
  assert.equal(createDeliveryQA('1')!.prepareArtReview,undefined);
});

test('exact local GLB and rig fingerprints are checked before parsing and external subresources are rejected',async()=>{
  const f=await fixture();f.files.set(PUSHPA_ART_REVIEW.rig,bytes({...f.rig,id:'tampered'}));
  await assert.rejects(preparePushpaArtReview(undefined,f.dependencies),/fingerprints/);assert.equal(f.counts().parsed,0);
  const external=await fixture(true);await assert.rejects(preparePushpaArtReview(undefined,external.dependencies),/external/);assert.equal(external.counts().parsed,0);
  assert.deepEqual(external.fetches,[PUSHPA_ART_REVIEW.descriptor,PUSHPA_ART_REVIEW.glb,PUSHPA_ART_REVIEW.rig]);
});

test('local review clones authored skin, book, read and catch without marking the actor released',async()=>{
  const f=await fixture(),review=await preparePushpaArtReview(undefined,f.dependencies),owned:THREE.Material[]=[];
  assert.deepEqual(f.counts(),{parsed:1,gpu:1});const actor=review.createCharacter((_key,material)=>owned.push(material));
  assert.equal(actor.group.userData.characterRelease,'local-unreviewed-preview');assert.equal(actor.group.userData.releasedCharacter,undefined);
  assert.equal(actor.group.userData.localCharacterArtPreview.glbSha256,f.descriptor.glb.sha256);assert.ok(actor.book);
  actor.animate!(.1,'read');assert.equal(actor.group.userData.authoredMotion.motion,'read');assert.equal(actor.group.userData.authoredMotion.clip,'Read');
  actor.catchPose(.6);assert.equal(actor.group.userData.authoredMotion.catching,true);
  const clone=actor.group.getObjectByName('ReaderBody') as THREE.SkinnedMesh;assert.equal(clone.geometry,f.geometry);assert.notEqual(clone.material,f.material);
  assert.notEqual(clone.skeleton,(f.root.getObjectByName('ReaderBody') as THREE.SkinnedMesh).skeleton);owned.forEach(material=>material.dispose());review.dispose();
});

test('actual truck factory substitutes only its Pushpa reader, leaves other roles gated and owns clone lifetimes safely',async()=>{
  const f=await fixture(),review=await preparePushpaArtReview(undefined,f.dependencies),scene=new THREE.Scene(),module=review.createModule('matchAndLand');
  module.setup({scene,destination:{x:0,y:0,z:0},route:[{x:0,y:0,z:0},{x:0,y:0,z:300}],player:()=>({x:0,y:.55,z:-20,yaw:Math.PI,speed:0}),emit(){}},{scene:'truckInterior',speed:8});
  const previews:THREE.Object3D[]=[],withheld:THREE.Object3D[]=[];scene.traverse(node=>{if(node.userData.localCharacterArtPreview)previews.push(node);if(node.userData.characterRelease==='withheld')withheld.push(node);});
  assert.equal(previews.length,1);assert.ok(withheld.some(node=>node.name==='withheld-character-unknown'));assert.ok(scene.getObjectByName('delivery-container-closed-roof'));
  const later=review.createModule('matchAndLand'),otherScene=new THREE.Scene();later.setup({scene:otherScene,destination:{x:0,y:4,z:0},player:()=>({x:0,y:.55,z:0,yaw:0,speed:0}),emit(){}},{vehicle:'train',characterId:'ram-vvr'});
  let laterPreviews=0;otherScene.traverse(node=>{if(node.userData.localCharacterArtPreview)laterPreviews++;});assert.equal(laterPreviews,0,'later matchAndLand scenes retain their normal character gate');later.teardown();
  let disposed=0;f.geometry.addEventListener('dispose',()=>disposed++);review.dispose();assert.equal(disposed,0,'template remains alive beneath the real scene clone');
  module.teardown();assert.equal(disposed,1);module.teardown();review.dispose();assert.equal(disposed,1);assert.equal(scene.children.length,0);
});

test('partial module material-ownership failure releases every clone before retiring its template',async()=>{
  const f=await fixture(),review=await preparePushpaArtReview(undefined,f.dependencies);let disposed=0;f.geometry.addEventListener('dispose',()=>disposed++);
  assert.throws(()=>review.createCharacter(()=>{throw new Error('ownership fixture');}),/ownership/);review.dispose();assert.equal(disposed,1);
});

test('missing authored reader contracts and GPU failures dispose the unpublished template without exposing a module',async()=>{
  const missing=await fixture();const invalid={...missing.rig,nodes:{...missing.rig.nodes,book:'MissingBook'}},raw=bytes(invalid);
  missing.files.set(PUSHPA_ART_REVIEW.rig,raw);missing.files.set(PUSHPA_ART_REVIEW.descriptor,bytes({...missing.descriptor,rig:{...missing.descriptor.rig,sha256:await hash(raw)}}));
  let disposed=0;missing.geometry.addEventListener('dispose',()=>disposed++);
  await assert.rejects(preparePushpaArtReview(undefined,missing.dependencies),/anchor is absent/);assert.equal(disposed,1);assert.equal(missing.counts().gpu,0);
  const graphics=await fixture();let released=0;graphics.geometry.addEventListener('dispose',()=>released++);
  graphics.dependencies.prepareGpu=async()=>{throw new Error('GPU comparison fixture');};
  await assert.rejects(preparePushpaArtReview(undefined,graphics.dependencies),/GPU comparison/);assert.equal(released,1);
});

test('private preview rewarms against the constructed cabin light and GPU borrows outlive retired scene clones',async()=>{
  const f=await fixture(),scene=new THREE.Scene();let calls=0,resolve!:()=>void;
  const pending=new Promise<void>(done=>resolve=done);
  f.dependencies.prepareGpu=async root=>{if(++calls===1){assert.equal(root,f.root);return;}assert.notEqual(root,f.root,'cabin lighting compiles the real independently owned instance');assert.ok(root.getObjectByName(f.rig.nodes.book!));assert.ok(scene.getObjectByName('delivery-truck-reading-light'));await pending;};
  const review=await preparePushpaArtReview(undefined,f.dependencies),module=review.createModule('matchAndLand');
  module.setup({scene,destination:{x:0,y:0,z:0},route:[{x:0,y:0,z:0},{x:0,y:0,z:300}],player:()=>({x:0,y:.55,z:-25,yaw:Math.PI,speed:0}),emit(){}},{scene:'truckInterior',speed:6});
  await flush();assert.equal(calls,2,'a pre-city template warm does not replace actual cabin-light preparation');
  let disposed=0;f.geometry.addEventListener('dispose',()=>disposed++);review.dispose();module.teardown();assert.equal(disposed,0,'outstanding graphics work still borrows shared geometry');
  resolve();await flush();assert.equal(disposed,1);review.dispose();assert.equal(disposed,1);assert.equal(scene.children.length,0);
  await assert.rejects(review.prepareGraphics(),/session has ended/);assert.equal(calls,2);
});

test('a failed private graphics borrow releases ownership and can be retried without retiring the template',async()=>{
  const f=await fixture();let calls=0;f.dependencies.prepareGpu=async()=>{if(++calls===2)throw new Error('cabin GPU fixture');};
  const review=await preparePushpaArtReview(undefined,f.dependencies);let disposed=0;f.geometry.addEventListener('dispose',()=>disposed++);
  await assert.rejects(review.prepareGraphics(),/cabin GPU/);assert.equal(disposed,0);await review.prepareGraphics();assert.equal(calls,3);
  review.dispose();assert.equal(disposed,1);
});

test('local art preview can never become accepted campaign evidence even with all synthetic approvals and visual checks',()=>{
  const level=loadLevels()[0],scenario=campaignScenario(level.id)!,recorder=new CampaignQARecorder([level],{mode:'full-campaign',layout:'desktop',environment:'Synthetic local comparison',
    artPreview:{id:PUSHPA_ART_REVIEW.id,characterId:'pushpa-raj',descriptor:PUSHPA_ART_REVIEW.descriptor,glbSha256:'a'.repeat(64),rigSha256:'b'.repeat(64)}},[{characterId:'pushpa-raj',allowed:true,status:'synthetic fixture only'}],()=>0);
  recorder.begin(level.id);recorder.picked('carrier',true);recorder.input('handoff','mouse',true);campaignRequiredFacts(level,true).forEach(fact=>recorder.fact(fact));
  scenario.visualChecks.forEach(check=>recorder.reviewVisualCheck(check,'/fixture/preview.png'));recorder.complete(level.id);
  const report=recorder.report();assert.equal(report.rows[0].observedSceneMechanics,true);assert.equal(report.acceptance.unreviewedArtPreview,true);
  assert.equal(report.acceptance.fullCampaignAccepted,false);assert.equal(report.rows[0].allScenarioEvidence,false);
  const main=readFileSync('src/main.ts','utf8');assert.ok(main.indexOf('await qa?.prepareArtReview?.(engine)')<main.indexOf('const game = new Game(engine, core, world, { lowQ, delivery: qa?.runtime'));
});

test('fixed scene catalog selects only the current scene and rejects absent actors instead of substituting identities',()=>{
  const levels=loadLevels();
  assert.deepEqual(sceneReviewCandidates(levels[0]).map(c=>c.characterId),['pushpa-raj']);
  assert.deepEqual(sceneReviewCandidates(levels[2]).map(c=>c.characterId),['devara']);
  assert.deepEqual(sceneReviewCandidates(levels.find(level=>level.module==='metroRide')!).map(c=>c.characterId),['vakeel-saab','vakeel-woman-1','vakeel-woman-2','vakeel-woman-3']);
  assert.throws(()=>sceneReviewCandidates({...levels[0],moduleParams:{...levels[0].moduleParams,characterId:'absent-test-character'}}),/No unique unpublished scene candidate/);
  assert.equal(typeof createDeliveryQA('3',undefined,new URLSearchParams('qaArt=scene-candidates-v1'))!.prepareArtReview,'function');
  assert.throws(()=>createDeliveryQA('1',undefined,new URLSearchParams('qaArt=scene-candidates-v1&qaCampaign=1&qaCampaignMode=full')),/allowlisted isolated/);
});

test('an authored static grip needs no reader book or invented catch animation and is warmed inside the real existing module',async()=>{
  const f=await fixture(),expected=sceneReviewCandidates(loadLevels()[2])[0];
  const rig:CharacterRigContract={...f.rig,id:'static-grip-fixture',nodes:{leftArm:'LeftArm',rightArm:'RightArm',catchPoint:'PizzaCatch'},pose:{mode:'authored-static'},motions:{required:['idle'],clips:{idle:{clipName:'Idle'}}}};
  const rawRig=bytes(rig),model=f.files.get(PUSHPA_ART_REVIEW.glb)!;
  const descriptor={schemaVersion:1,id:expected.id,characterId:expected.characterId,glb:{url:expected.glb,sha256:await hash(model)},rig:{url:expected.rig,sha256:await hash(rawRig)}};
  const files=new Map([[expected.descriptor,bytes(descriptor)],[expected.glb,model],[expected.rig,rawRig]]);let warmed=0;
  const deps:LocalArtReviewDependencies={...f.dependencies,fetchBytes:async url=>files.get(url)!,prepareGpu:async()=>{warmed++;}};
  const review=await prepareLocalCharacterArtReview(expected,undefined,deps),catalog=new LocalSceneArtReview(new Map([['devara',review]]));
  assert.equal(warmed,1);assert.equal(catalog.evidence.assets[0].characterId,'devara');
  const scene=new THREE.Scene(),module=catalog.createModule('underwater');
  module.setup({scene,destination:{x:0,y:0,z:0},player:()=>({x:0,y:.5,z:0,yaw:0,speed:0}),emit(){}},{scene:'devaraUnderwater',depth:6});
  await flush();assert.equal(warmed,2,'the actual model instance is prepared after scene construction');
  const previews:THREE.Object3D[]=[];scene.traverse(n=>{if(n.userData.localCharacterArtPreview)previews.push(n);});
  assert.equal(previews.length,1);assert.equal(previews[0].userData.localCharacterArtPreview.characterId,'devara');
  assert.equal(previews[0].userData.releasedCharacter,undefined);assert.ok(scene.getObjectByName('delivery-devara-intact-skeleton'));
  let disposed=0;f.geometry.addEventListener('dispose',()=>disposed++);catalog.dispose();assert.equal(disposed,0);module.teardown();assert.equal(disposed,1);
});

test('group scene comparison evidence stays explicitly unaccepted even if every requested visual decision is fabricated as passing',()=>{
  const level=loadLevels()[2],scenario=campaignScenario(level.id)!,recorder=new CampaignQARecorder([level],{mode:'full-campaign',layout:'touch-layout',environment:'Synthetic fixture',artPreview:{id:'scene-candidates-v1',assets:[{id:'fixed-grip',characterId:'devara',descriptor:'/fixture',glbSha256:'a'.repeat(64),rigSha256:'b'.repeat(64)}]}},[{characterId:'devara',allowed:true,status:'synthetic'}],()=>0);
  recorder.begin(level.id);recorder.picked('carrier',true);recorder.input('handoff','touch',true);campaignRequiredFacts(level,true).forEach(fact=>recorder.fact(fact));scenario.visualChecks.forEach(check=>recorder.reviewVisualCheck(check,'/fixture.png'));recorder.complete(level.id);
  assert.equal(recorder.report().acceptance.fullCampaignAccepted,false);assert.equal(recorder.report().acceptance.unreviewedArtPreview,true);
});

test('the stationary haunted-gate actor loads without invented skin or animation while animated contracts stay strict',async()=>{
  const expected=sceneReviewCandidates(loadLevels()[4])[0];
  const fixture=async(change:Partial<CharacterRigContract>={})=>{
    const root=new THREE.Group();root.name='GateStaticScene';
    const geometry=new THREE.BoxGeometry(.6,1.8,.3);geometry.translate(0,.9,0);
    const material=new THREE.MeshStandardMaterial({color:'#7a652e'});root.add(new THREE.Mesh(geometry,material));
    for(const name of ['LeftArm','RightArm','PizzaCatch']){const anchor=new THREE.Group();anchor.name=name;root.add(anchor);}
    const rig:CharacterRigContract={id:'static-gate-fixture',sceneName:root.name,requireSkin:false,
      nodes:{leftArm:'LeftArm',rightArm:'RightArm',catchPoint:'PizzaCatch'},pose:{mode:'authored-static'},
      height:{min:1.7,max:1.9},materialTreatment:'as-authored',...change};
    const model=glb(),rawRig=bytes(rig),descriptor={schemaVersion:1,id:expected.id,characterId:expected.characterId,
      glb:{url:expected.glb,sha256:await hash(model)},rig:{url:expected.rig,sha256:await hash(rawRig)}};
    const files=new Map([[expected.descriptor,bytes(descriptor)],[expected.glb,model],[expected.rig,rawRig]]);
    const dependencies:LocalArtReviewDependencies={fetchBytes:async url=>files.get(url)!,digest:hash,
      parse:async()=>({scene:root,scenes:[root],animations:[]}) as unknown as GLTF};
    return{geometry,dependencies};
  };
  const f=await fixture(),review=await prepareLocalCharacterArtReview(expected,undefined,f.dependencies),owned:THREE.Material[]=[];
  const actor=review.createCharacter((_key,material)=>owned.push(material));
  assert.equal(actor.animate,undefined);actor.catchPose(1);
  assert.equal(actor.group.userData.characterRelease,'local-unreviewed-preview');
  assert.equal(actor.group.userData.authoredMotion.clip,'','a static gate presence cannot fabricate an animated handoff clip');
  assert.equal(actor.group.userData.authoredMotion.catching,false);
  let disposed=0;f.geometry.addEventListener('dispose',()=>disposed++);review.dispose();assert.equal(disposed,0);
  owned.forEach(material=>material.dispose());assert.equal(disposed,1);
  for(const change of [{pose:{mode:'handoff-clip',clipName:'TakePizza'}},{motions:{required:['walk'],clips:{walk:{clipName:'Walk',metresPerCycle:1}}}}] as Partial<CharacterRigContract>[]){
    const invalid=await fixture(change);await assert.rejects(prepareLocalCharacterArtReview(expected,undefined,invalid.dependencies),/animated actors require skin/);
  }
  const reader=await fixture();await assert.rejects(prepareLocalCharacterArtReview(expected,undefined,reader.dependencies,true),/readers also require a book/);
});
