import * as THREE from 'three';
import { CharacterSculpt } from './character-sculpt';

export const DELIVERY_PIZZA_BOX={width:.4,height:.07,depth:.4,palmToCentre:.035} as const;
/** An opaque carton with a separate lid seam and pizza seal. All surfaces join
 * one vertex-colour draw: no canvas, external texture, lights or per-frame work.
 * The underside remains exactly -.035m, matching the authored palm contract. */
export function deliveryPizzaBoxGeometry():THREE.BufferGeometry{
  const s=new CharacterSculpt();
  s.box(0,-.006,0,.396,.058,.396,'#E9D5AC');
  s.box(0,.029,0,.4,.012,.4,'#B93C2E');
  // Folded front lip and inset seam make the thickness legible in a catch.
  s.box(0,.0175,.1985,.17,.009,.001,'#F2DDB4');
  s.box(0,.0225,.1991,.15,.001,.0006,'#783124');
  s.box(0,.03525,0,.224,.0005,.224,'#FFF0CB');
  const disk=new THREE.CylinderGeometry(.087,.087,.0004,24);disk.translate(0,.0357,0);s.add(disk,'#D87A2F');
  const cheese=new THREE.CylinderGeometry(.071,.071,.0004,24);cheese.translate(0,.0361,0);s.add(cheese,'#F1C65B');
  for(const [x,z]of [[-.025,-.027],[.028,-.012],[0,.032]] as const){
    const pepperoni=new THREE.CylinderGeometry(.013,.013,.0003,10);pepperoni.translate(x,.03645,z);s.add(pepperoni,'#B72E24');
  }
  const geometry=s.finish();geometry.name='delivery-pizza-carton-40cm';
  geometry.userData={physicalSize:{...DELIVERY_PIZZA_BOX},treatment:'opaque-merged-carton-with-lid-and-pizza-seal'};
  return geometry;
}
