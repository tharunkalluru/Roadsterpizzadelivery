import * as THREE from 'three';
import type { SceneCharacter } from '../modules/character';
import { deliveryPizzaBoxGeometry, DELIVERY_PIZZA_BOX } from '../modules/pizza-box';
import type { ReleasedCharacterResources } from './released-gltf';

/** The delivery module owns when a pizza changes hands. Sample the authored
 * reaching pose and keep the carton on its moving palm until the scene exits. */
export function installRodinHandoff(actor:SceneCharacter, resources:ReleasedCharacterResources) {
  const carton=new THREE.Mesh(resources.geometry(deliveryPizzaBoxGeometry()),
    new THREE.MeshStandardMaterial({vertexColors:true,roughness:.9}));
  carton.name='received-delivery-carton';
  resources.material('rodin-carton-'+actor.group.uuid,carton.material);
  actor.group.add(carton);
  carton.visible=false;
  const hand=new THREE.Vector3(),catchPose=actor.catchPose,animate=actor.animate;
  const sync=()=>{
    actor.catchPoint.getWorldPosition(hand);
    actor.group.worldToLocal(hand);
    carton.position.copy(hand);
    if(actor.catchPointSpace!=='box-center')carton.position.y+=DELIVERY_PIZZA_BOX.palmToCentre;
  };
  actor.receivePizza=()=>{
    catchPose(1);
    if(actor.book)actor.book.visible=false;
    carton.visible=true;sync();
    return true;
  };
  actor.catchPose=amount=>{catchPose(carton.visible?1:amount);if(carton.visible)sync();};
  actor.animate=(dt,mode,speed)=>{animate?.(dt,mode,speed);if(carton.visible)sync();};
  return {bytes:0,dispose(){carton.removeFromParent();}};
}
