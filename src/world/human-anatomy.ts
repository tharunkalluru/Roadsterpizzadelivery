import * as THREE from 'three';
import { toTpl, type Tpl, type AddOpts } from '../core/util';
import humanSource from './npc-human.json';

/** Shared clothed anatomy, in metres. Faces are a CC0 MakeHuman derivative,
 * not celebrity scans. All surfaces merge into the existing vertex-colour batch. */
export type HumanPartSink = (t: Tpl, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, o?: AddOpts) => void;
type Ring = readonly [height: number, halfWidth: number, halfDepth: number, depthOffset?: number];
function loft(rings: readonly Ring[], sides = 10): Tpl {
  const p: number[] = [], uv: number[] = [], ix: number[] = [];
  for (let r = 0; r < rings.length; r++) {
    const [y, w, d, z = 0] = rings[r];
    for (let j = 0; j <= sides; j++) { const a = j / sides * Math.PI * 2; p.push(Math.sin(a) * w, y, Math.cos(a) * d + z); uv.push(j / sides, r / (rings.length - 1)); }
    if (r) for (let j = 0; j < sides; j++) { const a = (r - 1) * (sides + 1) + j, b = a + sides + 1; ix.push(a, a + 1, b, a + 1, b + 1, b); }
  }
  for (let j = 1; j < sides - 1; j++) { ix.push(0, j + 1, j); const n = (rings.length - 1) * (sides + 1); ix.push(n, n + j, n + j + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(ix); g.computeVertexNormals(); const t = toTpl(g); g.dispose(); return t;
}
// Shape follows pelvis -> waist -> rib cage -> clavicles, with separate sleeve
// cuffs and garment hems in the wardrobe builder. No rectangular block torso.
export const HUMAN_TORSO = loft([[-.245,.155,.108],[-.19,.17,.117],[-.105,.145,.106],[.025,.175,.124,-.006],[.14,.20,.112],[.205,.18,.092],[.255,.074,.073]]);
export const HUMAN_UPPER_ARM = loft([[-.5,.37,.34],[-.36,.43,.39],[-.1,.49,.43],[.28,.48,.43],[.46,.38,.35],[.5,.3,.3]], 8);
export const HUMAN_FOREARM = loft([[-.5,.27,.25],[-.35,.31,.29],[.05,.43,.36],[.35,.45,.40],[.5,.36,.34]], 8);
export const HUMAN_THIGH = loft([[-.5,.35,.33],[-.32,.39,.36],[.12,.49,.45],[.38,.49,.46],[.5,.40,.39]], 10);
export const HUMAN_SHIN = loft([[-.5,.24,.25],[-.32,.27,.29],[-.05,.34,.37],[.24,.39,.41],[.45,.34,.34],[.5,.31,.31]], 8);
export const HUMAN_PALM = loft([[-.5,.36,.20],[-.35,.49,.25],[.15,.5,.26],[.4,.40,.21],[.5,.31,.18]], 8);
export const HUMAN_FINGER = loft([[-.5,.19,.18],[-.36,.25,.22],[.12,.27,.24],[.42,.23,.21],[.5,.11,.12]], 6);
export const HUMAN_SHOE = loft([[-.5,.40,.42],[-.32,.48,.49],[.22,.46,.49],[.5,.35,.34,.08]], 10);
const LOW_LIMB=loft([[-.5,.27,.25],[0,.46,.40],[.5,.35,.33]],5),LOW_PALM=loft([[-.5,.35,.20],[.5,.4,.22]],4),LOW_FINGER=loft([[-.5,.19,.18],[.5,.20,.18]],3);
export const LOW_ANATOMY = new Map<Tpl,Tpl>([[HUMAN_TORSO,loft([[-.245,.155,.108],[-.105,.145,.106],[.14,.20,.112],[.255,.074,.073]],6)],
  [HUMAN_UPPER_ARM,LOW_LIMB],[HUMAN_FOREARM,LOW_LIMB],[HUMAN_THIGH,LOW_LIMB],[HUMAN_SHIN,LOW_LIMB],[HUMAN_PALM,LOW_PALM],[HUMAN_FINGER,LOW_FINGER],[HUMAN_SHOE,loft([[-.5,.40,.42],[.5,.35,.34,.08]],6)]]);
const EYE_SURFACE=(()=>{const p=[0,0,-.1],n=[0,0,-1],uv=[.5,.5],ix:number[]=[];for(let i=0;i<8;i++){const a=i/8*Math.PI*2;p.push(Math.cos(a),Math.sin(a),0);n.push(0,0,-1);uv.push(.5+Math.cos(a)*.5,.5+Math.sin(a)*.5);}for(let i=0;i<8;i++)ix.push(0,1+(i+1)%8,1+i);const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);const t=toTpl(g);g.dispose();return t;})();

export interface HumanHeadLook { skin: string; hair: string; female?: boolean; age?: 'child' | 'teen' | 'adult' | 'elder'; face?: number; hairstyle?: number; facialHair?: boolean; covered?: boolean; cloth?: string; bindi?: boolean; low?: boolean }
type HeadParts = { skin: Tpl; lips: Tpl; shadow: Tpl; scalp: Tpl };
const headCache = new Map<string, HeadParts>();
const facialProfiles = [
  [1,.99,1,1], [1.07,1.09,1.02,.95], [.94,.92,.92,1.07], [1.01,1.06,1.12,1.08], [1.055,.96,.95,.93], [.98,1.04,1.07,1.04],
] as const;
function headParts(look: HumanHeadLook): HeadParts {
  const source=look.low?humanSource.headLow:humanSource.head;
  const face = (look.face ?? 0) % facialProfiles.length, female = !!look.female, elder = look.age === 'elder', child = look.age === 'child', hair = (look.hairstyle ?? 0) % 4;
  const teen=look.age==='teen',variant=`${female?'female':'male'}-${elder?'old':child?'child':'young'}` as keyof typeof source.positions;
  const key = `${face}:${+female}:${look.age}:${hair}:${+!!look.low}:${+!!look.covered}:${+!!look.facialHair}`; const found = headCache.get(key); if (found) return found;
  const [width, jaw, nose, cheek] = facialProfiles[face], positions: number[] = [];
  const original=source.positions[variant],younger=source.positions[`${female?'female':'male'}-child`];
  for (let i = 0; i < original.length; i += 3) {
    const [x,y,z]=original.slice(i,i+3).map((v,j)=>teen?v*.76+younger[i+j]*.24:v),chin=Math.max(0,Math.min(1,(-y-.015)/.10)),cheekWeight=Math.exp(-((y/.045)**2)),noseWeight=Math.exp(-((x/.025)**2+((y+.004)/.03)**2));
    positions.push(x*width*(1+(jaw-1)*chin)*(1+(cheek-1)*cheekWeight),y,z-(nose-1)*.013*noseWeight);
  }
  // The offline derivative already reflects and reverses source winding.
  const reflectedIndices=source.indices;
  const g = new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3)); g.setIndex(reflectedIndices); g.computeVertexNormals();
  const normal = g.getAttribute('normal'), grouped: Record<keyof HeadParts,{p:number[];n:number[]}> = {skin:{p:[],n:[]},lips:{p:[],n:[]},shadow:{p:[],n:[]},scalp:{p:[],n:[]}};
  for (let i=0;i<source.indices.length;i+=3) {
    let x=0,y=0,z=0; for(let j=0;j<3;j++){const v=source.indices[i+j];x+=positions[v*3]/3;y+=positions[v*3+1]/3;z+=positions[v*3+2]/3;}
    // Scalp uses the continuous cranial mesh, leaving the forehead and ears free.
    const hairline = z<-.065 ? (hair===1?.105:hair===2?.091:.084) : .035;
    const mouth=humanSource.mouths[variant],mouthDepth=humanSource.mouthDepths[variant],lip=Math.abs(y-mouth)<.003&&z<mouthDepth+.003&&Math.abs(x)<.032;
    const covered=look.covered&&(z>-.064||Math.abs(x)>.065||y>.09);
    const beard=look.facialHair&&!female&&!teen&&!child&&((elder&&y<mouth-.008&&z<-.035&&Math.abs(x)<.058)||(y>mouth+.005&&y<mouth+.011&&z<mouthDepth+.002&&Math.abs(x)<.027));
    const region: keyof HeadParts = y>hairline||covered||beard ? 'scalp' : lip ? 'lips' : 'skin';
    for(let j=0;j<3;j++){const v=reflectedIndices[i+j];grouped[region].p.push(...positions.slice(v*3,v*3+3));grouped[region].n.push(normal.getX(v),normal.getY(v),normal.getZ(v));}
  }
  const result = Object.fromEntries(Object.entries(grouped).map(([k,v])=>[k,{pos:v.p,nor:v.n,uv:new Float32Array(v.p.length/3*2),count:v.p.length/3}])) as unknown as HeadParts;
  g.dispose(); headCache.set(key,result); return result;
}
const tinted = (color: string, value: number) => `#${new THREE.Color(color).multiplyScalar(value).getHexString()}`;
/** Actual facial topology includes eye sockets, nose, jaw, mouth and ears. Small
 * eye/brow surfaces sit in those sockets rather than painting dots on a sphere. */
