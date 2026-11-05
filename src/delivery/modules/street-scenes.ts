import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ModuleBase, distanceXZ, heading, numberParam } from './base';
import type { CharacterStyle, SceneCharacter } from './character';
import type { DeliveryModuleContext, DeliveryPoint, ModuleParams } from './types';
import { DELIVERY_PIZZA_BOX } from './pizza-box';
import { WeddingCrowd } from '../art/wedding-crowd';

const elapsed = (dt: number) => Math.max(0, Math.min(.1, Number.isFinite(dt) ? dt : 0));
const angleDifference = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// Legible physical signs without canvas textures, external fonts, or mobile
// compositing. Each sign joins its host's material batch, not a draw per letter.
const GLYPHS: Record<string, string[]> = {
  A:['01110','10001','10001','11111','10001','10001','10001'], B:['11110','10001','10001','11110','10001','10001','11110'],
  C:['01111','10000','10000','10000','10000','10000','01111'], D:['11110','10001','10001','10001','10001','10001','11110'],
  E:['11111','10000','10000','11110','10000','10000','11111'], F:['11111','10000','10000','11110','10000','10000','10000'],
  G:['01111','10000','10000','10111','10001','10001','01111'], H:['10001','10001','10001','11111','10001','10001','10001'],
  I:['111','010','010','010','010','010','111'], J:['00111','00010','00010','00010','10010','10010','01100'],
  K:['10001','10010','10100','11000','10100','10010','10001'], L:['10000','10000','10000','10000','10000','10000','11111'],
  M:['10001','11011','10101','10101','10001','10001','10001'], N:['10001','11001','10101','10011','10001','10001','10001'],
  O:['01110','10001','10001','10001','10001','10001','01110'], P:['11110','10001','10001','11110','10000','10000','10000'],
  Q:['01110','10001','10001','10001','10101','10010','01101'], R:['11110','10001','10001','11110','10100','10010','10001'],
  S:['01111','10000','10000','01110','00001','00001','11110'], T:['11111','00100','00100','00100','00100','00100','00100'],
  U:['10001','10001','10001','10001','10001','10001','01110'], V:['10001','10001','10001','10001','10001','01010','00100'],
  W:['10001','10001','10001','10101','10101','11011','10001'], X:['10001','10001','01010','00100','01010','10001','10001'],
  Y:['10001','10001','01010','00100','00100','00100','00100'], Z:['11111','00001','00010','00100','01000','10000','11111'],
  '0':['01110','10001','10011','10101','11001','10001','01110'], '1':['010','110','010','010','010','010','111'],
  '2':['01110','10001','00001','00010','00100','01000','11111'], '3':['11110','00001','00001','01110','00001','00001','11110'],
  '4':['10010','10010','10010','11111','00010','00010','00010'], '5':['11111','10000','10000','11110','00001','00001','11110'],
  '6':['01110','10000','10000','11110','10001','10001','01110'], '7':['11111','00001','00010','00100','01000','01000','01000'],
  '8':['01110','10001','10001','01110','10001','10001','01110'], '9':['01110','10001','10001','01111','00001','00001','01110'],
  '-':['000','000','000','111','000','000','000'],
};

/** Static scenery is merged by material inside this local scene. Temporary
 * source geometry is disposed immediately; only merged buffers stay resident. */
export class SceneBatch {
  private pending = new Map<string, THREE.BufferGeometry[]>();
  constructor(private own: <T extends THREE.BufferGeometry>(g: T) => T,
    private material: (color: string) => THREE.MeshBasicMaterial, private parent: THREE.Group) {}
  private add(geometry: THREE.BufferGeometry, color: string, position: THREE.Vector3, rotation?: THREE.Quaternion) {
    geometry.applyMatrix4(new THREE.Matrix4().compose(position, rotation ?? new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)));
    const batch = this.pending.get(color) ?? []; batch.push(geometry); this.pending.set(color, batch);
  }
  box(x: number, y: number, z: number, w: number, h: number, d: number, color: string, yaw = 0) {
    this.add(new THREE.BoxGeometry(w, h, d), color, new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw));
  }
  cylinder(x: number, y: number, z: number, radius: number, height: number, color: string, topRadius = radius) {
    this.add(new THREE.CylinderGeometry(topRadius, radius, height, 12), color, new THREE.Vector3(x, y, z));
  }
  rod(a: readonly number[], b: readonly number[], radius: number, color: string) {
    const from = new THREE.Vector3(...a as [number, number, number]), to = new THREE.Vector3(...b as [number, number, number]);
    const direction = to.clone().sub(from), length = direction.length(); if (length < .001) return;
    this.add(new THREE.CylinderGeometry(radius, radius, length, 6), color, from.add(to).multiplyScalar(.5),
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
  }
  sign(text: string, x: number, y: number, z: number, width: number, color = '#FFF2C9') {
    const chars = [...text.toUpperCase()];
    const columns = chars.reduce((sum, letter) => sum + (GLYPHS[letter]?.[0].length ?? 3) + 1, -1);
    const pixel = width / Math.max(1, columns); let cursor = -width / 2;
    for (const letter of chars) {
      const glyph = GLYPHS[letter];
      if (glyph) for (let row = 0; row < 7; row++) for (let column = 0; column < glyph[row].length; column++) {
        if (glyph[row][column] === '1') this.box(x + cursor + column * pixel, y + (3 - row) * pixel, z, pixel * .9, pixel * .9, .04, color);
      }
      cursor += ((glyph?.[0].length ?? 3) + 1) * pixel;
    }
  }
  flush(name: string) {
    for (const [color, sources] of this.pending) {
      const geometry = mergeGeometries(sources, false);
      for (const source of sources) source.dispose();
      if (geometry) { const mesh = new THREE.Mesh(this.own(geometry), this.material(color)); mesh.name = name; this.parent.add(mesh); }
    }
    this.pending.clear();
  }
}

/** A visible physical pizza pass also works for a gate/bucket with no actor.
 * The character factory remains the single likeness-release gate. */
abstract class StreetScene extends ModuleBase {
  private transfer: { elapsed: number; from: THREE.Vector3; to: () => THREE.Vector3; after: () => void; keep: boolean; instruction: string } | null = null;
  protected pizza: THREE.Group | null = null;
  private transferPoint = new THREE.Vector3();
  private actorCatchPoint = new THREE.Vector3();
  private releasingActor: { actor: SceneCharacter; remaining: number } | null = null;
  protected get transferArcHeight(){return 1.05;}
  protected releaseCatch(dt: number) {
    const release=this.releasingActor;if(!release)return;
    release.remaining=Math.max(0,release.remaining-elapsed(dt));
    release.actor.catchPose(release.remaining/.45);
    if(release.remaining===0)this.releasingActor=null;
  }
  protected get transferring() { return this.transfer !== null; }
  get exitPending() { return this.ready && this.ended && distanceXZ(this.ctx.player(), this.target) < 45; }
  /** Leaving the driving interaction is different from leaving the scenery.
   * Keep a completed property/actor visible when the player looks back. */
  get sceneryPending() { return this.ready && this.ended && distanceXZ(this.ctx.player(), this.ctx.destination) < 850; }
  protected override done() {
    if (!this.ended && this.unlocked()) {
      this.ring.visible = false;
      this.status.instruction = this.params.theme === 'salaar' ? 'Leave the courtyard through the open gates to continue' : 'Leave the delivery area to continue';
    }
    super.done();
  }
  protected grounded() {
    const p = this.ctx.player();
    return !p.flying && !p.descending && !p.jumping && p.y >= this.ctx.destination.y - .35 && p.y <= this.ctx.destination.y + 1.7;
  }
  override setup(ctx: DeliveryModuleContext, params: ModuleParams = {}) {
    super.setup(ctx, params);
    if (params.useExistingStreet) {
      this.root.rotation.y = numberParam(params, 'streetYaw', 0, -Math.PI * 2, Math.PI * 2);
      this.root.updateWorldMatrix(true, false);
      this.ring.position.copy(this.root.worldToLocal(new THREE.Vector3(this.target.x, this.target.y + .08, this.target.z)));
    }
  }
  protected batch(parent = this.root) { return new SceneBatch(g => this.own(g), color => this.mat(color), parent); }
  protected block(batch: SceneBatch, x: number, y: number, z: number, w: number, h: number, d: number, color: string) {
    batch.box(x, y, z, w, h, d, color);
    const origin = this.ctx.destination;
    this.bodies.push({ id: `delivery-street:${this.bodies.length}`, x: origin.x + x, y: origin.y + y, z: origin.z + z,
      hx: 0, hz: 1, halfWidth: w / 2, halfLength: d / 2, bottom: origin.y + y - h / 2, roof: origin.y + y + h / 2,
      previous: { x: origin.x + x, y: origin.y + y, z: origin.z + z, hx: 0, hz: 1 } });
  }
  protected actor(style: string, x: number, y: number, z: number, parent = this.root) {
    return this.character(style as CharacterStyle, x, y, z, false, parent);
  }
  protected localPoint(x: number, y: number, z: number) {
    const yaw = this.params.realCampusId ? Number(this.params.sceneYaw)||0 : this.params.useExistingStreet ? numberParam(this.params, 'streetYaw', 0, -Math.PI * 2, Math.PI * 2) : 0;
    return new THREE.Vector3(x * Math.cos(yaw) + z * Math.sin(yaw) + this.ctx.destination.x, y + this.ctx.destination.y, -x * Math.sin(yaw) + z * Math.cos(yaw) + this.ctx.destination.z);
  }
  protected streetTarget(x: number, z: number, label: string, notify = true) {
    const p = this.localPoint(x, 0, z), target = { x: p.x, y: p.y, z: p.z, label };
    if (notify) this.setTarget(target); else Object.assign(this.target, target);
    this.ring.position.set(x, .08, z);
  }
  protected scaleSet(scale: number) {
    if (scale === 1) return;
    for (const child of this.root.children) if (child instanceof THREE.Mesh && child !== this.ring) child.scale.set(scale, 1, scale);
    const d = this.ctx.destination;
    for (const body of this.bodies) {
      body.x = d.x + (body.x - d.x) * scale; body.z = d.z + (body.z - d.z) * scale;
      body.halfWidth *= scale; body.halfLength *= scale;
      Object.assign(body.previous, { x: body.x, z: body.z });
    }
  }
  protected makePizza() {
    if (this.pizza) return this.pizza;
    const group = new THREE.Group(); group.name = 'delivery-scene-pizza'; this.root.add(group);
    this.pizzaBox(group).name='delivery-pizza-box';
    group.visible = false; this.pizza = group; return group;
  }
  protected beginTransfer(to: () => THREE.Vector3, after: () => void, keepVisible = false, instruction = 'Passing the pizza…') {
    if (!this.unlocked() || this.ended || this.transfer) return;
    const player = this.ctx.player(), pizza = this.makePizza();
    this.transfer = { elapsed: 0, from: new THREE.Vector3(player.x, player.y + .5, player.z), to, after, keep: keepVisible, instruction };
    this.root.updateWorldMatrix(true, false); pizza.position.copy(this.root.worldToLocal(this.transfer.from.clone())); pizza.visible = true;
    this.failureTime = 0; this.dropFeedback = ''; this.status.failure = undefined;
    this.status.canDrop = false; this.status.instruction = instruction; this.ctx.cue?.('throw');
    this.ctx.sceneEvent?.('catchStarted',{character:'street-recipient'});
  }
  protected updateTransfer(dt: number) {
    this.releaseCatch(dt);
    const transfer = this.transfer; if (!transfer) return;
    this.status.canDrop = false; this.status.instruction = transfer.instruction;
    if (!this.unlocked()) return;
    transfer.elapsed += elapsed(dt); const t = Math.min(1, transfer.elapsed / .8);
    this.transferPoint.lerpVectors(transfer.from, transfer.to(), t); this.transferPoint.y += Math.sin(t * Math.PI) * this.transferArcHeight;
    this.root.updateWorldMatrix(true, false); this.pizza!.position.copy(this.root.worldToLocal(this.transferPoint));
    this.pizza!.rotation.y = Math.PI * 2 * t;
    if (t >= 1) { this.transfer = null; this.pizza!.visible = transfer.keep; transfer.after(); }
  }
  protected transferToActor(actor: SceneCharacter | null, fallback: () => THREE.Vector3, after: () => void) {
    this.beginTransfer(() => {
      if (actor?.group.visible && actor.catchPoint) {
        actor.catchPose(1); actor.catchPoint.updateWorldMatrix(true, false);
        this.actorCatchPoint.setFromMatrixPosition(actor.catchPoint.matrixWorld);
        if(actor.catchPointSpace!=='box-center')this.actorCatchPoint.y+=DELIVERY_PIZZA_BOX.palmToCentre;
        return this.actorCatchPoint;
      }
      return fallback();
    }, () => {
      if(actor){this.releasingActor={actor,remaining:.45};actor.receivePizza?.();}
      after();
    });
  }
  override teardown() { this.releasingActor?.actor.catchPose(0);this.releasingActor=null;this.transfer = null; this.pizza = null; super.teardown(); }
}

