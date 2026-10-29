import * as THREE from 'three';
import type { Car } from '../../game/traffic';
import { PICKUP_CONFIG, type PickupConfig } from '../core/pickup-config';

export interface CarrierPickupMarker {
  carrierId: string;
  position: { x: number; y: number; z: number };
  previousPosition: { x: number; y: number; z: number };
}

export interface CarrierView {
  /** Horizontal direction of travel/view. Reuse this object across frames. */
  forwardX: number;
  forwardZ: number;
  jumping: boolean;
  airborne?: boolean;
  cameraX?: number; cameraY?: number; cameraZ?: number;
}

interface MarkerSlot extends CarrierPickupMarker {
  car: Car | null;
  group: THREE.Group;
  visual: THREE.Group;
  halo: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  phase: number;
}

/** Owns only the markers, never the traffic vehicles or their shared resources. */
export class CarrierMarker {
  readonly markers: CarrierPickupMarker[] = [];
  private slots: MarkerSlot[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];
  private scratch = new THREE.Vector3();
  private time = 0;
  private caught = false;
  private disposed = false;
  private catchAge = Infinity;
  private catchRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private catchFollower: THREE.Object3D | null = null;
  private carriedSlot: MarkerSlot | null = null;
  private forwardX = 0;
  private forwardZ = -1;
  private hasView = false;
  private noForwardTime = 0;
  private cameraPoint = new THREE.Vector3();
  private hasCamera = false;

