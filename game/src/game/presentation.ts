import { Object3D, Vector3, Quaternion } from 'three';
interface Pose { object: Object3D; prior: Vector3; current: Vector3; priorQ: Quaternion; currentQ: Quaternion; seen: number }
/** Render-only interpolation. Authoritative transforms are restored before physics runs. */
export class Presentation {
  private poses = new Map<Object3D, Pose>(); private epoch = 0;
  capture(objects: Iterable<Object3D>) {
    this.epoch++;
    for (const object of objects) {
      let p=this.poses.get(object);
      if(!p){p={object,prior:object.position.clone(),current:object.position.clone(),priorQ:object.quaternion.clone(),currentQ:object.quaternion.clone(),seen:this.epoch};this.poses.set(object,p);}
      else {p.prior.copy(p.current);p.priorQ.copy(p.currentQ);p.current.copy(object.position);p.currentQ.copy(object.quaternion);p.seen=this.epoch; if(p.prior.distanceToSquared(p.current)>400)p.prior.copy(p.current);}
    }
    for(const [o,p] of this.poses)if(p.seen!==this.epoch)this.poses.delete(o);
  }
  apply(alpha:number){for(const p of this.poses.values()){p.object.position.lerpVectors(p.prior,p.current,alpha);p.object.quaternion.slerpQuaternions(p.priorQ,p.currentQ,alpha);}}
  restore(){for(const p of this.poses.values()){p.object.position.copy(p.current);p.object.quaternion.copy(p.currentQ);}}
  reset(){this.poses.clear();}
}