export class RopeBucket extends StreetScene {
  // The same0.8s pass must clear the actual1.7m basket walls from the safe
  // beside-basket bay. Other scene throws retain their original arc.
  protected override get transferArcHeight(){return 2.2;}
  override get story(){
    const frame=super.story;if(!frame)return undefined;
    const p=this.ctx.player(),d=this.ctx.destination,nx=numberParam(this.params,'facadeNormalX',0,-1,1),nz=numberParam(this.params,'facadeNormalZ',1,-1,1);
    const entry=frame.entry&&((p.x-d.x)*nx+(p.z-d.z)*nz>=-.25),tx=-this.roofNormal.y,tz=this.roofNormal.x;
    // The marker belongs to the basket, not a place to put the windscreen.
    // Keep an already-low approach on its nearer tangent side; crossing to a
    // fixed side would drive through the basket before reaching a clear bay.
    if(!this.bucketParkingSide&&entry){
      this.bucketParkingSide=Math.sign((p.x-d.x)*tx+(p.z-d.z)*tz)||-this.roofCameraSide;
      const a=Math.atan2(tx,tz),b=a+Math.PI;
      this.bucketParkingYaw=Math.abs(angleDifference(a,p.yaw))<=Math.abs(angleDifference(b,p.yaw))?a:b;
    }
    const side=this.bucketParkingSide||-this.roofCameraSide,distance=2.4+Math.abs(tx)*2.48+Math.abs(tz)*1.9+.4;
    const point=this.localPoint(tx*side*distance,.55,tz*side*distance);
    return {...frame,point,landing:{point,radius:3.15},yaw:this.bucketParkingYaw,entry};
  }
  private rooftop:SceneCharacter|null=null;
  private roofFocusPosition=new THREE.Vector3();
  private roofFocusTarget=new THREE.Vector3();
  private roofFocus={position:this.roofFocusPosition,target:this.roofFocusTarget,context:'stationary-handoff' as const};
  private bucketFocusPosition=new THREE.Vector3();
  private bucketFocusTarget=new THREE.Vector3();
  private bucketFocus={position:this.bucketFocusPosition,target:this.bucketFocusTarget,context:'stationary-handoff' as const};
  private roofLight=new THREE.Vector3();
  private roofLightLocal=new THREE.Vector3();
  private roofNormal=new THREE.Vector2(0,1);
  private roofCameraSide=1;
  private bucketParkingSide=0;
  private bucketParkingYaw=0;
  private roofLightRequest={position:this.roofLight,kind:'porch' as const};
  get sceneLamp(){
    if(!this.ended||!this.cameraFocus||!this.rooftop)return undefined;
    this.root.localToWorld(this.roofLight.copy(this.roofLightLocal));return this.roofLightRequest;
  }
  get cameraFocus(){
    if(this.ready&&!this.ended&&this.ctx.storyActive?.()&&this.bucket){
      const height=this.bucket.position.y,side=this.bucketParkingSide?-this.bucketParkingSide:this.roofCameraSide;
      const nx=this.roofNormal.x,nz=this.roofNormal.y,x=nx*1.5-nz*side*7.5,z=nz*1.5+nx*side*7.5;
      // The basket keeps its actual world-axis panels, even at a rotated
      // frontage. Look down over its1.7m walls so the40cm carton is visible;
      // stay in the narrow street-side strip, not the opposite building.
      const above=Math.max(Math.abs(x)/2.35,Math.abs(z)/1.82)*1.65;
      this.root.updateWorldMatrix(true,false);
      this.root.localToWorld(this.bucketFocusPosition.set(x,height*1.35+4.23+above,z));
      this.root.localToWorld(this.bucketFocusTarget.set(0,height*.55+2.4,0));
      return this.bucketFocus;
    }
    if(!this.ready||!this.ended||!this.ctx.storyActive?.()||!this.charactersReady||!this.rooftop||this.rooftop.group.userData.characterRelease==='withheld')return undefined;
    const actor=this.rooftop.group.position;this.root.updateWorldMatrix(true,false);
    const nx=this.roofNormal.x,nz=this.roofNormal.y,side=this.roofCameraSide;
    // Actor and camera stay on the same tangent side of the winch. The old
    // fixed world-axis shot could put its near plane inside the pulley brace.
    this.root.localToWorld(this.roofFocusPosition.set(actor.x+nx*2.7-nz*side*.9,actor.y+1.6,actor.z+nz*2.7+nx*side*.9));
    this.root.localToWorld(this.roofFocusTarget.set(actor.x,actor.y+1.1,actor.z));return this.roofFocus;
  }
  private bucket!: THREE.Group;
  private rope!: THREE.Mesh;
  private phase: 'waiting' | 'lowering' | 'ready' | 'passing' | 'raising' = 'waiting';
  private top = 18;
  private low = 1.1;
  protected build() {
    this.phase = 'waiting';this.bucketParkingSide=0;this.bucketParkingYaw=0; this.top = numberParam(this.params, 'roofHeight', 18, 5, 70); this.low = 1.1;
    const b = this.batch();
    // An original Paradise-inspired restaurant facade: stacked dining floors,
    // green band, red name fascia, public entrance and a rooftop service winch.
    if (!this.params.useExistingFacade) {
    this.block(b, 0, this.top / 2, -11, 26, this.top, 15, '#E3D2B3');
    for (let floor = 0; floor < 4; floor++) {
      const y = 2.1 + floor * 3.8;
      b.box(0, y, -3.42, 24, 2.3, .18, '#344D49');
      for (let x = -11; x <= 11; x += 3.65) b.box(x, y, -3.23, .2, 2.5, .4, '#F0E5D1');
      b.box(0, y + 1.45, -3.1, 26.3, .45, .7, '#75684E');
    }
    b.box(0, 5.7, -2.85, 25, 2.1, .45, '#A52424'); b.sign('PARADISE', 0, 5.7, -2.58, 20);
    b.box(0, .9, -3.16, 5.8, 1.8, .15, '#182B2B'); b.box(0, .1, -.8, 16, .2, 5, '#C6BDAA');
    b.box(0, this.top + .2, -10, 27, .4, 16, '#706C5C');
    } else {
      const nx = numberParam(this.params, 'facadeNormalX', 0, -1, 1), nz = numberParam(this.params, 'facadeNormalZ', 1, -1, 1);
      const fascia = new THREE.Group(); fascia.name = 'delivery-existing-paradise-sign';
      fascia.position.set(-nx * 4.05, Math.min(this.top - 1.8, Math.max(3.5, this.top * .45)), -nz * 4.05);
      fascia.rotation.y = Math.atan2(nx, nz); this.root.add(fascia);
      const sign = this.batch(fascia); sign.box(0, 0, 0, 8.6, 1.45, .14, '#A52424'); sign.sign('PARADISE', 0, 0, .1, 7.9); sign.flush('delivery-paradise-fascia');
    }
    const anchorX = numberParam(this.params, 'winchAnchorX', 0, -20, 20), anchorZ = numberParam(this.params, 'winchAnchorZ', -3, -20, 20);
    b.box(anchorX, this.top + 2.2, anchorZ, .5, 4.4, .5, '#494638');
    b.rod([anchorX, this.top + 4.2, anchorZ], [0, this.top + 4.2, 0], .23, '#494638');
    b.rod([anchorX, this.top + 1.8, anchorZ], [0, this.top + 4.2, 0], .11, '#494638');
    b.cylinder(0, this.top + 3.4, 0, .48, .55, '#A59364');
    this.roofNormal.set(numberParam(this.params,'facadeNormalX',0,-1,1),numberParam(this.params,'facadeNormalZ',1,-1,1));
    if(this.roofNormal.lengthSq()<.01)this.roofNormal.set(0,1);else this.roofNormal.normalize();
    this.roofCameraSide=numberParam(this.params,'rooftopCameraSide',1,-1,1)<0?-1:1;
    const nx=this.roofNormal.x,nz=this.roofNormal.y,side=this.roofCameraSide;
    const actorX=numberParam(this.params,'rooftopActorX',anchorX-nx*1.3-nz*side*1.8,-40,40);
    const actorZ=numberParam(this.params,'rooftopActorZ',anchorZ-nz*1.3+nx*side*1.8,-40,40);
    const floorY=this.top+(this.params.useExistingFacade?0:.4);
    const lampX=actorX+nx*1.6+nz*side*.4,lampZ=actorZ+nz*1.6-nx*side*.4;
    b.cylinder(lampX,floorY+1.35,lampZ,.045,2.7,'#494638');
    b.box(lampX,floorY+2.78,lampZ,.7,.12,.25,'#494638');
    b.box(lampX,floorY+2.7,lampZ,.4,.025,.18,'#FFE0B0');
    this.roofLightLocal.set(lampX,floorY+2.7,lampZ);
    b.flush('delivery-paradise-facade');
    // The same exact-asset release gate as every other scene owns this actor.
    // Unreviewed art remains an empty rig, never a generic celebrity stand-in.
    this.rooftop=this.actor('odela',actorX,floorY,actorZ);
    this.rooftop.group.rotation.y=Math.atan2(nx,nz);
    this.bucket = new THREE.Group(); this.bucket.name = 'delivery-rope-bucket'; this.bucket.position.set(0, this.top - 1, 0); this.root.add(this.bucket);
    const basket = this.batch(this.bucket);
    basket.box(0, 0, 0, 4.8, .22, 3.8, '#625A4A'); basket.box(-2.35, .8, 0, .16, 1.7, 3.8, '#A7966B');
    basket.box(2.35, .8, 0, .16, 1.7, 3.8, '#A7966B'); basket.box(0, .8, -1.82, 4.8, 1.7, .16, '#A7966B');
    basket.box(0, .32, 1.82, 4.8, .7, .16, '#A7966B');
    for (const z of [-1.9, 1.9]) for (const y of [.1, .7]) basket.box(0, y, z, 4.95, .1, .12, '#4D4C45');
    basket.rod([-2.25, 1.6, 0], [0, 3.1, 0], .065, '#C3B797'); basket.rod([2.25, 1.6, 0], [0, 3.1, 0], .065, '#C3B797');
    basket.flush('delivery-bucket-shell');
    this.rope = new THREE.Mesh(this.own(new THREE.CylinderGeometry(.065, .065, 1, 6)), this.mat('#B8A479'));
    this.rope.name = 'delivery-bucket-rope'; this.root.add(this.rope); this.makePizza();
    this.setTarget({ ...this.ctx.destination, y: this.ctx.destination.y + this.low, label: this.ctx.destination.label || 'Paradise service bucket' });
    this.status = { instruction: 'Approach the Paradise entrance', canDrop: false, actionLabel: 'PLACE PIZZA' };
    this.updateRope();
  }
  private updateRope() {
    const high = this.top + 3.4, low = this.bucket.position.y + 3.1, length = Math.max(.1, high - low);
    this.rope.scale.y = length; this.rope.position.set(0, low + length / 2, 0);
  }
  update(dt: number) {
    if(this.ready)this.rooftop?.animate?.(elapsed(dt),'idle',1);
    if (!this.tick(dt)) return;
    const step = elapsed(dt), close = distanceXZ(this.ctx.player(), this.ctx.destination) < 42;
    if (this.phase === 'waiting' && close) this.phase = 'lowering';
    if (this.phase === 'lowering') {
      this.bucket.position.y = Math.max(this.low, this.bucket.position.y - step * 3.4);
      if (this.bucket.position.y <= this.low) this.phase = 'ready';
    } else if (this.phase === 'raising') {
      this.bucket.position.y = Math.min(this.top - 1, this.bucket.position.y + step * 4.2);
      if (this.pizza) this.pizza.position.set(0, this.bucket.position.y + .23, 0);
      if (this.bucket.position.y >= this.top - 1) { if(this.pizza)this.pizza.visible=false;this.rooftop?.receivePizza?.();this.done(); return; }
    }
    this.updateRope();
    this.status.canDrop = this.phase === 'ready' && this.unlocked() && this.grounded() && this.within(6.5, 3.5) && Math.abs(this.ctx.player().speed) < 2;
    this.status.instruction = this.phase === 'raising' ? 'Pizza on its way to the roof' : this.phase === 'passing' ? 'Placing the pizza…'
      : this.phase === 'ready' ? 'Place the pizza in the bucket' : this.phase === 'waiting' ? 'Approach the Paradise entrance' : 'The bucket is coming down';
    this.updateTransfer(dt);
  }
  onDrop() {
    if (!this.unlocked() || this.ended || this.transferring || this.phase === 'raising') return;
    if (!this.status.canDrop || !this.grounded()) { this.fail('Park beside the lowered bucket.'); return; }
    this.phase = 'passing';
    this.beginTransfer(() => this.localPoint(0, this.bucket.position.y + .23, 0), () => { this.phase = 'raising'; }, true, 'Placing the pizza…');
  }
}

