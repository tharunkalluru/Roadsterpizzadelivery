import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { MovingRailBody } from '../../game/moving-rail';
import { ModuleBase, distanceXZ, heading, numberParam } from './base';
import type { DeliveryPoint, VerifiedTrainPassage } from './types';
import type { DeliveryModuleContext, ModuleParams } from './types';
import { TruckInterior } from './truck-interior';
import type { SceneCharacter } from './character';

export class MatchAndLand extends ModuleBase {
  private interior:TruckInterior|null=null;
  private receiver:SceneCharacter|null=null;
  get supports(){return this.interior?.supports??super.supports;}
  get trafficBodies(){return this.interior?.trafficBodies??this.supports.filter(body=>body.id==='delivery-log-truck');}
  get arrival(){return this.interior?.arrival;}
  setup(ctx:DeliveryModuleContext,params:ModuleParams={}){
    if(params.scene==='truckInterior'){
      this.teardown();this.interior=new TruckInterior();this.interior.setup(ctx,params);this.syncInterior();return;
    }
    super.setup(ctx,params);
  }
  private syncInterior(){if(this.interior){this.target=this.interior.target;this.status=this.interior.status;this.movement=this.interior.movement;}}
  teardown(){this.interior?.teardown();this.interior=null;super.teardown();}
  private vehicle = new THREE.Group();
  private passenger = new THREE.Group();
  private vehicleKind = 'truck';
  private speed = 10;
  private matched = 0;
  private routeDistance = 0;
  private routeSpeed = 0;
  private routeLoop = false;
  private routeLength = 0;
  private lengths: number[] = [];
  private body: MovingRailBody | null = null;
  private targetVelocity = { x: 0, z: 0 };
  private sourceTrainId = '';
  private obstacleFailed = false;
  private priorPlayer = { x: 0, z: 0 };
  private priorDt = 0;
  private liveBody: MovingRailBody | null = null;
  private passage: (VerifiedTrainPassage & { hx: number; hz: number }) | null = null;
  private passageUnder = false;
  private passageCleared = false;
  private passageRequired = false;

  protected build() {
    this.receiver=null;
    this.vehicleKind = String(this.params.vehicle || this.params.scene || 'truck');
    this.speed = numberParam(this.params, 'speed', this.vehicleKind === 'stationary' ? 0 : 10, 0, 25);
    this.matched = 0; this.routeDistance = 0; this.routeSpeed = 0; this.routeLoop = false; this.routeLength = 0; this.lengths = [];
    this.targetVelocity = { x: 0, z: 0 }; this.sourceTrainId = ''; this.body = null; this.obstacleFailed = false;
    this.priorPlayer = { x: this.ctx.player().x, z: this.ctx.player().z }; this.priorDt = 0; this.liveBody = null;
    this.passage = null; this.passageUnder = false; this.passageCleared = false; this.passageRequired = false;
    this.vehicle = new THREE.Group(); this.root.add(this.vehicle);
    const route = this.ctx.route || [];
    for (let i = 1; i < route.length; i++) { this.routeLength += distanceXZ(route[i - 1], route[i]); this.lengths.push(this.routeLength); }
    this.routeLoop = !!this.ctx.routeLoop && route.length >= 3 && distanceXZ(route[0], route[route.length - 1]) < 1;
    if (this.vehicleKind === 'stationary' || this.speed === 0) {
      this.platform(24, 20, 0, '#C8D3DC');
      this.box(0, -3.6, 0, 24, 6.8, 20, '#B5C0C9');
      this.box(0, .2, 9.5, 24, .4, 1, '#D45439');
      this.box(-11.5, .2, 0, 1, .4, 20, '#D45439');
      this.box(11.5, .2, 0, 1, .4, 20, '#D45439');
      this.receiver=this.character('gabbar',3,0,0);this.passenger=this.receiver.group;
      for (const x of [-6, 0, 6]) { this.box(x, -2.5, 10.03, 3, 2, .12, '#22364F'); }
      this.box(0, 2.6, -8, 10, 1.3, .3, '#17315B');
      for (const x of [-2, 2]) this.cylinder(x, 2.6, -7.8, .25, .06, x < 0 ? '#EA334F' : '#32ACED').rotation.x = Math.PI / 2;
    } else if (this.vehicleKind === 'train') {
      // Attach the setpiece's customer/marker to a genuine simulation coach.
      // Its existing mesh, route, collision and lifetime remain owned by RailTrains.
      this.receiver=this.character('trainHero',0,0,0,false,this.vehicle);this.passenger=this.receiver.group;
      this.vehicle.name = 'delivery-train-customer';
    } else {
      this.vehicleKind = 'truck';
      this.box(0, 1.4, 0, 3.8, .65, 10.5, '#95442A', this.vehicle);
      this.buildTruckCab();
      for (const x of [-1.6, 1.6]) for (const z of [-3.4, 3.5]) {
        const wheel = this.cylinder(x, .6, z, .7, .45, '#24202A', this.vehicle); wheel.rotation.z = Math.PI / 2;
      }
      for (let i = 0; i < 6; i++) {
        const log = this.cylinder((i % 3 - 1) * .88, 1.9 + Math.floor(i / 3) * .75, -1.4, .45, 6, i % 2 ? '#9E633B' : '#BC8552', this.vehicle);
        log.rotation.x = Math.PI / 2;
      }
      this.body = this.makeBody(this.ctx.destination, 0, 1);
      // An unavailable route must not leave an invisible collider at the anchor.
      if (this.routeLength >= 1) this.bodies.push(this.body);
    }
    this.status = { instruction: 'Approach the delivery marker', canDrop: false, actionLabel: 'DROP' };
    this.movement = { mode: 'approach', center: this.target, radius: 100, altitude: this.target.y + 4 };
  }