  constructor(private scene: THREE.Scene, private config: PickupConfig = PICKUP_CONFIG) {
    // The cheese face is drawn toward the camera, with actual opaque thickness.
    const wedge = new THREE.Shape(); wedge.moveTo(0, -.95); wedge.lineTo(-.85, .66);
    wedge.quadraticCurveTo(0, 1.04, .85, .66); wedge.closePath();
    const body = new THREE.ExtrudeGeometry(wedge, { depth: .15, bevelEnabled: false, curveSegments: 12 });
    const cheese = new THREE.ShapeGeometry(wedge, 12);
    const crustPath = new THREE.CatmullRomCurve3([new THREE.Vector3(-.85,.68,.19),new THREE.Vector3(-.43,.84,.19),new THREE.Vector3(0,.9,.19),new THREE.Vector3(.43,.84,.19),new THREE.Vector3(.85,.68,.19)]);
    const crust = new THREE.TubeGeometry(crustPath, 16, .11, 6, false);
    const topping = new THREE.CylinderGeometry(.095,.095,.035,10); topping.rotateX(Math.PI/2);
    const halo = new THREE.RingGeometry(1.02, 1.17, 28);
    this.geometries.push(body, cheese, crust, topping, halo);
    const material = (color: string) => { const m = new THREE.MeshBasicMaterial({ color, toneMapped:false, side:THREE.DoubleSide }); this.materials.push(m); return m; };
    const bread = material('#D8782D'), cheeseMaterial = material('#FFD453'), crustMaterial = material('#F5A13A'), pepperoniMaterial = material('#C93D2F');
    const matrix = new THREE.Matrix4();
    for(let i=0;i<config.maxCarriersNearby;i++) {
      const group = new THREE.Group(); group.name='delivery-carrier-box';
      const visual = new THREE.Group(); visual.name='delivery-box-visual'; group.add(visual);
      const base = new THREE.Mesh(body,bread); base.name='delivery-pizza-slice'; visual.add(base);
      const face = new THREE.Mesh(cheese,cheeseMaterial); face.position.z=.158; visual.add(face);
      visual.add(new THREE.Mesh(crust,crustMaterial));
      const pepperoni = new THREE.InstancedMesh(topping,pepperoniMaterial,5);
      [[0,.44],[-.33,.35],[.34,.35],[-.14,-.03],[.12,-.35]].forEach(([x,y],j)=>pepperoni.setMatrixAt(j,matrix.makeTranslation(x,y,.19)));
      visual.add(pepperoni);
      const glowMaterial = new THREE.MeshBasicMaterial({color:'#FFB627',transparent:true,opacity:.5,depthWrite:false,side:THREE.DoubleSide,toneMapped:false}); this.materials.push(glowMaterial);
      const glow = new THREE.Mesh(halo,glowMaterial); glow.name='delivery-box-halo'; glow.rotation.x=-Math.PI/2; glow.position.y=-.7; group.add(glow);
      const point={x:0,y:0,z:0}; this.slots.push({carrierId:'',car:null,group,visual,halo:glow,position:point,previousPosition:{...point},phase:i*2.1});
    }
    const catchMaterial = new THREE.MeshBasicMaterial({ color: '#45E3D3', transparent: true, opacity: 0,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    this.materials.push(catchMaterial);
    this.catchRing = new THREE.Mesh(halo, catchMaterial);
    this.catchRing.name = 'delivery-caught-effect'; this.catchRing.rotation.x = -Math.PI / 2;
    this.catchRing.visible = false; scene.add(this.catchRing);
  }

  get activeCount() { return this.markers.length; }
  get holding() { return this.caught; }

  /** Snapshot before traffic moves; each slot retains its own scratch positions. */
  beforeFrame() {
    for (const slot of this.slots) if (slot.car) Object.assign(slot.previousPosition, slot.position);
  }

  update(dt: number, cars: readonly Car[], player: { x: number; y: number; z: number }, allowAssign = true, view?: CarrierView) {
    if (this.disposed) return;
    const elapsed = Math.max(0, Number.isFinite(dt) ? dt : 0);
    this.time += elapsed;
    this.hasCamera = !!view && [view.cameraX,view.cameraY,view.cameraZ].every(v => typeof v === 'number' && Number.isFinite(v));
    if(this.hasCamera) this.cameraPoint.set(view!.cameraX!,view!.cameraY!,view!.cameraZ!);
    if(this.carriedSlot) { this.carriedSlot.group.position.y=1.5+Math.sin(this.time*2.6)*.07; if(this.hasCamera) this.carriedSlot.visual.lookAt(this.cameraPoint); }
    this.updateCatch(dt);
    const viewLength = view ? Math.hypot(view.forwardX, view.forwardZ) : 0;
    this.hasView = Number.isFinite(viewLength) && viewLength > .001;
    if (this.hasView) { this.forwardX = view!.forwardX / viewLength; this.forwardZ = view!.forwardZ / viewLength; }
    const jumping = !!view?.jumping;
    const recycleRange = Math.max(this.config.carrierRange, this.config.recycleRange ?? this.config.carrierRange * 1.3);
    let changed = false;
    for (const slot of this.slots) {
      const car = slot.car;
      // A valid jump target keeps its lease even if the jump crosses the normal
      // range/height boundary. Truly removed traffic cannot retain a live marker.
      if (car && (!cars.includes(car) || !car.g.parent || (!jumping &&
        (!this.visible(car) || !this.sameSurface(car, player, view) || Math.hypot(car.x - player.x, car.z - player.z) > recycleRange)))) {
        this.detach(slot); changed = true;
      }
    }
    if (allowAssign && !this.caught && !jumping) for (const slot of this.slots) {
      if (slot.car) continue;
      const selected = this.select(cars, player, view, false);
      if (selected) { this.attach(slot, selected, player); changed = true; }
    }
    // Keep leases stable. If all offers are behind the player for three seconds,
    // move only one off-screen offer to an already visible forward vehicle.
    // Never reshuffle a box during a jump or while hovering over a possible grab.
    if (allowAssign && !this.caught && this.hasView && !jumping && !view?.airborne) {
      let forward = false;
      for (const slot of this.slots) if (slot.car && this.inFront(slot.car, player)) { forward = true; break; }
      this.noForwardTime = forward ? 0 : this.noForwardTime + elapsed;
      if (this.noForwardTime >= 3) {
        this.noForwardTime = 0;
        const selected = this.select(cars, player, view, true);
        if (selected) {
          let replace: MarkerSlot | null = null, mostBehind = 4;
          for (const slot of this.slots) if (slot.car) {
            const dx = slot.car.x - player.x, dz = slot.car.z - player.z;
            const behind = -(dx * this.forwardX + dz * this.forwardZ);
            if (behind > mostBehind) { replace = slot; mostBehind = behind; }
          }
          if (replace) { this.detach(replace); this.attach(replace, selected, player); changed = true; }
        }
      }
    } else this.noForwardTime = 0;
    for (const slot of this.slots) if (slot.car) this.place(slot, player);
    if (changed) {
      this.markers.length = 0;
      for (const slot of this.slots) if (slot.car) this.markers.push(slot);
    }
  }

  private visible(car: Car) {
    for (let node: THREE.Object3D | null = car.g; node; node = node.parent) if (!node.visible) return false;
    return !!car.g.parent;
  }

  private sameSurface(car: Car, player: { y: number }, view?: CarrierView) {
    if (view && !view.airborne) return Math.abs(car.y - (player.y - .55)) <= 3;
    // In flight, boxes on streets below remain discoverable without suggesting
    // an overhead deck that the car has not reached yet.
    return car.y <= player.y + 3;
  }

  private inFront(car: Car, player: { x: number; z: number }) {
    const dx = car.x - player.x, dz = car.z - player.z, distance = Math.hypot(dx, dz);
    return distance > .001 && dx * this.forwardX + dz * this.forwardZ >= distance * .65;
  }

  private select(cars: readonly Car[], player: { x: number; y: number; z: number }, view: CarrierView | undefined, forwardOnly: boolean) {
    let selected: Car | null = null, best = Infinity;
    for (const car of cars) {
      if (!this.visible(car) || !this.eligible(car) || !this.sameSurface(car, player, view)) continue;
      let assigned = false;
      for (const slot of this.slots) if (slot.car === car) { assigned = true; break; }
      if (assigned) continue;
      const dx = car.x - player.x, dz = car.z - player.z, distance = Math.hypot(dx, dz);
      if (distance >= this.config.carrierRange) continue;
      let score = distance;
      if (this.hasView) {
        const alignment = distance > .001 ? (dx * this.forwardX + dz * this.forwardZ) / distance : 1;
        const ahead = alignment >= .65;
        if (forwardOnly && !ahead) continue;
        // A forward candidate always beats a behind/side-street candidate.
        // Within that cone, favour a nearby vehicle travelling with the player.
        const heading = Number.isFinite(car.hx) && Number.isFinite(car.hz) ? car.hx * this.forwardX + car.hz * this.forwardZ : 1;
        score += (ahead ? 0 : this.config.carrierRange * 2) + (1 - alignment) * 30 + Math.max(0, .5 - heading) * 25;
      }
      if (score < best) { selected = car; best = score; }
    }
    return selected;
  }

  private attach(slot: MarkerSlot, car: Car, player: { x: number; z: number }) {
    slot.car = car; slot.carrierId = car.g.uuid;
    car.g.add(slot.group); this.place(slot, player);
    // A replacement starts a new sweep; never create a pickup segment spanning
    // the old carrier and its newly assigned forward counterpart.
    Object.assign(slot.previousPosition, slot.position);
  }

  /** Catch is atomic: all alternative offers disappear before the next simulation tick. */
  collect(carrierId: string, playerGroup?: THREE.Object3D) {
    if (this.disposed || this.caught) return false;
    const slot = this.slots.find(s => s.car && s.carrierId === carrierId);
    if (!slot) return false;
    this.caught = true; this.catchAge = 0; this.catchFollower = playerGroup ?? null;
    this.catchRing.position.set(slot.position.x, slot.position.y, slot.position.z);
    this.catchRing.scale.setScalar(.7); this.catchRing.material.opacity = .95; this.catchRing.visible = true;
    for (const other of this.slots) this.detach(other);
    if (playerGroup) {
      // Roadster's model is translated -.55 from its support root. This rests
      // above the cabin, rather than hovering at the traffic-marker height.
      this.carriedSlot = slot; slot.group.name = 'delivery-carried-box';
      slot.group.position.set(0, 1.5, 0); slot.group.scale.setScalar(.7);
      slot.visual.rotation.set(0, 0, 0);
      slot.halo.visible = false; playerGroup.add(slot.group);
    }
    this.markers.length = 0;
    return true;
  }

  /** Relocation or the next delivery starts a fresh anonymous carrier search. */
  clear() {
    for (const slot of this.slots) this.detach(slot);
    this.carriedSlot = null; this.noForwardTime = 0;
    this.markers.length = 0; this.caught = false;
    this.catchAge = Infinity; this.catchRing.visible = false; this.catchFollower = null;
  }

  dispose() {
    if (this.disposed) return;
    this.clear(); this.scene.remove(this.catchRing);
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.disposed = true;
  }

  private eligible(car: Car) {
    return (car.group === 'auto' || car.group === 'bus' || car.group === 'bike' || car.group === 'car' || car.group === 'truck') &&
      car.size.length >= 3 && Number.isFinite(car.size[1]) && car.size[1] > 0 &&
      Number.isFinite(car.x) && Number.isFinite(car.y) && Number.isFinite(car.z);
  }

  private detach(slot: MarkerSlot) {
    slot.group.removeFromParent(); slot.car = null; slot.carrierId = '';
    slot.group.name = 'delivery-carrier-box'; slot.group.scale.setScalar(1); slot.halo.visible = true;
    slot.visual.rotation.set(0, 0, 0);
    if (this.carriedSlot === slot) this.carriedSlot = null;
  }

  private place(slot: MarkerSlot, player: { x: number; z: number }) {
    const car = slot.car!;
    slot.group.position.set(0, car.size[1] + this.config.boxHeightAboveRoof + Math.sin(this.time * 2.6 + slot.phase) * .065, 0);
    slot.group.updateWorldMatrix(true, false); slot.group.getWorldPosition(this.scratch);
    slot.position.x = this.scratch.x; slot.position.y = this.scratch.y; slot.position.z = this.scratch.z;
    // Only the art tilts; swept pickup coordinates remain at the stable center.
    if(this.hasCamera) slot.visual.lookAt(this.cameraPoint);
    else slot.visual.rotation.set(.15, slot.phase, 0);
    const close = Math.max(0, 1 - Math.hypot(car.x - player.x, car.z - player.z) / 32);
    const pulse = .5 + .5 * Math.sin(this.time * (3 + close * 5) + slot.phase);
    slot.halo.material.opacity = .3 + close * .25 + pulse * .16;
    slot.halo.scale.setScalar(1 + pulse * (.05 + close * .12));
  }

  private updateCatch(dt: number) {
    if (!this.catchRing.visible) return;
    this.catchAge += Math.max(0, Number.isFinite(dt) ? dt : 0);
    const u = Math.min(1, this.catchAge / .65);
    if (this.catchFollower) {
      this.catchFollower.getWorldPosition(this.scratch);
      this.catchRing.position.set(this.scratch.x, this.scratch.y + 1, this.scratch.z);
    }
    this.catchRing.scale.setScalar(.7 + u * 2.6); this.catchRing.material.opacity = (1 - u) * .95;
    if (u === 1) { this.catchRing.visible = false; this.catchFollower = null; }
  }
}
