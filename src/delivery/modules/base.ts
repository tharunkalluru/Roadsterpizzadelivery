import * as THREE from 'three';
import type { MovingRailBody } from '../../game/moving-rail';
import type { DeliveryModule, DeliveryModuleContext, DeliveryPoint, ModuleMovement, ModuleParams, ModuleStatus } from './types';

export const numberParam = (p: ModuleParams, key: string, fallback: number, min = 0, max = Infinity) => {
  const value = p[key]; return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
};
export const distanceXZ = (a: Pick<DeliveryPoint, 'x' | 'z'>, b: Pick<DeliveryPoint, 'x' | 'z'>) => Math.hypot(a.x - b.x, a.z - b.z);
export const heading = (yaw: number) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });

/** Local, disposable set dressing: no lights, shadows or city-wide updates. */
export abstract class ModuleBase implements DeliveryModule {
  protected ctx!: DeliveryModuleContext;
  protected params: ModuleParams = {};
  protected root = new THREE.Group();
  protected ring!: THREE.Mesh;
  protected geometries = new Set<THREE.BufferGeometry>();
  protected materials = new Map<string, THREE.MeshBasicMaterial>();
  protected instances = new Set<THREE.InstancedMesh>();
  protected time = 0;
  protected ended = false;
  protected ready = false;
  protected failureTime = 0;
  protected dropFeedback = '';
  protected bodies: MovingRailBody[] = [];
  target: DeliveryPoint = { x: 0, y: 0, z: 0, label: '' };
  status: ModuleStatus = { instruction: '', canDrop: false, actionLabel: 'DROP' };
  movement: ModuleMovement = { mode: 'normal' };
  get supports(): readonly MovingRailBody[] { return this.bodies; }

  setup(ctx: DeliveryModuleContext, params: ModuleParams = {}) {
    this.teardown(); this.ctx = ctx; this.params = params; this.time = 0; this.ended = false; this.ready = true;
    this.target = { ...ctx.destination }; this.root = new THREE.Group(); this.root.name = 'delivery-setpiece';
    this.root.position.set(ctx.destination.x, ctx.destination.y, ctx.destination.z); ctx.scene.add(this.root);
    this.ring = new THREE.Mesh(this.own(new THREE.RingGeometry(2.8, 3.15, 36)), this.mat('#45E3D3'));
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = .08; this.ring.name = 'delivery-target-ring'; this.root.add(this.ring);
    this.build(); this.setTarget(this.target);
  }
  protected abstract build(): void;
  abstract update(dt: number): void;
  abstract onDrop(): void;
  protected tick(dt: number) {
    if (!this.ready || this.ended) return false;
    const elapsed = Math.max(0, Math.min(Number.isFinite(dt) ? dt : 0, .1)); this.time += elapsed;
    this.failureTime = Math.max(0, this.failureTime - elapsed);
    if (!this.failureTime) { this.status.failure = undefined; this.dropFeedback = ''; }
    this.root.visible = distanceXZ(this.ctx.player(), this.ctx.destination) < 850;
    return true;
  }
  protected own<T extends THREE.BufferGeometry>(geometry: T): T { this.geometries.add(geometry); return geometry; }
  protected ownInstances<T extends THREE.InstancedMesh>(mesh: T): T { this.instances.add(mesh); return mesh; }
  protected mat(color: string) {
    let material = this.materials.get(color);
    if (!material) { material = new THREE.MeshBasicMaterial({ color, toneMapped: false, side: THREE.DoubleSide }); this.materials.set(color, material); }
    return material;
  }
  protected box(x: number, y: number, z: number, width: number, height: number, depth: number, color: string, parent = this.root) {
    const mesh = new THREE.Mesh(this.own(new THREE.BoxGeometry(width, height, depth)), this.mat(color));
    mesh.position.set(x, y, z); parent.add(mesh); return mesh;
  }
  /** For axis-aligned structural scenery only: collision exactly matches the visible box. */
  protected solidBox(x: number, y: number, z: number, width: number, height: number, depth: number, color: string, parent = this.root) {
    const mesh = this.box(x, y, z, width, height, depth, color, parent);
    parent.updateWorldMatrix(true, false);
    const world = new THREE.Vector3(x, y, z).applyMatrix4(parent.matrixWorld);
    this.bodies.push({ id: `delivery-structure:${this.bodies.length}`, x: world.x, y: world.y, z: world.z, hx: 0, hz: 1,
      halfWidth: width / 2, halfLength: depth / 2, bottom: world.y - height / 2, roof: world.y + height / 2,
      previous: { x: world.x, y: world.y, z: world.z, hx: 0, hz: 1 } });
    return mesh;
  }
  protected cylinder(x: number, y: number, z: number, radius: number, height: number, color: string, parent = this.root) {
    const mesh = new THREE.Mesh(this.own(new THREE.CylinderGeometry(radius, radius, height, 12)), this.mat(color));
    mesh.position.set(x, y, z); parent.add(mesh); return mesh;
  }
  protected person(x: number, y: number, z: number, color = '#F6EEDC', parent = this.root) {
    const group = new THREE.Group(); group.position.set(x, y, z); parent.add(group);
    this.box(0, 1.2, 0, .6, .85, .38, color, group); this.cylinder(0, 1.95, 0, .23, .4, '#B7825F', group);
    this.box(-.18, .45, 0, .23, .8, .25, '#272138', group); this.box(.18, .45, 0, .23, .8, .25, '#272138', group);
    return group;
  }
  protected setTarget(point: DeliveryPoint) {
    Object.assign(this.target, point);
    if (this.ctx?.destination) this.ring?.position.set(point.x - this.ctx.destination.x, point.y - this.ctx.destination.y + .08, point.z - this.ctx.destination.z);
    this.ctx?.onTarget?.({ ...this.target });
  }
  protected within(radius = 7, altitude = 8) {
    const p = this.ctx.player(); return distanceXZ(p, this.target) <= radius && Math.abs(p.y - this.target.y) <= altitude;
  }
  protected unlocked() { return this.ready && (this.ctx.canInteract?.() ?? true); }
  protected fail(reason: string, step?: number) {
    if (this.ended || !this.unlocked()) return;
    this.failureTime = 2.5; this.status.failure = reason; this.dropFeedback = reason;
    this.ctx.cue?.('retry'); this.ctx.emit('failed', { reason, step });
  }
  protected done() {
    if (this.ended || !this.unlocked()) return;
    this.ended = true; this.status.canDrop = false; this.ctx.cue?.('success'); this.ctx.emit('done');
  }
  protected platform(width: number, depth: number, top: number, color = '#45364F') {
    this.box(0, top - .22, 0, width, .44, depth, color);
    const d = this.ctx.destination;
    this.bodies.push({ id: `delivery-platform:${d.x}:${d.z}`, x: d.x, y: d.y, z: d.z, hx: 0, hz: 1,
      halfWidth: width / 2, halfLength: depth / 2, bottom: d.y + top - .44, roof: d.y + top,
      previous: { x: d.x, y: d.y, z: d.z, hx: 0, hz: 1 } });
  }
  teardown() {
    for (const mesh of this.instances) mesh.dispose();
    this.instances.clear();
    this.root.removeFromParent(); this.root.clear();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials.values()) material.dispose();
    this.geometries.clear(); this.materials.clear(); this.bodies.length = 0;
    this.ready = false; this.ended = false; this.failureTime = 0; this.status.canDrop = false; this.movement = { mode: 'normal' };
  }
}
