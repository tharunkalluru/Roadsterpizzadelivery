import * as THREE from 'three';
import { buildSourceLandscape } from '../art/sourceLandscape';
import type { ArtApi, HeroCar, Quality, TrafficKind, TrafficTemplate, LandingMarker } from '../art/api';
import type { WorldCore, WorldChunk, RoadEdge } from '../world/schema';
import type { Session } from '../missions/session';
import type { WorldPhysics } from '../world/collision';
import { forwardOf } from '../world/roadIndex';
import { SignalSystem } from '../traffic/signals';
import { SIM_HZ } from '../config/gameplay';
import { buildStreetscape, type StreetscapeData } from '../art/streetscape';
import { updateBicycleAnimation } from '../art/bicycleAnimation';

/** must equal ROAD_TILE in src/art/roads.ts (the art bundle is loaded separately) */
const ROAD_TILE = 480;
const roadTileKey = (x: number, z: number) => `${Math.floor(x / ROAD_TILE)}_${Math.floor(z / ROAD_TILE)}`;
/** worlds with more road edges than this stream road geometry by tile */
const ROAD_STREAM_MIN = 3000;

const tmpV = new THREE.Vector3();
const cameraDragBindings = new WeakMap<HTMLCanvasElement, () => void>();

/** X east, Y up, Z south — identical to the simulation frame, so no axis conversion. */
export class GameView {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private env: { update(t: THREE.Vector3,dt?:number): void; setAtmosphere?(state:{timeOfDay:'day'|'dusk'|'night';weather:'clear'|'rain'}):void;setTerrainCore?(core:WorldCore):void;bindTerrainObject?(object:THREE.Object3D):void; dispose(): void } | null = null;
  private atmosphere:{timeOfDay:'day'|'dusk'|'night';weather:'clear'|'rain'}={timeOfDay:'day',weather:'clear'};
  setAtmosphere(state:{timeOfDay:'day'|'dusk'|'night';weather:'clear'|'rain'}) { this.atmosphere={...state};this.env?.setAtmosphere?.(state);this.car?.setHeadlights?.(state.timeOfDay!=='day'||state.weather==='rain'); }
  private staticGroup = new THREE.Group();
  private chunkGroups = new Map<string, THREE.Group>();
  car: HeroCar | null = null;
  private templates: Record<TrafficKind, TrafficTemplate> | null = null;
  private pedTemplate: THREE.Object3D | null = null;
  private actorObjs = new Map<number, THREE.Object3D>();
  private actorMaterials = new WeakMap<THREE.Object3D, THREE.Material[]>();
  private pedObjs = new Map<number, THREE.Object3D>();
  private deliveryMarker: THREE.Object3D | null = null;
  private markerFor: string | null = null;
  landing: LandingMarker | null = null;
  private routeLine: THREE.Line | null = null;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private camInit = false;
  private cameraOrbit = 0;
  private cameraPitch = 0;
  private lookAllowed = false;
  private lookPointer: number | null = null;
  private lookX = 0;
  private lookY = 0;
  private lookCanvas: HTMLCanvasElement | null = null;
  private releaseLookListeners: (() => void) | null = null;
  reducedShake = false;
  shake = 0;
  quality: Quality = 'standard';
  stats = { drawCalls: 0, triangles: 0, chunks: 0, actors: 0 };
  private metroVisual: THREE.Group | null = null;
  get metroAmbience():number { return Math.max(0,Math.min(1,Number(this.metroVisual?.userData.nearbySound??0))); }
  private presentationTime = 0;
  private signalHeads: { edge: string; lamps: THREE.MeshStandardMaterial[] }[] = [];

