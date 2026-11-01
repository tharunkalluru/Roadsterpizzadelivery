import * as THREE from 'three';
import { CharacterSculpt } from './character-sculpt';
import { anatomicalCharacterHead, crownOffset, FACE_PROFILES } from './character-head';

export type CharacterStyle = 'pushpa' | 'simhadri' | 'trainHero' | 'gabbar' | 'jersey' | 'imax' | 'director' | 'extra' | 'unknown';
export type CharacterMotion = 'idle' | 'walk' | 'dance' | 'read';
export interface SceneCharacter {
  group: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  book?: THREE.Object3D;
  catchPoint?: THREE.Object3D;
  /** Older authored rigs may already place the anchor at the box centre. */
  catchPointSpace?: 'palm-contact'|'box-center';
  catchPose: (amount: number) => void;
  /** Authored in-place motion; scene systems continue to own the world path. */
  animate?: (dt: number, motion: CharacterMotion, speed?: number) => void;
}
interface Resources { geometry: <T extends THREE.BufferGeometry>(value: T) => T; material: (key: string, value: THREE.MeshBasicMaterial) => void }
interface Look { shirt:string; pants:string; skin:string; hair:string; width:number; jaw:number; beard:number; hairHeight:number; moustache:boolean }
const LOOKS:Record<CharacterStyle,Look>={
  pushpa:{shirt:'#96613D',pants:'#403E34',skin:'#AD7956',hair:'#231D18',width:1.04,jaw:1.13,beard:.058,hairHeight:.052,moustache:true},
  simhadri:{shirt:'#C65D21',pants:'#902D2B',skin:'#BB8968',hair:'#231C1C',width:1.15,jaw:1.13,beard:0,hairHeight:.038,moustache:true},
  trainHero:{shirt:'#376171',pants:'#2B3540',skin:'#B98567',hair:'#241C18',width:1.08,jaw:1.1,beard:.017,hairHeight:.03,moustache:true},
  gabbar:{shirt:'#AC9569',pants:'#897853',skin:'#BC8869',hair:'#27201D',width:1.05,jaw:1.02,beard:.005,hairHeight:.031,moustache:true},
  jersey:{shirt:'#DDDCCF',pants:'#D5D3C6',skin:'#B58361',hair:'#28231F',width:.98,jaw:.97,beard:.014,hairHeight:.035,moustache:true},
  imax:{shirt:'#31515F',pants:'#29343A',skin:'#C69779',hair:'#282522',width:.96,jaw:.91,beard:0,hairHeight:.034,moustache:false},
  director:{shirt:'#617484',pants:'#3A4147',skin:'#B78E72',hair:'#7B7B72',width:1.02,jaw:1.02,beard:.027,hairHeight:.016,moustache:true},
  extra:{shirt:'#A79F88',pants:'#454840',skin:'#A87A5B',hair:'#352A24',width:1,jaw:1,beard:0,hairHeight:.018,moustache:false},
  unknown:{shirt:'#2C2836',pants:'#24212D',skin:'#35303E',hair:'#25212E',width:1.04,jaw:1.04,beard:.025,hairHeight:.035,moustache:false},
};
const mix=(color:string,amount:number)=>new THREE.Color(color).multiplyScalar(amount).getStyle();

/** Authored, anatomically proportioned scene actors. Facial form is sculpted 3D,
 * not a portrait plane. These are detailed stylizations, not scanned likenesses.
 * Body and each shoulder chain remain one draw, with a real hand catch anchor. */
