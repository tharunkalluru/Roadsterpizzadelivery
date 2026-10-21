/**
 * Original low-poly geometry inspired by the current Tesla Roadster official imagery.
 * White angular body, smoked bronze glazing, T-top frame, thin rear light and four rear nozzles.
 * Dimensions and flight actuation are authored game presentation, not engineering specifications.
 * Shared wheels and two instanced cold-gas effects keep the mobile presentation bounded.
 */
import * as THREE from 'three';
import type { HeroCar, Quality } from './api';
import { GeoBuilder, addBox, boxMatrix, clamp, hex, smoothstep } from './geo';
import { getSoftSprite, latinLabelTexture } from './textures';

/* ---- 1D cubic Hermite through keys ---- */
export function curve(keys: [number, number][], x: number): number {
  const n = keys.length;
  if (x <= keys[0][0]) return keys[0][1];
  if (x >= keys[n - 1][0]) return keys[n - 1][1];
  let i = 0;
  while (i < n - 2 && x > keys[i + 1][0]) i++;
  const [x0, y0] = keys[i], [x1, y1] = keys[i + 1];
  const h = x1 - x0;
  const t = (x - x0) / h;
  const m0 = i > 0 ? (y1 - keys[i - 1][1]) / (x1 - keys[i - 1][0]) : (y1 - y0) / h;
  const m1 = i < n - 2 ? (keys[i + 2][1] - y0) / (keys[i + 2][0] - x0) : (y1 - y0) / h;
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * m1;
}

const WHEEL_R = 0.35;
const AXLE_Z = 1.3;
const TRACK_X = 0.84;

