import * as THREE from 'three';
import type { ArtApi, HeroCar, Quality, TrafficKind, TrafficTemplate, LandingMarker } from '../art/api';
import type { WorldCore, WorldChunk } from '../world/schema';
import type { Session } from '../missions/session';
import type { WorldPhysics } from '../world/collision';
import { forwardOf } from '../world/roadIndex';

const tmpV = new THREE.Vector3();

/** X east, Y up, Z south — identical to the simulation frame, so no axis conversion. */
export class GameView {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private env: { update(t: THREE.Vector3): void; dispose(): void } | null = null;
  private staticGroup = new THREE.Group();
  private chunkGroups = new Map<string, THREE.Group>();
  car: HeroCar | null = null;
  private templates: Record<TrafficKind, TrafficTemplate> | null = null;
  private pedTemplate: THREE.Object3D | null = null;
  private actorObjs = new Map<number, THREE.Object3D>();
  private pedObjs = new Map<number, THREE.Object3D>();
  private deliveryMarker: THREE.Object3D | null = null;
  private markerFor: string | null = null;
  landing: LandingMarker | null = null;
  private routeLine: THREE.Line | null = null;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private camInit = false;
  reducedShake = false;
  shake = 0;
  quality: Quality = 'standard';
  stats = { drawCalls: 0, triangles: 0, chunks: 0, actors: 0 };

