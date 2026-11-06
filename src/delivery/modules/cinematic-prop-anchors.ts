import * as THREE from 'three';
import type {SceneCharacter} from './character';

export type CinematicPropRole='phone'|'bottle'|'xray';
export interface ReviewedPropBinding {hand:'LeftHand'|'RightHand';position:readonly[number,number,number];rotation:readonly[number,number,number]}
const authoredNodes:Record<CinematicPropRole,string>={phone:'PropPhone',bottle:'PropBottle',xray:'PropXray'};
/** New role rigs author these anchors at the actual prop mesh origin. A
 * reviewed wrist-local transform may be provided for older exact candidates.
 * Upper-arm/catch/carton anchors and unreviewed torso offsets are forbidden. */
export function bindCinematicProp(actor:SceneCharacter,prop:THREE.Object3D,role:CinematicPropRole,binding?:ReviewedPropBinding):boolean{
 const authored=actor.group.getObjectByName(authoredNodes[role]);
 if(authored){
  // An authored prop pivot must genuinely follow the skeleton hand, not be an
  // empty object at the actor's root that only happens to have the right name.
  let parent:THREE.Object3D|null=authored.parent,hand=false;
  while(parent&&parent!==actor.group){if(parent instanceof THREE.Bone&&['LeftHand','RightHand'].includes(parent.name))hand=true;parent=parent.parent;}
  if(hand){authored.add(prop);prop.position.set(0,0,0);prop.rotation.set(0,0,0);prop.visible=true;return true;}
 }
 const wrist=binding&&actor.group.getObjectByName(binding.hand);
 if(binding&&wrist instanceof THREE.Bone&&Array.isArray(binding.position)&&binding.position.length===3&&Array.isArray(binding.rotation)&&binding.rotation.length===3&&[...binding.position,...binding.rotation].every(Number.isFinite)){
  wrist.add(prop);prop.position.set(binding.position[0],binding.position[1],binding.position[2]);prop.rotation.set(binding.rotation[0],binding.rotation[1],binding.rotation[2]);prop.visible=true;return true;
 }
 prop.visible=false;prop.userData.cinematicPropWithheld=`${role}: authored wrist anchor or reviewed transform missing`;
 return false;
}