  /** Open-window cab and seated reader, batched by local scene rather than dozens of draws. */
  private buildTruckCab() {
    const parts: { geometry: THREE.BufferGeometry; color: string }[] = [];
    const box = (x: number,y: number,z: number,w: number,h: number,d: number,color: string) =>
      parts.push({geometry: new THREE.BoxGeometry(w,h,d).translate(x,y,z), color});
    const flush = (name: string) => {
      for (const part of parts) {
        const c = new THREE.Color(part.color), count = part.geometry.attributes.position.count, colors = new Float32Array(count * 3);
        for(let i=0;i<count;i++){colors[i*3]=c.r;colors[i*3+1]=c.g;colors[i*3+2]=c.b;}
        part.geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
      }
      const merged = this.own(mergeGeometries(parts.map(p=>p.geometry))!);
      for(const part of parts)part.geometry.dispose();parts.length=0;
      const material = new THREE.MeshBasicMaterial({vertexColors:true,toneMapped:false});this.materials.set(name,material);
      const mesh=new THREE.Mesh(merged,material);mesh.name=name;this.vehicle.add(mesh);return mesh;
    };
    box(0,1.3,4,3.5,1.1,3,'#EA8C32');
    box(0,3.15,4,3.7,.18,3.2,'#EA8C32');
    box(0,2.35,2.6,3.5,1.5,.2,'#EA8C32');
    for(const x of [-1.65,1.65])box(x,2.55,5.45,.18,1.15,.18,'#EA8C32');
    box(.7,1.75,3.45,.8,.22,.85,'#272138');box(.7,2.15,3.05,.8,.9,.18,'#272138');
    flush('delivery-truck-open-window-cab');
    // Torso/head stay under the cab roof. Bent thighs and shins face the windshield.
    box(.7,2.2,3.5,.55,.7,.35,'#BF4F37');
    parts.push({geometry:new THREE.CylinderGeometry(.22,.22,.36,12).translate(.7,2.76,3.5),color:'#B7825F'});
    for(const side of [-1,1]){
      box(.7+side*.18,1.9,3.75,.23,.22,.65,'#272138');
      box(.7+side*.18,1.6,4.02,.21,.5,.21,'#272138');
      box(.7+side*.32,2.18,3.8,.15,.18,.6,'#B7825F');
    }
    flush('delivery-truck-seated-reader');
    box(.7,2.17,4.12,.78,.07,.55,'#D85334');box(.7,2.22,4.12,.72,.04,.49,'#FFF0C4');
    // A compact printed lesson: a Kanji-like box glyph and short study lines.
    for(const x of [.44,.61])box(x,2.245,4.11,.025,.012,.2,'#29243A');
    for(const z of [4.01,4.11,4.21])box(.525,2.245,z,.18,.012,.025,'#29243A');
    for(const z of [4.02,4.1,4.18])box(.86,2.245,z,.23,.012,.018,'#29243A');
    flush('delivery-truck-japanese-lesson-book');
  }