export type GateTheme = 'haunted' | 'college' | 'villa' | 'salaar';

export class GateDelivery extends StreetScene {
  override get story(){
    const frame=super.story;if(!frame)return undefined;
    const p=this.ctx.player(),d=this.ctx.destination,s=numberParam(this.params,'sceneScale',1,.5,1),dx=p.x-d.x,dz=p.z-d.z;
    if(this.params.realCampusId)return {...frame,entry:frame.entry&&distanceXZ(p,this.target)<9,yaw:Number(this.params.sceneYaw)||0};
    if(this.theme!=='salaar')return{...frame,entry:frame.entry&&dz>=1&&Math.abs(dx)<14&&distanceXZ(p,this.target)<16};
    const inside=Math.abs(dx)<19*s&&dz< -8.5*s&&dz> -43*s;
    const atGate=Math.abs(dx)<8*s&&dz>=-6*s&&dz<18*s;
    const point=!inside&&(Math.abs(dx)>.35||this.opening<1)?{x:d.x,y:d.y+.55,z:d.z+4*s}:frame.point;
    return {...frame,entry:frame.entry&&(inside||atGate),point,landing:{point,radius:3.15},yaw:0};
  }
  private theme: GateTheme = 'haunted';
  private receiver: SceneCharacter | null = null;
  private doors: THREE.Group[] = [];
  private opening = 0;
  private doorBodies: number[] = [];
  private porchLocal=new THREE.Vector3();
  private porchWorld=new THREE.Vector3();
  private porchRequest={position:this.porchWorld,kind:'reading' as const};
  private villaPorchRequest={position:this.porchWorld,kind:'porch' as const};
  private hauntedLanternRequest={position:this.porchWorld,kind:'lantern' as const};
  private focusPosition=new THREE.Vector3();
  private focusTarget=new THREE.Vector3();
  private gateFocus={position:this.focusPosition,target:this.focusTarget,context:'stationary-handoff' as const};
  private nearHauntedReceiver(){
    return this.ready&&this.theme==='haunted'&&!!this.receiver?.group.visible&&
      this.receiver.group.userData.characterRelease!=='withheld'&&this.grounded()&&this.within(9,3);
  }
  get headlightGain(){return this.nearHauntedReceiver() ? .02 : undefined;}
  get hideWorldGuidance(){return this.theme==='haunted'&&!!this.cameraFocus;}
  get intentionalStop(){return this.nearHauntedReceiver()&&Math.abs(this.ctx.player().speed)<=.8;}
  get sceneLamp(){
    if(!this.ready||!['haunted','college','villa','salaar'].includes(this.theme)||!this.receiver?.group.visible||distanceXZ(this.ctx.player(),this.target)>35)return undefined;
    if(this.theme==='haunted'&&this.receiver.group.userData.characterRelease==='withheld')return undefined;
    this.root.updateWorldMatrix(true,false);this.porchWorld.copy(this.porchLocal);this.root.localToWorld(this.porchWorld);
    return this.theme==='haunted'?this.hauntedLanternRequest:['villa','salaar'].includes(this.theme)?this.villaPorchRequest:this.porchRequest;
  }
  get cameraFocus(){
    if(!this.ready||!this.charactersReady||!['haunted','college','villa','salaar'].includes(this.theme)||!this.receiver?.group.visible||!this.grounded())return undefined;
    if(this.receiver.group.userData.characterRelease==='withheld')return undefined;
    const p=this.ctx.player();if(Math.abs(p.speed)>.75||distanceXZ(p,this.target)>9)return undefined;
    const actor=this.receiver.group.position;this.root.updateWorldMatrix(true,false);
    const close=this.theme==='salaar'&&this.ended&&this.ctx.storyActive?.();
    this.root.localToWorld(this.focusPosition.set(actor.x+(close?1.1:1.8),1.7,actor.z+(close?2.7:4.2)));
    this.root.localToWorld(this.focusTarget.set(actor.x,1.1,actor.z));return this.gateFocus;
  }
  override get exitPending() {
    if (!this.ready || !this.ended) return false;
    if (this.theme !== 'salaar') return super.exitPending;
    const p = this.ctx.player(), d = this.ctx.destination, scale = numberParam(this.params, 'sceneScale', 1, .5, 1);
    const sx = Math.abs(Math.sin(p.yaw)), sz = Math.abs(Math.cos(p.yaw)), halfX = sx * 2.4 + sz * 1.15, halfZ = sz * 2.4 + sx * 1.15;
    const dx = p.x - d.x, dz = p.z - d.z;
    return dz - halfZ <= 4.5 * scale + 1 && Math.abs(dx) - halfX <= 28.5 * scale + 1 && dz + halfZ >= -52 * scale - 1 && p.y - .55 < d.y + 34;
  }
  protected build() {
    this.theme = (['haunted', 'college', 'villa', 'salaar'].includes(String(this.params.theme)) ? this.params.theme : 'haunted') as GateTheme;
    this.receiver = null; this.doors = []; this.doorBodies = []; this.opening = 0;
    const b = this.batch();
    if(this.params.realCampusId==='nizam_college'){this.root.rotation.y=Number(this.params.sceneYaw)||0;this.receiver=this.actor('hasini',-3.2,0,-7);}
    else if (this.params.useExistingFacade && ['college', 'villa'].includes(this.theme)) this.entranceOnly(b);
    else if (this.theme === 'haunted') this.haunted(b);
    else if (this.theme === 'college') this.college(b);
    else if (this.theme === 'villa') this.villa(b);
    else this.salaar(b);
    b.flush(`delivery-${this.theme}-architecture`);
    const scale = ['haunted', 'salaar'].includes(this.theme) ? numberParam(this.params, 'sceneScale', 1, .5, 1) : 1;
    this.scaleSet(scale);
    if (this.receiver) { this.receiver.group.position.x *= scale; this.receiver.group.position.z *= scale; }
    if(this.theme==='haunted'){
      // Borrow the existing left gate lantern, including the actual X/Z set
      // scale. No new light or fixture is added to the haunted property.
      this.porchLocal.set(-9*scale,6.1,-3.75*scale);
    }
    if(this.theme==='salaar'){this.porchLocal.x*=scale;this.porchLocal.z*=scale;}
    if(this.receiver&&['college','villa'].includes(this.theme)){
      const actor=this.receiver.group.position,x=actor.x+1.4,z=actor.z+1.5;
      // A small entrance light stands beside the human opening, outside the
      // Roadster's driving corridor. It borrows a pre-existing engine slot.
      b.cylinder(x,1.5,z,.045,3,'#596166');b.box(x-.4,3,z,.9,.12,.24,'#444D50');
      b.box(x-.8,2.94,z,.32,.025,.18,'#FFE0B0');b.flush('delivery-entrance-light');
      this.porchLocal.set(x-.8,2.91,z);
    }
    for (const door of this.doors) { door.position.x *= scale; door.position.z *= scale; door.scale.set(scale, 1, scale); }
    const labels: Record<GateTheme, string> = { haunted: 'Mansion gate', college: 'College gate', villa: 'Villa entrance', salaar: 'Fortified courtyard' };
    this.setTarget({ ...this.ctx.destination, z: this.ctx.destination.z + (this.theme === 'salaar' ? -21 * scale : this.params.realCampusId ? 0 : 2), label: this.ctx.destination.label || labels[this.theme] });
    this.status = { instruction: this.theme === 'salaar' ? 'Enter through the great gates' : 'Stop by the gate', canDrop: false, actionLabel: 'DELIVER' };
  }
  private entranceOnly(b: SceneBatch) {
    const college = this.theme === 'college', height = college ? 5.6 : 3.6, wall = college ? '#C5B28F' : '#E9E2D1';
    // An original exterior fragment at the public approach. It includes a
    // real entrance opening, windows, a short covered corridor and masonry,
    // without replacing or painting over any existing city building.
    this.block(b, -7.25, 2.05, -5.5, 5.5, 4.1, .5, wall);
    this.block(b, 1.55, 2.05, -5.5, 6.9, 4.1, .5, wall);
    this.block(b, -9.8, 2.05, -7.55, .4, 4.1, 4.6, wall);
    this.block(b, 4.8, 2.05, -7.55, .4, 4.1, 4.6, wall);
    b.box(-2.5, -.045, -7.1, 15, .09, 6.2, '#BDB39E');
    b.box(-2.5, 4.2, -7.3, 15.5, .3, 5.8, college ? '#847967' : '#635C50');
    b.box(-3.2, 1.65, -9.65, 2.6, 3.3, .12, '#2D4243');
    for (const x of [-7.1, 1.6]) {
      b.box(x, 2.15, -5.18, 3.3, 2.3, .11, '#344D53');
      b.box(x, 2.15, -5.08, .12, 2.35, .12, '#E6DDCA');
      b.box(x, 2.15, -5.08, 3.4, .12, .12, '#E6DDCA');
    }
    for (const x of [-6.7, .7]) this.block(b, x, height / 2, -2, .8, height, .8, college ? '#A48D6C' : '#B6A58C');
    if (college) {
      b.box(-2.95, 5.4, -2, 8.3, 1.2, .75, '#344F49'); b.sign(String(this.params.sign ?? 'COLLEGE'), -2.95, 5.4, -1.58, 7.65);
      b.box(-2.5, 6.2, -5.45, 15, 2.2, .5, '#D5C7A9');
      for (const x of [-7.1, -2.6, 1.6]) { b.box(x, 6.15, -5.12, 2.9, 1.4, .11, '#344D53'); b.box(x, 6.15, -5.04, .1, 1.45, .1, '#EDE3CD'); }
      b.box(-7, .5, -7.5, 3, .18, .75, '#735E43');
      for (const x of [-8.1, -5.9]) b.box(x, .24, -7.5, .14, .48, .6, '#594F43');
    } else {
      b.box(-2.5, 5.6, -7.3, 15.1, 2.6, 4.5, '#DED5C3');
      for (const x of [-7, 1.5]) {
        b.box(x, 5.7, -4.96, 3.1, 1.65, .12, '#3B5559');
        for (let offset = -1.4; offset <= 1.4; offset += .35) b.box(x + offset, 5.7, -4.81, .08, 1.75, .1, '#75614A');
      }
      b.box(-2.5, 7, -7.2, 15.6, .22, 5.6, '#62594D');
      b.box(-.5, 2.2, -1.52, 2.8, .95, .12, '#51483D');
      b.sign(`VILLA ${Math.round(numberParam(this.params, 'villaNumber', 79, 1, 999))}`, -.5, 2.2, -1.42, 2.5);
      for (const x of [-7.1, .9]) { b.cylinder(x, .45, -4.6, .55, .9, '#826F56'); b.cylinder(x, 1.25, -4.6, .85, 1.05, '#3E6B4D', .45); }
    }
    // Two short fence wings leave the central human entry open and keep the
    // Roadster's separate handoff/approach corridor entirely unobstructed.
    for (const [from, to] of [[-7, -4.45], [-1.95, 1]]) {
      for (let x = from; x <= to; x += .35) b.box(x, 1.3, -2, .075, 2.6, .075, '#3D4644');
      b.box((from + to) / 2, .6, -2, to - from, .08, .09, '#3D4644');
      b.box((from + to) / 2, 2.15, -2, to - from, .08, .09, '#3D4644');
    }
    this.receiver = this.actor(college ? 'hasini' : 'maruthi', -3.2, 0, -3.4);
  }
  private haunted(b: SceneBatch) {
    this.block(b, 0, 7.2, -26, 31, 14.4, 16, '#3B3B43');
    this.block(b, -13, 10, -23, 7, 20, 12, '#4B4850'); this.block(b, 13, 10, -23, 7, 20, 12, '#4B4850');
    b.cylinder(-13, 22.5, -23, 5.3, 5.3, '#252733', .02); b.cylinder(13, 22.5, -23, 5.3, 5.3, '#252733', .02);
    b.box(0, 16, -25, 33, .75, 18, '#292A34');
    for (const x of [-9, 0, 9]) for (const y of [4, 10]) {
      b.box(x, y, -17.85, 3.7, 4.6, .15, '#101B22');
      b.box(x, y, -17.7, .18, 4.6, .1, '#737073'); b.box(x, y, -17.7, 3.7, .2, .1, '#737073');
    }
    for (const x of [-9, 9]) this.block(b, x, 3.8, -5, 1.6, 7.6, 1.6, '#58535B');
    for (const side of [-1, 1]) {
      this.block(b, side * 17.5, 2, -5, 16, 4, 1, '#373741');
    }
    for (let x = -8; x <= 8; x += .7) {
      const height = 4.5 + (1 - Math.abs(x) / 8) * 1.2;
      b.box(x, height / 2 + .15, -5, .075, height, .09, '#24232C');
      b.cylinder(x, height + .35, -5, .12, .35, '#24232C', 0);
    }
    b.box(0, 1.4, -5, 16, .12, .12, '#706572'); b.box(0, 4.3, -5, 16, .12, .12, '#706572');
    // Radial webs at both gate corners and a broken upstairs window.
    for (const [cx, cy, cz, size] of [[-8.4, 6.8, -4.8, 4.7], [8.4, 6.8, -4.8, 3.9], [1.6, 12, -17.6, 3]]) {
      for (let i = 0; i <= 5; i++) {
        const angle = (i / 5) * Math.PI / 2, direction = cx < 0 ? 1 : -1;
        b.rod([cx, cy, cz], [cx + Math.cos(angle) * size * direction, cy - Math.sin(angle) * size, cz], .018, '#B9B3BD');
      }
      for (let ring = 1; ring <= 4; ring++) for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI / 2, c = (i + 1) / 5 * Math.PI / 2, r = size * ring / 4, direction = cx < 0 ? 1 : -1;
        b.rod([cx + Math.cos(a) * r * direction, cy - Math.sin(a) * r, cz], [cx + Math.cos(c) * r * direction, cy - Math.sin(c) * r, cz], .014, '#B9B3BD');
      }
    }
    for (const side of [-1, 1]) {
      const x = side * 20;
      b.rod([x, 0, -14], [x - side, 8, -14], .32, '#34302F');
      b.rod([x - side, 5, -14], [x - side * 4, 8.8, -14], .16, '#34302F');
      b.rod([x - side, 6.7, -14], [x + side * 2, 10.4, -14], .12, '#34302F');
      b.rod([x - side * 3, 7.6, -14], [x - side * 5.3, 8, -13], .08, '#34302F');
      b.box(side * 9, 6.1, -4.1, .8, 1.1, .65, '#36312F');
      b.box(side * 9, 6.1, -3.75, .43, .65, .05, '#D4A759');
    }
    this.receiver = this.actor('arundhati', -3, 0, -7);
  }
  private college(b: SceneBatch) {
    this.block(b, 0, 7, -32, 45, 14, 14, '#E7D6B5');
    for (const x of [-16, -8, 0, 8, 16]) for (const y of [3, 7, 11]) {
      b.box(x, y, -24.9, 4.8, 2.6, .15, '#344D53');
      b.box(x, y, -24.72, .14, 2.6, .15, '#ECE5D4');
    }
    for (const x of [-9, 9]) this.block(b, x, 3.5, -6, 2.1, 7, 2.4, '#B59B79');
    b.box(0, 7.2, -6, 20.8, 1.7, 2.6, '#344F49'); b.sign(String(this.params.sign ?? 'DEGREE COLLEGE'), 0, 7.2, -4.64, 17.5);
    for (const side of [-1, 1]) {
      this.block(b, side * 22, 1.6, -6, 24, 3.2, .8, '#BCB7A5');
      for (let i = 0; i < 12; i++) b.box(side * (11.5 + i * 1.7), 3.8, -6, .12, 1.7, .12, '#303B3F');
    }
    b.box(0, -.05, -14, 16, .1, 35, '#C4B9A2');
    // Hasini remains partly sheltered by the pillar, as requested.
    this.receiver = this.actor('hasini', -6.8, 0, -8.7);
  }
  private villa(b: SceneBatch) {
    this.block(b, -6, 5.5, -24, 23, 11, 15, '#E8E1CF'); this.block(b, 9, 4, -23, 9, 8, 17, '#B7A387');
    b.box(-6, 7, -16.3, 22, 2.8, .25, '#303F42'); b.box(-6, 2.8, -16.3, 17, 3.8, .2, '#303F42');
    b.box(0, 11.2, -24, 34, .45, 18, '#5E574C'); b.box(-6, 5.4, -14.8, 24, .6, 3.1, '#6A6255');
    for (const x of [-8.5, 8.5]) this.block(b, x, 2.2, -6, 2, 4.4, 2, '#B6A58C');
    for (const x of [-19, 19]) this.block(b, x, 1.9, -6, 19, 3.8, .7, '#D6C9B1');
    b.box(0, .02, -14, 15, .04, 28, '#A69D8B');
    b.box(11, 2.8, -4.92, 4.8, 1.7, .12, '#51483D');
    b.sign(`VILLA ${Math.round(numberParam(this.params, 'villaNumber', 79, 1, 999))}`, 11, 2.8, -4.8, 4.1);
    for (const side of [-1, 1]) {
      b.cylinder(side * 12, .8, -12, 1.2, 1.6, '#786D58');
      b.cylinder(side * 12, 2, -12, 1.9, 1.4, '#3A6043', .9);
    }
    this.receiver = this.actor('maruthi', 4, 0, -10);
  }
  private salaar(b: SceneBatch) {
    for (const side of [-1, 1]) this.block(b, side * 25, 16, -23, 6, 32, 54, '#4B4C48');
    this.block(b, 0, 16, -49, 55, 32, 5, '#55544E');
    for (const side of [-1, 1]) this.block(b, side * 19.5, 16, -5, 17, 32, 5, '#4B4C48');
    this.block(b, 0, 29.5, -5, 24, 5, 6, '#373A39');
    for (const side of [-1, 1]) for (let z = -43; z <= 0; z += 12) b.box(side * 21.8, 16, z, .35, 31, 1, '#6A685C');
    b.box(0, -.06, -22, 43, .12, 52, '#7D7565');
    for (const side of [-1, 1]) {
      const group = new THREE.Group(); group.name = 'delivery-salaar-sliding-gate'; group.position.set(side * 5.4, 12, -5); this.root.add(group); this.doors.push(group);
      const door = this.batch(group); door.box(0, 0, 0, 10.6, 24, 1.5, '#252E30');
      for (const x of [-4.5, 0, 4.5]) door.box(x, 0, .8, .4, 23, .16, '#797264');
      for (const y of [-10, -5, 0, 5, 10]) door.box(0, y, .8, 10.3, .35, .15, '#797264');
      door.flush('delivery-salaar-gate-metal');
      const index = this.bodies.length, d = this.ctx.destination;
      this.bodies.push({ id: `delivery-sliding-gate:${side}`, x: d.x + side * 5.4, y: d.y + 12, z: d.z - 5,
        hx: 0, hz: 1, halfWidth: 5.3, halfLength: .75, bottom: d.y, roof: d.y + 24,
        previous: { x: d.x + side * 5.4, y: d.y + 12, z: d.z - 5, hx: 0, hz: 1 } });
      this.doorBodies.push(index);
    }
    b.box(-17, 5, -33, 5, 10, 6, '#665C4B'); b.box(17, 4, -38, 6, 8, 8, '#665C4B');
    b.cylinder(4.3,1.55,-21.5,.055,3.1,'#494638');
    b.box(4.3,3.18,-21.5,.7,.14,.28,'#252E30');b.box(4.3,3.1,-21.5,.4,.025,.18,'#FFE0B0');
    this.receiver=this.actor('salaar',2.8,0,-23);
    this.porchLocal.set(4.3,3.1,-21.5);
  }
  private updateDoors(dt: number) {
    if (this.theme === 'salaar') {
      const near = distanceXZ(this.ctx.player(), this.ctx.destination) < 48;
      this.opening = Math.min(1, this.opening + (near ? elapsed(dt) / 2.4 : 0));
      for (let i = 0; i < this.doors.length; i++) {
        const side = i === 0 ? -1 : 1, door = this.doors[i], body = this.bodies[this.doorBodies[i]];
        Object.assign(body.previous, { x: body.x, y: body.y, z: body.z, hx: body.hx, hz: body.hz });
        door.position.x = side * (5.4 + 11 * this.opening) * numberParam(this.params, 'sceneScale', 1, .5, 1); body.x = this.ctx.destination.x + door.position.x;
      }
    }
  }
  update(dt: number) {
    if (this.ready && this.ended) { this.receiver?.animate?.(elapsed(dt), 'idle', 1); this.releaseCatch(dt);this.updateDoors(dt); this.status.canDrop = false; return; }
    if (!this.tick(dt)) return;
    this.receiver?.animate?.(elapsed(dt), 'idle', 1); this.updateDoors(dt);
    if(this.theme==='haunted')this.ring.visible=!this.hideWorldGuidance;
    const p = this.ctx.player(), scale = numberParam(this.params, 'sceneScale', 1, .5, 1);
    const halfZ = Math.abs(Math.cos(p.yaw)) * 2.4 + Math.abs(Math.sin(p.yaw)) * 1.15;
    const inside = this.theme !== 'salaar' || p.z + halfZ < this.ctx.destination.z - 8.5 * scale;
    this.status.canDrop = !this.transferring && this.unlocked() && this.grounded() && inside && this.within(7, 3) && Math.abs(p.speed) <= 2;
    this.status.instruction = this.status.canDrop ? 'Deliver the pizza here' : this.theme === 'salaar' ? 'Enter the courtyard and slow down' : 'Slow down by the gate';
    this.updateTransfer(dt);
  }
  onDrop() {
    if (!this.unlocked() || this.ended || this.transferring) return;
    if (!this.status.canDrop || !this.grounded()) { this.fail('Land, come closer and stop safely at the delivery point.'); return; }
    const fallback = () => new THREE.Vector3(this.target.x, this.target.y + .45, this.target.z - 1.5);
    // A drop at Arundhati's gate never forces a collection animation.
    if (this.theme === 'haunted' || this.theme === 'salaar') {
      const scale=numberParam(this.params,'sceneScale',1,.5,1),d=this.ctx.destination;
      // A leave-at-gate delivery stays on the paving, beside the car's full
      // footprint. It must not hover at waist height or vanish before leaving.
      const floorDrop=()=>new THREE.Vector3(this.target.x+1.8,d.y+DELIVERY_PIZZA_BOX.palmToCentre,
        this.theme==='haunted'?d.z-5*scale+.7:this.target.z-1.5);
      this.beginTransfer(floorDrop, () => this.done(),true);
    }
    else this.transferToActor(this.receiver, fallback, () => this.done());
  }
}