function buildSceneCharacter(style:CharacterStyle,seated:boolean,resources:Resources):SceneCharacter {
  const group=new THREE.Group();group.name=`delivery-character-${style}`;
  const look=LOOKS[style],anonymous=style==='unknown',body=new CharacterSculpt();
  const material=new THREE.MeshBasicMaterial({vertexColors:true,toneMapped:false});resources.material(`${group.name}-vertex-lit`,material);
  const flush=(sculpt:CharacterSculpt,name:string,parent:THREE.Group)=>{
    const mesh=new THREE.Mesh(resources.geometry(sculpt.finish()),material);mesh.name=name;parent.add(mesh);return mesh;
  };
  const offset=seated?-.26:0,hip=.96+offset,shoulder=1.49+offset,head=1.69+offset;
  const skin=look.skin,hair=look.hair,shirt=look.shirt,pants=look.pants,shade=mix(skin,.72),clothShadow=mix(shirt,.72),clothLight=mix(shirt,1.15);
  group.userData.characterArt='sculpted-v2';group.userData.characterStyle=style;group.userData.height=1.86+offset;
  // Natural seven-head proportions: shaped shoulders, waist and pelvis rather
  // than a cylinder torso and a head a quarter of the person's total height.
  body.rings([[hip-.11,.177,.108,0],[hip,.194,.119,0],[hip+.2,.182,.112,0],[hip+.38,.222*look.width,.124,0],[shoulder-.015,.255*look.width,.108,-.005],[shoulder+.035,.186,.086,-.008],[shoulder+.065,.083,.064,0]],shirt);
  body.rings([[hip-.12,.165,.105,0],[hip-.045,.187,.113,0],[hip+.025,.183,.112,0]],pants);
  body.orb(0,shoulder+.06,-.008,.061,.076,.058,skin);
  for(const side of[-1,1]){
    const x=side*.105;
    if(seated){
      body.limb([x,hip-.06,0],[x,.59,.36],.091,.078,pants,12,.92);body.orb(x,.59,.36,.078,.079,.085,pants);
      body.limb([x,.59,.38],[x,.13,.43],.069,.052,pants,12,.9);body.orb(x,.085,.5,.064,.06,.145,'#352B25');
      body.curve([[x-.035,.64,.14],[x-.03,.63,.3],[x-.025,.51,.42]],.005,mix(pants,.74),5);
    }else{
      body.limb([x,hip-.08,0],[x*1.05,.5,.014],.095,.068,pants,12,.9);body.orb(x*1.05,.5,.014,.067,.071,.065,pants);
      body.limb([x*1.05,.5,.014],[x*1.06,.12,.02],.065,.049,pants,12,.94);body.orb(x*1.06,.07,.083,.064,.065,.144,'#302B29');
      body.curve([[x+side*.064,.84,.01],[x+side*.061,.52,.04],[x+side*.045,.19,.045]],.004,mix(pants,1.16),6);
      for(const y of[.49,.21])body.curve([[x-.04,y,.065],[x,y-.015,.08],[x+.04,y+.005,.065]],.004,mix(pants,.77),4);
    }
    // Shoe welt/toe, collar points, two chest pockets and their actual seams.
    const footY=.042,footZ=seated?.53:.112;body.orb(x,footY,footZ,.064,.017,.125,'#1E1E1E',10,5);
    body.curve([[side*.058,shoulder+.026,.075],[side*.094,shoulder-.052,.128],[side*.025,shoulder-.005,.137]],.012,clothLight,5);
    if(style!=='simhadri'){
      body.box(side*.105,hip+.345,.122,.091,.105,.012,clothShadow);body.box(side*.105,hip+.36,.13,.08,.066,.008,shirt);
      body.curve([[side*.06,hip+.397,.136],[side*.106,hip+.387,.139],[side*.15,hip+.397,.133]],.004,clothLight,4);
    }
    body.curve([[side*.16,hip+.12,.093],[side*.12,hip+.09,.119],[side*.042,hip+.1,.12]],.004,clothShadow,5);
  }
  // Shirt placket, buttons and rolled cotton folds are physical shallow ridges.
  body.curve([[0,hip+.03,.122],[0,hip+.27,.132],[0,shoulder+.007,.104]],.006,clothShadow,7);
  for(const y of[hip+.09,hip+.2,hip+.31,hip+.43])body.orb(.008,y,.138,.007,.008,.003,'#C5B497',7,4);
  if(style==='pushpa'||style==='director'){
    const stripe=style==='pushpa'?'#B28756':'#9BA5A5';
    for(const x of[-.145,-.07,.07,.145])body.curve([[x,hip+.03,.111],[x,hip+.25,.131],[x,shoulder-.04,.116]],.0035,stripe,7);
    for(const y of[hip+.09,hip+.2,hip+.31,hip+.42])body.curve([[-.192,y,.09],[0,y,.135],[.192,y,.09]],.0035,stripe,7);
  }
  if(style==='simhadri'){
    body.rings([[.12,.135,.102,0],[hip-.045,.19,.124,0],[hip+.02,.185,.123,0]],pants,20);
    for(let i=-3;i<=3;i++)body.curve([[i*.045,.18,.093],[i*.044,.49,.115],[i*.04,hip-.035,.12]],.005,'#AF4B36',6);
    body.curve([[-.18,hip-.02,.11],[0,hip-.015,.139],[.18,hip-.02,.11]],.008,'#CF8D3A',7);
  }
  if(style==='gabbar'){
    body.box(0,hip+.01,.12,.36,.04,.014,'#574734');body.box(0,hip+.01,.135,.045,.045,.009,'#B69A55');
    body.box(.111,hip+.42,.14,.052,.058,.014,'#BBA453');body.box(-.11,hip+.4,.14,.067,.015,.01,'#25272A');
    for(const side of[-1,1])body.box(side*.21,shoulder+.02,.015,.077,.015,.075,'#C4B07D');
  }
  if(style==='jersey'){
    for(const side of[-1,1])body.curve([[side*.065,shoulder+.04,.075],[0,shoulder-.02,.133],[side*.065,shoulder+.04,.077]],.009,'#3F6771',7);
    body.box(-.11,hip+.42,.14,.043,.047,.01,'#52766E');
    for(const side of[-1,1])for(const yy of[.22,.32,.42])body.curve([[side*.105-.045,yy,.085],[side*.105,yy,.1],[side*.105+.045,yy,.085]],.006,'#C1BDA3',5);
  }
  // Continuous anatomical face topology replaces the separate facial orbs.
  // Its actual eyelids recess the eyes; hair/beard follow the same skin contour.
  const face=new CharacterSculpt(),profile=FACE_PROFILES[style]??{width:1,eyeSpacing:1,brow:0};
  face.add(anatomicalCharacterHead(style,head,look),skin);
  if(!anonymous){
    for(const side of[-1,1]){
      const x=side*.0345*profile.width*profile.eyeSpacing,y=head+.0346,z=.1045,eyeDown=seated?-.0038:0;
      face.orb(x,y,z,.0155,.0155,.0155,'#BDB8A5',14,10);
      face.orb(x,y-.0007+eyeDown,z+.0153,.0047,.0048,.0012,'#47382C',12,8);
      face.orb(x,y-.0007+eyeDown,z+.0163,.0022,.0026,.0007,'#171A1B',10,7);
      face.orb(x-.001,y+.0011+eyeDown,z+.017,.0008,.0008,.0005,'#EEE3C8',6,4);
      face.curve([[x-side*.023,y+.016,.119],[x,y+.018+profile.brow,.126],[x+side*.023,y+.016,.11]],style==='imax'?.0028:.0037,hair,8);
    }
  }
  if(style==='pushpa'||style==='simhadri'||style==='jersey'){
    const rows=style==='pushpa'?3:2,columns=5,volume=style==='pushpa'?.0105:.008;
    for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
      const x=(col-2)*.034,z=.11-row*.038,cap=head+crownOffset(.132+row*.019+Math.sin(col*1.7)*.009)+look.hairHeight*.11;
      face.lock([[x-.014,cap-.014,z+.01],[x-.024,cap+.009,z+.014],[x+.004,cap+.019,z-.007],[x+.023,cap+.002,z-.027]],volume,((row+col)%3)?hair:mix(hair,1.2),8);
    }
    // Solid overlapping nape/side clumps meet the actual scalp. Open C-shaped
    // curves here read as floating rings in a three-quarter silhouette.
    for(const side of[-1,1])for(let i=0;i<(style==='pushpa'?3:1);i++){
      const yy=head+.067-i*.035,x=side*(.058-i*.007),z=-.054+i*.012;
      face.orb(x,yy,z,style==='pushpa'?.026:.023,.029,.023,i%2?hair:mix(hair,1.12),10,7);
    }
  }else{
    const locks=style==='director'?4:6,sweep=style==='imax'?-.038:style==='gabbar'?-.051:-.028;
    for(let i=0;i<locks;i++){
      const x=(i/(locks-1)-.5)*.154,wave=Math.sin(i*1.7)*.005,root=head+crownOffset(.117+wave),top=head+crownOffset(.156+look.hairHeight*.65);
      face.lock([[x,root,.13],[x+sweep*.7,top,.108],[x+sweep,top+.004,.055],[x*.8+sweep*.4,head+crownOffset(.13),.001]],style==='trainHero'?.008:.0065,i%3?hair:mix(hair,1.22),10);
    }
  }
  if(style==='simhadri')face.box(0,head+crownOffset(.067),.135,.01,.035,.003,'#A8432C');
  if(style==='gabbar')for(const side of[-1,1]){
    face.orb(side*.0345,head+.0346,.124,.027,.013,.004,'#24292B',12,8);
    face.curve([[-.011,head+.039,.13],[0,head+.043,.134],[.011,head+.039,.13]],.0025,'#887B54',5);
    face.curve([[side*.06,head+.04,.12],[side*.09,head+.041,.027]],.0025,'#383632',4);
  }
  if(seated){
    const pivot=new THREE.Vector3(0,shoulder+.105,0),tilt=new THREE.Matrix4().makeTranslation(pivot.x,pivot.y,pivot.z).multiply(new THREE.Matrix4().makeRotationX(.22)).multiply(new THREE.Matrix4().makeTranslation(-pivot.x,-pivot.y,-pivot.z));
    body.append(face,tilt);
  }else body.append(face);
  flush(body,`${group.name}-body`,group);
  const arms=[-1,1].map(side=>{
    const arm=new THREE.Group();arm.name=`${group.name}-${side<0?'left':'right'}-arm`;arm.position.set(side*.255*look.width,shoulder-.008,0);group.add(arm);
    const a=new CharacterSculpt();
    a.orb(0,-.067,0,.071,.064,.075,shirt,12,8);
    a.limb([0,-.05,0],[side*.009,-.255,.01],.074,.055,shirt,12,.98);
    a.orb(side*.01,-.235,.008,.058,.048,.061,clothLight,12,6);
    a.curve([[-.047,-.23,.035],[0,-.247,.059],[.047,-.23,.035]],.006,clothShadow,6);
    a.limb([side*.01,-.255,.012],[side*.004,-.46,.026],.05,.034,skin,12,.86);
    a.orb(side*.005,-.332,.02,.047,.105,.04,skin,12,8);
    a.orb(0,-.49,.032,.035,.045,.023,skin,12,7);
    for(let finger=0;finger<4;finger++){
      const x=(finger-1.5)*.017,tip=-.566+(finger===0||finger===3?.012:0);
      a.limb([x,-.516,.037],[x,tip,.041],.009,.0075,skin,7,.86);a.orb(x,tip,.041,.0075,.009,.007,skin,7,5);
      a.curve([[x-.005,-.53,.046],[x+.005,-.53,.046]],.0012,shade,2,4);
    }
    a.limb([side*.027,-.478,.032],[side*.052,-.508,.044],.013,.009,skin,8);
    if(style==='pushpa'||style==='director')for(const yy of[-.08,-.14,-.2])a.curve([[-.06,yy,.05],[0,yy-.006,.074],[.06,yy,.05]],.003,clothLight,5);
    if(style==='pushpa')a.orb(0,-.454,.027,.038,.014,.033,'#5C4937',12,5);
    if(style==='director')a.orb(0,-.45,.028,.038,.019,.032,'#252B2A',12,5);
    const armGeometry=a.finish();
    if(seated){
      const positions=armGeometry.getAttribute('position'),normals=armGeometry.getAttribute('normal'),colors=armGeometry.getAttribute('color'),light=new THREE.Vector3(-.38,.7,.6).normalize();
      for(let i=0;i<positions.count;i++)if(positions.getY(i)<-.255){
        const dy=positions.getY(i)+.255,dz=positions.getZ(i)-.012,nx=normals.getX(i),ny=normals.getY(i),nz=normals.getZ(i),nextY=ny*Math.cos(1)+nz*Math.sin(1),nextZ=-ny*Math.sin(1)+nz*Math.cos(1);
        positions.setXYZ(i,positions.getX(i),-.255+dy*Math.cos(1)+dz*Math.sin(1),.012-dy*Math.sin(1)+dz*Math.cos(1));normals.setXYZ(i,nx,nextY,nextZ);
        const oldFill=.64+.36*Math.max(0,nx*light.x+ny*light.y+nz*light.z),newFill=.64+.36*Math.max(0,nx*light.x+nextY*light.y+nextZ*light.z),ratio=newFill/oldFill;
        colors.setXYZ(i,colors.getX(i)*ratio,colors.getY(i)*ratio,colors.getZ(i)*ratio);
      }
      armGeometry.computeBoundingBox();armGeometry.computeBoundingSphere();
    }
    const armMesh=new THREE.Mesh(resources.geometry(armGeometry),material);armMesh.name=`${arm.name}-mesh`;arm.add(armMesh);arm.rotation.x=seated?-.25:-.035;arm.rotation.z=side*.035;return arm;
  });
  let book:THREE.Object3D|undefined;
  if(style==='pushpa'||anonymous){
    const b=new CharacterSculpt(),by=seated?.94:1.04,bz=seated?-.11:0;
    b.box(0,by,.46,.42,.025,.28,'#8E302D');b.box(0,by+.019,.46,.395,.023,.26,'#D8CDAA');
    b.curve([[0,by+.037,.335],[0,by+.029,.46],[0,by+.037,.585]],.004,'#A69C7D',7);
    for(const side of[-1,1])for(let line=0;line<5;line++){
      const z=.365+line*.043;b.box(side*.108,by+.033,z,.143,.002,.0025,'#665D4C');
      if(side<0)for(let col=0;col<3;col++)b.box(-.16+col*.049,by+.034,z,.002,.002,.021,'#665D4C');
    }
    book=flush(b,'delivery-japanese-study-book',group);book.position.z=bz;
  }
  if(style==='jersey'){
    const prop=new CharacterSculpt();prop.limb([0,-1.33,.052],[0,-.75,.052],.064,.053,'#BA9A64',8,.25);
    prop.limb([0,-.75,.052],[0,-.49,.052],.018,.017,'#493C31',8);prop.curve([[-.04,-1.2,.073],[0,-.84,.073],[.04,-1.2,.073]],.0028,'#D2B67C',5);flush(prop,'delivery-cricket-bat',arms[1]);
  }
  if(style==='director'){
    const prop=new CharacterSculpt();prop.add(new THREE.ConeGeometry(.095,.2,14).rotateX(Math.PI/2).translate(0,-.445,.11),'#A6B0AE');
    prop.limb([0,-.455,.11],[0,-.535,.06],.014,.014,'#343A39');flush(prop,'delivery-director-megaphone',arms[1]);
  }
  return characterRig(group,arms[0],arms[1],book,seated);
}

