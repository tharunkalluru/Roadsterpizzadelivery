import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createReleasedSceneCharacter, prewarmReleasedSceneCharacters } from '../../src/delivery/art/scene-character';
import { auditCampaignCharacters } from '../../src/delivery/art/campaign-release';
import { loadLevels } from '../../src/delivery/content/levels';
import assets from '../../src/delivery/art/character-assets.json';

test('an unprepared or unapproved appearance stays mesh-free even if a scene toggles its group visible',async()=>{
  for(const style of ['pushpa','trainHero','devara','odela','arundhati','jessie','hasini','bhanumathi','sukumar','vakeelSaab','vakeelWoman1','vakeelWoman2','vakeelWoman3','maruthi','salaar','arjunReddy','jersey','unknown','invented-style']){
    let resources=0;const actor=createReleasedSceneCharacter(style,false,{geometry:g=>{resources++;return g;},material:()=>resources++});
    actor.group.visible=true;actor.catchPose(1);let meshes=0;actor.group.traverse(n=>{if(n instanceof THREE.Mesh)meshes++;});
    assert.equal(meshes,0,style);assert.equal(resources,0,'withheld assets must not allocate GPU resources');
    assert.equal(actor.group.userData.characterRelease,'withheld');
  }
  // Approved GLBs need the real browser loader. Only withheld identities belong
  // in this no-network failure test; an empty list remains valid after release.
  await prewarmReleasedSceneCharacters(auditCampaignCharacters(loadLevels()).filter(d=>!d.allowed).map(d=>d.characterId));
});

test('campaign audit includes all three women and evaluates each exact released candidate independently of gameplay',()=>{
  const decisions=auditCampaignCharacters(loadLevels());assert.equal(decisions.length,17);
  assert.deepEqual(decisions.filter(d=>d.level===10).map(d=>d.characterId),['vakeel-saab','vakeel-woman-1','vakeel-woman-2','vakeel-woman-3']);
  for(const decision of decisions){
    assert.ok(decision.reasons.length>0);
    if(decision.allowed)assert.ok(assets.assets.some(asset=>asset.characterId===decision.characterId),'approved appearances require an actual registered asset');
  }
  assert.deepEqual(decisions.filter(d=>d.level===4||d.level===12).map(d=>d.characterId),['srikanth-odela','prabhas-salaar'],'both newly visible named actors require their own exact independent asset review');
});