export class WalkingHandoff extends StreetScene {
  override get story(){
    const frame=super.story;if(!frame)return undefined;
    const side=numberParam(this.params,'walkSide',-3.5,-4,-1.5),point=this.localPoint(side+3.1,.55,this.localZ);
    const streetYaw=this.params.useExistingStreet?numberParam(this.params,'streetYaw',0,-Math.PI*2,Math.PI*2):0;
    return {...frame,point,landing:{point,radius:3.15},yaw:streetYaw+(this.direction<0?0:Math.PI),speed:Math.max(.3,Math.min(1.8,Math.abs(this.walkSpeed))),maxSpeed:4};
  }
  private receiver: SceneCharacter | null = null;
  private localZ = 0;
  private previousZ = 0;
  private walkSpeed = 0;
  private direction = -1;
  private streetLampWorld=new THREE.Vector3();
  private streetLampRequest={position:this.streetLampWorld,kind:'street-scene' as const};
  private focusPosition=new THREE.Vector3();
  private focusTarget=new THREE.Vector3();
  private walkingFocus={position:this.focusPosition,target:this.focusTarget};
  get cameraFocus(){
    if(!this.ready||!this.ctx.storyActive?.()||!this.charactersReady||!this.receiver?.group.visible||
      this.receiver.group.userData.characterRelease==='withheld'||distanceXZ(this.ctx.player(),this.target)>35)return undefined;
    // Follow the actor's real facing direction, including her return walk.
    // Stay on the road side, ahead of the beside-her car, rather than behind
    // its cabin where her face and the physical handoff would disappear.
    const actor=this.receiver.group;actor.updateWorldMatrix(true,false);
    actor.localToWorld(this.focusPosition.set(this.direction<0?-1.8:1.8,1.65,3.8));
    actor.localToWorld(this.focusTarget.set(0,1.05,0));return this.walkingFocus;
  }
  get sceneLamp(){
    if(!this.ready||distanceXZ(this.ctx.player(),this.target)>35)return undefined;
    const length=numberParam(this.params,'walkLength',70,20,140),side=numberParam(this.params,'walkSide',-3.5,-4,-1.5);
    // Light the front of the walking customer from the next real fixture in
    // her direction of travel, rather than illuminating only her hair/back.
    const lampZ=this.direction<0?-Math.min(length,(Math.floor(-this.localZ/12)+1)*12):-Math.max(0,(Math.ceil(-this.localZ/12)-1)*12);
    this.root.updateWorldMatrix(true,false);
    this.root.localToWorld(this.streetLampWorld.set(side-.56,4.01,lampZ));
    return this.streetLampRequest;
  }
  protected build() {
    this.localZ = 0; this.previousZ = 0; this.walkSpeed = 0; this.direction = -1;
    const b = this.batch(), length = numberParam(this.params, 'walkLength', 70, 20, 140);
    if (!this.params.useExistingStreet) {
    b.box(-5.5, -.05, -length / 2, 3, .1, length + 18, '#C0B5A1');
    b.box(3.5, -.09, -length / 2, 14, .1, length + 20, '#57565A');
    for (let z = 5; z > -length - 6; z -= 12) b.box(4, -.02, z, .13, .015, 4, '#DED7BD');
    for (const z of [-8, -34, -61]) {
      this.block(b, -16, 3.8, z, 13, 7.6, 16, '#C4BCA9'); b.box(-9.45, 3.2, z, .12, 2.7, 5, '#45606A');
    }
    }
    const side = numberParam(this.params, 'walkSide', -3.5, -4, -1.5);
    // Opaque curb-side fixtures cover the walking route. Only the next real
    // fixture borrows an existing engine light; distant ones cost no lights.
    const posts:number[]=[];for(let z=0;z>-length;z-=12)posts.push(z);posts.push(-length);
    for(const z of posts){
      b.cylinder(side-.8,2.05,z,.055,4.1,'#59676A');
      b.box(side-.56,4.1,z,.6,.13,.25,'#4C555A');
      b.box(side-.56,4.025,z,.48,.025,.19,'#FFE6C2');
    }
    b.flush('delivery-quiet-street'); this.receiver = this.actor('jessie', side, 0, 0);
    this.streetTarget(side, 0, this.ctx.destination.label || 'Walking customer');
    this.status = { instruction: 'Follow slowly alongside the customer', canDrop: false, actionLabel: 'HAND OVER' };
  }
  update(dt: number) {
    const completed = this.ready && this.ended;
    if (completed) this.time += elapsed(dt); else if (!this.tick(dt)) return;
    const length = numberParam(this.params, 'walkLength', 70, 20, 140), speed = numberParam(this.params, 'walkSpeed', numberParam(this.params, 'walkingSpeed', 1.15, .5, 1.8), .5, 1.8), step = elapsed(dt);
    this.previousZ = this.localZ;
    // A smooth back-and-forth path slows naturally at each end. No recycling
    // or frame-dependent teleport can outrun the following player.
    this.localZ = -length / 2 + Math.cos(this.time * speed * 2 / length) * length / 2;
    this.walkSpeed = step > 0 ? (this.localZ - this.previousZ) / step : 0;
    if (Math.abs(this.walkSpeed) > .03) this.direction = Math.sign(this.walkSpeed);
    const receiver = this.receiver;
    const walkSide = numberParam(this.params, 'walkSide', -3.5, -4, -1.5);
    if (receiver) {
      const animated = typeof receiver.animate === 'function', actualSpeed = Math.abs(this.walkSpeed);
      receiver.group.position.set(walkSide, animated ? 0 : Math.sin(this.time * 5) * .018, this.localZ);
      receiver.group.rotation.y = this.direction < 0 ? Math.PI : 0;
      if (animated) receiver.animate!(step, actualSpeed > .04 ? 'walk' : 'idle', actualSpeed);
      else if (!this.transferring) { receiver.leftArm.rotation.x = Math.sin(this.time * 4) * .13; receiver.rightArm.rotation.x = -Math.sin(this.time * 4) * .13; }
    }
    this.streetTarget(walkSide, this.localZ, this.target.label, !completed);
    if (completed) { this.releaseCatch(dt);this.status.canDrop = false; return; }
    const player = this.ctx.player(), h = heading(player.yaw), yaw = this.params.useExistingStreet ? numberParam(this.params, 'streetYaw', 0, -Math.PI * 2, Math.PI * 2) : 0;
    const dx = player.x - this.target.x, dz = player.z - this.target.z, side = dx * Math.cos(yaw) - dz * Math.sin(yaw), along = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    const alongside = side > 1.5 && side < 7.5 && Math.abs(along) < 5;
    const matching = Math.abs(player.speed) <= 3.3 && Math.abs(player.speed) >= .25 && (h.x * Math.sin(yaw) + h.z * Math.cos(yaw)) * this.direction * Math.sign(player.speed) > .45;
    this.status.canDrop = !this.transferring && this.unlocked() && this.grounded() && alongside && matching && Math.abs(player.y - this.target.y) < 2.8;
    this.status.instruction = this.status.canDrop ? 'Hand over while rolling alongside' : 'Follow slowly alongside the customer';
    this.updateTransfer(dt);
  }
  onDrop() {
    if (!this.unlocked() || this.ended || this.transferring) return;
    if (!this.status.canDrop || !this.grounded()) { this.fail('Roll slowly alongside her, facing the same direction.'); return; }
    this.transferToActor(this.receiver, () => new THREE.Vector3(this.target.x, this.target.y + 1.2, this.target.z), () => this.done());
  }
}

