import * as THREE from 'three';
import { createSceneCharacter, prewarmSceneCharacterAssets, type SceneCharacter, type CharacterStyle } from '../modules/character';
import { canDisplayCharacter, REVIEWED_PROCEDURAL_CANDIDATE } from './release-gate';
import { createReleasedGltfCharacter, prewarmReleasedGltfAssets, prepareReleasedGltfGpu, retainReleasedGltfAssets } from './released-gltf';
import assetManifest from './character-assets.json';
import { prepareCharacterGpu, type CharacterGpuContext } from './gpu-preparation';

const identities: Record<string, string> = {
  pushpa:'pushpa-raj', trainHero:'ram-vvr', devara:'devara', simhadri:'devara',
  arundhati:'arundhati', jessie:'jessie', hasini:'hasini', bhanumathi:'bhanumathi',
  sukumar:'sukumar', vakeelSaab:'vakeel-saab', vakeelWoman1:'vakeel-woman-1',
  vakeelWoman2:'vakeel-woman-2', vakeelWoman3:'vakeel-woman-3', maruthi:'maruthi',
  arjunReddy:'arjun-reddy', jersey:'nani-jersey', gabbar:'vakeel-saab',
};
export const sceneCharacterIdentity=(style:string):string|undefined=>identities[style];
type Resources = { geometry:<T extends THREE.BufferGeometry>(geometry:T)=>T; material:(key:string,material:THREE.Material)=>void };
const proceduralStyles=new Set(['pushpa','trainHero','simhadri','jersey','gabbar']);

/** Pending/rejected art never consumes the initial model-preparation budget. */
export async function prewarmReleasedSceneCharacters(identitiesToPrepare?:readonly string[],gpu?:CharacterGpuContext){
  // Pending artwork remains mesh-free in local mechanics review. Publication
  // separately requires every campaign identity to pass its exact review gate.
  const registered=assetManifest.assets as {characterId:string}[];
  const selected=identitiesToPrepare?identitiesToPrepare.filter(id=>registered.some(asset=>asset.characterId===id)):registered.map(asset=>asset.characterId);
  const report=await prewarmReleasedGltfAssets(selected);
  if(report.failed.length)throw new Error('Character assets could not be prepared. Please retry loading the game.');
  if(gpu&&report.ready.length){const graphics=await prepareReleasedGltfGpu(report.ready,root=>prepareCharacterGpu(root,gpu));if(graphics.failed.length)throw new Error('Character graphics could not be prepared. Please retry loading the delivery.');}
  if((identitiesToPrepare??Object.values(identities)).some(id=>canDisplayCharacter(id,REVIEWED_PROCEDURAL_CANDIDATE)))await prewarmSceneCharacterAssets();
}
export const retainSceneCharacters=(ids:readonly string[])=>retainReleasedGltfAssets(ids);
export const hasRegisteredSceneCharacters=(ids:readonly string[])=>(assetManifest.assets as {characterId:string}[]).some(asset=>ids.includes(asset.characterId));

/** Runtime actors fail closed. Review pages inspect raw candidates independently.
 * An empty rig keeps a pending scene mechanically inspectable without displaying
 * a generic person as a film character. It cannot be mistaken for approved art. */
export function createReleasedSceneCharacter(style: string, seated: boolean, resources: Resources): SceneCharacter {
  const released=identities[style]?createReleasedGltfCharacter(identities[style],resources):null;
  if(released)return released;
  if (style === 'extra' ||
    (proceduralStyles.has(style) && identities[style] && canDisplayCharacter(identities[style], REVIEWED_PROCEDURAL_CANDIDATE)))
    return createSceneCharacter(style as CharacterStyle, seated, resources);
  const group = new THREE.Group(), leftArm = new THREE.Group(), rightArm = new THREE.Group();
  const catchPoint=new THREE.Object3D();catchPoint.name='withheld-scene-handoff-anchor';catchPoint.position.set(0,seated?.85:1.15,.28);
  group.name = `withheld-character-${identities[style] ?? style}`;
  group.userData.characterRelease = 'withheld';
  group.add(leftArm, rightArm,catchPoint);
  return { group, leftArm, rightArm,catchPoint, catchPose() {} };
}