function characterRig(group:THREE.Group,leftArm:THREE.Group,rightArm:THREE.Group,book:THREE.Object3D|undefined,seated:boolean):SceneCharacter {
  let catchPoint=group.getObjectByName(`${group.name}-hands`);
  if(!catchPoint){catchPoint=new THREE.Object3D();catchPoint.name=`${group.name}-hands`;group.add(catchPoint);}
  const leftHand=new THREE.Vector3(),rightHand=new THREE.Vector3();
  const updateCatch=()=>{leftArm.updateMatrix();rightArm.updateMatrix();const handY=seated?-.38:-.54,handZ=seated?.25:.04;leftHand.set(0,handY,handZ).applyMatrix4(leftArm.matrix);rightHand.set(0,handY,handZ).applyMatrix4(rightArm.matrix);catchPoint!.position.copy(leftHand).add(rightHand).multiplyScalar(.5);};
  updateCatch();
  return {group,leftArm,rightArm,book,catchPoint,catchPose:amount=>{
    const a=Number.isFinite(amount)?Math.max(0,Math.min(1,amount)):0;
    leftArm.rotation.x=rightArm.rotation.x=(seated?-.25:-.035)*(1-a)-1.35*a;
    leftArm.rotation.z=-.035-.18*a;rightArm.rotation.z=.035+.18*a;updateCatch();
  }};
}