export function createHeroCar(quality: Quality): HeroCar {
  const low = quality === 'low';
  const high = quality === 'high';
  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(o: T): T => { owned.push(o); return o; };

  // ------------------------------------------------------------- materials
  const paint: THREE.MeshStandardMaterial = !high
    ? own(new THREE.MeshStandardMaterial({ name: 'hero-paint', color: 0xe9e9e5, metalness: 0.16, roughness: 0.42, vertexColors: true, flatShading: true }))
    : own(new THREE.MeshPhysicalMaterial({
        name: 'hero-paint', color: 0xe9e9e5, metalness: 0.3, roughness: 0.32, vertexColors: true,
        clearcoat: 0.45, clearcoatRoughness: 0.2, envMapIntensity: 1.05,
      }));
  // Vertex colours carry the actual trim/interior colours; a dark base would hide the tan seats.
  const trim = own(new THREE.MeshStandardMaterial({ name: 'hero-trim', color: 0xffffff, roughness: 0.72, metalness: 0.12, vertexColors: true }));
  const detail = own(new THREE.MeshStandardMaterial({ name: 'hero-courier-detail', vertexColors: true, roughness: 0.82, metalness: 0.02, flatShading: true }));
  const glass = own(new THREE.MeshStandardMaterial({
    name: 'hero-glass', color: 0xffffff, vertexColors: true, metalness: 0.1, roughness: 0.27, transparent: true, opacity: 0.96,
    envMapIntensity: 0.8, depthWrite: false, side: THREE.FrontSide,
  }));
  const tyreMat = own(new THREE.MeshStandardMaterial({ name: 'hero-tyre', color: 0x1c2224, roughness: 0.88, metalness: 0 }));
  const rimMat = own(new THREE.MeshStandardMaterial({ name: 'hero-rim', color: 0xffffff, vertexColors: true, roughness: 0.42, metalness: 0.5, envMapIntensity: 0.9, flatShading: !high }));
  const headMat = own(new THREE.MeshStandardMaterial({ name: 'hero-head', color: 0xe1e6e3, emissive: 0xdfeeff, emissiveIntensity: 2.4, roughness: 0.3 }));
  const tailMat = own(new THREE.MeshStandardMaterial({ name: 'hero-tail', color: 0x3a0505, emissive: 0xff1c14, emissiveIntensity: 0.9, roughness: 0.4 }));
  const reverseMat = own(new THREE.MeshStandardMaterial({ name: 'hero-reverse', color: 0xd8d8d8, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.4 }));

  const root = new THREE.Group();
  root.name = 'hero-car';
  const body = new THREE.Group();
  body.name = 'hero-body';
  root.add(body);
  // One shared forward beam lights the actual road surface at night without a second shadow pass.
  const headBeam=own(new THREE.SpotLight(0xffefd6,0,85,Math.PI/6,.55,2));
  headBeam.name='road-headlight-beam';headBeam.position.set(0,.56,-1.9);
  headBeam.target.position.set(0,-.3,-32);root.add(headBeam,headBeam.target);

  const addMesh = (g: THREE.BufferGeometry, m: THREE.Material, name: string, parent: THREE.Object3D = body, cast = true): THREE.Mesh => {
    own(g);
    const mesh = new THREE.Mesh(g, m);
    mesh.name = name;
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  // Broad planar shoulders and a squared wedge nose, traced as original low-poly sections.
  const topKeys: [number, number][] = [[-2,.49],[-1.8,.59],[-1.3,.68],[-.65,.8],[0,.79],[.7,.81],[1.35,.85],[1.75,.81],[2,.75]];
  const widthKeys: [number, number][] = [[-2,.81],[-1.82,.93],[-1.45,.975],[-.6,.94],[.1,.93],[.9,.98],[1.55,.99],[2,.93]];
  const shoulderKeys: [number, number][] = [[-2,.54],[-1.8,.69],[-1.3,.84],[-.65,.83],[0,.81],[.7,.87],[1.35,.9],[1.75,.85],[2,.77]];
  const shell=new GeoBuilder(true),sections:number[][][]=[],steps=low?28:high?48:36;
  for(let i=0;i<=steps;i++) {
    const z=-2+4*i/steps,w=curve(widthKeys,z),top=curve(topKeys,z),shoulder=curve(shoulderKeys,z);
    const wheelDistance=Math.min(Math.abs(z-AXLE_Z),Math.abs(z+AXLE_Z));
    const lower=wheelDistance<.39?WHEEL_R+.015+Math.sqrt(.39**2-wheelDistance**2):.22;
    const upper=Math.max(shoulder-.08,lower+.025);
    sections.push([[0,top,z],[w*.62,top,z],[w*.91,shoulder,z],[w,upper,z],[w,lower,z],[w*.79,.2,z],[-w*.79,.2,z],[-w,lower,z],[-w,upper,z],[-w*.91,shoulder,z],[-w*.62,top,z]]);
  }
  // Broad value changes keep white paint legible on low without an environment map.
  const shellColours=[0xf4f6f3,0xffffff,0xe3e9e7,0xcdd7d7,0x343a3c,0x343a3c,0x343a3c,0xcdd7d7,0xe3e9e7,0xffffff,0xf4f6f3].map(hex);
  for(let i=1;i<sections.length;i++)for(let j=0;j<sections[i].length;j++) {
    const k=(j+1)%sections[i].length,A=sections[i-1],B=sections[i];
    shell.quad([...A[j],...B[j],...B[k],...A[k]],[0,0,0,1,1,1,1,0],undefined,shellColours[j]);
  }
  for(const [index,direction]of [[0,-1],[sections.length-1,1]]) {
    const ring=sections[index],centre:[number,number,number]=[0,.4,ring[0][2]];
    const faceColour=hex(direction>0?0xd1d9d8:0xe1e5e2);
    for(let j=0;j<ring.length;j++)shell.triangle(centre,ring[j] as [number,number,number],ring[(j+1)%ring.length] as [number,number,number],[.5,.5],[0,0],[1,0],[0,0,direction],faceColour);
  }
  // White rear buttresses close the quarter panels beneath the tapering rear glass.
  for(const side of [-1,1])shell.triangle([side*.62,1.19,.78],[side*.74,.83,1.1],[side*.47,.87,1.52],[0,1],[0,0],[1,0],[side,.4,.3],[1,1,1]);
  const bodyMesh=addMesh(shell.build(),paint,'body');

  // A baked sky reflection makes the taper read as glass even on the reflection-free
  // low preset. Bronze stays at the lower edge; all strips share one transparent draw.
  const canopy=new GeoBuilder(true,4);
  type GlazingStop=readonly [t:number,colour:number,opacity:number];
  const glazing=(corners:number[],normal:number[],stops:readonly GlazingStop[])=>{
    const at=(a:number,b:number,t:number)=>corners[a]+(corners[b]-corners[a])*t;
    for(let i=1;i<stops.length;i++) {
      const [t0,c0,a0]=stops[i-1],[t1,c1,a1]=stops[i];
      const base=canopy.vcount,col0=[...hex(c0),a0],col1=[...hex(c1),a1];
      canopy.quad([
        at(0,9,t0),at(1,10,t0),at(2,11,t0),at(3,6,t0),at(4,7,t0),at(5,8,t0),
        at(3,6,t1),at(4,7,t1),at(5,8,t1),at(0,9,t1),at(1,10,t1),at(2,11,t1),
      ],[0,t0,1,t0,1,t1,0,t1],normal);
      for(let v=0;v<4;v++)for(let c=0;c<4;c++)canopy.col[(base+v)*4+c]=(v<2?col0:col1)[c];
    }
  };
  glazing([-.72,.82,-.67,.72,.82,-.67,.63,1.165,-.08,-.63,1.165,-.08],[0,.86,-.5],[
    [0,0x423f34,.82],[.1,0x303d40,.8],[.7,0x4d666d,.84],[1,0x849b9d,.95],
  ]);
  glazing([-.63,1.165,-.08,.63,1.165,-.08,.62,1.19,.78,-.62,1.19,.78],[0,1,0],[
    [0,0x72888c,.96],[.32,0x3e535a,.96],[1,0x607a80,.98],
  ]);
  glazing([-.62,1.19,.78,.62,1.19,.78,.47,.87,1.52,-.47,.87,1.52],[0,.92,.4],[
    [0,0x6b858a,.99],[.18,0x7b9497,.99],[.5,0x3f565d,.98],[.92,0x263336,.99],[1,0x464337,1],
  ]);
  for(const side of [-1,1])glazing([side*.72,.82,-.67,side*.74,.83,1.1,side*.62,1.19,.78,side*.63,1.165,-.08],[side,0,0],[
    [0,0x474337,.88],[.12,0x29383b,.82],[1,0x52696e,.94],
  ]);
  addMesh(canopy.build(),glass,'canopy',body,false);
  const trimB=new GeoBuilder(true),dk=hex(0x171c20),titanium=hex(0x777a76);
  // Endpoint transforms keep every frame segment attached to its glazing corners.
  const frame=(from:THREE.Vector3,to:THREE.Vector3,width:number,color:ArrayLike<number>)=>{
    const delta=to.clone().sub(from);
    const transform=new THREE.Matrix4().compose(from.clone().add(to).multiplyScalar(.5),new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize()),new THREE.Vector3(1,delta.length(),1));
    addBox(trimB,width,1,width,transform,1,color);
  };
  addBox(trimB,1.47,.025,.06,boxMatrix(0,.82,-.65),1,dk);
  addBox(trimB,1.28,.022,.035,boxMatrix(0,1.165,-.08),1,titanium);
  frame(new THREE.Vector3(0,1.165,-.08),new THREE.Vector3(0,1.19,.78),.022,dk);
  addBox(trimB,1.27,.025,.045,boxMatrix(0,1.19,.78),1,titanium);
  for(const side of [-1,1]) {
    frame(new THREE.Vector3(side*.72,.82,-.67),new THREE.Vector3(side*.63,1.165,-.08),.028,titanium);
    frame(new THREE.Vector3(side*.63,1.165,-.08),new THREE.Vector3(side*.62,1.19,.78),.022,dk);
    addBox(trimB,.065,.09,1.45,boxMatrix(side*.95,.255,0),1,dk);
    addBox(trimB,.13,.055,.1,boxMatrix(side*.82,.87,-.41,side*.25),1,dk);
  }
  // A single seam across the rear deck separates the wing from the tail volume.
  const deckZ=1.84,deckY=curve(topKeys,deckZ)+.007,deckShoulder=curve(shoulderKeys,deckZ)+.007,seam=hex(0x738184);
  frame(new THREE.Vector3(-.57,deckY,deckZ),new THREE.Vector3(.57,deckY,deckZ),.009,seam);
  for(const side of [-1,1])frame(new THREE.Vector3(side*.57,deckY,deckZ),new THREE.Vector3(side*.85,deckShoulder,deckZ),.009,seam);
  // Wide black splitter/grille, rear light recess and diffuser stay within the silhouette.
  addBox(trimB,1.64,.17,.075,boxMatrix(0,.365,-2.005),1,dk);
  addBox(trimB,1.84,.045,.21,boxMatrix(0,.235,-1.94),1,hex(0x0b1014));
  addBox(trimB,1.87,.1,.045,boxMatrix(0,.69,2.014),1,hex(0x10151a));
  addBox(trimB,1.72,.21,.08,boxMatrix(0,.295,2.012),1,dk);
  for(const x of [-.68,-.34,0,.34,.68])addBox(trimB,.025,.16,.33,boxMatrix(x,.23,1.91),1,hex(0x0c1114));
  addBox(trimB,.38,.16,.024,boxMatrix(0,.49,2.035),1,hex(0xc3c4be));

  // The rear wing rises only as flight presentation; its dimensions/actuation are authored.
  const wing=new THREE.Group();wing.name='active-rear-wing';wing.position.set(0,.865,1.64);body.add(wing);
  const wingB=new GeoBuilder(true);
  addBox(wingB,1.84,.045,.27,boxMatrix(0,.025,0),1,hex(0xd6d8d5));
  for(const side of [-1,1])addBox(wingB,.045,.35,.065,boxMatrix(side*.57,-.15,.015),1,titanium);
  addMesh(wingB.build(),trim,'wing-blade',wing);

  // ----------------------------------------------------------- interior
  {
    const ib = trimB;
    const seatC = hex(0x1b1d21), tan = hex(0xb8855a), dash = hex(0x141518);
    for (const s of [-1, 1]) {
      addBox(ib, 0.46, 0.1, 0.5, boxMatrix(s * 0.33, 0.74, 0.42), 1, seatC);
      addBox(ib, 0.46, 0.36, 0.1, boxMatrix(s * 0.33, 0.9, 0.72, 0, -0.3), 1, seatC);
      addBox(ib, 0.34, 0.1, 0.02, boxMatrix(s * 0.33, 0.92, 0.665, 0, -0.3), 1, tan);
    }
    addBox(ib, 1.2, 0.14, 0.3, boxMatrix(0, 0.73, -0.3, 0, 0.2), 1, dash);
    const wheelGeo = new THREE.TorusGeometry(0.13, 0.018, 4, high ? 16 : 10);
    ib.appendGeometry(wheelGeo, new THREE.Matrix4().compose(new THREE.Vector3(0.33, 0.82, -0.06), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.9, 0, 0)), new THREE.Vector3(1, 1, 1)), hex(0x0a0a0a));
    wheelGeo.dispose();
  }

  // One opaque, vertex-coloured mesh for the driver: no skeletal rig or frame allocations.
  {
    const courier = new GeoBuilder(true), jacket = hex(0xc4a071), cream = hex(0xf1dfb7), skin = hex(0x9c6947), tomato = hex(0xb74732);
    addBox(courier,.3,.25,.22,boxMatrix(.33,.945,.38,0,-.12),1,jacket);
    addBox(courier,.22,.035,.2,boxMatrix(.33,1.075,.36),1,cream);
    addBox(courier,.042,.24,.014,boxMatrix(.29,.955,.263,0,0,-.28),1,hex(0x80583d));
    const head = new THREE.IcosahedronGeometry(1, 0);
    courier.appendGeometry(head,new THREE.Matrix4().compose(new THREE.Vector3(.33,1.17,.34),new THREE.Quaternion(),new THREE.Vector3(.105,.125,.105)),skin);
    head.dispose();
    const cap = new THREE.CylinderGeometry(.102,.12,.055,high?10:7);
    courier.appendGeometry(cap,new THREE.Matrix4().makeTranslation(.33,1.265,.34),cream);cap.dispose();
    addBox(courier,.18,.018,.1,boxMatrix(.33,1.25,.235),1,tomato);
    const arm = new THREE.CylinderGeometry(1,1,1,5), up = new THREE.Vector3(0,1,0);
    const limb = (from:THREE.Vector3,to:THREE.Vector3,r:number,color:ArrayLike<number>) => {
      const delta=to.clone().sub(from);
      courier.appendGeometry(arm,new THREE.Matrix4().compose(from.clone().add(to).multiplyScalar(.5),new THREE.Quaternion().setFromUnitVectors(up,delta.clone().normalize()),new THREE.Vector3(r,delta.length(),r)),color);
    };
    for(const side of [-1,1]) {
      const shoulder=new THREE.Vector3(.33+side*.16,1.02,.37),elbow=new THREE.Vector3(.33+side*.19,.89,.17),hand=new THREE.Vector3(.33+side*.105,.92,-.035);
      limb(shoulder,elbow,.048,jacket);limb(elbow,hand,.04,jacket);
      addBox(courier,.07,.06,.065,boxMatrix(hand.x,hand.y,hand.z),1,cream);
    }
    arm.dispose();
    addMesh(courier.build(),detail,'courier',body).position.y=-.13;
  }

  // Inset triangular lamps sit at the fender edges; the rear bar runs the full width.
  {
    const lamps=new GeoBuilder(),surround=new GeoBuilder(true);
    for(const side of [-1,1]) {
      surround.triangle([side*.62,.638,-1.82],[side*.91,.74,-1.57],[side*.69,.774,-1.36],[0,0],[1,0],[.5,1],[0,1,-.3],dk);
      lamps.quad([side*.665,.685,-1.71,side*.855,.751,-1.55,side*.842,.767,-1.52,side*.665,.704,-1.68],[0,0,1,0,1,1,0,1],[0,1,-.4]);
    }
    trimB.appendBuilder(surround);
    addMesh(lamps.build(),headMat,'headlights',body,false);
    const rear=new GeoBuilder();
    rear.quad([-.895,.682,2.041,.895,.682,2.041,.895,.71,2.041,-.895,.71,2.041],[0,0,1,0,1,1,0,1],[0,0,1]);
    addMesh(rear.build(),tailMat,'brake',body,false);
    const reverse=new GeoBuilder();
    for(const side of [-1,1])addBox(reverse,.16,.025,.02,boxMatrix(side*.67,.454,2.034));
    addMesh(reverse.build(),reverseMat,'reverse',body,false);
  }

  const cargo=new THREE.Group();cargo.name='collected-pizza-box';cargo.visible=false;cargo.scale.setScalar(.58);cargo.position.set(0,.34,.66);body.add(cargo);
  {
    const box=new GeoBuilder(true),tomato=hex(0xb74732);
    addBox(box,.9,.12,.53,boxMatrix(0,.89,1.7),1,hex(0xc6a378));
    addBox(box,.93,.028,.56,boxMatrix(0,.964,1.7),1,hex(0xf2dfb8));
    for(const side of [-1,1])addBox(box,.065,.006,.55,boxMatrix(side*.34,.982,1.7),1,tomato);
    // A geometric pizza-slice emblem stays legible without another texture or draw call.
    box.triangle([-.18,.983,1.54],[.18,.983,1.54],[0,.983,1.87],[0,0],[1,0],[.5,1],[0,1,0],hex(0xe1a950));
    addBox(box,.36,.012,.045,boxMatrix(0,.99,1.54),1,hex(0xb87942));
    const pepperoni=new THREE.CircleGeometry(.032,7);pepperoni.rotateX(-Math.PI/2);
    for(const [x,z]of [[-.075,1.61],[.065,1.63],[0,1.745]])box.appendGeometry(pepperoni,new THREE.Matrix4().makeTranslation(x,.989,z),tomato);
    pepperoni.dispose();
    addMesh(box.build(),detail,'pizza-carton',cargo);
  }
  // A small original label leaves the reference bodywork and rear light uninterrupted.
  {
    const texture=own(latinLabelTexture(['ROADSTER'],'#343b40',null,256,64,'600 38px Arial, sans-serif'));
    const material=own(new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
    const decal=new GeoBuilder();
    decal.quad([-.16,.445,2.051,.16,.445,2.051,.16,.53,2.051,-.16,.53,2.051],[0,0,1,0,1,1,0,1],[0,0,1]);
    addMesh(decal.build(),material,'decals',body,false);
  }

  // --------------------------------------------------------------- wheels
  const wheelPivots: THREE.Object3D[] = [];
  const spinGroups: THREE.Object3D[] = [];
  {
    const segs = low ? 12 : high ? 28 : 16;
    const tyreProfile = (w: number): THREE.Vector2[] => {
      const hw2 = w / 2;
      const pts = high ? [
        [0.228, -hw2 * 0.74], [0.26, -hw2 * 0.97], [0.31, -hw2], [0.342, -hw2 * 0.84], [0.352, -hw2 * 0.45], [0.354, 0], [0.352, hw2 * 0.45], [0.342, hw2 * 0.84], [0.31, hw2], [0.26, hw2 * 0.97], [0.228, hw2 * 0.74],
      ] : [
        [.228,-hw2*.75],[.31,-hw2],[.35,-hw2*.65],[.354,hw2*.65],[.31,hw2],[.228,hw2*.75],
      ];
      return pts.map(([r, y]) => new THREE.Vector2(r, y));
    };
    const makeTyre = (w: number): THREE.BufferGeometry => {
      const g = new THREE.LatheGeometry(tyreProfile(w), segs);
      g.rotateZ(-Math.PI / 2);
      return own(g);
    };
    const makeRim = (w: number): THREE.BufferGeometry => {
      const b = new GeoBuilder(true);
      const hw2 = w / 2;
      const silver = hex(0xbfc4c4), graphite = hex(0x22282b), steel = hex(0x555b62), cap = hex(0x686f72);
      // lathe pieces around Y then rotated to X
      const barrel = new THREE.LatheGeometry([new THREE.Vector2(0.2, -hw2 * 0.85), new THREE.Vector2(0.236, hw2 * 0.75), new THREE.Vector2(0.246, hw2 * 0.98)], segs);
      b.appendGeometry(barrel, new THREE.Matrix4().makeRotationZ(-Math.PI / 2), silver);
      barrel.dispose();
      // dish face
      const face = new THREE.CircleGeometry(0.23, segs);
      face.rotateY(Math.PI / 2);
      b.appendGeometry(face, new THREE.Matrix4().makeTranslation(hw2 * 0.7, 0, 0), graphite);
      face.dispose();
      // brake disc behind
      if(high) {
        const disc = new THREE.CylinderGeometry(0.19, 0.19, 0.022, segs);
        disc.rotateZ(Math.PI / 2);
        b.appendGeometry(disc, new THREE.Matrix4().makeTranslation(hw2 * 0.12, 0, 0), steel);
        disc.dispose();
      }
      // spokes: 5 twin spokes
      const n = high ? 10 : 5;
      const sp = new THREE.BoxGeometry(0.035, 0.22, 0.042);sp.translate(0, 0.125, 0);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a);
        m.compose(new THREE.Vector3(hw2 * 0.78, 0, 0).applyQuaternion(q), q, new THREE.Vector3(1, 1, 1));
        b.appendGeometry(sp, m, silver);
      }
      sp.dispose();
      // hub cap
      const hub = new THREE.CylinderGeometry(0.055, 0.06, 0.035, high ? 12 : 8);
      hub.rotateZ(Math.PI / 2);
      b.appendGeometry(hub, new THREE.Matrix4().makeTranslation(hw2 * 0.88, 0, 0), cap);
      hub.dispose();
      return own(b.build());
    };
    // Width is an instance transform; all four wheels share each geometry.
    const tyreGeo = makeTyre(.29), rimGeo = makeRim(.29);
    const defs = [
      { x: -TRACK_X, z: -AXLE_Z, front: true, left: true },
      { x: TRACK_X, z: -AXLE_Z, front: true, left: false },
      { x: -TRACK_X, z: AXLE_Z, front: false, left: true },
      { x: TRACK_X, z: AXLE_Z, front: false, left: false },
    ];
    for (const d of defs) {
      const pivot = new THREE.Group();
      pivot.name = `wheel-${d.front ? 'F' : 'R'}${d.left ? 'L' : 'R'}`;
      pivot.rotation.order = 'YXZ';
      pivot.position.set(d.x, WHEEL_R, d.z);
      const spin = new THREE.Group();
      spin.name = 'spin';
      const faceFlip = new THREE.Group();
      if (d.left) faceFlip.rotation.y = Math.PI;
      const tyre = new THREE.Mesh(tyreGeo, tyreMat);
      const rim = new THREE.Mesh(rimGeo, rimMat);
      tyre.scale.x = rim.scale.x = (d.front ? .27 : .31) / .29;
      tyre.castShadow = rim.castShadow = true;
      tyre.receiveShadow = rim.receiveShadow = true;
      tyre.name = 'tyre'; rim.name = 'rim';
      faceFlip.add(tyre, rim);
      spin.add(faceFlip);
      pivot.add(spin);
      root.add(pivot);
      wheelPivots.push(pivot);
      spinGroups.push(spin);
    }
  }

  // Four rear nozzles follow the official image. Perimeter lift/yaw locations are an
  // authored game approximation; neither layout nor emitted gas is an engineering claim.
  type Jet = {kind:'down'|'rear'|'side';x:number;y:number;z:number;dx:number;dy:number;dz:number;turn:number;rotation:THREE.Quaternion};
  const jets:Jet[]=[],up=new THREE.Vector3(0,1,0);
  const addJet=(kind:Jet['kind'],x:number,y:number,z:number,dx:number,dy:number,dz:number,turn=0)=>{
    jets.push({kind,x,y,z,dx,dy,dz,turn,rotation:new THREE.Quaternion().setFromUnitVectors(up,new THREE.Vector3(dx,dy,dz))});
  };
  for(const x of [-.54,-.18,.18,.54])addJet('rear',x,.3,2.075,0,0,1);
  for(const x of [-.79,.79])for(const z of [-1.16,1.2])addJet('down',x,.18,z,0,-1,0);
  for(const side of [-1,1])for(const z of [-.78,.92])addJet('side',side*.96,.42,z,side,0,0,side*Math.sign(z));
  {
    const rim=new THREE.CylinderGeometry(.074,.061,.06,low?7:10,1,true);
    const aperture=new THREE.CircleGeometry(.06,low?7:10);aperture.rotateX(-Math.PI/2);
    const m=new THREE.Matrix4(),position=new THREE.Vector3(),scale=new THREE.Vector3(1,1,1);
    for(const jet of jets){
      m.compose(position.set(jet.x,jet.y,jet.z),jet.rotation,scale);trimB.appendGeometry(rim,m,hex(0x666d70));
      m.compose(position.set(jet.x+jet.dx*.032,jet.y+jet.dy*.032,jet.z+jet.dz*.032),jet.rotation,scale);trimB.appendGeometry(aperture,m,hex(0x080d12));
    }
    rim.dispose();aperture.dispose();
  }
  addMesh(trimB.build(),trim,'trim');

  // A narrow, pale tapered core for every nozzle in a single draw; never a combustion flame.
  const coreGeometry=own(new THREE.CylinderGeometry(.19,.024,1,low?5:8,3,true));coreGeometry.translate(0,.5,0);
  const corePositions=coreGeometry.getAttribute('position'),coreColours=new Float32Array(corePositions.count*4);
  for(let i=0;i<corePositions.count;i++){
    coreColours[i*4]=.98;coreColours[i*4+1]=.99;coreColours[i*4+2]=.98;
    coreColours[i*4+3]=.8*(1-corePositions.getY(i))**1.6;
  }
  coreGeometry.setAttribute('color',new THREE.BufferAttribute(coreColours,4));
  const coreMaterial=own(new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,toneMapped:false,fog:true}));
  const cores=own(new THREE.InstancedMesh(coreGeometry,coreMaterial,jets.length));cores.name='cold-gas-core';cores.visible=false;
  cores.instanceMatrix.setUsage(THREE.DynamicDrawUsage);cores.boundingSphere=new THREE.Sphere(new THREE.Vector3(),8);cores.renderOrder=1;body.add(cores);

  // Billboard all vapor puffs and ground wash in one instanced draw, with a fixed pool
  // and per-instance opacity. Matrix/vector/attribute storage is reused in animate().
  const perJet=low?2:high?4:3,dustCount=low?4:high?8:6,particleCount=jets.length*perJet+dustCount;
  const plumeGeometry=own(new THREE.PlaneGeometry(1,1));
  const opacities=new THREE.InstancedBufferAttribute(new Float32Array(particleCount),1);opacities.setUsage(THREE.DynamicDrawUsage);
  plumeGeometry.setAttribute('aOpacity',opacities);
  const uniforms=THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
  uniforms.uMap={value:getSoftSprite('vapour')};uniforms.uColour={value:new THREE.Color(0xf0f4f1)};
  const plumeMaterial=own(new THREE.ShaderMaterial({
    uniforms,transparent:true,depthWrite:false,toneMapped:false,fog:true,
    vertexShader:`
      attribute float aOpacity;
      varying vec2 vUv;
      varying float vOpacity;
      #include <fog_pars_vertex>
      void main(){
        vUv=uv;vOpacity=aOpacity;
        vec4 mvPosition=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);
        vec2 size=vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));
        mvPosition.xy+=position.xy*size;
        gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader:`
      uniform sampler2D uMap;
      uniform vec3 uColour;
      varying vec2 vUv;
      varying float vOpacity;
      #include <fog_pars_fragment>
      void main(){
        gl_FragColor=vec4(uColour,texture2D(uMap,vUv).a*vOpacity);
        #include <fog_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  const plumes=own(new THREE.InstancedMesh(plumeGeometry,plumeMaterial,particleCount));plumes.name='cold-gas-vapour';plumes.visible=false;
  plumes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);plumes.boundingSphere=new THREE.Sphere(new THREE.Vector3(),9);plumes.renderOrder=2;body.add(plumes);
  const jetGains=new Float32Array(jets.length),matrix=new THREE.Matrix4(),position=new THREE.Vector3(),scale=new THREE.Vector3(),identity=new THREE.Quaternion();
  root.userData.coldGas={nozzles:jets.length,rearNozzles:4,particles:particleCount,effectDrawCalls:2,jetGains};

  // -------------------------------------------------------------- state
  let thrTarget=0,thr=0,time=0,spinAngle=0,lastSpeed=0,hasSpeed=false,wingDeployment=0;
  const flight={heightM:0,verticalSpeed:0,speedMps:0,steerRad:0,airborne:false};
  const tmpCol=new THREE.Color();
  const animateGas=(dt:number,acceleration:number):void=>{
    const active=flight.airborne&&thr>.01;
    cores.visible=plumes.visible=active;
    wingDeployment+=(Number(flight.airborne)-wingDeployment)*(1-Math.exp(-dt*5));
    wing.position.y=.865+wingDeployment*.33;wing.rotation.x=-wingDeployment*.1;
    if(!active){jetGains.fill(0);return;}
    const response=1-Math.exp(-dt*13),yaw=clamp(flight.steerRad/.4,-1,1);
    for(let i=0;i<jets.length;i++){
      const jet=jets[i];let target=0;
      if(jet.kind==='down')target=thr*clamp(.78+flight.verticalSpeed*.045,.5,1);
      else if(jet.kind==='rear')target=thr*clamp(acceleration*.16,0,1);
      else target=thr*Math.max(0,yaw*jet.turn)*(.74+.26*Math.sin(time*19+i));
      const gain=jetGains[i]+(target-jetGains[i])*response;jetGains[i]=gain;
      const length=jet.kind==='down'?2.1:jet.kind==='rear'?1.9:.95;
      position.set(jet.x,jet.y,jet.z);scale.set(Math.sqrt(gain),gain*length,Math.sqrt(gain));matrix.compose(position,jet.rotation,scale);cores.setMatrixAt(i,matrix);
      for(let j=0;j<perJet;j++){
        const index=i*perJet+j,phase=(time*(jet.kind==='side'?2.1:1.6)+j/perJet+i*.17)%1,travel=.12+phase*length*1.5;
        const spread=phase*.18,swirl=time*3.4+i*2.3+j;
        position.set(jet.x+jet.dx*travel+(jet.dx===0?Math.cos(swirl)*spread:0),jet.y+jet.dy*travel+(jet.dy===0?Math.sin(swirl)*spread:0),jet.z+jet.dz*travel+(jet.dz===0?Math.sin(swirl)*spread:0));
        const size=.11+phase*(jet.kind==='down'?1.1:.55);scale.set(size,size*1.25,1);matrix.compose(position,identity,scale);plumes.setMatrixAt(index,matrix);
        opacities.setX(index,gain*.68*(1-phase)*smoothstep(0,.08,phase));
      }
    }
    const ground=clamp(1-flight.heightM/4.5,0,1);
    for(let i=0;i<dustCount;i++){
      const phase=(time*.75+i/dustCount)%1,angle=i/dustCount*Math.PI*2+time*.15,radius=.8+phase*3.4;
      position.set(Math.cos(angle)*radius,-flight.heightM+.13+phase*.2,Math.sin(angle)*radius);
      scale.set(1+phase*2.1,.25+phase*.55,1);matrix.compose(position,identity,scale);const index=jets.length*perJet+i;plumes.setMatrixAt(index,matrix);
      opacities.setX(index,thr*ground*.28*(1-phase)*smoothstep(0,.12,phase));
    }
    cores.instanceMatrix.needsUpdate=true;plumes.instanceMatrix.needsUpdate=true;opacities.needsUpdate=true;
  };

  const car: HeroCar = {
    root,
    wheels: wheelPivots,
    setThruster(intensity: number): void {
      thrTarget = clamp(intensity, 0, 1);
    },
    setFlightContext(context): void { flight.heightM=context.heightM;flight.verticalSpeed=context.verticalSpeed;flight.speedMps=context.speedMps;flight.steerRad=context.steerRad;flight.airborne=context.airborne??context.heightM>.08; },
    setCargoLoaded(loaded): void { cargo.visible=loaded; },
    setHeadlights(on):void { headBeam.intensity=on?1800:0;headMat.emissiveIntensity=on?4:2.4; },
    setBrakeLights(on: boolean): void {
      tailMat.emissiveIntensity = on ? 4.2 : 0.9;
      tmpCol.setHex(on ? 0xff2a1a : 0xff1c14);
      tailMat.emissive.copy(tmpCol);
    },
    setReverseLights(on: boolean): void {
      reverseMat.emissiveIntensity = on ? 2.8 : 0;
    },
    animate(dt: number, speedMps: number, steerRad: number): void {
      time += dt;
      spinAngle -= (speedMps * dt) / WHEEL_R;
      if (spinAngle < -1e4) spinAngle %= Math.PI * 2;
      for (let i = 0; i < 4; i++) spinGroups[i].rotation.x = spinAngle;
      wheelPivots[0].rotation.y = steerRad;
      wheelPivots[1].rotation.y = steerRad;
      // thruster easing
      const k = 1 - Math.exp(-dt * 7);
      thr += (thrTarget - thr) * k;
      if (thr < 0.004 && thrTarget === 0) thr = 0;
      const acceleration=hasSpeed&&dt>0?(speedMps-lastSpeed)/dt:0;
      lastSpeed=speedMps;hasSpeed=true;
      animateGas(dt,acceleration);
    },
    dispose(): void {
      root.removeFromParent();
      for (const o of owned) o.dispose();
    },
  };
  root.userData.dimensions = { length: 4.48, width: 2.0, height: 1.21 };
  body.scale.z=1.12;wheelPivots.forEach(w=>{w.position.z*=1.12;});
  root.userData.bodyMesh = bodyMesh;
  root.userData.designReference={url:'https://www.tesla.com/roadster',observed:'2026-10-21',style:'original low-poly Roadster interpretation',dimensions:'authored game scale',thrusterPlacement:'rear reference; underside and sides approximate'};
  return car;
}