export class WeddingHandoff extends StreetScene {
  override get story(){
    const frame=super.story;if(!frame)return undefined;
    // Keep a full car beside the dancer, not centered on her body. The bay
    // also sits between the two nearest procession rows and clear of lamps.
    const point=this.localPoint(3.3,.55,(this.receiver?.group.position.z??-4)+.5);
    return {...frame,point,landing:{point,radius:3.15},yaw:this.params.useExistingStreet?numberParam(this.params,'streetYaw',0,-Math.PI*2,Math.PI*2):0};
  }
  private receiver: SceneCharacter | null = null;
  private readonly processionLampZ=[-13,-7,-1,5];
  private lampWorld=new THREE.Vector3();
  private lampRequest={position:this.lampWorld,kind:'porch' as const};
  private focusPosition=new THREE.Vector3();
  private focusTarget=new THREE.Vector3();
  private handoffFocus={position:this.focusPosition,target:this.focusTarget,context:'stationary-handoff' as const};
  private nearCustomer(radius:number){return this.ready&&!!this.receiver?.group.visible&&this.receiver.group.userData.characterRelease!=='withheld'&&this.grounded()&&distanceXZ(this.ctx.player(),this.target)<=radius;}
  get headlightGain(){return this.nearCustomer(8) ? .02 : undefined;}
  get intentionalStop(){return this.nearCustomer(8)&&Math.abs(this.ctx.player().speed)<=.8;}
  get hideWorldGuidance(){return !!this.cameraFocus;}
  get sceneLamp(){
    if(!this.ready||!this.receiver?.group.visible||this.receiver.group.userData.characterRelease==='withheld'||distanceXZ(this.ctx.player(),this.target)>35)return undefined;
    const z=this.receiver.group.position.z;
    let nearest=this.processionLampZ[0];
    for(const candidate of this.processionLampZ)if(Math.abs(candidate-z)<Math.abs(nearest-z))nearest=candidate;
    this.root.updateWorldMatrix(true,false);this.root.localToWorld(this.lampWorld.set(-3.1,2.91,nearest));return this.lampRequest;
  }
  get cameraFocus(){
    if(this.ctx?.storyActive?.()){
      if(!this.ready||!this.charactersReady||!this.receiver?.group.visible||this.receiver.group.userData.characterRelease==='withheld'||distanceXZ(this.ctx.player(),this.target)>35)return undefined;
      const actor=this.receiver.group;actor.updateWorldMatrix(true,false);
      actor.localToWorld(this.focusPosition.set(-2.2,1.65,3.6));
      actor.localToWorld(this.focusTarget.set(0,1.05,0));return this.handoffFocus;
    }
    if(!this.charactersReady||!this.nearCustomer(8)||Math.abs(this.ctx.player().speed)>.75)return undefined;
    const actor=this.receiver!.group.position;this.root.updateWorldMatrix(true,false);
    this.root.localToWorld(this.focusPosition.set(actor.x+1.8,1.7,actor.z+4.2));
    this.root.localToWorld(this.focusTarget.set(actor.x,1.05,actor.z));return this.handoffFocus;
  }
  private dancers:WeddingCrowd|null=null;
  protected build() {
    const b = this.batch();
    if (!this.params.useExistingStreet) {
    b.box(0, -.05, -13, 27, .1, 70, '#8E7D65');
    for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
      const z = -40 + i * 20; this.block(b, side * 23, 3, z, 17, 6, 14, i % 2 ? '#C2A48E' : '#D8C197');
      b.box(side * 23, 6.2, z, 18, .4, 15, '#82735D');
      for (const x of [-4, 4]) b.box(side * 23 + x, 3.5, z + 7.1, 2.7, 2.4, .1, '#506058');
    }
    }
    // Real, fixed procession fixtures at the lane edge. Only the nearest
    // existing engine light slot is borrowed; no actor-following light or
    // extra renderer light is created as the procession moves past them.
    for(const z of this.processionLampZ){
      b.cylinder(-3.9,1.5,z,.045,3,'#7F6544');b.box(-3.5,3,z,.9,.12,.24,'#7F6544');
      b.box(-3.1,2.94,z,.32,.025,.18,'#FFE0B0');
    }
    for (const z of [-23, 2]) {
      for (const side of [-1, 1]) b.cylinder(side * 11, 4.5, z, .16, 9, '#7F6544');
      for (let i = 0; i <= 20; i++) {
        const x = -11 + i * 1.1, y = 8.5 - Math.sin(i / 20 * Math.PI) * 1.25;
        b.rod([x, y, z], [Math.min(11, x + 1.1), 8.5 - Math.sin(Math.min(20, i + 1) / 20 * Math.PI) * 1.25, z], .035, '#C8AC6E');
        b.cylinder(x, y - .25, z, .2, .42, i % 2 ? '#F2B53C' : '#C84256');
      }
    }
    b.box(-12, 1.1, -2, 3.8, 2.2, 6, '#9A443D'); b.box(-12, 2.6, -2, 3.6, .4, 5.8, '#D7B567');
    b.flush('delivery-village-procession');
    this.receiver = this.actor('bhanumathi', 0, 0, -4);
    // Anonymous guests share the approved reduced anatomical people source.
    // Four internally coloured/posed templates preserve sixteen original slots.
    this.dancers=new WeddingCrowd();this.root.add(this.dancers.group);
    this.streetTarget(0, -4, this.ctx.destination.label || 'Wedding procession');
    this.status = { instruction: 'Approach the dancing procession slowly', canDrop: false, actionLabel: 'HAND OVER' };
    this.animateCrowd();
  }
  private animateCrowd(dt = 0, notify = true) {
    const centerZ = -4 - Math.sin(this.time * .085) * 9;
    this.dancers?.update(this.time);
    if (this.receiver) {
      const animated = typeof this.receiver.animate === 'function';
      this.receiver.group.position.set(0, animated ? 0 : Math.abs(Math.sin(this.time * 3)) * .06, centerZ);
      this.receiver.group.rotation.y = animated ? 0 : Math.sin(this.time * 1.7) * .25;
      this.receiver.animate?.(elapsed(dt), 'dance', 1);
    }
    this.streetTarget(0, centerZ, this.target.label, notify);
  }
  update(dt: number) {
    if (this.ready && this.ended) { this.time += elapsed(dt); this.animateCrowd(dt, false);this.releaseCatch(dt); this.status.canDrop = false; return; }
    if (!this.tick(dt)) return; this.animateCrowd(dt);
    this.status.canDrop = !this.transferring && this.unlocked() && this.grounded() && this.within(7, 3) && Math.abs(this.ctx.player().speed) <= 3;
    this.status.instruction = this.status.canDrop ? 'Hand over beside the procession' : 'Approach the dancing procession slowly';
    this.updateTransfer(dt);
  }
  onDrop() {
    if (!this.unlocked() || this.ended || this.transferring) return;
    if (!this.status.canDrop || !this.grounded()) { this.fail('Land and slow down beside the procession.'); return; }
    this.transferToActor(this.receiver, () => new THREE.Vector3(this.target.x, this.target.y + 1.2, this.target.z), () => this.done());
  }
  override teardown(){this.dancers?.dispose();this.dancers=null;super.teardown();}
}