export function drawHumanHead(put: HumanPartSink, look: HumanHeadLook, y: number, z = 0, eyeTemplate?: Tpl) {
  const parts = headParts(look); put(parts.skin,0,y,z,1,1,1,look.skin); put(parts.lips,0,y,z,1,1,1,tinted(look.skin,.86));
  put(parts.shadow,0,y,z,1,1,1,tinted(look.skin,.90)); put(parts.scalp,0,y,z,1,1,1,look.covered?(look.cloth??'#16151b'):look.hair);
  const variant=`${look.female?'female':'male'}-${look.age==='elder'?'old':look.age==='child'?'child':'young'}` as keyof typeof humanSource.eyes;
  if (eyeTemplate) for(let i=0;i<2;i++) {
    const e=humanSource.eyes[variant][i],younger=humanSource.eyes[`${look.female?'female':'male'}-child`][i],ex=(look.age==='teen'?e[0]*.76+younger[0]*.24:e[0])*facialProfiles[(look.face??0)%6][0],ey=look.age==='teen'?e[1]*.76+younger[1]*.24:e[1],ez=look.age==='teen'?e[2]*.76+younger[2]*.24:e[2],side=i===0?1:-1;
    put(EYE_SURFACE,ex,y+ey,z+ez-.006,.0108,.0032,.003,'#a69e8f');
    put(EYE_SURFACE,ex,y+ey,z+ez-.0068,.0031,.0030,.001,'#342b23');
    put(EYE_SURFACE,ex,y+ey,z+ez-.0072,.0013,.002,.0005,'#181410');
    // Slightly arched eyebrows are short extruded strips; no giant cartoon eyes.
    put(HUMAN_FINGER,ex,y+ey+.009,z+ez-.003,.040,.003,.006,look.hair,{rz:side*.08});
  }
  if(look.bindi&&eyeTemplate) put(eyeTemplate,0,y+.055,z-.114,.006,.007,.003,'#8d211e');
}

/** Palm, four tapering fingers, thumb and wrist. Fingers remain joined at the
 * knuckles, so an NPC hand reads as anatomy from the driving camera. */
export function drawHumanHand(put: HumanPartSink, x: number, y: number, z: number, skin: string, side: number, relaxed = true) {
  put(HUMAN_PALM,x,y,z,.07,.09,.07,skin,{rz:side*.10});
  for(let i=0;i<4;i++) put(HUMAN_FINGER,x+(i-1.5)*.013,y-.055+(i===0||i===3?.006:0),z-(relaxed?.008:0),.036,i===0||i===3?.043:.052,.051,skin,{rx:relaxed?.16:0,rz:side*.04});
  put(HUMAN_FINGER,x-side*.035,y-.008,z-.013,.044,.052,.052,skin,{rz:-side*.65,rx:.18});
}

export const humanAnatomyStats = { sourceTriangles: humanSource.head.triangleCount, sourceVertices: humanSource.head.vertexCount, lowTriangles:humanSource.headLow.triangleCount, maxHeadTemplates: 6*2*4*4*2*2,
  get headTemplates() { return headCache.size; } };
