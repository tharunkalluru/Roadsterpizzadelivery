import * as THREE from 'three';
import { Batch, TPL, toTpl, Tpl, Rng } from '../core/util';
import { labelTexture } from './signs';
import { PersonSpec, drawSeatedPerson, randomPerson, personFemale, personAge, type PersonSeat } from './people';
import { autoQuote } from './auto-quotes';
import { TRAFFIC_VEHICLE_SPECS, type VehicleOccupant } from './traffic-vehicle-specs';
import { archedSide,archLip,carCanopy,facePanel,formedCabFrame,ellipticalLoft,cycleMudguard,rickshawCowl } from './traffic-coachwork';

// Hyderabad street traffic. Each builder returns a body batch, a lights batch (emissive at night),
// optional text decals and its footprint size [width, height, length]. Local frame: ground y=0, front toward -z.
const PI = Math.PI;
export interface LampAnchor { x: number; y: number; z: number }
export interface Model { body: Batch; lights: Batch; tailLights?: Batch; reverseLights?: Batch; headlights?: readonly LampAnchor[]; size: number[]; decals?: { geo: THREE.BufferGeometry; mat: THREE.Material }[]; kind: string; quoteId?: string; archetype?:string; occupants?:VehicleOccupant[] }

// Lamp surfaces sit beyond the body skin, so paint cannot hide them from an
// exterior camera. Headlights stay in the shared emissive batch; separate rear
// geometry overlays the dim tail lens only while braking, adding no draw for
// ordinary cruising; shared materials never change another vehicle's lamps.
type Lens = readonly [x: number, y: number, z: number, width: number, height: number];
function roadLamps(lights: Batch, fronts: readonly Lens[], rears: readonly Lens[], reversing = true) {
  const tailLights = new Batch(), reverseLights = new Batch();
  for (const [x, y, z, w, h] of fronts) lights.box(x, y, z, w, h, .012, '#fff8e1');
  for (const [x, y, z, w, h] of rears) {
    lights.box(x, y, z, w, h, .012, '#8b0806');
    tailLights.box(x, y, z + .008, w, h, .012, '#ff0805');
    if (reversing) reverseLights.box(x * .72, y - h * .9, z, w * .52, h * .65, .012, '#fff8ed');
  }
  return { tailLights, reverseLights, headlights: fronts.map(([x, y, z]) => ({ x, y, z })) };
}

// side profile (z, y pairs, front = +z in the list) extruded across the width -> template in local frame
const profCache = new Map<string, Tpl>();
function profile(pts: number[][], width: number, bevel = 0.05): Tpl {
  const key = JSON.stringify(pts) + width + bevel;
  let t = profCache.get(key); if (t) return t;
  const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
  sh.closePath();
  const d = Math.max(0.01, width - bevel * 2);
  const geo = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 });
  geo.translate(0, 0, -d / 2);
  geo.rotateY(PI / 2);          // shape x -> -z (front ends up at -z), extrude depth -> x
  t = toTpl(geo); profCache.set(key, t);
  return t;
}
function wheel(b: Batch, x: number, y: number, z: number, r: number, w: number, rim = '#a7a4ad') {
  b.add(TPL.cyl, x, y, z, r, w, r, '#151418', { rz: PI / 2 });
  b.add(TPL.cyl, x + Math.sign(x || 1) * 0.01, y, z, r * 0.58, w + 0.02, r * 0.58, rim, { rz: PI / 2 });
  b.add(TPL.cyl, x + Math.sign(x || 1) * 0.02, y, z, r * 0.2, w + 0.03, r * 0.2, '#5d5a63', { rz: PI / 2 });
}
const plateTex = new Map<string, THREE.Material>();
function plateMat(text: string, bg: string) {
  const k = text + bg; let m = plateTex.get(k);
  if (!m) { m = new THREE.MeshBasicMaterial({ map: labelTexture([{ text, font: '800 {s}px "Baloo 2", sans-serif', color: '#141216', size: 64 }], 256, 64, bg, '#141216') }); plateTex.set(k, m); }
  return m;
}
function decal(w: number, h: number, mat: THREE.Material, x: number, y: number, z: number, ry = 0) {
  const g = new THREE.PlaneGeometry(w, h); g.rotateY(ry); g.translate(x, y, z); return { geo: g, mat };
}
// One shared, double-sided glazing draw per prototype. The old solid black
// greenhouse hid actual passengers, even through an open side window.
const trafficGlass = new THREE.MeshStandardMaterial({color:'#627d88',roughness:.28,metalness:.08,transparent:true,opacity:.30,depthWrite:false,side:THREE.DoubleSide});
const wheelRing = (()=>{const g=new THREE.TorusGeometry(1,.07,4,14),t=toTpl(g);g.dispose();return t;})();
const tankHoop=(()=>{const g=new THREE.TorusGeometry(1,.014,4,24),t=toTpl(g);g.dispose();return t;})();
const cycleTyre=(()=>{const g=new THREE.TorusGeometry(.88,.12,6,24),t=toTpl(g);g.dispose();return t;})();
const cycleRim=(()=>{const g=new THREE.TorusGeometry(.73,.035,4,24),t=toTpl(g);g.dispose();return t;})();
function cycleWheel(b:Batch,y:number,z:number,radius:number){
  b.add(cycleTyre,0,y,z,radius,radius,radius,'#171b1e',{ry:PI/2});
  b.add(cycleRim,0,y,z,radius,radius,radius,'#a9b4ba',{ry:PI/2});
  b.add(TPL.cyl,0,y,z,radius*.20,.12,radius*.20,'#727f87',{rz:PI/2});
  for(let i=0;i<5;i++){const a=i/5*Math.PI*2;strut(b,[0,y+Math.sin(a)*radius*.17,z+Math.cos(a)*radius*.17],[0,y+Math.sin(a)*radius*.72,z+Math.cos(a)*radius*.72],.014,'#9da9b0');}
}
function glass(batch:Batch){return {geo:batch.geometry(),mat:trafficGlass};}
function strut(b:Batch,a:number[],c:number[],radius:number,color:string){
  const from=new THREE.Vector3(...a as [number,number,number]),to=new THREE.Vector3(...c as [number,number,number]),v=to.clone().sub(from),length=v.length();
  const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());
  b.addTpl(TPL.cyl6,new THREE.Matrix4().compose(from.add(to).multiplyScalar(.5),q,new THREE.Vector3(radius,length,radius)),color);
}
function seat(b:Batch,x:number,y:number,z:number,w=.42){
  b.box(x,y-.055,z,w,.11,.42,'#34363a');
  b.box(x,y+.21,z+.14,w,.43,.095,'#34363a',{rx:-.09});
  b.box(x,y+.47,z+.18,w*.58,.18,.09,'#2a2c30');
}
function driver(b:Batch,r:Rng,x:number,y:number,z:number,scale=1):VehicleOccupant{
  const p={...trafficOccupantSpec(r,r()<.25,true),s:scale};rider(b,p,x,y,z,'auto');
  const control={x,y:y+.29*scale,z:z-.44*scale};
  b.add(wheelRing,control.x,control.y,control.z,.265*scale,.265*scale,.265*scale,'#25272b',{rx:-.22});
  strut(b,[x,y-.02,z-.56],[control.x,control.y,control.z],.025,'#34363a');
  seat(b,x,y-.025,z,.43*scale);return {role:'driver',x,hipY:y,z,scale,control};
}
function seatedPassenger(b:Batch,r:Rng,x:number,y:number,z:number,scale=1):VehicleOccupant{
  rider(b,{...passenger(r),s:scale},x,y,z,'bench');seat(b,x,y-.025,z,.43*scale);
  return {role:'passenger',x,hipY:y,z,scale};
}
function uprightCab(b:Batch,g:Batch,r:Rng,x:number,z:number,w:number,length:number,base:number,top:number,paint:string){
  const belt=base+(top-base)*.50,front=z-length/2,rear=z+length/2,small=top<2,wy=small?.25:.5,radius=small?.30:.57,axle=z+(small?.14:0);
  b.box(x,(base+belt)/2,front+.05,w-.16,belt-base,.10,paint);
  b.add(TPL.rbox??TPL.box,x,top-.065,z+.03,w-.06,.13,length-.05,paint);
  b.box(x,(belt+top)/2,rear-.045,w,top-belt,.09,paint);
  for(const side of [-1,1]){
    const xx=x+side*w/2;
    archedSide(b,side,xx,front+.12,rear,base,belt,[axle],wy,radius,paint);archLip(b,side,xx+side*.006,axle,wy,radius,.025,'#414b51');
    formedCabFrame(b,g,side,w/2,front,rear,belt,top,paint);
    strut(b,[xx,belt+.23,front+.21],[xx+side*.17,belt+.28,front+.10],.025,'#34383b');
    b.add(TPL.rbox??TPL.box,xx+side*.17,belt+.28,front+.10,.13,.29,.09,'#34383b');
    b.box(xx+side*.05,belt-.16,z+.2,.018,.035,.17,'#6d7477');
    b.box(xx+side*.006,belt-.035,z+.02,.025,.025,length-.28,'#56636a');
    for(let j=0;j<3;j++)b.box(xx+side*.008,belt-.22-j*.065,rear-.19,.02,.025,.17,'#68767b');
    const outer=xx,inner=x+side*(w/2-.08);
    const corner=[[inner,base,front],[inner,belt,front],[outer,belt,front+.12],[outer,base,front+.12]];
    if(side>0)b.quad(corner[0],corner[1],corner[2],corner[3],paint);else b.quad(corner[3],corner[2],corner[1],corner[0],paint);
  }
  g.quad([x-w*.46,belt+.04,front-.008],[x+w*.46,belt+.04,front-.008],[x+w*.445,top-.13,front+.17],[x-w*.445,top-.13,front+.17],'#fff');
  b.box(x,belt+.12,front+.12,w*.85,.12,.26,'#303438');
  for(const side of [-1,1])strut(b,[x+side*w*.28,belt+.07,front-.022],[x+side*w*.18,belt+.39,front-.022],.012,'#313438');
  const hip=base+(small?.53:.65),occupants=[driver(b,r,x+w*.235,hip,z+.04,.92)];
  if(r()<.35)occupants.push(seatedPassenger(b,r,x-w*.235,hip,z+.04,.9));else seat(b,x-w*.235,hip-.025,z+.04,.4);
  b.box(x,base-.025+(small?0:.12),z,w*.85,.05,length-.14,'#303438');
  return occupants;
}