  constructor(public renderer: THREE.WebGLRenderer, private art: ArtApi) {
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.3, 2200);
    this.scene.add(this.staticGroup);
  }

  async buildStatic(core: WorldCore, quality: Quality, onProgress: (s: string) => void): Promise<void> {
    this.quality = quality;
    onProgress('Preparing the road');
    this.env = this.art.buildEnvironment(this.scene, this.renderer, quality);
    await tick();
    this.staticGroup.add(this.art.buildRoads(core, quality));
    await tick();
    onProgress('Raising the metro viaduct');
    this.staticGroup.add(this.art.buildMetro(core, quality));
    await tick();
    onProgress('Preparing vehicles');
    this.car = this.art.createHeroCar(quality);
    this.scene.add(this.car.root);
    this.templates = this.art.createTrafficTemplates(quality);
    this.pedTemplate = this.art.createPedestrianTemplate(quality);
    this.landing = this.art.createLandingMarker();
    this.landing.setState('hidden');
    this.scene.add(this.landing.object);
  }

  addChunk(chunk: WorldChunk, core: WorldCore) {
    if (this.chunkGroups.has(chunk.id)) return;
    const g = this.art.buildChunk(chunk, core, this.quality);
    g.name = chunk.id;
    this.chunkGroups.set(chunk.id, g);
    this.scene.add(g);
  }
  removeChunk(id: string) {
    const g = this.chunkGroups.get(id);
    if (!g) return;
    this.scene.remove(g);
    g.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose(); });
    this.chunkGroups.delete(id);
  }
  get chunkIds() { return [...this.chunkGroups.keys()]; }

  /** shader warm-up before READY (P06) */
  warm() { this.renderer.compile(this.scene, this.camera); }

  setDeliveryMarker(polygon: [number, number][] | null, elevation: number, id: string | null) {
    if (this.markerFor === id) return;
    if (this.deliveryMarker) { this.scene.remove(this.deliveryMarker); this.deliveryMarker = null; }
    this.markerFor = id;
    if (polygon) { this.deliveryMarker = this.art.createDeliveryMarker(polygon, elevation); this.scene.add(this.deliveryMarker); }
  }

  setRoute(points: THREE.Vector3[] | null) {
    if (this.routeLine) { this.scene.remove(this.routeLine); this.routeLine.geometry.dispose(); this.routeLine = null; }
    if (!points || points.length < 2) return;
    const g = new THREE.BufferGeometry().setFromPoints(points);
    const m = new THREE.LineDashedMaterial({ color: 0x35d0ff, dashSize: 3, gapSize: 2, transparent: true, opacity: 0.85, depthWrite: false });
    this.routeLine = new THREE.Line(g, m);
    this.routeLine.computeLineDistances();
    this.routeLine.renderOrder = 2;
    this.scene.add(this.routeLine);
  }

  private syncActors(s: Session, alpha: number) {
    if (!this.templates || !this.pedTemplate) return;
    const live = new Set<number>();
    for (const a of s.traffic.actors) {
      live.add(a.id);
      let o = this.actorObjs.get(a.id);
      if (!o) {
        o = this.templates[a.kind].object.clone();
        o.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh && c.name === 'brake') m.material = (m.material as THREE.Material).clone(); });
        this.actorObjs.set(a.id, o); this.scene.add(o);
      }
      o.position.set(a.px + (a.x - a.px) * alpha, a.py + (a.y - a.py) * alpha, a.pz + (a.z - a.pz) * alpha);
      o.rotation.y = lerpAngle(a.pheading, a.heading, alpha);
      const brake = o.getObjectByName('brake') as THREE.Mesh | undefined;
      if (brake) { const m = brake.material as THREE.MeshStandardMaterial; if (m.emissiveIntensity !== undefined) m.emissiveIntensity = a.braking ? 2.2 : 0.25; }
    }
    for (const [id, o] of this.actorObjs) if (!live.has(id)) { this.scene.remove(o); this.actorObjs.delete(id); }
    const livep = new Set<number>();
    for (const p of s.traffic.peds) {
      livep.add(p.id);
      let o = this.pedObjs.get(p.id);
      if (!o) { o = this.pedTemplate.clone(); this.pedObjs.set(p.id, o); this.scene.add(o); }
      o.position.set(p.px + (p.x - p.px) * alpha, p.y, p.pz + (p.z - p.pz) * alpha);
      o.rotation.y = p.heading;
    }
    for (const [id, o] of this.pedObjs) if (!livep.has(id)) { this.scene.remove(o); this.pedObjs.delete(id); }
    this.stats.actors = this.actorObjs.size + this.pedObjs.size;
  }

  clearActors() {
    for (const o of this.actorObjs.values()) this.scene.remove(o);
    for (const o of this.pedObjs.values()) this.scene.remove(o);
    this.actorObjs.clear(); this.pedObjs.clear();
  }

  update(s: Session, world: WorldPhysics, alpha: number, dt: number) {
    const p = s.player;
    const x = p.prev.x + (p.x - p.prev.x) * alpha;
    const y = p.prev.y + (p.y - p.prev.y) * alpha;
    const z = p.prev.z + (p.z - p.prev.z) * alpha;
    const h = lerpAngle(p.prev.heading, p.heading, alpha);
    if (this.car) {
      this.car.root.position.set(x, y, z);
      this.car.root.rotation.set(0, h, 0);
      // gentle visual pitch in flight / bank on steer — visual only
      if (p.isAirborne) { this.car.root.rotateX(Math.max(-0.12, Math.min(0.12, p.vy * 0.03))); this.car.root.rotateZ(-p.steerAngle * 0.5); }
      this.car.animate(dt, p.speed, p.steerAngle);
      this.car.setThruster(p.isAirborne ? (p.move === 'TAKEOFF' ? 1 : p.move === 'DESCENDING' ? 0.6 : 0.75) : p.move === 'LANDING_CONFIRM' ? 0.3 : 0);
      this.car.setBrakeLights(p.speed < 0.5 || (s as any)._brakeHeld === true);
      this.car.setReverseLights(p.reverseEngaged);
    }
    if (this.landing) {
      const f = p.forecast;
      if (p.isAirborne && f.state !== 'hidden') {
        this.landing.setState(f.state);
        this.landing.object.position.set(f.x, f.y + 0.06, f.z);
      } else this.landing.setState('hidden');
    }
    this.syncActors(s, alpha);
    this.updateCamera(x, y, z, h, p.isAirborne, p.speed, world, dt);
    this.env?.update(tmpV.set(x, y, z));
  }

  private updateCamera(x: number, y: number, z: number, h: number, air: boolean, speed: number, world: WorldPhysics, dt: number) {
    const [fx, fz] = forwardOf(h);
    const back = air ? 11.5 : 7.2 + Math.min(2, Math.abs(speed) * 0.08);
    const up = air ? 6.0 : 3.1;
    let tx = x - fx * back, tz = z - fz * back, ty = y + up;
    // keep camera out of buildings: pull in along the boom until clear
    for (let k = 0; k < 6; k++) {
      if (!world.buildingAt(tx, tz)) break;
      tx = x - fx * back * (1 - (k + 1) * 0.14); tz = z - fz * back * (1 - (k + 1) * 0.14); ty += 0.6;
    }
    // stay under an overhead deck when the car is under it
    const over = world.overheadAt(x, z, y);
    if (over.bottom < Infinity) ty = Math.min(ty, over.bottom - 0.6);
    const lookAhead = air ? 9 : 6 + Math.abs(speed) * 0.35;
    const lx = x + fx * lookAhead, lz = z + fz * lookAhead, ly = y + (air ? -1.2 : 1.0);
    const k = this.camInit ? 1 - Math.exp(-dt * 5.5) : 1;
    this.camPos.x += (tx - this.camPos.x) * k; this.camPos.y += (ty - this.camPos.y) * k; this.camPos.z += (tz - this.camPos.z) * k;
    this.camLook.x += (lx - this.camLook.x) * k; this.camLook.y += (ly - this.camLook.y) * k; this.camLook.z += (lz - this.camLook.z) * k;
    this.camInit = true;
    this.camera.position.copy(this.camPos);
    if (this.shake > 0 && !this.reducedShake) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 1.5);
    }
    this.camera.lookAt(this.camLook);
    const targetFov = air ? 66 : 60 + Math.min(6, Math.abs(speed) * 0.3);
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 2);
    this.camera.updateProjectionMatrix();
  }

  resetCamera() { this.camInit = false; }

  /** static overview camera for menus */
  menuCamera(t: number, cx: number, cz: number) {
    const r = 140;
    this.camera.position.set(cx + Math.cos(t * 0.05) * r, 70, cz + Math.sin(t * 0.05) * r);
    this.camera.lookAt(cx, 8, cz);
    this.env?.update(tmpV.set(cx, 0, cz));
  }

  render() {
    this.renderer.render(this.scene, this.camera);
    const info = this.renderer.info.render;
    this.stats.drawCalls = info.calls; this.stats.triangles = info.triangles; this.stats.chunks = this.chunkGroups.size;
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }
}

function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}
const tick = () => new Promise((r) => setTimeout(r, 0));
