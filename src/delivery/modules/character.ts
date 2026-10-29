import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type CharacterStyle = 'pushpa' | 'simhadri' | 'trainHero' | 'gabbar' | 'jersey' | 'imax' | 'director' | 'extra' | 'unknown';
export interface SceneCharacter {
  group: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  book?: THREE.Object3D;
  /** Non-human receivers may expose a physical body anchor instead of hands. */
  catchPoint?: THREE.Object3D;
  catchPose: (amount: number) => void;
}
interface Resources { geometry: <T extends THREE.BufferGeometry>(value: T) => T; material: (key: string, value: THREE.MeshBasicMaterial) => void }

/** Faceted film-scene costumes, deliberately stylized rather than photographic likenesses. */
export function createSceneCharacter(style: CharacterStyle, seated: boolean, resources: Resources): SceneCharacter {
  const group = new THREE.Group(); group.name = `delivery-character-${style}`;
  const shirt = { pushpa:'#B86638', simhadri:'#E66E24', trainHero:'#3F657B', gabbar:'#B9A272', jersey:'#E9E7DF', imax:'#294957', director:'#637C8C', extra:'#C9BDA4',unknown:'#302A42' }[style];
  const trousers = style === 'simhadri' ? '#A3232D' : style === 'jersey' ? '#D5D7D4' : style === 'gabbar' ? '#9C8153' : '#28313C';
  const skin = style==='unknown'?'#40394F':'#B57F5E', hair = style==='unknown'?'#2D273B':style === 'director' ? '#515153' : '#241C19';
  const parts: { g: THREE.BufferGeometry; c: string }[] = [];
  const box = (x:number,y:number,z:number,w:number,h:number,d:number,c:string) => parts.push({g:new THREE.BoxGeometry(w,h,d).translate(x,y,z),c});
  const orb = (x:number,y:number,z:number,sx:number,sy:number,sz:number,c:string,detail=1) => parts.push({g:new THREE.IcosahedronGeometry(1,detail).scale(sx,sy,sz).translate(x,y,z),c});
  const flush = (name:string,parent:THREE.Group) => {
    for (const {g,c} of parts) {
      const color=new THREE.Color(c), values=new Float32Array(g.attributes.position.count*3);
      for(let i=0;i<values.length;i+=3){values[i]=color.r;values[i+1]=color.g;values[i+2]=color.b;}
      g.setAttribute('color',new THREE.BufferAttribute(values,3));
    }
    // Icosahedra are non-indexed; use matching vertex layouts for one local draw.
    const prepared=parts.map(p=>p.g.index?p.g.toNonIndexed():p.g);
    const geo=resources.geometry(mergeGeometries(prepared)!);
    prepared.forEach((g,i)=>{if(g!==parts[i].g)g.dispose();});parts.forEach(p=>p.g.dispose());parts.length=0;
    const mat=new THREE.MeshBasicMaterial({vertexColors:true,toneMapped:false});resources.material(name,mat);
    const mesh=new THREE.Mesh(geo,mat);mesh.name=name;parent.add(mesh);return mesh;
  };
  const hip=seated?.82:1.02, shoulder=hip+.52, head=shoulder+.45;
  parts.push({g:new THREE.CylinderGeometry(.29,.23,.72,6).scale(1.12,1,.68).translate(0,hip+.27,0),c:shirt});
  box(0,hip-.12,0,.46,.24,.33,trousers);
  for(const side of [-1,1]) {
    const x=side*.16;
    if(seated){box(x,.74,.22,.22,.22,.57,trousers);box(x,.4,.45,.2,.53,.2,trousers);box(x,.13,.52,.23,.15,.38,'#342B26');}
    else {box(x,.55,0,.22,.76,.24,trousers);box(x,.13,.09,.24,.18,.39,'#342B26');}
  }
  orb(0,head,0,.245,.3,.225,skin);
  orb(0,head+.15,-.035,.265,.22,.24,hair);
  if(['pushpa','simhadri','trainHero','director'].includes(style)) {
    orb(0,head-.12,.115,.21,.17,.16,hair);
    for(const side of [-1,1])orb(side*.18,head-.04,.075,.08,.15,.12,hair,0);
  } else if(style==='gabbar') box(0,head-.08,.222,.22,.045,.04,hair);
  for(const side of [-1,1]) {box(side*.09,head+.015,.214,.045,.035,.026,'#201B1B');box(side*.09,head+.073,.204,.1,.025,.04,hair);}
  orb(0,head-.04,.23,.055,.06,.07,skin,0);
  if(style==='pushpa') {
    for(const x of [-.17,0,.17])box(x,hip+.28,.139,.022,.66,.018,'#6D3C2A');
    for(const y of [hip+.07,hip+.25,hip+.43])box(0,y,.142,.54,.025,.018,'#E6AD6A');
    orb(-.14,head+.27,.03,.16,.13,.16,hair,0);
  }
  if(style==='simhadri') {
    box(0,head+.12,.23,.035,.11,.025,'#B9342A');
    for(const x of [-.18,.18])box(x,hip+.3,.15,.09,.68,.04,'#EB9A36');
    orb(0,head+.08,-.2,.25,.31,.12,hair);
  }
  if(style==='gabbar') {box(-.14,hip+.33,.15,.14,.16,.03,'#80673E');box(.15,hip+.43,.17,.08,.09,.03,'#EAC351');box(0,head+.015,.24,.4,.11,.04,'#21232C');}
  if(style==='jersey') {for(const x of [-.16,.16])box(x,.55,.15,.18,.54,.09,'#F8F2DA');box(0,hip+.32,.15,.2,.22,.025,'#365D79');}
  if(style==='director') {for(const x of [-.15,0,.15])box(x,hip+.27,.145,.02,.64,.02,'#CED4D6');for(const y of [hip+.1,hip+.3,hip+.5])box(0,y,.15,.52,.02,.02,'#CED4D6');}
  flush(`${group.name}-body`,group);
  const arms = [-1,1].map(side=>{
    const arm=new THREE.Group();arm.name=`${group.name}-${side<0?'left':'right'}-arm`;arm.position.set(side*.31,shoulder,0);group.add(arm);
    box(0,-.14,0,.19,.35,.23,shirt);box(0,-.4,.025,.145,.23,.17,skin);orb(0,-.54,.04,.09,.11,.085,skin,0);
    flush(`${arm.name}-mesh`,arm);if(seated)arm.rotation.x=-.95;return arm;
  });
  let book:THREE.Object3D|undefined;
  if(style==='pushpa'||style==='unknown') {
    box(0,.98,.57,.65,.06,.43,'#B42D2B');box(0,1.02,.57,.59,.03,.38,'#F3E6BC');
    for(const x of [-.2,-.07])box(x,1.04,.56,.018,.01,.18,'#382F2A');
    for(const z of [.47,.56,.65])box(-.135,1.04,z,.15,.01,.018,'#382F2A');
    for(const z of [.48,.56,.64])box(.16,1.04,z,.2,.01,.018,'#382F2A');book=flush('delivery-japanese-study-book',group);
  }
  if(style==='jersey'){box(.6,.5,.18,.18,.85,.1,'#C99D63');box(.6,1.05,.18,.06,.3,.06,'#5A4032');flush('delivery-cricket-bat',group);}
  if(style==='director'){parts.push({g:new THREE.ConeGeometry(.22,.48,8).rotateX(Math.PI/2).translate(.55,1.15,.23),c:'#B9BFC5'});flush('delivery-director-megaphone',group);}
  return {group,leftArm:arms[0],rightArm:arms[1],book,catchPose:amount=>{const a=Math.max(0,Math.min(1,amount));arms[0].rotation.x=arms[1].rotation.x=-1.35*a;arms[0].rotation.z=-.18*a;arms[1].rotation.z=.18*a;}};
}
