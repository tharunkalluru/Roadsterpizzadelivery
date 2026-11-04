import { DESTINATION_HERO_PLANS } from './destination-hero-data';

/** Exact middle lenses of the six towers already drawn by drawUppalStadium.
 * These are lighting sources, never extra poles or replacement stadium geometry. */
export function uppalStadiumFloodlights(center:{x:number;z:number}){
  const ring=DESTINATION_HERO_PLANS.uppal_stadium.ring;
  const xs=ring.map(p=>p[0]),zs=ring.map(p=>p[1]);
  const ru=(Math.max(...xs)-Math.min(...xs))*.46,rv=(Math.max(...zs)-Math.min(...zs))*.46;
  return Array.from({length:6},(_,i)=>{
    const angle=(i+.35)/6*Math.PI*2;
    return{x:center.x+Math.cos(angle)*ru*1.06,y:36.675,z:center.z+Math.sin(angle)*rv*1.06};
  });
}
