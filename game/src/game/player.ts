import * as THREE from 'three';
import { roadster, type RoadsterNozzle } from '../world/vehicles';
import { labelTexture } from '../world/signs';
import type { CityData } from '../world/city';
import { supportAt, collideBuildings, collideWalls, roofUnder, SupportKind } from './physics';

export interface Input { throttle: number; brake: number; steer: number; flyPressed: boolean; boost: boolean }
export const ROAD_SPEED_LIMIT = 150 / 3.6;
export const FLIGHT_SPEED_LIMIT = 240 / 3.6;

// Roadster: arcade car with real surfaces (flyovers/steel bridge are drivable) and unlimited flight.
export class Player {
  group: THREE.Group; pods: THREE.Mesh[]; glow: THREE.Mesh; light = new THREE.PointLight('#45E3D3', 0, 9, 1.8);
  pos = new THREE.Vector3(); yaw = 0; speed = 0; vy = 0; steerVis = 0;
  flying = false; descending = false; charge = 2.5; chargeCap = 20; earnT = 0; onRoad = true; lastSupport = 0;
  hitCooldown = 0; bump = 0; lastKind: SupportKind = 'road'; lastElevRoad = false; flyAlt = 24; altT = 0; kerbT = 0;
  placementRevision = 0;
  constructor(public city: CityData, mats: Record<string, any>) {
    const logo = new THREE.MeshBasicMaterial({ map: labelTexture([{ text: 'PIZZA TO PICTURE HALL', font: '{s}px "Bungee", sans-serif', color: '#FFB627', size: 44 }], 512, 128, '#17132B') });
    const plate = new THREE.MeshBasicMaterial({ map: labelTexture([{ text: 'TG 09 P2P 01', font: '800 {s}px "Baloo 2", sans-serif', color: '#17132B', size: 70 }], 512, 128, '#F6EEDC', '#17132B') });
    const R = roadster({
      paint: new THREE.MeshPhysicalMaterial({ color: '#d5d9dc', metalness: 0.48, roughness: 0.23, clearcoat: 1, clearcoatRoughness: 0.06 }),
      canopy: new THREE.MeshPhysicalMaterial({ color: '#29221c', metalness: 0.38, roughness: 0.13, transparent: true, opacity: 0.94, side: THREE.DoubleSide }),
      helmet: new THREE.MeshStandardMaterial({ color: '#FFB627', roughness: 0.35 }),
      trim: new THREE.MeshStandardMaterial({ color: '#16151b', roughness: 0.4, metalness: 0.6 }),
      accent: new THREE.MeshStandardMaterial({ color: '#a69377', metalness: 0.86, roughness: 0.27 }),
      pizzaBox: new THREE.MeshStandardMaterial({ color: '#FFB627', roughness: 0.55 }),
      red: new THREE.MeshStandardMaterial({ color: '#E8413A', roughness: 0.5 }),
      heatLed: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff7a2a').multiplyScalar(2.5), toneMapped: false }),
      tail: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff210c').multiplyScalar(1.5), toneMapped: false }),
      head: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff').multiplyScalar(2.5), toneMapped: false }),
      pod: new THREE.MeshStandardMaterial({ color: '#64686b', roughness: 0.28, metalness: 0.85 }),
      podGlow: new THREE.MeshBasicMaterial({ color: new THREE.Color('#bfeaff').multiplyScalar(1.6), toneMapped: false }),
      tyre: new THREE.MeshStandardMaterial({ color: '#1b1b1f', roughness: 0.92 }),
      rim: new THREE.MeshStandardMaterial({ color: '#c9ccd3', roughness: 0.25, metalness: 0.9 }),
      seat: new THREE.MeshStandardMaterial({ color: '#e4e0d8', roughness: 0.7 }),
      jet: new THREE.MeshBasicMaterial({ color: '#eef1f2', alphaMap: jetFade(), transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }),
      jetCore: new THREE.MeshBasicMaterial({ color: '#ffffff', alphaMap: jetFade(), transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    }, { logo, plate });
    this.group = R.group; this.pods = R.pods; this.wheels = R.wheels; this.wheelRollers = R.wheelRollers; this.nozzles = R.nozzles; this.setDeployment = R.setDeployment;
    this.gas = new GasPuffs(mats.radial);
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 5.6), new THREE.MeshBasicMaterial({ map: mats.radial, color: new THREE.Color('#45E3D3'), transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.glow.rotation.x = -Math.PI / 2;
  }
  wheels: THREE.Group[]; wheelRollers: THREE.Group[]; nozzles: RoadsterNozzle[]; gas: GasPuffs; wasFlying = false; puffAcc = 0; burst = 0;
  setDeployment: (amount: number) => void; thrusterDeployment = 0;
  addTo(scene: THREE.Scene) { scene.add(this.group, this.glow, this.light, this.gas.group); }
  // place on the road surface nearest to height `y` (a ground street under a flyover stays on the ground)
  place(x: number, z: number, yaw: number, y = 0) {
    this.pos.set(x, 0, z); this.yaw = yaw; this.speed = 0; this.vy = 0; this.flying = false; this.descending = false;
    const s = supportAt(this.city, x, z, y + 0.5, true); this.pos.y = s.y + 0.55;
    this.lastSupport = s.y; this.lastKind = s.kind; this.lastElevRoad = s.elevatedRoad; this.onRoad = s.onRoad;
    this.glide = null; this.lastEdge = null; this.roadPitch = 0; this.placementRevision++;
    this.group.position.copy(this.pos); this.group.rotation.set(0, yaw, 0, 'YXZ');
  }
  // one puff of vented gas from a nozzle (k), blown along the nozzle direction plus a share of the car's motion
  puff(power: number, k: number) {
    const nz = this.nozzles[k % this.nozzles.length]; if (!nz) return;
    const p = new THREE.Vector3(); nz.node.getWorldPosition(p);
    const d = nz.dir.clone().applyQuaternion(this.group.quaternion);
    const f = this.forward, v = new THREE.Vector3(f.x * this.speed * 0.25, 0, f.z * this.speed * 0.25);
    v.addScaledVector(d, (5 + Math.random() * 3) * power).add(new THREE.Vector3((Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 1.2));
    this.gas.emit(p, v, 0.8 + Math.random() * 0.6, 0.3, (2.0 + Math.random() * 1.4) * Math.max(0.7, power));
  }
  // the road under the car carries on from the one it was on (same piece, or the next piece at a shared junction):
  // a sudden drop there is a step in the data, not the edge of a flyover, so the car must not be held back
  lastEdge: any = null;
  roadPitch = 0;
  continues(sup: { s: any; kind: string }) {
    const e = sup.s?.e, l = this.lastEdge;
    if (!e || !l || sup.kind !== 'road') return false;
    return e === l || e.id === l.id || (!!e.from && (e.from === l.from || e.from === l.to)) || (!!e.to && (e.to === l.from || e.to === l.to));
  }
  updateGlide(dt: number, t: number) {
    const g = this.glide!; g.t += dt;
    const P = this.pos, dx = g.x - P.x, dz = g.z - P.z, d = Math.hypot(dx, dz);
    // rise clear of the roofs around, cross over, then settle onto the street
    const cruise = Math.max(g.y, P.y) + (d > 6 ? 4 : 0);
    const step = Math.min(d, 16 * dt);
    if (d > 0.05) { P.x += (dx / d) * step; P.z += (dz / d) * step; this.yaw += ((Math.atan2(-dx, -dz) - this.yaw + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 3); }
    const wantY = d > 6 ? cruise : g.y;
    P.y += (wantY - P.y) * Math.min(1, dt * (d > 6 ? 2.5 : 3.5));
    this.group.position.set(P.x, P.y, P.z); this.group.rotation.set(-0.04, this.yaw, 0, 'YXZ');
    this.glow.position.set(P.x, P.y - 0.5, P.z); this.light.position.set(P.x, P.y - 0.2, P.z);
    this.animateThrusters(dt, t, 0.7);
    if ((d < 0.3 && Math.abs(P.y - g.y) < 0.15) || g.t > 8) {
      P.set(g.x, g.y, g.z); this.yaw = g.yaw; this.glide = null; this.vy = 0; this.speed = 0;
      this.lastSupport = g.y - 0.55; this.lastKind = 'road'; this.lastElevRoad = g.y - 0.55 > 1.2; this.lastEdge = null;
      this.onRoad = true; this.roadPitch = 0; this.placementRevision++;
      this.group.position.copy(P); this.group.rotation.set(0, this.yaw, 0, 'YXZ');
      this.glow.position.set(P.x, P.y - 0.5, P.z); this.light.position.set(P.x, P.y - 0.2, P.z);
    }
  }
  get forward() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  // rescue: glide on the cold-gas jets to a street spot (off a roof, out of a gap between buildings); needs no boost
  glide: { x: number; y: number; z: number; yaw: number; t: number } | null = null;
  glideTo(x: number, y: number, z: number, yaw: number) { this.glide = { x, y: y + 0.55, z, yaw, t: 0 }; this.flying = false; this.descending = false; this.speed = 0; this.vy = 0; }
  update(dt: number, inp: Input, t: number) {
    if (this.glide) { this.updateGlide(dt, t); return; }
    const air = this.flying || this.descending;
    // Flight has no fuel requirement or time limit. The same control toggles a safe landing.
    if (inp.flyPressed) {
      if (this.flying) { this.flying = false; this.descending = true; }
      else { this.flying = true; this.descending = false; }
    }
    // --- longitudinal ---
    const maxF = this.flying ? FLIGHT_SPEED_LIMIT : ROAD_SPEED_LIMIT;
    if (inp.throttle > 0) this.speed += (this.flying ? 12 : 9) * inp.throttle * dt;
    if (inp.brake > 0) this.speed -= (this.speed > 0.5 ? 20 : 6) * inp.brake * dt;
    if (inp.throttle <= 0 && inp.brake <= 0) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 4 * dt);
    this.speed = Math.max(-6, Math.min(this.speed, maxF));
    // --- steering (sharper at low speed, reversed when reversing) ---
    const sf = Math.min(1, Math.abs(this.speed) / 6) * (1 / (1 + Math.abs(this.speed) * 0.045));
    this.steerVis += (inp.steer - this.steerVis) * Math.min(1, dt * 8);
    this.yaw -= this.steerVis * sf * 2.1 * dt * Math.sign(this.speed || 1);
    const prev = this.pos.clone();
    const f = this.forward;
    this.pos.x += f.x * this.speed * dt; this.pos.z += f.z * this.speed * dt;
    // Flight clears a barrier only after the body is above it; pressing Space
    // beside a parapet must not disable collision during the initial ascent.
    {
      const w = collideWalls(this.city, prev, this.pos, 1.05, this.pos.y - 0.55, this.pos.y + 0.6);
      if (w.hit > 0.02) {
        // scrape along the barrier: keep the part of the speed parallel to it
        const f2 = this.forward, into = f2.x * -w.nx + f2.z * -w.nz;
        this.speed *= into > 0.5 ? 0.35 : 0.8;
        if (into > 0.25) this.yaw += Math.sign(f2.x * w.nz - f2.z * w.nx) * 0.02;
        this.bump = Math.max(this.bump, Math.min(0.5, w.hit * 0.6));
        if (this.hitCooldown <= 0 && into > 0.5 && Math.abs(this.speed) > 3) this.hitCooldown = 0.4;
      }
      if (w.kerb && this.kerbT <= 0) { this.kerbT = 0.35; this.bump = Math.max(this.bump, 0.18); if (Math.abs(this.speed) > 6) this.speed *= 0.85; }
    }
    this.kerbT -= dt;
    // --- vertical ---
    const sup = supportAt(this.city, this.pos.x, this.pos.z, this.pos.y - 0.55);
    const ground = sup.y + 0.55;
    if (this.flying) {
      // cruise at 24 m, climbing over anything taller just ahead
      if ((this.altT -= dt) <= 0) {
        this.altT = 0.25;
        const f2 = this.forward, P = this.pos;
        const roof = roofUnder(this.city, [[P.x, P.z], [P.x + f2.x * 15, P.z + f2.z * 15], [P.x + f2.x * 30, P.z + f2.z * 30], [P.x + f2.x * 45, P.z + f2.z * 45]]);
        this.flyAlt = Math.max(24, roof + 6);
      }
      this.pos.y += (this.flyAlt - this.pos.y) * Math.min(1, dt * 1.6);
    } else if (!air && this.onRoad && sup.onRoad && Math.abs(sup.y - this.lastSupport) <= Math.max(.2, Math.hypot(this.pos.x - prev.x, this.pos.z - prev.z) * .14 + .03)) {
      // Tyres follow a continuous grade in both directions. Applying free fall
      // on every small downhill step makes a descending car repeatedly detach.
      this.pos.y = ground; this.vy = 0;
    } else if (!air && this.lastElevRoad && sup.y < this.lastSupport - 1.5 && !this.continues(sup)) {
      // never roll off the side of a flyover deck: the parapet holds the car
      this.pos.x = prev.x; this.pos.z = prev.z; this.speed *= 0.5; this.bump = 0.3;
    } else if (this.descending || this.pos.y > ground + 0.05) {
      // falling: off a roof edge, or the protected landing after a flight
      this.vy -= 18 * dt; this.pos.y += this.vy * dt;
      if (this.descending) this.vy = Math.max(this.vy, -6);
      if (this.pos.y <= ground) { if (this.vy < -9) { this.bump = 0.6; this.speed *= 0.6; } this.pos.y = ground; this.vy = 0; this.descending = false; }
    } else { this.pos.y = ground; this.vy = 0; }
    const sup2 = this.flying || this.descending ? sup : supportAt(this.city, this.pos.x, this.pos.z, this.pos.y - 0.55);
    const grounded = !this.flying && !this.descending && this.pos.y - (sup2.y + 0.55) < 0.1;
    if (grounded) { this.lastSupport = sup2.y; this.lastKind = sup2.kind; this.lastElevRoad = sup2.elevatedRoad; this.lastEdge = sup2.s?.e || null; }
    this.onRoad = grounded && sup2.onRoad;
    // --- buildings ---
    const hit = collideBuildings(this.city, this.pos, 1.15, this.pos.y - 0.4);
    if (hit > 0.05) { this.speed *= 0.55; this.bump = Math.min(0.6, hit); }
    this.hitCooldown -= dt; this.bump = Math.max(0, this.bump - dt);
    // --- visuals ---
    this.group.position.set(this.pos.x, this.pos.y + (air ? Math.sin(t * 2.6) * 0.06 : 0), this.pos.z);
    let pitch = 0;
    if (!air && this.onRoad) {
      const nose = supportAt(this.city, this.pos.x + f.x * 1.6, this.pos.z + f.z * 1.6, this.pos.y - .55, true), tail = supportAt(this.city, this.pos.x - f.x * 1.6, this.pos.z - f.z * 1.6, this.pos.y - .55, true);
      if (nose.onRoad && tail.onRoad && Math.abs(nose.y - tail.y) < 1) pitch = Math.atan2(nose.y - tail.y, 3.2);
    }
    this.roadPitch = (this.roadPitch || 0) + (pitch - (this.roadPitch || 0)) * Math.min(1, dt * 12);
    this.group.rotation.set(air ? -0.06 : this.roadPitch, this.yaw, -this.steerVis * Math.min(1, Math.abs(this.speed) / 15) * 0.06, 'YXZ');
    this.glow.position.set(this.pos.x, (air ? sup.y : this.pos.y - 0.55) + 0.06, this.pos.z);
    this.glow.visible = this.pos.y - sup.y < 6;
    this.light.position.set(this.pos.x, this.pos.y - 0.2, this.pos.z);
    // wheels roll with the road speed, the front pair steers
    const spin = (this.speed * dt) / 0.36;
    // The model faces -Z, so its front wheel yaw has the same negative sign
    // as the actual change of vehicle yaw (including the visible reverse steer).
    this.wheels.forEach((w, i) => { w.rotation.y = i < 2 ? -this.steerVis * 0.38 : 0; });
    this.wheelRollers.forEach((w) => { w.rotation.x -= air ? spin * 0.2 : spin; });
    this.animateThrusters(dt, t, this.flying ? 1 : this.descending ? 0.35 : 0);
  }
  // One visual path for normal flight and rescue: deployment, plume and stow stay in sync.
  animateThrusters(dt: number, t: number, firing: number) {
    this.thrusterDeployment += ((firing > 0 ? 1 : 0) - this.thrusterDeployment) * Math.min(1, dt * 7);
    this.setDeployment(this.thrusterDeployment);
    this.group.updateMatrixWorld();
    if (firing > 0.7 && !this.wasFlying) { for (let k = 0; k < this.nozzles.length * 2; k++) this.puff(1.5, k); this.burst = 1; }
    this.burst = Math.max(0, this.burst - dt * 1.4);
    this.nozzles.forEach((nz, i) => {
      if (!nz.jet) return;
      nz.jet.visible = firing > 0;
      if (!firing) return;
      // Downward lift jets have the longest plume; rear outlets supply a shorter push.
      const lift = nz.dir.y < -0.5 ? 1 : 0.55;
      const flutter = 0.88 + Math.sin(t * 53 + i * 1.7) * 0.08 + Math.sin(t * 31 + i) * 0.04;
      const length = (0.65 + firing * 1.2 + this.burst) * lift * flutter;
      nz.jet.scale.set(0.8 + this.burst * 0.35, length, 0.8 + this.burst * 0.35);
    });
    this.wasFlying = firing > 0.7;
    this.puffAcc += dt * firing * 38;
    while (this.puffAcc >= 1) { this.puffAcc -= 1; this.puff(firing > 0.5 ? 1 : 0.6, Math.floor(Math.random() * this.nozzles.length)); }
    this.pods.forEach((p) => { p.visible = firing > 0; p.scale.setScalar(0.75 + firing * 0.25); (p.material as THREE.MeshBasicMaterial).color.setScalar(0.7 + firing * 0.5); });
    this.gas.update(dt);
  }
}

// alpha along a jet: solid at the nozzle (canvas top = tip), gone by the open end
let fadeTex: THREE.Texture | null = null;
function jetFade() {
  if (fadeTex) return fadeTex;
  const c = document.createElement('canvas'); c.width = 4; c.height = 64; const x = c.getContext('2d')!;
  const gr = x.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, '#fff'); gr.addColorStop(0.35, '#999'); gr.addColorStop(1, '#000');
  x.fillStyle = gr; x.fillRect(0, 0, 4, 64); return (fadeTex = new THREE.CanvasTexture(c));
}

// Vented cold gas: white condensate puffs that shoot out, slow down, swell and fade (a small sprite pool).
class GasPuffs {
  group = new THREE.Group(); items: { s: THREE.Sprite; v: THREE.Vector3; age: number; life: number; s0: number; s1: number }[] = []; next = 0;
  constructor(tex: THREE.Texture) {
    for (let i = 0; i < 120; i++) {
      const m = new THREE.SpriteMaterial({ map: tex, color: '#f2f8ff', transparent: true, opacity: 0, depthWrite: false });
      const s = new THREE.Sprite(m); s.visible = false; this.group.add(s);
      this.items.push({ s, v: new THREE.Vector3(), age: 1, life: 1, s0: 0.2, s1: 1 });
    }
  }
  emit(p: THREE.Vector3, v: THREE.Vector3, life: number, s0: number, s1: number) {
    const it = this.items[this.next]; this.next = (this.next + 1) % this.items.length;
    it.s.position.copy(p); it.v.copy(v); it.age = 0; it.life = life; it.s0 = s0; it.s1 = s1; it.s.visible = true;
  }
  update(dt: number) {
    for (const it of this.items) {
      if (!it.s.visible) continue;
      it.age += dt; const f = it.age / it.life;
      if (f >= 1) { it.s.visible = false; continue; }
      it.v.multiplyScalar(Math.max(0, 1 - dt * 3.2)); it.v.y += dt * 0.6;           // drag, a little lift as it warms
      it.s.position.addScaledVector(it.v, dt);
      const sc = it.s0 + (it.s1 - it.s0) * (1 - (1 - f) * (1 - f));
      it.s.scale.setScalar(sc);
      (it.s.material as THREE.SpriteMaterial).opacity = 0.72 * (1 - f) * Math.min(1, f * 8);
    }
  }
}