export class AngleParking extends StreetScene {
  override get story(){const frame=super.story;return frame?{...frame,yaw:numberParam(this.params,'parkingYaw',Math.PI/4,-Math.PI*2,Math.PI*2)}:undefined;}
  private receiver: SceneCharacter | null = null;
  private studioLampLocal=new THREE.Vector3();
  private studioLampWorld=new THREE.Vector3();
  private studioLampRequest={position:this.studioLampWorld,kind:'reading' as const};
  private focusPosition=new THREE.Vector3();
  private focusTarget=new THREE.Vector3();
  private studioFocus={position:this.focusPosition,target:this.focusTarget,context:'stationary-handoff' as const};
  get intentionalStop(){
    if(!this.ready||!this.grounded())return false;
    const player=this.ctx.player(),yaw=numberParam(this.params,'parkingYaw',Math.PI/4,-Math.PI*2,Math.PI*2);
    const tolerance=numberParam(this.params,'angleTolerance',8,4,15)*Math.PI/180;
    const dx=player.x-this.target.x,dz=player.z-this.target.z;
    return Math.abs(dx*Math.cos(yaw)-dz*Math.sin(yaw))<=1.8&&Math.abs(dx*Math.sin(yaw)+dz*Math.cos(yaw))<=1.9&&
      this.within(3.5,2.5)&&Math.abs(player.speed)<=.8&&Math.abs(angleDifference(player.yaw,yaw))<=tolerance;
  }
  private nearCustomer(radius:number){return this.ready&&!!this.receiver?.group.visible&&this.receiver.group.userData.characterRelease!=='withheld'&&this.grounded()&&distanceXZ(this.ctx.player(),this.target)<=radius;}
  get headlightGain(){return this.nearCustomer(6) ? .02 : undefined;}
  get sceneLamp(){
    if(!this.ready||!this.receiver?.group.visible||this.receiver.group.userData.characterRelease==='withheld'||distanceXZ(this.ctx.player(),this.target)>35)return undefined;
    this.root.updateWorldMatrix(true,false);this.studioLampWorld.copy(this.studioLampLocal);this.root.localToWorld(this.studioLampWorld);return this.studioLampRequest;
  }
  get cameraFocus(){
    if(!this.charactersReady||!this.nearCustomer(4)||Math.abs(this.ctx.player().speed)>.75||!(this.status.canDrop||this.transferring||this.ended))return undefined;
    const actor=this.receiver!.group.position;this.root.updateWorldMatrix(true,false);
    this.root.localToWorld(this.focusPosition.set(actor.x+1.8,1.7,actor.z+4.2));
    this.root.localToWorld(this.focusTarget.set(actor.x,1.1,actor.z));return this.studioFocus;
  }
  protected build() {
    const b = this.batch(), yaw = numberParam(this.params, 'parkingYaw', Math.PI / 4, -Math.PI * 2, Math.PI * 2);
    this.block(b, 0, 5, -22, 34, 10, 13, '#B8B3A8'); b.box(0, 5.5, -15.4, 32, 3.2, .18, '#38515A');
    b.box(0, 9, -15.15, 31, 1.5, .35, '#333E41'); b.sign('FILM NAGAR STUDIOS', 0, 9, -14.94, 27);
    b.box(0, -.04, -2, 35, .08, 26, '#737476');
    const bay = new THREE.Group(); bay.name = 'delivery-45-degree-parking-bay'; bay.rotation.y = yaw; this.root.add(bay);
    const marking = this.batch(bay);
    for (const x of [-2.6, 2.6]) marking.box(x, .015, 0, .16, .03, 7.8, '#F2D77B');
    marking.box(0, .015, -3.85, 5.3, .03, .16, '#F2D77B');
    marking.flush('delivery-parking-paint');
    const numeral = new THREE.Group(); numeral.position.set(0, .035, -1.5); numeral.rotation.x = -Math.PI / 2; bay.add(numeral);
    const paint = this.batch(numeral); paint.sign('45', 0, 0, 0, 1.5, '#F2D77B'); paint.flush('delivery-parking-number');
    for (const side of [-1, 1]) { b.cylinder(side * 12, .55, -12, .95, 1.1, '#8E7055'); b.cylinder(side * 12, 2.5, -12, 1.5, 3, '#3F6550', .35); }
    b.flush('delivery-production-office'); this.receiver = this.actor('sukumar', -4.8, 0, -8);
    const actor=this.receiver.group.position,x=actor.x+1.4,z=actor.z+1.5;
    b.cylinder(x,1.5,z,.045,3,'#596166');b.box(x-.4,3,z,.9,.12,.24,'#444D50');
    b.box(x-.8,2.94,z,.32,.025,.18,'#FFE0B0');b.flush('delivery-studio-reading-light');
    this.studioLampLocal.set(x-.8,2.91,z);
    this.status = { instruction: 'Park in the marked 45° bay', canDrop: false, actionLabel: 'DELIVER' };
  }
  update(dt: number) {
    if (this.ready && this.ended) { this.receiver?.animate?.(elapsed(dt), 'idle', 1);this.releaseCatch(dt); this.status.canDrop = false; return; }
    if (!this.tick(dt)) return;
    this.receiver?.animate?.(elapsed(dt), 'idle', 1);
    const player = this.ctx.player();
    this.status.canDrop = !this.transferring && this.unlocked() && this.intentionalStop;
    this.status.instruction = this.status.canDrop ? 'Perfect angle — deliver the pizza' : Math.abs(player.speed) > .8 ? 'Slow down in the parking bay' : 'Line up with the 45° parking marks';
    this.updateTransfer(dt);
  }
  onDrop() {
    if (!this.unlocked() || this.ended || this.transferring) return;
    if (!this.status.canDrop || !this.grounded()) { this.fail('Park slowly within the yellow lines at 45°.'); return; }
    this.transferToActor(this.receiver, () => this.localPoint(-4.8, 1.1, -8), () => this.done());
  }
}