  /** signal heads at signalled junctions (S03); lamp position + colour, so state is not colour-only */
  buildSignals(sig: SignalSystem, world: WorldPhysics) {
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.11, 5.2, 8);
    const boxGeo = new THREE.BoxGeometry(0.45, 1.25, 0.35);
    const lampGeo = new THREE.SphereGeometry(0.14, 12, 8);
    const dark = new THREE.MeshStandardMaterial({ color: 0x1b1f24, roughness: 0.6, metalness: 0.4 });
    for (const n of sig.nodes) for (const ap of n.approaches) {
      const e = world.nav.edges.get(ap.edge)!;
      const road = world.roads.roads.get(e.roadId)!;
      const p = world.nav.pointOnDirected(ap.edge, Math.max(0, e.lengthM - 5));
      const [fx, fz] = forwardOf(p.heading);
      const side = road.widthM / 2 + 0.8; // left kerb (left-hand traffic)
      const g = new THREE.Group();
      g.position.set(p.x + fz * side, p.y, p.z - fx * side);
      g.rotation.y = p.heading + Math.PI; // face oncoming traffic
      const pole = new THREE.Mesh(poleGeo, dark); pole.position.y = 2.6; g.add(pole);
      const box = new THREE.Mesh(boxGeo, dark); box.position.set(0, 4.6, 0); g.add(box);
      const lamps: THREE.MeshStandardMaterial[] = [];
      [0xff3b30, 0xffb020, 0x34c759].forEach((c, i) => {
        const m = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: c, emissiveIntensity: 0.05 });
        const l = new THREE.Mesh(lampGeo, m); l.position.set(0, 5.0 - i * 0.4, -0.2); g.add(l); lamps.push(m);
      });
      this.scene.add(g);
      this.signalHeads.push({ edge: ap.edge, lamps });
    }
  }
  updateSignals(sig: SignalSystem, tick: number) {
    for (const h of this.signalHeads) {
      const c = sig.colorFor(h.edge, tick);
      h.lamps[0].emissiveIntensity = c === 'red' ? 3 : 0.05;
      h.lamps[1].emissiveIntensity = c === 'amber' ? 3 : 0.05;
      h.lamps[2].emissiveIntensity = c === 'green' ? 3 : 0.05;
    }
  }

  constructor(public renderer: THREE.WebGLRenderer, private art: ArtApi) {
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.3, 2200);
    this.scene.add(this.staticGroup);
    this.bindCameraLook(renderer.domElement);
  }

  /** Canvas-only gesture: UI controls keep their own independent pointers. */
  private bindCameraLook(canvas: HTMLCanvasElement | undefined) {
    if (!canvas?.addEventListener) return;
    cameraDragBindings.get(canvas)?.();
    this.lookCanvas = canvas;
    const down = (e: PointerEvent) => {
      if (!this.lookAllowed || this.lookPointer !== null || e.button !== 0 || e.target !== canvas) return;
      this.lookPointer = e.pointerId; this.lookX = e.clientX; this.lookY = e.clientY;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* pointer cancel/up still releases */ }
      e.preventDefault();
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== this.lookPointer || !this.lookAllowed) return;
      this.cameraOrbit = Math.max(-Math.PI, Math.min(Math.PI, this.cameraOrbit + (e.clientX - this.lookX) * .006));
      // Pull the scene downward to look up at upper-floor shops; only the aim changes.
      this.cameraPitch = Math.max(-.25, Math.min(.65, this.cameraPitch + (e.clientY - this.lookY) * .004));
      this.lookX = e.clientX; this.lookY = e.clientY;
      e.preventDefault();
    };
    const end = (e: PointerEvent) => { if (e.pointerId === this.lookPointer) this.endCameraLook(); };
    const blur = () => this.endCameraLook();
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) canvas.addEventListener(name, end);
    if (typeof window !== 'undefined') window.addEventListener('blur', blur);
    this.releaseLookListeners = () => {
      this.endCameraLook();
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
      for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) canvas.removeEventListener(name, end);
      if (typeof window !== 'undefined') window.removeEventListener('blur', blur);
      if (cameraDragBindings.get(canvas) === this.releaseLookListeners) cameraDragBindings.delete(canvas);
      this.lookCanvas = null;
    };
    cameraDragBindings.set(canvas, this.releaseLookListeners);
  }

  private endCameraLook() {
    const pointer = this.lookPointer; this.lookPointer = null;
    if (pointer !== null) try { this.lookCanvas?.releasePointerCapture(pointer); } catch { /* capture may already be lost */ }
  }

  disposeCameraControls() { this.releaseLookListeners?.(); this.releaseLookListeners = null; }

  async buildStatic(core: WorldCore, quality: Quality, onProgress: (s: string) => void): Promise<void> {
    this.quality = quality;
    this.camera.far = quality === 'low' ? 650 : quality === 'high' ? 1700 : 1100; // fog far + margin (art notes)
    this.camera.updateProjectionMatrix();
    onProgress('Preparing the road');
    this.env = this.art.buildEnvironment(this.scene, this.renderer, quality);
    this.env.setTerrainCore?.(core);
    this.env.setAtmosphere?.(this.atmosphere);
    this.staticGroup.add(buildSourceLandscape(core));
    await tick();
    if (core.roads.length > ROAD_STREAM_MIN) this.initRoadStream(core); // whole network: stream road tiles around the camera
    else this.staticGroup.add(this.art.buildRoads(core, quality));
    await tick();
    onProgress('Raising the metro viaduct');
    this.metroVisual = this.art.buildMetro(core, quality);
    this.staticGroup.add(this.metroVisual);
    if ((core as any).structures?.length && this.artExtras.buildStructures) this.staticGroup.add(this.artExtras.buildStructures(core, quality));
    await tick();
    const streetscape=(core as WorldCore & {streetscape?:StreetscapeData}).streetscape;
    if(streetscape)this.staticGroup.add(buildStreetscape(streetscape,core,quality));
    this.env.bindTerrainObject?.(this.staticGroup);
    onProgress('Preparing vehicles');
    this.car = this.art.createHeroCar(quality);
    this.car.setHeadlights?.(this.atmosphere.timeOfDay!=='day'||this.atmosphere.weather==='rain');
    this.scene.add(this.car.root);
    this.templates = this.art.createTrafficTemplates(quality);
    this.pedTemplate = this.art.createPedestrianTemplate(quality);
    this.landing = this.art.createLandingMarker();
    this.landing.setState('hidden');
    this.scene.add(this.landing.object);
  }

  /** optional v2 art builders (storefronts, structures) exported outside the ArtApi contract */
  artExtras: { buildStorefronts?: (c: any, core: WorldCore, q: Quality) => THREE.Group; disposeStorefronts?: (g: THREE.Object3D) => void; buildStructures?: (core: any, q: Quality) => THREE.Group } = {};

  addChunk(chunk: WorldChunk, core: WorldCore) {
    if (this.chunkGroups.has(chunk.id)) return;
    const g = this.art.buildChunk(chunk, core, this.quality);
    const sf = (chunk as any).storefronts as unknown[] | undefined;
    if (sf?.length && this.artExtras.buildStorefronts) { const sg = this.artExtras.buildStorefronts(chunk, core, this.quality); sg.name = 'storefronts'; g.add(sg); }
    g.name = chunk.id;
    this.chunkGroups.set(chunk.id, g);
    this.scene.add(g);
    this.env?.bindTerrainObject?.(g);
  }
  removeChunk(id: string) {
    const g = this.chunkGroups.get(id);
    if (!g) return;
    this.scene.remove(g);
    const sg = g.getObjectByName('storefronts');
    if (sg) this.artExtras.disposeStorefronts?.(sg); // per-chunk sign atlas textures
    g.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose(); });
    this.chunkGroups.delete(id);
  }
  get chunkIds() { return [...this.chunkGroups.keys()]; }

  /** shader warm-up before READY (P06) */
  warm() { this.renderer.compile(this.scene, this.camera); }

  setDeliveryMarker(polygon: [number, number][] | null, elevation: number, id: string | null) {
    if (this.markerFor === id) return;
    if (this.deliveryMarker) { this.scene.remove(this.deliveryMarker); this.deliveryMarker.userData.dispose?.(); this.deliveryMarker = null; }
    this.markerFor = id;
    if (polygon) { this.deliveryMarker = this.art.createDeliveryMarker(polygon, elevation); this.scene.add(this.deliveryMarker); }
  }

  setRoute(points: THREE.Vector3[] | null) {
    if (this.routeLine) { this.scene.remove(this.routeLine); this.routeLine.geometry.dispose();for(const mat of Array.isArray(this.routeLine.material)?this.routeLine.material:[this.routeLine.material])mat.dispose(); this.routeLine = null; }
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
        const tmpl = this.templates[a.kind].object;
        const variants = (tmpl.userData.paintVariants as (string | number)[] | undefined) ?? [];
        const ownedMaterials:THREE.Material[]=[];
        o.traverse((c) => {
          const m = c as THREE.Mesh;
          if (!m.isMesh) return;
          if (c.name === 'brake') { const mat=(m.material as THREE.Material).clone();m.material=mat;ownedMaterials.push(mat); }
          // cosmetic paint variety from the actor id (never affects simulation)
          if (c.name === 'body' && variants.length) { const mat = (m.material as THREE.MeshStandardMaterial).clone(); mat.color.set(variants[a.id % variants.length] as any); m.material = mat;ownedMaterials.push(mat); }
        });
        this.actorMaterials.set(o,ownedMaterials);
        this.actorObjs.set(a.id, o); this.scene.add(o);
      }
      o.position.set(a.px + (a.x - a.px) * alpha, a.py + (a.y - a.py) * alpha, a.pz + (a.z - a.pz) * alpha);
      o.rotation.y = lerpAngle(a.pheading, a.heading, alpha);
      if(a.kind==='bicycle'){
        const moved=Math.hypot(o.position.x-(o.userData.cycleX??o.position.x),o.position.z-(o.userData.cycleZ??o.position.z));
        // Accumulate actual movement so a new directed edge never resets the crank phase.
        o.userData.cycleDistance=(o.userData.cycleDistance??a.along)+(moved<10?moved:0);
        o.userData.cycleX=o.position.x;o.userData.cycleZ=o.position.z;
        updateBicycleAnimation(o,o.userData.cycleDistance);
      }
      const brake = o.getObjectByName('brake') as THREE.Mesh | undefined;
      if (brake) { const m = brake.material as THREE.MeshStandardMaterial; if (m.emissiveIntensity !== undefined) m.emissiveIntensity = a.braking ? 2.2 : 0.25; }
    }
    for (const [id, o] of this.actorObjs) if (!live.has(id)) { this.releaseActor(o); this.actorObjs.delete(id); }
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

  private releaseActor(o:THREE.Object3D) {
    this.scene.remove(o);
    o.traverse(c=>{if((c as THREE.InstancedMesh).isInstancedMesh)(c as THREE.InstancedMesh).dispose();});
    for(const mat of this.actorMaterials.get(o)??[])mat.dispose();
    this.actorMaterials.delete(o);
  }

  clearActors() {
    for (const o of this.actorObjs.values()) this.releaseActor(o);
    for (const o of this.pedObjs.values()) this.scene.remove(o);
    this.actorObjs.clear(); this.pedObjs.clear();
  }

  update(s: Session, world: WorldPhysics, alpha: number, dt: number) {
    this.presentationTime = s.tick / SIM_HZ;
    const p = s.player;
    const x = p.prev.x + (p.x - p.prev.x) * alpha;
    const y = p.prev.y + (p.y - p.prev.y) * alpha;
    const z = p.prev.z + (p.z - p.prev.z) * alpha;
    const h = lerpAngle(p.prev.heading, p.heading, alpha);
    if (this.car) {
      this.car.root.position.set(x, y, z);
      const suspension = p as typeof p & { suspensionPitch?: number; suspensionRoll?: number; curbImpact?: number };
      this.car.root.rotation.set(0, h, 0);
      this.car.root.rotateX(suspension.suspensionPitch ?? 0);
      this.car.root.rotateZ(suspension.suspensionRoll ?? 0);
      // gentle visual pitch in flight / bank on steer — visual only
      if (p.isAirborne) { this.car.root.rotateX(Math.max(-0.12, Math.min(0.12, p.vy * 0.03))); this.car.root.rotateZ(-p.steerAngle * 0.5); }
      const ground=world.roads.surface(x,z,{maxY:y+.3,margin:0});
      this.car.setFlightContext?.({heightM:Math.max(0,y-(ground?.elevation??0)),verticalSpeed:p.vy,speedMps:p.speed,steerRad:p.steerAngle});
      this.car.animate(dt, p.speed, p.steerAngle);
      this.car.setThruster(p.isAirborne ? (p.move === 'TAKEOFF' ? 1 : p.move === 'DESCENDING' ? 0.6 : 0.75) : p.move === 'LANDING_CONFIRM' ? 0.3 : 0);
      this.car.setCargoLoaded?.(s.cargoLoaded);
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
    if (this.signalHeads.length) this.updateSignals(s.traffic.signals, s.traffic.tick);
    this.updateCamera(x, y, z, h, p.isAirborne, p.speed, world, dt);
    this.env?.update(tmpV.set(x, y, z),dt);
    this.metroVisual?.userData.update?.(this.presentationTime, tmpV);
  }

  private updateCamera(x: number, y: number, z: number, h: number, air: boolean, speed: number, world: WorldPhysics, dt: number) {
    this.lookAllowed = !air && Math.abs(speed) <= .75;
    if (!this.lookAllowed) {
      this.endCameraLook();
      this.cameraOrbit *= Math.exp(-dt * 1.6);
      this.cameraPitch *= Math.exp(-dt * 1.6);
      if (Math.abs(this.cameraOrbit) < .001) this.cameraOrbit = 0;
      if (Math.abs(this.cameraPitch) < .001) this.cameraPitch = 0;
    }
    const [fx, fz] = forwardOf(h + this.cameraOrbit);
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
    const lx = x + fx * lookAhead, lz = z + fz * lookAhead;
    const ly = y + (air ? -1.2 : 1.0) + Math.tan(this.cameraPitch) * (back + lookAhead);
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

  resetCamera() { this.camInit = false; this.cameraOrbit = 0; this.cameraPitch = 0; this.lookAllowed = false; this.endCameraLook(); }

  /** static overview camera for menus */
  menuCamera(t: number, cx: number, cz: number) {
    this.lookAllowed = false; this.endCameraLook();
    const r = 140;
    this.camera.position.set(cx + Math.cos(t * 0.05) * r, 70, cz + Math.sin(t * 0.05) * r);
    this.camera.lookAt(cx, 8, cz);
    this.env?.update(tmpV.set(cx, 0, cz));
    this.metroVisual?.userData.update?.(t, tmpV);
  }

  // ---- road tile streaming (v2 whole network: ~650 km of roads would be ~4 M triangles if built at once)
  private roadCore: WorldCore | null = null;
  private roadTileIndex = new Map<string, RoadEdge[]>();
  private roadTiles = new Map<string, THREE.Group>();

  private initRoadStream(core: WorldCore) {
    this.roadCore = core;
    this.roadTileIndex.clear();
    const M = 40; // margin: roads ending just outside a tile still shape its junction fills and deck frames
    for (const r of core.roads) {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const [x, z] of r.points) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      for (let ix = Math.floor((x0 - M) / ROAD_TILE); ix <= Math.floor((x1 + M) / ROAD_TILE); ix++)
        for (let iz = Math.floor((z0 - M) / ROAD_TILE); iz <= Math.floor((z1 + M) / ROAD_TILE); iz++) {
          const k = `${ix}_${iz}`;
          let l = this.roadTileIndex.get(k);
          if (!l) this.roadTileIndex.set(k, (l = []));
          l.push(r);
        }
    }
  }

  private buildRoadTile(key: string) {
    const core = this.roadCore!;
    const roads = this.roadTileIndex.get(key) ?? [];
    const ids = new Set<string>();
    for (const r of roads) { ids.add(r.fromNode); ids.add(r.toNode); }
    const sub = { ...core, roads, nodes: core.nodes.filter((n) => ids.has(n.id)) } as WorldCore;
    const g = roads.length ? this.art.buildRoads(sub, this.quality, key) : new THREE.Group();
    g.name = `roadtile_${key}`;
    this.roadTiles.set(key, g);
    this.staticGroup.add(g);
    this.env?.bindTerrainObject?.(g);
  }

  private disposeRoadTile(key: string) {
    const g = this.roadTiles.get(key);
    if (!g) return;
    this.staticGroup.remove(g);
    g.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose(); });
    for (const geo of (g.userData.sharedGeometries ?? []) as THREE.BufferGeometry[]) geo.dispose();
    this.roadTiles.delete(key);
  }

  /** keep road tiles within view range of (x, z); `budget` = tiles to build now (nearest first) */
  updateRoadTiles(x: number, z: number, budget = 1) {
    if (!this.roadCore) return;
    const R = this.camera.far * 0.9;
    const ix0 = Math.floor((x - R) / ROAD_TILE), ix1 = Math.floor((x + R) / ROAD_TILE);
    const iz0 = Math.floor((z - R) / ROAD_TILE), iz1 = Math.floor((z + R) / ROAD_TILE);
    const want: [string, number][] = [];
    for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
      const cx = (ix + 0.5) * ROAD_TILE, cz = (iz + 0.5) * ROAD_TILE;
      const d = Math.hypot(cx - x, cz - z) - ROAD_TILE * 0.71;
      const k = `${ix}_${iz}`;
      if (d < R && this.roadTileIndex.has(k) && !this.roadTiles.has(k)) want.push([k, d]);
    }
    want.sort((a, b) => a[1] - b[1]);
    for (let i = 0; i < Math.min(budget, want.length); i++) this.buildRoadTile(want[i][0]);
    for (const k of [...this.roadTiles.keys()]) {
      const [ix, iz] = k.split('_').map(Number);
      const d = Math.hypot((ix + 0.5) * ROAD_TILE - x, (iz + 0.5) * ROAD_TILE - z) - ROAD_TILE * 0.71;
      if (d > R + 500) this.disposeRoadTile(k);
    }
  }

  get roadTileCount() { return this.roadTiles.size; }

  render() {
    // the nearest missing tile is built at once (never drive on invisible road); further ones one per frame
    if (this.roadCore) {
      const k = roadTileKey(this.camera.position.x, this.camera.position.z);
      this.updateRoadTiles(this.camera.position.x, this.camera.position.z, this.roadTiles.has(k) ? 1 : 2);
    }
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