/** Smooth belt/shoulder sections with actual tyre openings and an open cabin
 * floor. The roof is not a giant opaque volume around an occupant's head. */
function carSkin(kind:CarKind):Tpl{
  const key=`skin:${kind}`;let cached=profCache.get(key);if(cached)return cached;
  const S=TRAFFIC_VEHICLE_SPECS[kind],L=S.length,W=S.width,wb=S.wheelbase,high=kind==='suv',arch=high?.37:.335;
  const positions:number[]=[],indices:number[]=[],segments=72,ringSize=8;
  const stations=[[-L/2,.85,high?.96:.82],[-L*.38,1,high?1.05:.89],[-L*.24,1,high?1.08:.93],[L*.25,1,high?1.07:.96],[L*.43,.98,high?1.05:.96],[L/2,.88,high?1.04:.95]];
  for(let i=0;i<=segments;i++){
    const z=-L/2+L*i/segments;let k=0;while(k<stations.length-2&&z>stations[k+1][0])k++;
    const a=stations[k],c=stations[k+1],t=(z-a[0])/(c[0]-a[0]),w=(a[1]+(c[1]-a[1])*t)*W/2,top=a[2]+(c[2]-a[2])*t;
    let floor=.22;for(const axle of [-wb/2,wb/2]){const dz=z-axle;if(Math.abs(dz)<arch+.025)floor=Math.max(floor,arch+Math.sqrt(Math.max(0,(arch+.025)**2-dz**2)));}
    const ring=[[-w*.75,top],[w*.75,top],[w,Math.max(top-.08,floor+.025)],[w*.99,floor],[w*.74,.18],[-w*.74,.18],[-w*.99,floor],[-w,Math.max(top-.08,floor+.025)]];
    for(const [x,y]of ring)positions.push(x,y,z);
    if(i)for(let j=0;j<ringSize;j++){
      // The middle top panel is omitted: a real hollow passenger compartment.
      if(j===0&&z>-L*.24&&z<L*(kind==='hatch'?.475:high?.36:.27))continue;
      const a=(i-1)*ringSize+j,c=i*ringSize+j,d=i*ringSize+(j+1)%ringSize,e=(i-1)*ringSize+(j+1)%ringSize;
      indices.push(a,c,d,a,d,e);
    }
  }
  for(let i=1;i<ringSize-1;i++){indices.push(0,i,i+1);const n=segments*ringSize;indices.push(n,n+i+1,n+i);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();cached=toTpl(geometry);geometry.dispose();profCache.set(key,cached);return cached;
}

// ---------------- cars ----------------
type CarKind = 'hatch' | 'sedan' | 'suv' | 'cab';
export function car(kind: CarKind, color: string, r: Rng): Model {
  const b = new Batch(), l = new Batch(),g=new Batch(),S=TRAFFIC_VEHICLE_SPECS[kind],W=S.width,L=S.length,H=S.height,high=kind==='suv',hatch=kind==='hatch';
  b.add(carSkin(kind),0,0,0,1,1,1,color);
  const frontBottom=-L*.245,rearBottom=L*(high?.44:hatch?.475:.30),roofFront=-L*(high?.10:hatch?.11:.095),roofRear=L*(high?.30:hatch?.39:.15),belt=high?1.08:.96;
  carCanopy(b,g,{width:W,height:H,belt,front:frontBottom,rear:rearBottom,roofFront,roofRear,suv:high,sedan:!high&&!hatch},color);
  b.box(0,high?.27:.18,(frontBottom+rearBottom)/2,W*.78,.04,rearBottom-frontBottom,'#27292d');
  b.box(0,belt-.12,frontBottom+.15,W*.76,.12,.22,'#2d3035');
  for (const s of [-1, 1]) {
    for(const z of [-.43,.61]){b.box(s*W*.505,belt-.15,z,.018,.03,.145,'#c4c6c6');strut(b,[s*W*.498,.36,z+.12],[s*W*.498,belt-.06,z+.12],.005,'#4c5054');}
    strut(b,[s*W*.46,belt+.02,frontBottom+.17],[s*(W/2+.05),belt+.06,frontBottom+.17],.025,'#30363a');
    b.add(TPL.rbox??TPL.box,s*(W/2+.065),belt+.055,frontBottom+.15,.13,.09,.19,color);
    b.box(s*(W/2+.135),belt+.06,frontBottom+.17,.012,.06,.12,'#adb9c0');
    if(high){
      strut(b,[s*W*.31,H-.018,roofFront+.1],[s*W*.31,H-.018,roofRear-.1],.018,'#34383c');
      // Roof rails bear on two real feet sunk into the crown; they cannot be
      // suspended rods above the lower curved shell.
      for(const z of [roofFront+.18,roofRear-.18])b.box(s*W*.31,H-.058,z,.060,.095,.15,'#34383c');
    }
    for(const axle of [-S.wheelbase/2,S.wheelbase/2])archLip(b,s,s*(W/2+.004),axle,high?.37:.335,high?.395:.36,high?.055:.018,high?'#30363a':color);
    if(high)b.box(s*(W/2-.008),.30,0,.045,.15,S.wheelbase-.78,'#30363a');
  }
  // India-spec right-hand drive. Hips, cushion, floor, head and controls are
  // authored together instead of adding a floating head on the window band.
  const hip=high?.77:.67,occupants=[driver(b,r,W*.23,hip,-.06,.88)];
  if(r()<.5)occupants.push(seatedPassenger(b,r,-W*.23,hip,-.06,.87));else seat(b,-W*.23,hip-.025,-.06,.39);
  b.box(0,hip-.06,.77,W*.72,.12,.43,'#36383b');b.box(0,hip+.15,.95,W*.72,.43,.10,'#36383b');
  facePanel(b,[[-W*.44,.27],[W*.44,.27],[W*.47,.43],[W*.39,.51],[-W*.39,.51],[-W*.47,.43]],-L/2-.015,.045,color);
  b.box(0,.38,L/2+.025,W*.86,.14,.08,'#34373b');
  if(high){
    facePanel(b,[[-W*.31,.61],[W*.31,.61],[W*.32,.92],[-W*.32,.92]],-L/2-.018,.035,'#171f24');
    for(let row=0;row<3;row++)for(let col=0;col<5;col++)b.box((col-2)*W*.118,.66+row*.10,-L/2-.041,W*.087,.025,.014,'#7e898d');
    facePanel(b,[[-W*.37,.28],[W*.37,.28],[W*.29,.48],[-W*.29,.48]],-L/2-.035,.025,'#7f898d');
    b.box(0,.37,-L/2-.052,W*.49,.15,.018,'#242d32');
    b.box(0,.895,-L/2-.005,W*.73,.050,.025,'#263139');
    l.box(0,.895,-L/2-.024,W*.70,.024,.012,'#fff8e1');
  }else{
    const outline=hatch?[[-W*.26,.43],[W*.26,.43],[W*.31,.51],[W*.29,.65],[W*.20,.70],[-W*.20,.70],[-W*.29,.65],[-W*.31,.51]]:
      [[-W*.29,.43],[W*.29,.43],[W*.33,.68],[W*.25,.73],[-W*.25,.73],[-W*.33,.68]];
    facePanel(b,outline,-L/2-.018,.035,'#182024');
    for(let row=0;row<4;row++)b.box(0,.47+row*.058,-L/2-.041,W*(hatch?.50:.55),.014,.012,'#68757d');
    for(const s of [-1,1])facePanel(b,[[s*W*.29,.30],[s*W*.42,.32],[s*W*.43,.43],[s*W*.32,.45]],-L/2-.023,.03,'#20292f');
  }
  const wy=high?.35:.31,wz=S.wheelbase/2;
  for(const s of [-1,1])for(const z of [-wz,wz]){wheel(b,s*(W/2-.11),wy,z,wy,.22);for(let k=0;k<5;k++){const a=k*PI*2/5;strut(b,[s*(W/2+.008),wy+Math.sin(a)*.04,z+Math.cos(a)*.04],[s*(W/2+.008),wy+Math.sin(a)*wy*.56,z+Math.cos(a)*wy*.56],.018,'#d8dad8');}}
  // Shallow inset housings stay inside the tapered painted corners. The old
  // tall trapezoids sat above/beyond the nose and read as unsupported fins.
  for(const s of [-1,1]){
    b.box(s*W*.32,high?.64:.71,-L/2-.005,.25,high?.19:.09,.025,'#263139');
    b.box(s*W*.33,high?.90:.80,L/2+.004,.22,.18,.024,'#28292b');
  }
  const lighting = roadLamps(l,
    [-1, 1].map(s => [s * W * .32, high?.64:.71, -L / 2 - .024, .20, high?.12:.055] as const),
    [-1, 1].map(s => [s * W * .33, high?.90:.80, L / 2 + .022, .055, .15] as const));
  for(const s of [-1,1])for(const dy of high?[.06]:hatch?[-.06,.06]:[.06]){
    l.box(s*(W*.33-.05), (high?.90:.80)+dy,L/2+.022,.15,.026,.012,'#8b0806');
    lighting.tailLights.box(s*(W*.33-.05),(high?.90:.80)+dy,L/2+.030,.15,.026,.012,'#ff0805');
  }
  if(high){b.box(0,.985,L/2+.004,W*.73,.05,.024,'#28292b');l.box(0,.985,L/2+.022,W*.70,.025,.012,'#8b0806');lighting.tailLights.box(0,.985,L/2+.030,W*.70,.025,.012,'#ff0805');}
  const plate = plateMat(`TS ${r.int(7, 15).toString().padStart(2, '0')} ${String.fromCharCode(65 + r.int(0, 25))}${String.fromCharCode(65 + r.int(0, 25))} ${r.int(1000, 9999)}`, kind === 'cab' ? '#FFD600' : '#F6F4EE');
  const decals = [glass(g),decal(0.52, 0.13, plate, 0, 0.5, L / 2 + 0.08), decal(0.52, 0.13, plate, 0, 0.45, -L / 2 - 0.08, PI)];
  return { body: b, lights: l, ...lighting, size: [W,H,L], decals, kind: 'car',archetype:kind,occupants };
}

// ---------------- auto rickshaw (three-wheeler) ----------------
export function auto(r: Rng, quoteIndex = r.int(0, 9)): Model {
  const b = new Batch(), l = new Batch(),g=new Batch();
  const Y = r.pick(['#F2C21B', '#F4C81F', '#E9B514']), K = '#17161b', G = r() < 0.55 ? '#1E8F4E' : Y;
  // floor pan + rear tub
  b.box(0,.28,.25,1.22,.1,2.0,'#2a2930');
  // Toe pans extend either side of the front-wheel well. The driver soles
  // project ahead of the main rear pan, so a height-only contact is not enough.
  for(const side of [-1,1])b.box(side*.29,.28,-.87,.40,.10,.35,'#2a2930');
  for(const s of [-1,1])archedSide(b,s,s*.64,-.02,1.26,.43,.95,[.8],.24,.28,Y);
  b.box(0, 0.83, 1.27, 1.28, 0.78, 0.06, Y);                                                // rear panel
  b.box(0, 1.0, 1.29, 1.24, 0.08, 0.02, G);                                                 // stripe
  for (const s of [-1, 1]) b.box(s * 0.62, 0.98, 0.62, 0.065, 0.08, 1.28, G);
  // A single returned pressed legshield surrounds the wheel, lamp mask and
  // lower screen. Separate hanging spherical pods were not real coachwork.
  rickshawCowl(b,Y);
  for(const s of [-1,1]){
    archLip(b,s,s*.65,.8,.24,.28,.022,Y);
  }
  cycleMudguard(b,-1.12,.24,.29,.34,Y);
  // windscreen and frame
  g.quad([-.51,1.24,-1.18],[.51,1.24,-1.18],[.49,1.68,-.94],[-.49,1.68,-.94],'#fff');
  b.box(0,1.235,-1.18,1.08,.055,.07,Y);b.box(0,1.70,-.94,1.15,.065,.10,K);
  for(const s of [-1,1]){
    strut(b,[s*.54,1.22,-1.19],[s*.52,1.70,-.94],.032,Y);
    strut(b,[s*.53,1.47,-1.03],[s*.66,1.52,-1.08],.018,K);
    b.add(TPL.sphL,s*.66,1.53,-1.08,.067,.095,.035,K);
  }
  strut(b,[0,1.25,-1.219],[.19,1.60,-1.00],.008,'#292d30');
  // canopy: rounded black hood on rails
  b.add(TPL.halfCyl,0,1.55,.18,.70,2.25,.24,K,{rx:-PI/2});
  b.box(0, 1.62, -0.93, 1.38, 0.1, 0.08, K); b.box(0, 1.62, 1.29, 1.38, 0.1, 0.08, K);
  for (const s of [-1, 1]) { b.box(s * 0.66, 1.3, -0.4, 0.05, 0.62, 0.05, K); b.box(s * 0.66, 1.3, 1.27, 0.05, 0.62, 0.05, K); b.box(s * 0.67, 1.6, 0.44, 0.04, 0.06, 1.66, K); }
  b.box(0, 1.3, 1.31, 1.2, 0.55, 0.03, K);                                                   // rear canvas with window
  b.box(0, 1.32, 1.33, 0.6, 0.22, 0.01, '#26354f');
  // handlebar, driver in khaki, passenger bench
  b.box(0,1.05,-.86,.57,.035,.035,'#3a3840');
  seat(b,0,.735,-.42,.43);
  rider(b,{kind:'shirt',s:1,skin:r.pick(['#6e452f','#7d5135','#8d5a3b','#9c6644']),hair:'#141216',a:'#A3895A',b:'#6f6a60',c:'#1b1a1f',walk:1},0,.76,-.42,'rickshawDriver');
  b.box(0,.72,.78,1.16,.12,.5,'#5a2a24');b.box(0,1.00,1.05,1.16,.5,.08,'#5a2a24');
  const occupants:VehicleOccupant[]=[{role:'driver',x:0,hipY:.76,z:-.42,scale:1,control:{x:0,y:1.05,z:-.86}}];
  const pax = r.int(0, 3);
  for (let i = 0; i < pax; i++) {
    const p=passenger(r),x=-.4+i*.4;rider(b,p,x,.78,.82,'rickshawPassenger');
    occupants.push({role:'passenger',x,hipY:.78,z:.82,scale:p.s});
  }
  wheel(b, 0, 0.24, -1.12, 0.24, 0.13); wheel(b, -0.6, 0.24, 0.8, 0.24, 0.14); wheel(b, 0.6, 0.24, 0.8, 0.24, 0.14);
  for(const s of [-1,1]){
    b.add(TPL.cyl,s*.32,1.045,-1.243,.119,.018,.119,'#87949b',{rx:PI/2});
    l.add(TPL.cyl,s*.32,1.045,-1.259,.092,.012,.092,'#fff8e1',{rx:PI/2});
    b.box(s*.5,.62,1.31,.20,.18,.06,K);
    l.box(s*.43,1.225,-1.19,.10,.055,.012,'#ffb030');
  }
  b.box(0,.51,1.31,1.22,.15,.06,K);
  const lighting=roadLamps(l,[],[-1,1].map(s=>[s*.5,.62,1.347,.15,.13]as const));
  lighting.headlights=[-1,1].map(s=>({x:s*.32,y:1.045,z:-1.259}));
  const plate = plateMat(`TS 09 U${String.fromCharCode(65 + r.int(0, 25))} ${r.int(1000, 9999)}`, '#FFD600');
  const quote = autoQuote(quoteIndex);
  const quoteMaterial = new THREE.MeshBasicMaterial({ toneMapped: false, map: labelTexture(quote.lines.map(text => ({ text, font: '700 {s}px "Noto Sans Telugu", sans-serif', color: '#FFF6DC', size: 52 })), 768, 224, K) });
  return {body:b,lights:l,...lighting,size:[1.36,1.85,2.65],decals:[glass(g),decal(.42,.11,plate,0,.62,1.31),decal(1.17,.5,quoteMaterial,0,1.34,1.35)],kind:'auto',archetype:'auto-rickshaw',quoteId:quote.id,
    occupants};
}

// ---------------- two-wheelers ----------------
export function motorbike(r: Rng): Model {
  const b = new Batch(), l = new Batch();
  const paint = r.pick(['#c62828', '#1b1a1f', '#1F5FCC', '#e9e9ef', '#6a6f78', '#2E7D32', '#8E1F1F']);
  strut(b,[0,.31,.68],[0,.47,.04],.033,'#2a3035');strut(b,[0,.47,.04],[0,.94,-.49],.033,'#2a3035');strut(b,[0,.94,-.49],[0,.84,.48],.030,'#2a3035');
  b.add(ellipticalLoft([[.75,.06,.17,-.22],[.82,.16,.30,-.25],[.98,.17,.27,-.28],[1.065,.06,.12,-.30]]),0,0,0,1,1,1,paint);
  b.add(TPL.rbox??TPL.box,0,.875,.32,.29,.10,.76,'#14191d');
  for(const side of [-1,1]){
    b.add(TPL.cyl,side*.12,.49,-.04,.15,.055,.15,'#87969d',{rz:PI/2});
    strut(b,[side*.13,.31,.68],[side*.13,.79,.50],.035,'#4c5960');
    for(let i=0;i<5;i++)b.add(TPL.cyl,side*.13,.42+i*.055,.63-i*.023,.044,.016,.044,'#aab6bb');
    strut(b,[side*.066,.31,-.78],[side*.066,1.08,-.52],.026,'#b4bdc1');
    strut(b,[side*.13,.47,.02],[side*.27,.47,.02],.022,'#383e43');
    b.box(side*.25,.47,.02,.12,.04,.055,'#222b30');
    strut(b,[side*.13,.45,.50],[side*.23,.45,.50],.021,'#6d7b82');
    b.box(side*.23,.45,.50,.12,.035,.06,'#20292e');
  }
  for(let i=0;i<6;i++)b.box(0,.54+i*.025,-.16,.27,.014,.23,'#a4afb4');
  b.add(TPL.cyl, 0.16, 0.42, 0.42, 0.045, 0.75, 0.045, '#c8c6cf', { rx: PI / 2 - 0.12 });       // silencer
  b.box(0, 0.72, 0.62, 0.32, 0.16, 0.3, paint);                                                // side panels / tail
  for(const side of [-1,1])strut(b,[side*.13,.88,.64],[side*.13,.90,.86],.020,'#a5b0b5');strut(b,[-.13,.90,.86],[.13,.90,.86],.020,'#a5b0b5');
  b.add(TPL.rbox??TPL.box,0,1.02,-.72,.27,.24,.18,paint);
  b.box(0,1.0,-.81,.22,.18,.025,'#788a94');
  cycleMudguard(b,-.78,.31,.35,.16,paint);cycleMudguard(b,.68,.31,.35,.17,'#343e44');
  cycleWheel(b,.31,-.78,.31);cycleWheel(b,.31,.68,.31);
  const rd = riderSpec(r, false);
  const gripY=.9+.29*rd.s,gripZ=.18-.56*rd.s;
  for(const side of [-1,1]){
    const gx=side*.275*rd.s;strut(b,[0,1.095,-.52],[gx,gripY,gripZ],.020,'#59686f');
    b.box(gx,gripY,gripZ,.12,.035,.040,'#20292e');
    strut(b,[gx,gripY+.02,gripZ],[side*.34,1.40,gripZ-.06],.010,'#59686f');
    b.add(TPL.sphL,side*.34,1.42,gripZ-.06,.065,.081,.028,'#28343b');
    strut(b,[side*.10,1.0,-.72],[side*.19,.99,-.75],.012,'#5e6c73');
    b.add(TPL.rbox??TPL.box,side*.19,.99,-.75,.078,.070,.065,'#344149');
  }
  rider(b, rd, 0, 0.9, 0.18, 'bike');
  const occupants:VehicleOccupant[]=[{role:'driver',x:0,hipY:.9,z:.18,scale:rd.s,control:{x:0,y:gripY,z:gripZ}}];
  if (r() < 0.35) {
    const p=passenger(r),position=r()<.5?'pillionSide':'pillion';rider(b,p,0,.92,.6,position);
    occupants.push({role:'passenger',x:0,hipY:.92,z:.6,scale:p.s});
  }
  b.box(0,.84,.93,.20,.14,.11,'#343e45');
  const lighting=roadLamps(l,[[0,1,-.831,.18,.135]],[[0,.86,.992,.16,.10]],false);
  for(const side of [-1,1])l.box(side*.19,.99,-.77,.065,.055,.045,'#e5a23b');
  return {body:b,lights:l,...lighting,size:[.75,1.9,2.0],kind:'bike',archetype:'commuter-motorcycle',occupants};
}
export function scooter(r: Rng): Model {
  const b = new Batch(), l = new Batch();
  const paint = r.pick(['#e9e9ef', '#1b1a1f', '#8E1F1F', '#2a5bd7', '#7a7f88', '#c9b38a', '#d81b60']);
  b.add(ellipticalLoft([[.34,.14,.08,-.37],[.55,.235,.11,-.50],[.88,.245,.12,-.55],[1.08,.19,.08,-.47]]),0,0,0,1,1,1,paint);
  b.box(0, 0.32, -0.05, 0.36, 0.08, 0.7, '#2a2930');                                           // floorboard
  b.add(ellipticalLoft([[.37,.13,.28,.49],[.49,.24,.42,.49],[.70,.255,.41,.49],[.83,.18,.33,.47]]),0,0,0,1,1,1,paint);
  b.add(TPL.rbox??TPL.box,0,.88,.42,.36,.09,.70,'#252b30');
  b.add(ellipticalLoft([[1.01,.11,.075,-.47],[1.08,.13,.085,-.46],[1.15,.14,.085,-.46]]),0,0,0,1,1,1,paint);
  b.add(TPL.rbox??TPL.box,0,1.17,-.46,.53,.16,.25,paint);
  b.box(0,1.17,-.591,.27,.12,.025,'#697d89');
  cycleMudguard(b,-.72,.24,.29,.18,paint);cycleWheel(b,.24,-.72,.24);cycleWheel(b,.24,.58,.24);
  for(const side of [-1,1]){
    strut(b,[side*.06,.24,-.72],[side*.06,.87,-.52],.022,'#a8b6bd');
    strut(b,[side*.16,.88,.62],[side*.20,.92,.86],.020,'#b0bcc2');
    b.box(side*.235,.61,.43,.018,.025,.40,'#b7c2c7');
    strut(b,[side*.15,.43,.60],[side*.25,.43,.60],.015,'#72828b');
    b.box(side*.24,.43,.60,.12,.035,.13,'#38454c');
    b.add(TPL.rbox??TPL.box,side*.19,.94,-.605,.087,.14,.09,'#53616a');
  }
  strut(b,[-.20,.92,.86],[.20,.92,.86],.020,'#b0bcc2');
  for(let i=0;i<5;i++)b.box(0,.365,-.32+i*.11,.35,.012,.022,'#343e45');
  b.add(TPL.cyl,.21,.34,.56,.045,.52,.045,'#59666e',{rx:PI/2});
  const rd = riderSpec(r, true);
  const gripY=.9+.29*rd.s,gripZ=.3-.69*rd.s;
  for(const side of [-1,1]){
    const gx=side*.275*rd.s;strut(b,[0,1.18,-.44],[gx,gripY,gripZ],.020,'#4b5c66');b.box(gx,gripY,gripZ,.10,.034,.045,'#222c33');
    strut(b,[gx,gripY,gripZ],[side*.33,1.42,gripZ-.05],.010,'#4b5c66');b.add(TPL.sphL,side*.33,1.44,gripZ-.05,.072,.084,.030,'#2b3942');
  }
  rider(b, rd, 0, 0.9, 0.3, 'scooter');
  const occupants:VehicleOccupant[]=[{role:'driver',x:0,hipY:.9,z:.3,scale:rd.s,control:{x:0,y:gripY,z:gripZ}}];
  if (r() < 0.25) {
    const p=passenger(r,true);rider(b,p,0,.92,.72,'scooterPillion');
    occupants.push({role:'passenger',x:0,hipY:.92,z:.72,scale:p.s});
  }
  b.box(0,.78,.90,.25,.13,.09,'#39464f');
  const lighting=roadLamps(l,[[0,1.17,-.612,.23,.09]],[[0,.78,.951,.20,.09]],false);
  for(const side of [-1,1])l.box(side*.19,.94,-.648,.065,.11,.014,'#e8b15c');
  return {body:b,lights:l,...lighting,size:[.75,1.85,1.8],kind:'bike',archetype:'commuter-scooter',occupants};
}
function riderSpec(r: Rng, scooterRide: boolean): PersonSpec {
  const woman = r() < (scooterRide ? 0.55 : 0.12);
  const p=trafficOccupantSpec(r,woman,true);
  return {...p,kind:woman?(r()<.7?'salwar':'western_f'):(r()<.6?'shirt':'tee'),s:woman?.95:1,walk:1};
}
export function trafficOccupantSpec(r: Rng, woman = r()<.6, driver = false): PersonSpec {
  let p=randomPerson(r);
  for(let attempt=0;attempt<12&&(personFemale(p)!==woman||(driver&&personAge(p)!=='adult'));attempt++)p=randomPerson(r);
  if(driver&&personAge(p)!=='adult')p={...p,kind:woman?'salwar':'shirt',age:'adult',s:woman?.95:1,facialHair:false};
  return p;
}
function passenger(r: Rng, woman = r() < .6): PersonSpec { return trafficOccupantSpec(r,woman); }

// seated figure: hips at (x, y, z), facing -z
type Seat = PersonSeat;
export function rider(b: Batch, p: PersonSpec, x: number, y: number, z: number, seat: Seat) {
  drawSeatedPerson(b,p,x,y,z,seat as PersonSeat);
}

// ---------------- buses, lorries, tankers ----------------
export function busRouteBoards(number: string, destination: string) {
  const texture = labelTexture([
    { text: number.toUpperCase(), font: '{s}px "Bungee", sans-serif', color: '#FFB030', size: 102 },
    { text: destination.toUpperCase(), font: '800 {s}px "Baloo 2", sans-serif', color: '#FFF5DB', size: 34 },
  ], 768, 192, '#09090D', '#FFB030');
  const material = new THREE.MeshBasicMaterial({ toneMapped: false, map: texture });
  // One service identity, readable from either direction; no random prototype route.
  return [decal(2.2, 0.55, material, 0, 2.96, -5.56, PI), decal(2.2, 0.55, material, 0, 2.96, 5.56)];
}
export function bus(r: Rng): Model {
  const b = new Batch(), l = new Batch(),g=new Batch();
  const L = 11, W = 2.5, red = r() < 0.75 ? '#B7322C' : '#2E6FB7';                // City Ordinary / Metro Express body family
  const entrances=[-4.7,4.4],leftPanels=[[-5.5,-5.2],[-4.2,3.9],[4.9,5.5]],axles=[-3.6,2.1];
  for(const side of [-1,1])for(const [a,c]of side<0?leftPanels:[[-L/2,L/2]]){
    archedSide(b,side,side*(W/2-.008),a,c,.3,1.62,axles,.5,.60,red);
    b.box(side*(W/2-.008),1.355,(a+c)/2,.025,.53,c-a,'#eeeadd');
    b.box(side*(W/2+.006),1.625,(a+c)/2,.025,.055,c-a,'#d8b83f');
  }
  for(const side of [-1,1])for(const axle of axles)archLip(b,side,side*(W/2+.005),axle,.5,.60,.035,'#6e7679');
  for(const z of [-L/2+.045,L/2-.045]){b.box(0,.95,z,W,1.3,.09,'#eeeadd');b.box(0,1.62,z,W,.14,.09,'#F3EEDF');}
  // A real open cabin behind thin glazing; passengers have bodies and seats.
  for(const side of [-1,1])for(const [a,c]of side<0?leftPanels:[[-L/2+.22,L/2-.22]])g.quad([side*(W/2-.015),1.7,a],[side*(W/2-.015),2.78,a],[side*(W/2-.015),2.78,c],[side*(W/2-.015),1.7,c],'#fff');
  for (let i = 0; i < 9; i++) for (const s of [-1, 1]){const z=-L/2+.9+i*1.18;if(s<0&&entrances.some(d=>Math.abs(z-d)<.47))continue;b.box(s*(W/2-.005),2.25,z,.045,1.15,.12,'#e9e3d4');}
  // Distinct framed/sliding saloon windows, upper transom and safety rails.
  // All join the existing body draw, preserving the real door apertures.
  for(const side of [-1,1])for(const [a,c]of side<0?leftPanels:[[-L/2+.22,L/2-.22]]){
    for(const y of [1.80,1.99,2.45,2.76])b.box(side*(W/2+.012),y,(a+c)/2,.025,y>2.4?.045:.022,c-a,'#303b41');
    b.box(side*(W/2-.02),2.61,(a+c)/2,.025,.28,c-a,'#48575b');
    for(let z=a+.62;z<c-.1;z+=1.18)b.box(side*(W/2+.012),2.15,z,.025,.68,.025,'#3e4a50');
  }
  b.add(TPL.rbox,0,3.10,0,W,.16,L,'#F3EEDF');
  for(const side of [-1,1])b.box(side*(W/2-.035),2.90,0,.07,.39,L,'#F3EEDF');
  for(const z of [-L/2+.04,L/2-.04])b.box(0,2.90,z,W,.39,.08,'#F3EEDF');
  b.box(0,3.24,.6,W*.75,.10,L*.6,'#d9d3c3');
  // Two open left entrances, ahead of front axle and behind rear axle.
  for (const dz of entrances) {
    for(const zz of [dz-.50,dz+.50])b.box(-W/2-.025,1.72,zz,.045,2.1,.045,'#303439');
    b.box(-W/2-.025,2.76,dz,.04,.055,1.0,'#303439');
    for(const [x,y]of [[-1.18,.17],[-1.03,.47],[-.88,.77]])b.box(x,y,dz,.15,.30,.92,'#777970');
  }
  g.quad([-W*.44,1.35,-L/2-.025],[W*.44,1.35,-L/2-.025],[W*.44,2.78,-L/2-.025],[-W*.44,2.78,-L/2-.025],'#fff');
  b.box(0,2.07,-L/2-.045,.06,1.42,.04,'#e9e3d4');
  b.box(0, 1.25, -L / 2 - 0.02, W - 0.1, 0.06, 0.05, '#F3EEDF');
  b.box(0,0.5,-L/2-.05,W,.32,.1,red);b.box(0,.5,L/2+.05,W,.32,.1,red);
  g.quad([-W*.42,1.68,L/2+.01],[W*.42,1.68,L/2+.01],[W*.42,2.7,L/2+.01],[-W*.42,2.7,L/2+.01],'#fff');
  for(const s of [-1,1]){
    strut(b,[s*(W/2-.025),2.83,-L/2+.17],[s*(W/2+.18),2.50,-L/2+.10],.024,'#303b41');
    b.box(s*(W/2+.18),2.3,-L/2+.1,.08,.5,.06,'#1b1a1f');
  }
  for (const s of [-1, 1]) for (const z of axles) wheel(b, s * (W / 2 - 0.2), 0.5, z, 0.5, 0.32, '#c9c6cf');
  b.box(0,.90,0,W-.16,.08,L-.3,'#464648');
  const occupants=[driver(b,r,.69,1.45,-4.53,.94)];
  // Four seated customers are enough to read as a used bus without turning
  // every distant bus into an unbounded crowd mesh. Empty seats remain modeled.
  for(let i=0;i<12;i++){
    const x=i%2?.74:-.74,z=-2.9+Math.floor(i/2)*1.24;
    if([0,3,6,9].includes(i))occupants.push(seatedPassenger(b,r,x,1.45,z,.94));else seat(b,x,1.425,z,.46);
  }
  facePanel(b,[[-.66,.64],[.66,.64],[.81,1.33],[-.81,1.33]],-L/2-.027,.025,'#303b42');
  for(let row=0;row<6;row++){const y=.73+row*.095,w=1.13+row*.065;b.box(0,y,-L/2-.049,w,.028,.014,'#c7cbcb');}
  for(const side of [-1,1]){
    b.box(side*.92,.82,-L/2-.042,.53,.35,.065,'#7c8587');
    b.box(side*.95,.9,L/2+.083,.39,.31,.08,'#333d43');
    for(const xx of [side*.81,side*1.03]){b.add(TPL.cyl,xx,.82,-L/2-.079,.096,.018,.096,'#1a252c',{rx:PI/2});l.add(TPL.cyl,xx,.82,-L/2-.093,.076,.012,.076,'#fff8e1',{rx:PI/2});}
  }
  const lighting = roadLamps(l,[],[-1,1].map(s=>[s*.95,.9,L/2+.13,.30,.23]as const));
  lighting.headlights=[-1,1].flatMap(s=>[s*.81,s*1.03].map(x=>({x,y:.82,z:-L/2-.093})));
  const label = new THREE.MeshBasicMaterial({ map: labelTexture([{ text: red === '#B7322C' ? 'TGSRTC  CITY ORDINARY' : 'TGSRTC  METRO EXPRESS', font: '{s}px "Bungee", sans-serif', color: '#343f45', size: 40 }], 512, 64, '#eeeadd') });
  const decals = [glass(g),decal(3.1,.28,label,W/2+.025,1.32,-.5,PI/2),decal(3.1,.28,label,-W/2-.025,1.32,.6,-PI/2)];
  return { body: b, lights: l, ...lighting, size: [W, 3.3, L], decals, kind: 'bus',archetype:'city-bus',occupants };
}
export function lorry(r: Rng): Model {
  const b = new Batch(), l = new Batch(),g=new Batch();
  const cab = r.pick(['#E8731F', '#F2C14E', '#C62828', '#1E88E5']), bed = r.pick(['#8B5A2B', '#1E8F4E', '#1F5FCC', '#C62828']);
  const occupants=uprightCab(b,g,r,0,-3.15,2.35,1.9,.78,2.65,cab);
  b.box(0, 2.05, -4.13, 0.06, .98, 0.04, cab);
  b.add(TPL.rbox??TPL.box,0,2.64,-3.97,2.4,.11,.35,'#F6EEDC');
  facePanel(b,[[-.66,.99],[.66,.99],[.72,1.53],[-.72,1.53]],-4.123,.035,'#27323a');
  for(let row=0;row<5;row++)b.box(0,1.04+row*.102,-4.147,1.23,.022,.018,'#a6afb0');
  b.box(0,1.60,-4.125,1.78,.055,.045,'#e1e0d2');
  for(const side of [-1,1]){
    b.add(TPL.rbox??TPL.box,side*.86,.83,-4.14,.42,.27,.21,'#424c52');
    b.box(side*.95,.9,4.082,.39,.27,.085,'#343e45');
    b.box(side*1.11,.30,3.30,.13,.47,.06,'#252c32');
  }
  b.box(0, 0.62, -4.18, 2.3, 0.3, 0.12, '#c0c0c8');
  b.box(0, 0.86, 1.0, 2.3, 0.3, 6.1, '#2a2930');                                       // chassis
  b.box(0, 1.06, 1.0, 2.5, 0.12, 6.1, '#6b4a2b');                                       // deck
  for (const s of [-1, 1]) b.box(s * 1.22, 1.85, 1.0, 0.08, 1.5, 6.1, bed);             // high sides
  b.box(0, 1.85, -2.05, 2.5, 1.5, 0.08, bed); b.box(0, 1.85, 4.02, 2.5, 1.5, 0.08, bed);
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) b.box(s * 1.27, 1.4 + i * 0.4, 1.0, 0.02, 0.07, 6.0, ['#FFB627', '#ffffff', '#E53935'][i]);
  if (r() < 0.5) b.add(TPL.halfCyl, 0, 2.6, 1.0, 1.25, 6.0, 0.45, '#2E5E9E', { rx: -PI / 2 });   // tarpaulin
  for (const s of [-1, 1]) for (const z of [-3.15, 2.2, 3.3]) wheel(b, s * 1.08, 0.5, z, 0.5, 0.34, '#c9c6cf');
  const lighting = roadLamps(l,
    [-1,1].map(s=>[s*.86,.83,-4.252,.32,.16]as const),
    [-1,1].map(s=>[s*.95,.9,4.131,.29,.18]as const));
  const hok = new THREE.MeshBasicMaterial({ map: labelTexture([{ text: 'HORN OK PLEASE', font: '{s}px "Bungee", sans-serif', color: '#E53935', size: 60 }], 512, 96, '#FFD54F') });
  return { body: b, lights: l, ...lighting, size: [2.5, 3.1, 8.4], decals: [glass(g),decal(2.0, 0.38, hok, 0, 1.75, 4.08)], kind: 'truck',archetype:'lorry',occupants };
}
let waterMat: THREE.Material | null = null;
export function tanker(r: Rng): Model {
  const b = new Batch(), l = new Batch(),g=new Batch();
  const occupants=uprightCab(b,g,r,0,-2.95,2.3,2.0,.74,2.58,'#2E66C9');
  b.box(0,.60,-3.98,2.24,.26,.12,'#626f77');
  facePanel(b,[[-.62,1.05],[.62,1.05],[.68,1.52],[-.68,1.52]],-3.978,.035,'#28333b');
  for(let row=0;row<4;row++)b.box(0,1.10+row*.10,-4.001,1.16,.024,.018,'#9aa9af');
  for(const side of [-1,1]){
    b.add(TPL.rbox??TPL.box,side*.80,.80,-3.99,.39,.25,.11,'#34434e');
    b.box(side*.72,.90,3.94,.13,.14,.35,'#36414a');
    b.box(side*.80,.80,4.04,.42,.28,.13,'#36414a');
  }
  b.box(0,.80,4.015,2.06,.19,.13,'#58656d');
  b.box(0, 0.85, 0.6, 1.0, 0.35, 6.6, '#2a2930');
  b.add(TPL.cyl, 0, 2.0, 1.1, 1.12, 5.2, 1.12, '#3E7CE0', { rx: PI / 2 });
  b.add(TPL.sph, 0, 2.0, 3.7, 1.12, 1.12, 0.35, '#3E7CE0'); b.add(TPL.sph, 0, 2.0, -1.5, 1.12, 1.12, 0.35, '#3E7CE0');
  b.box(0, 2.0, 1.1, 2.26, 0.14, 5.0, '#F6EEDC');
  b.add(TPL.cyl, 0, 3.15, 1.1, 0.3, 0.12, 0.3, '#2a2930');
  // Tank saddles and hoops join the vessel visibly to the ladder chassis.
  for(const z of [-.65,2.75]){
    b.box(0,1.03,z,1.8,.30,.32,'#505b62');
    for(const side of [-1,1])strut(b,[side*.73,.86,z],[side*.93,1.36,z],.065,'#505b62');
    b.add(tankHoop,0,2,z,1.135,1.135,1.135,'#a5b1b5');
  }
  for(const x of [.38,.72]){
    strut(b,[x,.90,4.085],[x,2.97,4.085],.025,'#aeb9bc');
    for(const y of [1.35,2.65]){const cap=3.7+.35*Math.sqrt(Math.max(0,1-(x/1.12)**2-((y-2)/1.12)**2));strut(b,[x,y,cap-.012],[x,y,4.085],.025,'#aeb9bc');}
  }
  for(let y=1.08;y<2.95;y+=.24)strut(b,[.38,y,4.085],[.72,y,4.085],.019,'#aeb9bc');
  strut(b,[0,.89,2.95],[0,.89,3.84],.055,'#7e929c');strut(b,[0,.89,3.84],[0,.55,3.84],.055,'#7e929c');
  b.add(wheelRing,.13,.91,3.85,.13,.13,.13,'#a92e2e',{ry:PI/2});
  for (const s of [-1, 1]) for (const z of [-2.95, 1.6, 2.9]) wheel(b, s * 1.05, 0.48, z, 0.48, 0.3, '#c9c6cf');
  const lighting = roadLamps(l,
    [-1,1].map(s=>[s*.80,.80,-4.052,.29,.16]as const),
    [-1,1].map(s=>[s*.80,.80,4.111,.31,.19]as const));
  if (!waterMat) waterMat = new THREE.MeshBasicMaterial({ map: labelTexture([{ text: 'DRINKING WATER', font: '{s}px "Bungee", sans-serif', color: '#ffffff', size: 56 }], 512, 80, '#2E66C9') });
  void r;
  // The filler cap, not the tank barrel, is the actual highest surface. Feed
  // that envelope to the existing collision and carrier-height contracts.
  return { body: b, lights: l, ...lighting, size: [2.3, 3.22, 8.2], decals: [glass(g),decal(3.2, 0.5, waterMat, 1.13, 1.55, 1.1, PI / 2), decal(3.2, 0.5, waterMat, -1.13, 1.55, 1.1, -PI / 2)], kind: 'truck',archetype:'water-tanker',occupants };
}