  private makeBody(p: DeliveryPoint, hx: number, hz: number): MovingRailBody {
    const roof = p.y + numberParam(this.params, 'roofHeight', 2.8, 1, 5);
    return { id: 'delivery-log-truck', x: p.x, y: p.y, z: p.z, hx, hz, halfWidth: 1.95, halfLength: 5.25,
      bottom: p.y + .2, roof, previous: { x: p.x, y: p.y, z: p.z, hx, hz } };
  }

  private sampleRoute(distance: number) {
    const route = this.ctx.route || [];
    if (route.length < 2 || this.routeLength < 1) return null;
    let index = this.lengths.findIndex(length => length >= distance); if (index < 0) index = this.lengths.length - 1;
    const a = route[index], b = route[index + 1], from = index ? this.lengths[index - 1] : 0, length = Math.max(.001, this.lengths[index] - from);
    const t = Math.max(0, Math.min(1, (distance - from) / length));
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t,
      hx: (b.x - a.x) / length, hz: (b.z - a.z) / length, grade: (b.y - a.y) / length };
  }

  update(dt: number) {
    if(this.interior){this.interior.update(dt);this.syncInterior();return;}
    if (!this.tick(dt)) return;
    const elapsed = Math.max(0, Math.min(dt, .1));
    let targetSpeed = this.speed;
    if (this.vehicleKind === 'train') {
      const train = this.ctx.existingTrain?.();
      if (!train) { this.cancelHandoff();this.vehicle.visible = false; this.status.canDrop = false; this.status.instruction = 'Follow the rail marker; waiting for the next train'; this.matched = 0; return; }
      this.vehicle.visible = true;
      if (this.sourceTrainId && train.id !== this.sourceTrainId) {
        this.cancelHandoff();
        this.matched = 0; this.passage = null; this.passageUnder = false; this.passageRequired = false; this.passageCleared = false;
      }
      this.sourceTrainId = train.id;
      this.liveBody = train;
      this.targetVelocity.x = elapsed > 0 ? (train.x - train.previous.x) / elapsed : 0;
      this.targetVelocity.z = elapsed > 0 ? (train.z - train.previous.z) / elapsed : 0;
      targetSpeed = Math.hypot(this.targetVelocity.x, this.targetVelocity.z);
      this.setTarget({ x: train.x, y: train.roof, z: train.z, label: this.ctx.destination.label });
      this.vehicle.position.set(train.x - this.ctx.destination.x, train.roof - this.ctx.destination.y, train.z - this.ctx.destination.z);
      this.vehicle.rotation.y = Math.atan2(train.hx, train.hz);
      this.root.visible = distanceXZ(this.ctx.player(), this.target) < 850;
      this.trainObstacles(train);
      this.updatePassage(train);
    } else if (this.body) {
      const sample = this.sampleRoute(this.routeDistance);
      if (!sample) {
        this.status.canDrop = false; this.status.instruction = 'Loading the highway route'; this.vehicle.visible = false; return;
      }
      this.vehicle.visible = true;
      Object.assign(this.body.previous, { x: this.body.x, y: this.body.y, z: this.body.z, hx: this.body.hx, hz: this.body.hz });
      // Brake to the end of a non-circular road. Never teleport, reverse into
      // opposing traffic or manufacture an off-road U-turn at a streamed edge.
      const previousDistance = this.routeDistance;
      const remaining = this.routeLength - this.routeDistance;
      const trafficLimit = this.ctx.vehicleSpeedLimit?.(this.body);
      const permitted = trafficLimit != null && Number.isFinite(trafficLimit) ? Math.max(0, Math.min(this.speed, trafficLimit)) : this.speed;
      const desired = this.routeLoop ? permitted : Math.min(permitted, Math.sqrt(Math.max(0, 2 * 2.5 * remaining)));
      const change = (desired < this.routeSpeed ? 3 : 4) * elapsed;
      this.routeSpeed += Math.max(-change, Math.min(change, desired - this.routeSpeed));
      this.routeDistance += Math.min(remaining, this.routeSpeed * elapsed);
      if (this.routeDistance >= this.routeLength - .01) {
        if (this.routeLoop) this.routeDistance %= this.routeLength;
        else { this.routeDistance = this.routeLength; this.routeSpeed = 0; }
      }
      let next = this.sampleRoute(this.routeDistance)!;
      let candidate = this.makeBody(next, next.hx, next.hz); candidate.previous = { ...this.body.previous }; candidate.grade = next.grade;
      if (this.ctx.vehiclePoseClear && !this.ctx.vehiclePoseClear(candidate)) {
        // Last-resort overlap guard after normal gradual following. Keep the
        // same supported/rendered pose while the NPC clears the carriageway.
        this.routeDistance = previousDistance; this.routeSpeed = 0;
        next = this.sampleRoute(this.routeDistance)!;
        candidate = this.makeBody(next, next.hx, next.hz); candidate.previous = { ...this.body.previous }; candidate.grade = next.grade;
      }
      Object.assign(this.body, candidate);
      this.liveBody = this.body;
      this.body.grade = next.grade;
      this.vehicle.position.set(next.x - this.ctx.destination.x, next.y - this.ctx.destination.y, next.z - this.ctx.destination.z);
      this.vehicle.rotation.set(-Math.atan(next.grade), Math.atan2(next.hx, next.hz), 0, 'YXZ');
      this.targetVelocity = { x: elapsed > 0 ? (next.x - this.body.previous.x) / elapsed : 0,
        z: elapsed > 0 ? (next.z - this.body.previous.z) / elapsed : 0 };
      targetSpeed = Math.hypot(this.targetVelocity.x, this.targetVelocity.z);
      this.setTarget({ x: next.x, y: this.body.roof, z: next.z, label: this.ctx.destination.label });
      this.root.visible = distanceXZ(this.ctx.player(), this.target) < 850;
    } else { this.targetVelocity.x = 0; this.targetVelocity.z = 0; targetSpeed = 0; }
    const p = this.ctx.player(), forward = heading(p.yaw);
    let velocityX = forward.x * p.speed, velocityZ = forward.z * p.speed;
    const body = this.liveBody;
    if (body && !p.flying && !p.descending && !p.jumping && Math.abs(p.y - (body.roof + .55)) < .65) {
      const dx = p.x - body.x, dz = p.z - body.z;
      const along = dx * body.hx + dz * body.hz, side = -dx * body.hz + dz * body.hx;
      if (Math.abs(along) <= body.halfLength + .5 && Math.abs(side) <= body.halfWidth + .5) {
        // RailContacts carries a landed car without changing its speed property.
        // Measure its actual previous-frame displacement, not just throttle speed.
        const vx = this.priorDt > 0 ? (p.x - this.priorPlayer.x) / this.priorDt : NaN;
        const vz = this.priorDt > 0 ? (p.z - this.priorPlayer.z) / this.priorDt : NaN;
        if (Number.isFinite(vx) && Math.hypot(vx, vz) < 85) { velocityX = vx; velocityZ = vz; }
      }
    }
    const relativeSpeed = Math.hypot(velocityX - this.targetVelocity.x, velocityZ - this.targetVelocity.z);
    const within = this.within(numberParam(this.params, 'radius', 7, 3, 15), 5.5);
    const tolerance = numberParam(this.params, 'matchTolerance', targetSpeed ? 4 : 5, 1, 12);
    this.matched = this.unlocked() && within && relativeSpeed <= tolerance && !p.jumping ? this.matched + elapsed : 0;
    this.status.canDrop = !this.passageRequired && this.matched >= numberParam(this.params, 'holdSeconds', .45, 0, 2);
    this.status.instruction = this.status.canDrop ? 'Matched! Drop the pizza' : !within ? 'Fly alongside the glowing landing ring' : `Match ${Math.round(targetSpeed * 3.6)} km/h and hold steady`;
    this.status.progress = this.status.canDrop ? 'Ready' : `${Math.round(Math.min(1, this.matched / .45) * 100)}% steady`;
    if(this.vehicleKind==='train'&&this.params.obstacles){
      if(this.passageRequired){this.status.instruction='Stay with the train below the mapped bridge, then clear its far edge';this.status.progress=this.passageUnder?'Under the bridge — keep following':'Real bridge passage ahead';}
      else if(this.passageCleared)this.status.progress='Bridge cleared · '+this.status.progress;
      else this.status.progress='No verified bridge ahead · '+this.status.progress;
    }
    this.movement = { mode: 'approach', center: { ...this.target }, radius: 110, altitude: this.target.y + 3 };
    this.priorPlayer.x = p.x; this.priorPlayer.z = p.z; this.priorDt = elapsed;
    this.advanceHandoff(dt);
  }

  private updatePassage(train: MovingRailBody) {
    if(!this.params.obstacles||!this.unlocked()||this.passageCleared){this.passageRequired=false;return;}
    const p=this.ctx.player();
    if(this.passage&&this.passageUnder){
      const q=this.passage,trainAlong=(train.x-q.x)*q.hx+(train.z-q.z)*q.hz,playerAlong=(p.x-q.x)*q.hx+(p.z-q.z)*q.hz;
      if(trainAlong>q.radius&&playerAlong>q.radius&&distanceXZ(p,train)<28){this.passageCleared=true;this.passageRequired=false;return;}
    }
    const candidate=this.ctx.trainPassage?.();
    const valid=candidate&&candidate.trainId===train.id&&[candidate.x,candidate.z,candidate.radius,candidate.ceiling,candidate.distanceAhead].every(Number.isFinite)&&
      candidate.radius>=2&&candidate.radius<=100&&candidate.ceiling>=train.roof+1.4;
    if(valid){
      if(!this.passage||this.passage.id!==candidate.id){this.passage={...candidate,hx:train.hx,hz:train.hz};this.passageUnder=false;}
      this.passageRequired=true;
      const q=this.passage!;
      if(distanceXZ(train,q)<=q.radius&&distanceXZ(p,q)<=q.radius&&distanceXZ(p,train)<=20&&
        p.y-.55>=train.roof-.25&&p.y+.8<=q.ceiling-.1){
        // The route may bend between assignment and the crossing. Capture the
        // actual travel heading here, not the train's heading far upstream.
        if(!this.passageUnder){q.hx=train.hx;q.hz=train.hz;}
        this.passageUnder=true;
      }
    }else{
      // A vanished/source-ended train must not leave an impossible mandatory
      // obstacle. No metadata is not evidence that the bridge was cleared.
      this.passageRequired=false;
      if(!this.passageUnder)this.passage=null;
    }
  }

  private trainObstacles(train: MovingRailBody) {
    if (!this.params.obstacles) return;
    // Existing city bridges do the physical collision work. Query their real
    // underside instead of fabricating a moving bridge around this train.
    const p = this.ctx.player(), ceiling = this.ctx.clearanceAt?.(p);
    const hit = ceiling != null && p.y + 1 > ceiling && Math.abs(p.y - ceiling) < 4;
    if (hit && !this.obstacleFailed) { this.fail('Bridge clearance! Descend and approach again.'); this.matched = 0; }
    this.obstacleFailed = hit;
  }

  onDrop() {
    if(this.interior){this.interior.onDrop();this.syncInterior();return;}
    if (!this.unlocked() || this.ended || this.handoffPending) return;
    if (this.status.canDrop) this.beginHandoff(this.receiver,()=>this.done()); else this.fail('Missed the landing window. Match the vehicle and try again.');
  }
}
