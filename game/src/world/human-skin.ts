import * as THREE from 'three';
import {Batch,type Tpl,type AddOpts} from '../core/util';

export const HUMAN_BONES={root:0,hips:1,spine:2,neck:3,head:4,armL:5,elbowL:6,handL:7,armR:8,elbowR:9,handR:10,thighL:11,kneeL:12,ankleL:13,thighR:14,kneeR:15,ankleR:16} as const;
export interface HumanTemplate extends Tpl {skinIndex?:ArrayLike<number>;skinWeight?:ArrayLike<number>}
/** Metadata-only batch adapter. It does not alter generic world batching. Every
 * human surface carries anatomical influences through colour batching. */
export class HumanSkinBatch extends Batch {
  readonly humanIndices:number[]=[];readonly humanWeights:number[]=[];defaultBone:number=HUMAN_BONES.hips;
  override add(t:HumanTemplate,x:number,y:number,z:number,sx:number,sy:number,sz:number,color:THREE.ColorRepresentation,opts:AddOpts={}){
    super.add(t,x,y,z,sx,sy,sz,color,opts);
    for(let i=0;i<t.count;i++)for(let j=0;j<4;j++){
      this.humanIndices.push(t.skinIndex?.[i*4+j]??(j===0?this.defaultBone:0));this.humanWeights.push(t.skinWeight?.[i*4+j]??(j===0?1:0));
    }
  }
  skinAttributes(){return {index:new THREE.Uint16BufferAttribute(this.humanIndices,4),weight:new THREE.Float32BufferAttribute(this.humanWeights,4)};}
}
export function rigidHumanTemplate(t:Tpl,bone:number):HumanTemplate {const ids=new Uint16Array(t.count*4),weights=new Float32Array(t.count*4);for(let i=0;i<t.count;i++){ids[i*4]=bone;weights[i*4]=1;}return {...t,skinIndex:ids,skinWeight:weights};}
export type HumanSeatPose='bike'|'scooter'|'auto'|'bench'|'pillion'|'pillionSide'|'scooterPillion'|'rickshawDriver'|'rickshawPassenger';
function segmentMatrix(a:number[],b:number[],c:number[],d:number[]){const from=new THREE.Vector3(...a as [number,number,number]),axis=new THREE.Vector3(...b as [number,number,number]).sub(from),to=new THREE.Vector3(...c as [number,number,number]),target=new THREE.Vector3(...d as [number,number,number]).sub(to),q=new THREE.Quaternion().setFromUnitVectors(axis.clone().normalize(),target.clone().normalize()),scale=target.length()/axis.length();return new THREE.Matrix4().compose(to,q,new THREE.Vector3(scale,scale,scale)).multiply(new THREE.Matrix4().makeTranslation(-from.x,-from.y,-from.z));}
/** Real anatomical influence IDs choose matrices. A lateral pelvis vertex can
 * never be assigned to the arm merely because it happens to share x/y values. */
export function humanSeatMatrices(seat:HumanSeatPose,scale=1){const B=HUMAN_BONES,lean=seat==='bike'?.28:seat==='scooter'?.10:.035,reach=seat==='bike'||seat==='scooter'||seat==='auto'||seat==='rickshawDriver',bike=seat==='bike',inv=1/Math.max(.5,scale);
  const torso=new THREE.Matrix4().makeRotationX(-lean).multiply(new THREE.Matrix4().makeTranslation(0,-.84,0)),matrices=Array.from({length:17},()=>torso.clone());
  for(const side of [-1,1]){const right=side>0,arm=right?B.armR:B.armL,elbowId=right?B.elbowR:B.elbowL,hand=right?B.handR:B.handL,thigh=right?B.thighR:B.thighL,kneeId=right?B.kneeR:B.kneeL,ankleId=right?B.ankleR:B.ankleL;
    const wrist=[side*(reach?.275:.13),reach?.29:.14,reach?(seat==='scooter'?-.69:bike?-.56:-.44):-.35],elbow=[side*.25,.30,reach?-.28:-.075],shoulder=[side*.19,.49,-lean*.45];
    let sole=[side*.115,-.53,-.46],knee=[side*(bike?.17:.115),-.035,bike?-.32:-.41];
    if(bike)sole=[side*.25*inv,-.43*inv,-.16*inv];
    else if(seat==='rickshawDriver'||seat==='rickshawPassenger')sole=[side*.115,-(seat==='rickshawDriver'?.43:.45)*inv,-.46];
    else if(seat==='scooter')sole=[side*.115*inv,-.54*inv,-.32*inv];
    else if(seat==='pillion'||seat==='scooterPillion'){const scooter=seat==='scooterPillion';sole=[side*(scooter?.24:.23)*inv,-(scooter?.49:.47)*inv,-(scooter?.12:.10)*inv];knee=[side*.22,-.19,-.23];}
    else if(seat==='pillionSide'){sole=[(-.10+side*.035)*inv,-.47*inv,-.25*inv];knee=[-.10+side*.055,-.18,-.22];}
    // A horizontal foot is anchored by its real sole/ball support point. The
    // ankle position is derived from this matrix, so the shin cannot end above
    // an unsupported foot or put a passenger on the driver's front footrest.
    const support=[side*.085,.015,-.085],foot=new THREE.Matrix4().makeTranslation(sole[0]-support[0],sole[1]-support[1],sole[2]-support[2]),ankle=new THREE.Vector3(side*.085,.09,0).applyMatrix4(foot).toArray();
    matrices[arm]=segmentMatrix([side*.19,1.33,0],[side*.245,1.085,-.008],shoulder,elbow);
    matrices[elbowId]=segmentMatrix([side*.245,1.085,-.008],[side*.255,.845,-.025],elbow,wrist);
    matrices[hand]=segmentMatrix([side*.255,.845,-.025],[side*.255,.756,-.035],wrist,[wrist[0],wrist[1]-(reach?.015:.06),wrist[2]-.06]);
    matrices[thigh]=segmentMatrix([side*.085,.84,0],[side*.085,.45,0],[side*.10,0,0],knee);
    matrices[kneeId]=segmentMatrix([side*.085,.45,0],[side*.085,.09,0],knee,ankle);
    matrices[ankleId]=foot;
  }return matrices;
}
export function poseHumanPositions(positions:ArrayLike<number>,indices:ArrayLike<number>,weights:ArrayLike<number>,matrices:readonly THREE.Matrix4[]){const out=new Float32Array(positions.length),v=new THREE.Vector3(),p=new THREE.Vector3(),sum=new THREE.Vector3();for(let i=0;i<positions.length/3;i++){p.set(positions[i*3],positions[i*3+1],positions[i*3+2]);sum.set(0,0,0);for(let j=0;j<4;j++){const w=weights[i*4+j];if(w)sum.addScaledVector(v.copy(p).applyMatrix4(matrices[indices[i*4+j]]),w);}out.set([sum.x,sum.y,sum.z],i*3);}return out;}