// Immutable CPU templates own no rendered GPU buffers. Each scene gets new
// BufferAttribute/geometry wrappers and its own material, sharing only read-only
// typed arrays. Disposing one delivery cannot dispose another actor's buffers.
const templates=new Map<string,SceneCharacter>();
const productionPairs:readonly(readonly[CharacterStyle,boolean])[]=[['pushpa',true],['unknown',true],['simhadri',false],['trainHero',false],['gabbar',false],['jersey',false],['imax',true],['director',false],['extra',false]];
function templateFor(style:CharacterStyle,seated:boolean) {
  const key=`${style}:${Number(seated)}`;let template=templates.get(key);
  if(!template){template=buildSceneCharacter(style,seated,{geometry:g=>g,material(){}});templates.set(key,template);}
  return template;
}
let warming:Promise<void>|null=null;
/** Await during the existing initial loading screen; pickup never waits/fetches. */
export function prewarmSceneCharacterAssets(onProgress?:(done:number,total:number)=>void):Promise<void> {
  if(warming)return warming;
  warming=(async()=>{
    for(let i=0;i<productionPairs.length;i++){
      templateFor(...productionPairs[i]);onProgress?.(i+1,productionPairs.length);
      if(typeof requestAnimationFrame==='function')await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
    }
  })();
  return warming;
}
export function sceneCharacterAssetStats(){
  const buffers=new Set<ArrayBufferLike>();let bytes=0;
  for(const actor of templates.values())actor.group.traverse(node=>{if(node instanceof THREE.Mesh){
    for(const attribute of Object.values(node.geometry.attributes)){const buffer=(attribute as THREE.BufferAttribute).array.buffer;if(!buffers.has(buffer)){buffers.add(buffer);bytes+=buffer.byteLength;}}
    if(node.geometry.index){const buffer=node.geometry.index.array.buffer;if(!buffers.has(buffer)){buffers.add(buffer);bytes+=buffer.byteLength;}}
  }});
  return {templates:templates.size,productionTemplates:productionPairs.length,retainedTypedArrayBytes:bytes};
}
export function createSceneCharacter(style:CharacterStyle,seated:boolean,resources:Resources):SceneCharacter {
  const template=templateFor(style,seated),group=template.group.clone(true),material=new THREE.MeshBasicMaterial({vertexColors:true,toneMapped:false});
  resources.material(`${group.name}-vertex-lit`,material);
  group.traverse(node=>{if(node instanceof THREE.Mesh){
    const source=node.geometry,g=new THREE.BufferGeometry();
    for(const[name,attribute]of Object.entries(source.attributes)){
      const a=attribute as THREE.BufferAttribute;g.setAttribute(name,new THREE.BufferAttribute(a.array,a.itemSize,a.normalized));
    }
    if(source.index)g.setIndex(new THREE.BufferAttribute(source.index.array,1));
    g.boundingBox=source.boundingBox?.clone()??null;g.boundingSphere=source.boundingSphere?.clone()??null;g.userData.immutableCharacterAttributes=true;
    node.geometry=resources.geometry(g);node.material=material;
  }});
  return characterRig(group,group.getObjectByName(`${group.name}-left-arm`) as THREE.Group,group.getObjectByName(`${group.name}-right-arm`) as THREE.Group,group.getObjectByName('delivery-japanese-study-book')??undefined,seated);
}
