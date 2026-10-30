import * as THREE from 'three';
import headData from '../characters/anatomical-head.json';

interface HeadLook { skin:string; hair:string; jaw:number; beard:number; hairHeight:number }
export const FACE_PROFILES:Record<string,{width:number;cheek:number;jaw:number;noseWidth:number;noseProjection:number;eyeSpacing:number;brow:number}>={
  pushpa:{width:1.055,cheek:1.07,jaw:1.15,noseWidth:1.065,noseProjection:1.07,eyeSpacing:1.02,brow:.002},
  simhadri:{width:1.09,cheek:1.08,jaw:1.12,noseWidth:1.11,noseProjection:.96,eyeSpacing:1.035,brow:.000},
  trainHero:{width:1.025,cheek:1.01,jaw:1.16,noseWidth:1.025,noseProjection:1.13,eyeSpacing:.985,brow:.0025},
  gabbar:{width:1.025,cheek:1.03,jaw:1.08,noseWidth:1.06,noseProjection:1.04,eyeSpacing:1.035,brow:.001},
  jersey:{width:1.015,cheek:1.045,jaw:.99,noseWidth:1.06,noseProjection:1.07,eyeSpacing:1.045,brow:.004},
  imax:{width:.99,cheek:.99,jaw:.97,noseWidth:1.05,noseProjection:.95,eyeSpacing:1.055,brow:.0035},
  director:{width:1.075,cheek:1.07,jaw:1.1,noseWidth:1.09,noseProjection:1.01,eyeSpacing:.99,brow:.0015},
};
export const crownOffset=(y:number)=>y<=.0532?y:.0532+(y-.0532)*.59;
const smooth=(lo:number,hi:number,v:number)=>{const t=Math.max(0,Math.min(1,(v-lo)/(hi-lo)));return t*t*(3-2*t);};

/** CC0 neutral human topology, given an authored scene-specific silhouette.
 * Facial loops are continuous: no attached cheek, nose or lip primitives. */
export function anatomicalCharacterHead(style:string,headY:number,look:HeadLook) {
  const positions=new Float32Array(headData.positions.length),colors=new Float32Array(positions.length);
  const skin=new THREE.Color(look.skin),hair=new THREE.Color(look.hair),lip=new THREE.Color(style==='imax'?'#AA7A67':'#9A6C56'),shadow=new THREE.Color(look.skin).multiplyScalar(.66),color=new THREE.Color();
  const profile=FACE_PROFILES[style]??{width:1,cheek:1,jaw:look.jaw,noseWidth:1,noseProjection:1,eyeSpacing:1,brow:0};
  for(let i=0;i<headData.positions.length;i+=3){
    const x=headData.positions[i],y=headData.positions[i+1],z=headData.positions[i+2],ax=Math.abs(x);
    const jaw=smooth(7.15,6.2,y),cheek=Math.exp(-(((y-7.02)/.38)**2)),width=profile.width*(1+(profile.jaw-1)*jaw)*(1+(profile.cheek-1)*cheek);
    const front=smooth(.55,1.0,z),ear=ax>.64&&y<7.7&&z<.9;
    const frontHair=style==='director'?8.36:style==='pushpa'?7.98:style==='imax'?8.12:8.04;
    const scalp=smooth((z>1?frontHair:7.38), (z>1?frontHair:7.38)+.1,y)*(ear?0:1);
    const sideburn=smooth(.5,.67,ax)*(1-smooth(7.12,7.34,y))*smooth(.4,.85,z)*smooth(6.9,7.02,y);
    const beardEdge=6.43+.58*smooth(.15,.56,ax);
    const beard=look.beard>0?front*(1-smooth(beardEdge-.02,beardEdge+.06,y))*smooth(5.9,6.05,y):0;
    const moustache=style!=='unknown'&&style!=='imax'&&style!=='extra'?front*(1-smooth(.24,.37,ax))*smooth(6.7,6.75,y)*(1-smooth(6.82,6.89,y)):0;
    const hairWeight=Math.max(scalp,sideburn,beard,moustache);
    const nose=Math.exp(-((x/.3)**2+((y-6.96)/.3)**2))*smooth(1.1,1.45,z),eye=Math.exp(-(((ax-.31)/.22)**2+((y-7.28)/.17)**2))*smooth(1.02,1.24,z);
    const taper=1-.055*smooth(7.58,8.49,y);
    positions[i]=(x*.112*width+Math.sign(x)*(profile.eyeSpacing-1)*.31*.112*eye)*(1+(profile.noseWidth-1)*nose)*taper+Math.sign(x)*scalp*.005;
    positions[i+1]=headY+crownOffset((y-6.975)*.112)+scalp*look.hairHeight*.4-beard*look.beard*.32;
    positions[i+2]=z*.112-.035+(profile.noseProjection-1)*(z-1.1)*.112*nose+scalp*.004+beard*look.beard*.36;
    color.copy(skin);
    const lips=front*(1-smooth(.27,.4,ax))*smooth(6.45,6.5,y)*(1-smooth(6.68,6.73,y));
    color.lerp(lip,lips*.54);
    if(z<1.3&&z>.8&&ax<.35&&y>6.35&&y<6.75)color.lerp(shadow,.68);
    color.lerp(hair,hairWeight);
    const strand=1+.035*hairWeight*Math.sin(x*101+y*87+z*29);colors[i]=color.r*strand;colors[i+1]=color.g*strand;colors[i+2]=color.b*strand;
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));g.setAttribute('color',new THREE.BufferAttribute(colors,3));g.setIndex(headData.indices);g.computeVertexNormals();return g;
}