/** Compact last-mile goods carrier; fits the actual 3.8m × 1.5m Ace class.
 * It stays in the existing truck simulation group rather than creating a new
 * routing, collision or LOD path. */
export function miniTruck(r:Rng):Model{
  const b=new Batch(),l=new Batch(),g=new Batch(),S=TRAFFIC_VEHICLE_SPECS.miniTruck;
  const paint=r.pick(['#f0eee8','#efeee7','#d8d7d1','#d3aa3d']),occupants=uprightCab(b,g,r,0,-1.19,S.width,1.36,.40,S.height,paint);
  b.box(0,.43,.20,1.18,.15,3.25,'#35373b');
  b.box(0,.78,.66,1.49,.13,2.20,'#8c8880');
  for(const side of [-1,1]){
    b.box(side*.715,.99,.66,.065,.34,2.20,paint);
    b.box(side*.76,.66,.66,.025,.11,2.18,'#32363b');
    for(const z of [-.35,.19,.72,1.27,1.72])b.box(side*.756,1.0,z,.026,.31,.04,'#a4a7a6');
  }
  for(const z of [-.43,1.76])b.box(0,1.0,z,1.48,.34,.065,paint);
  b.box(0,.52,-1.91,1.46,.18,.08,'#34383c');
  b.box(0,.88,-1.90,.66,.23,.025,'#282d32');
  for(let row=0;row<3;row++)b.box(0,.81+row*.06,-1.922,.61,.018,.012,'#747d82');
  for(const side of [-1,1])for(const z of [-S.wheelbase/2,S.wheelbase/2])wheel(b,side*.66,.25,z,.25,.15,'#9ea4a7');
  // Bounded cargo is deliberately below the cabin roof / known carrier roof.
  for(const [x,z]of [[-.34,.1],[.34,.1],[-.34,.72],[.34,.72],[0,1.35]]){
    b.box(x,1.05,z,.54,.42,.48,r()<.5?'#b59869':'#a88655');
    b.box(x,1.265,z,.055,.014,.48,'#d1bd93');
  }
  for(const side of [-1,1]){
    b.add(TPL.rbox??TPL.box,side*.55,.77,-1.91,.29,.21,.07,'#3c484f');
    b.box(side*.57,.66,1.83,.25,.20,.10,'#3c484f');
  }
  b.box(0,.59,1.80,1.43,.13,.11,'#3c484f');
  const lighting=roadLamps(l,[-1,1].map(s=>[s*.55,.77,-1.951,.23,.14]as const),[-1,1].map(s=>[s*.57,.66,1.887,.19,.13]as const));
  const plate=plateMat(`TG 09 U${String.fromCharCode(65+r.int(0,25))} ${r.int(1000,9999)}`,'#f4cd28');
  return {body:b,lights:l,...lighting,size:[S.width,S.height,S.length],kind:'truck',archetype:'mini-truck',occupants,
    decals:[glass(g),decal(.43,.11,plate,0,.61,-1.97,PI),decal(.43,.10,plate,0,.59,1.861)]};
}

