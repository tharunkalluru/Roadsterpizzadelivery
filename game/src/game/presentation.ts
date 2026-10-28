import { Object3D, Vector3, Quaternion, Euler } from 'three';
interface Pose { object: Object3D; prior: Vector3; current: Vector3; priorQ: Quaternion; currentQ: Quaternion; currentRotation: Euler; generation: unknown; seen: number }
/** Render-only interpolation. Authoritative transforms are restored before physics runs. */
export class Presentation {
  private poses = new Map<Object3D, Pose>(); private epoch = 0; private applied = false;
  capture(objects: Iterable<Object3D>) {
    this.epoch++;
    for (const object of objects) {
      let p=this.poses.get(object);
      if(!p){p={object,prior:object.position.clone(),current:object.position.clone(),priorQ:object.quaternion.clone(),currentQ:object.quaternion.clone(),currentRotation:object.rotation.clone(),generation:object.userData.presentationGeneration,seen:this.epoch};this.poses.set(object,p);}
      else {
        p.prior.copy(p.current);p.priorQ.copy(p.currentQ);p.current.copy(object.position);p.currentQ.copy(object.quaternion);p.currentRotation.copy(object.rotation);p.seen=this.epoch;
        const generation=object.userData.presentationGeneration;
        if(p.generation!==generation||p.prior.distanceToSquared(p.current)>400){p.prior.copy(p.current);p.priorQ.copy(p.currentQ);}
        p.generation=generation;
      }
    }
    for(const [o,p] of this.poses)if(p.seen!==this.epoch)this.poses.delete(o);
  }
  apply(alpha:number){this.applied=true;for(const p of this.poses.values()){p.object.position.lerpVectors(p.prior,p.current,alpha);p.object.quaternion.slerpQuaternions(p.priorQ,p.currentQ,alpha);}}
  restore(){
    if(!this.applied)return;
    for(const p of this.poses.values()){
      p.object.position.copy(p.current);
      // Quaternion -> XYZ Euler decomposition can introduce X/Z half-turns.
      // Restore the exact authoritative angles/order before any yaw-only writer runs.
      p.object.rotation.copy(p.currentRotation);
    }
    this.applied=false;
  }
  reset(){this.restore();this.poses.clear();}
}
