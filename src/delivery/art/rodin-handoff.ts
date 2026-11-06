import * as THREE from 'three';
import type { SceneCharacter } from '../modules/character';
import { deliveryPizzaBoxGeometry, DELIVERY_PIZZA_BOX } from '../modules/pizza-box';
import type { ReleasedCharacterResources } from './released-gltf';

/** Retargeted hands differ in size and wrist roll. Use the finger pads of the
 * posed skeleton so the arriving carton and the retained carton share a support. */
function twoPalmSupport(actor: SceneCharacter) {
  const id = actor.group.userData.releasedCharacter?.identity;
  if (id !== 'srikanth-odela' && id !== 'shankar-dada') return;
  const fingers = ['Left','Right'].flatMap(side =>
    ['Index1','Index3','Middle1','Middle3','Ring1','Ring3','Thumb3'].map(finger => actor.group.getObjectByName(side + finger)));
  if (fingers.some(finger => !finger)) return;
  const anchor = new THREE.Object3D(), local = new THREE.Vector3(), inverse = new THREE.Matrix4();
  anchor.name = 'carton-on-both-palms';
  actor.group.add(anchor);
  actor.catchPoint = anchor;
  actor.catchPointSpace = 'box-center';
  return () => {
    actor.group.updateWorldMatrix(true, true);
    inverse.copy(actor.group.matrixWorld).invert();
    let x = 0, z = 0, top = -Infinity;
    for (const finger of fingers) {
      local.setFromMatrixPosition(finger!.matrixWorld).applyMatrix4(inverse);
      x += local.x; z += local.z; top = Math.max(top, local.y);
    }
    // Fingertip joint centres sit just below their skin. Retain a slight front
    // overhang, as on a carton carried with wrists visible from the front.
    anchor.position.set(x / fingers.length, top + .013 + DELIVERY_PIZZA_BOX.palmToCentre, z / fingers.length + .035);
  };
}

/** The delivery module owns when a pizza changes hands. Sample the authored
 * reaching pose and keep the carton on its moving palm until the scene exits. */
export function installRodinHandoff(actor:SceneCharacter, resources:ReleasedCharacterResources) {
  const carton=new THREE.Mesh(resources.geometry(deliveryPizzaBoxGeometry()),
    new THREE.MeshStandardMaterial({vertexColors:true,roughness:.9}));
  carton.name='received-delivery-carton';
  resources.material('rodin-carton-'+actor.group.uuid,carton.material);
  actor.group.add(carton);
  carton.visible=false;
  const support=twoPalmSupport(actor);
  const hand=new THREE.Vector3(),catchPose=actor.catchPose,animate=actor.animate;
  const sync=()=>{
    actor.catchPoint.getWorldPosition(hand);
    actor.group.worldToLocal(hand);
    carton.position.copy(hand);
    if(actor.catchPointSpace!=='box-center')carton.position.y+=DELIVERY_PIZZA_BOX.palmToCentre;
  };
  actor.receivePizza=()=>{
    catchPose(1);support?.();
    if(actor.book)actor.book.visible=false;
    carton.visible=true;sync();
    return true;
  };
  actor.catchPose=amount=>{catchPose(carton.visible?1:amount);if(carton.visible||amount>0)support?.();if(carton.visible)sync();};
  actor.animate=(dt,mode,speed)=>{animate?.(dt,mode,speed);if(carton.visible){support?.();sync();}};
  return {bytes:0,dispose(){carton.removeFromParent();}};
}