/** Passenger/office shuttle, interpreted from the manufacturer's 3050WB
 * dimensional drawing. No emergency service or siren behaviour is invented. */
export function passengerVan(r:Rng):Model{
  const b=new Batch(),l=new Batch(),g=new Batch(),S=TRAFFIC_VEHICLE_SPECS.van,W=S.width,L=S.length,paint=r.pick(['#eeeae0','#f4f0e7','#e9e8e2','#bfc5c6']);
  b.box(0,.53,0,W*.8,.16,L*.88,'#33373b');
  const axle=S.wheelbase/2,tyre=.34;
  for(const side of [-1,1])for(let i=0;i<48;i++){
    const z0=-L/2+i*L/48,z1=-L/2+(i+1)*L/48;
    const bottom=(z:number)=>{let y=.39;for(const a of [-axle,axle])if(Math.abs(z-a)<.385)y=Math.max(y,tyre+Math.sqrt(.385**2-(z-a)**2));return y;};
    const x=side*W/2,points=[[x,bottom(z0),z0],[x,1.38,z0],[x,1.38,z1],[x,bottom(z1),z1]];
    if(side>0)b.quad(points[0],points[1],points[2],points[3],paint);else b.quad(points[3],points[2],points[1],points[0],paint);
  }
  b.box(0,.86,-L/2+.03,W,.94,.10,paint);
  // The real Traveller is a short-bonnet van, not a cab-over minibus. Form
  // the hood as a crowned surface, with returned shoulders to the side skin.
  for(let j=0;j<6;j++)for(let i=0;i<12;i++){
    const point=(u:number,t:number)=>[u*W*(.47-.025*t),1.39+.10*t+.035*(1-u*u),-L/2+.55*t];
    const u0=-1+2*i/12,u1=-1+2*(i+1)/12,t0=j/6,t1=(j+1)/6;
    b.quad(point(u0,t0),point(u0,t1),point(u1,t1),point(u1,t0),paint);
  }
  // The front return follows the crowned hood edge exactly. A flat header
  // leaves a slit under the higher middle of the crown.
  for(let i=0;i<12;i++){
    const u=-1+2*i/12,v=-1+2*(i+1)/12;
    b.quad([u*W*.47,1.29,-L/2-.02],[u*W*.47,1.39+.035*(1-u*u),-L/2],
      [v*W*.47,1.39+.035*(1-v*v),-L/2],[v*W*.47,1.29,-L/2-.02],paint);
  }
  for(const side of [-1,1]){
    const p=[[side*W*.47,1.38,-L/2],[side*W*.445,1.38,-2.0],[side*W*.445,1.49,-2.0],[side*W*.47,1.39,-L/2]];
    if(side>0)b.quad(p[3],p[2],p[1],p[0],paint);else b.quad(p[0],p[1],p[2],p[3],paint);
    // Close the horizontal shoulder between the narrower bonnet and the
    // full-width side skin; this must be closed from side views as well.
    const a=[side*W/2,1.38,-L/2],c=[side*W*.47,1.38,-L/2],d=[side*W*.445,1.38,-2.0],e=[side*W/2,1.38,-2.0];
    if(side>0)b.quad(a,c,d,e,paint);else b.quad(e,d,c,a,paint);
    const corner=[[side*W*.47,1.29,-L/2-.02],[side*W*.47,1.39,-L/2],[side*W/2,1.38,-L/2],[side*W/2,1.29,-L/2-.02]];
    if(side>0)b.quad(corner[0],corner[1],corner[2],corner[3],paint);else b.quad(corner[3],corner[2],corner[1],corner[0],paint);
  }
  // Real rear door windows: a lower door sheet, returned outer frame, centre
  // mullion and roof header surround two transparent upper apertures.
  const back=L/2-.045;
  b.box(0,.94,back,W,1.08,.09,paint);b.box(0,2.18,back,W,.16,.09,paint);
  b.box(0,1.79,back,.075,.62,.09,paint);
  for(const side of [-1,1]){
    b.box(side*(W/2-.065),1.79,back,.13,.62,.09,paint);
    const inner=side*.055,outer=side*(W/2-.14),z=L/2+.002;
    g.quad([inner,1.50,z],[outer,1.50,z],[outer,2.08,z],[inner,2.08,z],'#fff');
    b.box(side*(W/4+.002),1.49,L/2+.007,W/2-.18,.025,.020,'#39474f');
    b.box(side*(W/4+.002),2.09,L/2+.007,W/2-.18,.025,.020,'#39474f');
    for(const x of [inner,outer])b.box(x,1.79,L/2+.007,.022,.60,.02,'#39474f');
  }
  // A separate rounded roof cap leaves all window bays genuinely hollow.
  b.add(profile([[1.90,2.27],[1.65,S.height-.07],[-L/2+.17,S.height-.07],[-L/2,2.30],[-L/2,2.18],[1.90,2.18]],W,.055),0,0,0,1,1,1,paint);
  for(const side of [-1,1]){
    const x=side*(W/2-.025);
    formedCabFrame(b,g,side,W/2-.025,-2.15,-1.10,1.39,2.27,paint);
    g.quad([x,1.39,-1.10],[x,2.27,-1.10],[x,2.27,2.38],[x,1.39,2.38],'#fff');
    for(const z of [-1.10,.05,1.18,2.39])b.box(side*W/2,1.86,z,.06,1.02,.07,paint);
    b.box(side*(W/2+.005),1.38,.64,.035,.065,3.50,'#333a3e');
    b.box(side*(W/2+.008),.98,.22,.035,.13,4.55,'#507282');
    strut(b,[side*(W/2-.04),1.72,-2.04],[side*(W/2+.10),1.77,-2.10],.023,'#3c4346');
    b.box(side*(W/2+.10),1.70,-2.1,.15,.29,.12,'#3c4346');
    b.box(side*(W/2+.025),1.20,-1.32,.025,.04,.18,'#545d62');
  }
  g.quad([-W*.445,1.50,-2.015],[W*.445,1.50,-2.015],[W*.43,2.27,-1.90],[-W*.43,2.27,-1.90],'#fff');
  for(const side of [-1,1]){
    strut(b,[side*W*.45,1.48,-2.025],[side*W*.435,2.285,-1.90],.035,paint);
    strut(b,[side*.42,1.525,-2.027],[side*.28,1.83,-1.984],.012,'#30363a');
  }
  b.box(0,.54,-L/2-.03,W*.97,.22,.10,'#3a4043');b.box(0,.76,-L/2-.06,.75,.22,.025,'#282e32');
  for(let y=0;y<3;y++)b.box(0,.70+y*.06,-L/2-.078,.70,.014,.012,'#727c82');
  for(const side of [-1,1])for(const z of [-axle,axle])wheel(b,side*(W/2-.12),tyre,z,tyre,.23,'#a9b0b2');
  // Move seat, wrists, steering column and wheel together behind the screen.
  // The former wheel centre z−2.034 lay in front of its sloped lower edge.
  const occupants=[driver(b,r,.46,1.13,-1.42,.94)];
  for(let i=0;i<8;i++){
    const x=i%2?.48:-.48,z=-.43+Math.floor(i/2)*.77;
    if(i===1||i===4)occupants.push(seatedPassenger(b,r,x,1.13,z,.94));else seat(b,x,1.105,z,.43);
  }
  b.box(0,.60,0,W*.86,.05,4.65,'#4a4e50');
  for(const side of [-1,1]){
    b.add(TPL.rbox??TPL.box,side*.69,1.0,-L/2-.025,.34,.29,.10,'#3a4750');
    b.add(TPL.rbox??TPL.box,side*.73,1.06,L/2+.022,.24,.48,.09,'#3a4750');
    archLip(b,side,side*(W/2+.004),-axle,tyre,.385,.025,'#626f78');archLip(b,side,side*(W/2+.004),axle,tyre,.385,.025,'#626f78');
  }
  // Split rear doors have real seams, hinges, small glazed upper apertures
  // and handles; their lens housings attach to the rear sheet metal.
  b.box(0,1.20,L/2+.009,.025,1.61,.025,'#57656d');
  for(const side of [-1,1]){b.box(side*.30,1.28,L/2+.025,.04,.17,.03,'#3b4952');for(const y of [.72,1.63])b.box(side*.86,y,L/2+.023,.06,.12,.045,'#7c8a91');}
  const lighting=roadLamps(l,[-1,1].map(s=>[s*.69,1.0,-L/2-.081,.28,.20]as const),[-1,1].map(s=>[s*.73,1.06,L/2+.074,.18,.40]as const));
  const plate=plateMat(`TG 11 T${String.fromCharCode(65+r.int(0,25))} ${r.int(1000,9999)}`,'#f4cd28');
  return {body:b,lights:l,...lighting,size:[W,S.height,L],kind:'car',archetype:'passenger-van',occupants,
    decals:[glass(g),decal(.47,.12,plate,0,.52,-L/2-.10,PI),decal(.47,.12,plate,0,.72,L/2+.07)]};
}