export class ClassroomHandoff extends StreetScene {
  override get story(){const frame=super.story;return frame&&this.params.realCampusId?{...frame,yaw:Number(this.params.sceneYaw)||0}:frame;}
  private receiver: SceneCharacter | null = null;
  private courtyardLampLocal=new THREE.Vector3();
  private courtyardLampWorld=new THREE.Vector3();
  private courtyardLamp={position:this.courtyardLampWorld,kind:'reading' as const};
  private focusPosition=new THREE.Vector3();
  private focusTarget=new THREE.Vector3();
  private classroomFocus={position:this.focusPosition,target:this.focusTarget,context:'stationary-handoff' as const};
  private nearCustomer(radius:number){return this.ready&&!!this.receiver?.group.visible&&this.receiver.group.userData.characterRelease!=='withheld'&&this.grounded()&&this.within(radius,3);}
  get intentionalStop(){return this.nearCustomer(7)&&Math.abs(this.ctx.player().speed)<=.8;}
  get hideWorldGuidance(){return this.charactersReady&&this.nearCustomer(7)&&Math.abs(this.ctx.player().speed)<=.75;}
  get headlightGain(){return this.nearCustomer(6) ? .02 : undefined;}
  get sceneLamp(){
    if(!this.ready||!this.receiver?.group.visible||this.receiver.group.userData.characterRelease==='withheld'||distanceXZ(this.ctx.player(),this.target)>35)return undefined;
    this.root.updateWorldMatrix(true,false);this.root.localToWorld(this.courtyardLampWorld.copy(this.courtyardLampLocal));return this.courtyardLamp;
  }
  get cameraFocus(){
    if(!this.hideWorldGuidance)return undefined;
    const actor=this.receiver!.group.position;this.root.updateWorldMatrix(true,false);
    this.root.localToWorld(this.focusPosition.set(actor.x+1.8,1.7,actor.z+4.2));
    this.root.localToWorld(this.focusTarget.set(actor.x,1.1,actor.z));return this.classroomFocus;
  }
  private courtyardFixture(b:SceneBatch){
    const actor=this.receiver!.group.position,x=actor.x-1.4,z=actor.z+1.5;
    // A courtyard lamp stands on the actor's far side, outside the car lane.
    // Its source borrows one existing engine slot; no additional light/shadow.
    b.cylinder(x,1.5,z,.045,3,'#596166');b.box(x+.4,3,z,.9,.12,.24,'#444D50');
    b.box(x+.8,2.94,z,.32,.025,.18,'#FFE0B0');b.flush('delivery-classroom-courtyard-lamp');
    this.courtyardLampLocal.set(x+.8,2.91,z);
  }
  protected build() {
    const b = this.batch();
    if(this.params.realCampusId==='osmania_medical'){
      this.root.rotation.y=Number(this.params.sceneYaw)||0;
      this.receiver=this.actor('arjunReddy',-3,0,-3.2);this.courtyardFixture(b);
      this.status={instruction:'Approach the main academic courtyard',canDrop:false,actionLabel:'HAND OVER'};return;
    }
    if (this.params.useExistingFacade) {
      // A compact but actual classroom exterior: two wall wings frame an open
      // door and a covered student corridor, with benches and teaching props
      // visible behind it. The validated car lane stays in front of the set.
      for (const [x,w] of [[-7.9,4.2],[.3,9.4]]) this.block(b,x,1.65,-5.4,w,3.3,.4,'#D1BA94');
      for (const x of [-9.95,4.8]) this.block(b,x,1.65,-7.5,.3,3.3,4.6,'#D1BA94');
      b.box(-2.5,3.65,-7.4,15.5,.45,6,'#9B886D'); b.box(-2.5,-.04,-7.1,15,.08,6.2,'#B7B3A3');
      for(const x of [-7.8,1.7]) { b.box(x,1.9,-5.14,2.9,1.75,.1,'#344F53'); b.box(x,1.9,-5.04,.1,1.8,.1,'#DFD5BD'); }
      for (const x of [-5.8,-4.4]) b.box(x,1.55,-5.12,.14,3.1,.18,'#705849');
      b.box(-5.1,3.18,-5.12,1.65,.16,.18,'#705849');
      const door=new THREE.Group();door.name='delivery-classroom-open-door';door.position.set(-5.8,0,-5.1);door.rotation.y=-Math.PI*.42;this.root.add(door);
      const db=this.batch(door);db.box(.7,1.48,0,1.4,2.95,.08,'#637B6F');db.box(.7,2.05,.06,.65,.85,.035,'#314D52');db.flush('delivery-classroom-door-panel');
      b.box(-3.05,1.85,-5.12,1.5,1.1,.1,'#36574A');
      for (const [x,y] of [[-3.4,1.87],[-2.75,2.05]]) {b.box(x,y,-5.04,.48,.7,.025,'#D5D0BA');for(let n=0;n<3;n++)b.box(x,y+.2-n*.15,-5.01,.32,.025,.015,'#6C796D');}
      b.box(-5.1,3.08,-4.98,.6,.4,.1,'#D9CDAC'); b.sign('13',-5.1,3.08,-4.91,.48,'#543A31');
      b.box(-2.5,4.35,-5.35,15,1,.3,'#7A4B44');b.sign('OSMANIA MEDICAL COLLEGE',-2.5,4.35,-5.16,13.8);
      b.box(-5,1.9,-9.75,5,1.65,.08,'#365D4C'); b.sign('CLASSROOM',-5,1.9,-9.69,3.9);
      for(const x of [-6.6,-3.6]){b.box(x,.74,-8,2.2,.16,1,'#84694F');for(const dx of [-.8,.8])b.box(x+dx,.35,-8,.1,.7,.8,'#545650');}
      b.flush('delivery-medical-classroom-doorway'); this.receiver = this.actor('arjunReddy', -3, 0, -3.2);this.courtyardFixture(b);
      this.status = { instruction: 'Approach the classroom courtyard', canDrop: false, actionLabel: 'HAND OVER' }; return;
    }
    // A level courtyard entrance has an 11m opening and no step or collider
    // across its approach. The classroom is scenery beyond the driving area.
    b.box(0, -.04, 0, 35, .08, 31, '#B7B3A3');
    this.block(b, -16, 5, -18, 13, 10, 18, '#D1BA94'); this.block(b, 15, 5, -18, 13, 10, 18, '#D1BA94');
    this.block(b, 0, 7.7, -15, 44, 4.6, 15, '#D1BA94'); this.block(b, 0, 2.8, -25, 44, 5.6, 1.2, '#D1BA94');
    b.box(0, 9, -7.4, 42, 1.5, .3, '#7A4B44'); b.sign('OSMANIA MEDICAL COLLEGE', 0, 9, -7.2, 38);
    for (const x of [-18, -12, 12, 18]) b.box(x, 3.8, -8.85, 3.4, 3.8, .14, '#344F53');
    b.box(0, 2.3, -24.3, 9, 3, .14, '#3C6254');
    for (let row = 0; row < 2; row++) for (const x of [-5, 0, 5]) {
      b.box(x, 1.1, -17 - row * 3.2, 2.5, .18, 1.4, '#84694F');
      for (const side of [-1, 1]) b.box(x + side, .52, -17 - row * 3.2, .12, 1.05, .12, '#545650');
    }
    b.box(6, 2.6, -9, .14, 5.2, 1.3, '#705849'); b.box(6, 3.7, -8.3, 1.8, 1, .12, '#D9CDAC'); b.sign('13', 6, 3.7, -8.18, 1.3, '#543A31');
    b.flush('delivery-medical-college-classroom'); this.receiver = this.actor('arjunReddy', 3.6, 0, -5);this.courtyardFixture(b);
    this.status = { instruction: 'Approach the classroom courtyard', canDrop: false, actionLabel: 'HAND OVER' };
  }
  update(dt: number) {
    if (this.ready && this.ended) { this.receiver?.animate?.(elapsed(dt), 'idle', 1);this.releaseCatch(dt); this.status.canDrop = false; return; }
    if (!this.tick(dt)) return;
    this.receiver?.animate?.(elapsed(dt), 'idle', 1);
    this.status.canDrop = !this.transferring && this.unlocked() && this.grounded() && this.within(7, 3) && Math.abs(this.ctx.player().speed) <= 2;
    this.ring.visible=!this.hideWorldGuidance;
    this.status.instruction = this.status.canDrop ? 'Hand over outside the classroom' : 'Slow down outside the classroom'; this.updateTransfer(dt);
  }
  onDrop() {
    if (!this.unlocked() || this.ended || this.transferring) return;
    if (!this.status.canDrop || !this.grounded()) { this.fail('Land, approach the courtyard and slow down.'); return; }
    this.transferToActor(this.receiver, () => this.params.useExistingFacade ? this.localPoint(-3, 1.2, -3.2) : this.localPoint(3.6, 1.2, -5), () => this.done());
  }
}
