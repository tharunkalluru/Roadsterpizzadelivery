import * as THREE from 'three';
import { ModuleBase, numberParam } from './base';
import type { DeliveryPoint } from './types';

/** The opening must be crossed before a handover at the seat can count. */
export class ThreadGap extends ModuleBase {
  private entered = false;
  private previous = { x: 0, y: 0, z: 0 };
  private width = 10;
  private height = 8;
  private entry = 14;
  private beam!: THREE.Mesh;
  private beamX = 0;
  private hazardLatch = false;
  private entranceTarget: DeliveryPoint = { x: 0, y: 0, z: 0 };
  private seatTarget: DeliveryPoint = { x: 0, y: 0, z: 0 };
  protected build() {
    this.entered = false; this.hazardLatch = false;
    this.width = numberParam(this.params, 'width', 10, 6, 18);
    this.height = numberParam(this.params, 'height', 8, 5, 14);
    this.entry = numberParam(this.params, 'entryDepth', 14, 10, 30);
    const d = this.ctx.destination, p = this.ctx.player(); this.previous = { x: p.x, y: p.y, z: p.z };
    this.platform(34, this.entry * 2 + 8, 0, '#161322');
    this.solidBox(-16.5, 7, 0, 1, 14, this.entry * 2 + 8, '#261832');
    this.solidBox(16.5, 7, 0, 1, 14, this.entry * 2 + 8, '#261832');
    for (const side of [-1, 1]) this.solidBox(side * (8.25 + this.width / 4), 5, this.entry, 16.5 - this.width / 2, 10, .8, '#34213F');
    this.solidBox(0, this.height + 1, this.entry, this.width, 2, .8, '#B18DD1');
    this.solidBox(0, 6, -this.entry - 3, 29, 11, .6, '#34213F');
    this.box(0, 6, -this.entry - 2.65, 23, 8, .1, '#E6F5EC');
    // Repeated seat parts keep exactly the same shapes, palette and placement,
    // but two locally bounded draws replace sixty-four independent draws.
    const seatBases = this.ownInstances(new THREE.InstancedMesh(this.own(new THREE.BoxGeometry(1.8, .6, 1.8)), this.mat('#753246'), 32));
    const seatBacks = this.ownInstances(new THREE.InstancedMesh(this.own(new THREE.BoxGeometry(1.8, 2, .3)), this.mat('#962F45'), 32));
    seatBases.name = 'delivery-imax-seat-bases'; seatBacks.name = 'delivery-imax-seat-backs';
    this.root.add(seatBases, seatBacks);
    const matrix = new THREE.Matrix4(); let seatIndex = 0;
    for (let row = 0; row < 4; row++) for (const side of [-1, 1]) for (let col = 0; col < 4; col++) {
      const x = side * (6 + col * 2.4), z = -6 + row * 4;
      seatBases.setMatrixAt(seatIndex, matrix.makeTranslation(x, .9, z));
      seatBacks.setMatrixAt(seatIndex, matrix.makeTranslation(x, 1.8, z + .8)); seatIndex++;
    }
    for (const mesh of [seatBases, seatBacks]) { mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingBox(); mesh.computeBoundingSphere(); }
    this.person(3, 1.2, -7, '#E2E2E7'); this.box(3, .7, -7, 2.3, .5, 2.4, '#962F45');
    this.beam = this.box(0, 3.5, -2, .7, 6.5, 9, '#8C8C77'); this.beam.visible = this.params.hazards !== false;
    this.box(0, 9, this.entry - 2, 1.5, 1.3, 2, '#3E3A4D');
    this.entranceTarget = { x: d.x, y: d.y + 3, z: d.z + this.entry + 5, label: 'IMAX entrance opening' };
    this.seatTarget = { x: d.x, y: d.y + 3, z: d.z - 7, label: 'Inside the IMAX hall' };
    this.setTarget(this.entranceTarget);
    this.movement = { mode: 'approach', center: { x: d.x, y: d.y, z: d.z }, radius: 110, altitude: d.y + Math.min(5, this.height - 2) };
    this.status = { instruction: 'Enter through the lit opening', canDrop: false, actionLabel: 'DROP' };
  }
  update(dt: number) {
    if (!this.tick(dt)) return;
    const p = this.ctx.player(), d = this.ctx.destination;
    if (!this.unlocked()) { this.entered = false; this.status.canDrop = false; this.setTarget(this.entranceTarget); Object.assign(this.previous, p); return; }
    const px = p.x - d.x, py = p.y - d.y, pz = p.z - d.z, priorZ = this.previous.z - d.z;
    const cross = priorZ > this.entry && pz <= this.entry;
    if (cross) {
      const mix = (priorZ - this.entry) / Math.max(.0001, priorZ - pz);
      const x = this.previous.x - d.x + (p.x - this.previous.x) * mix;
      const y = this.previous.y - d.y + (p.y - this.previous.y) * mix;
      if (Math.abs(x) <= this.width / 2 - 1.15 && y >= .65 && y <= this.height - .9) this.entered = true;
      else { this.entered = false; this.fail('Missed the opening. Circle around and try again.'); }
    }
    if (pz > this.entry + 2 || Math.abs(px) > 17.5 || py > 15 || pz < -this.entry - 4) this.entered = false;
    this.beamX = Math.sin(this.time * Math.PI * 2 / numberParam(this.params, 'sweepPeriod', 5, 3, 12)) * 13;
    this.beam.position.x = this.beamX;
    const hazard = this.params.hazards !== false && this.entered && Math.abs(px - this.beamX) < 1.2 && Math.abs(pz + 2) < 4.5 && py < 7;
    if (hazard && !this.hazardLatch) { this.entered = false; this.fail('Projector sweep! Circle back through the opening.'); }
    this.hazardLatch = hazard;
    this.setTarget(this.entered ? this.seatTarget : this.entranceTarget);
    this.status.canDrop = this.entered && this.within(6, 4) && Math.abs(p.speed) <= 8 && !hazard;
    this.status.instruction = this.status.canDrop ? 'At the seat. Hand over the pizza' : this.entered ? 'Slip past the sweeping beam to the glowing seat' : 'Enter through the lit opening';
    Object.assign(this.previous, p);
  }
  onDrop() {
    if (!this.unlocked() || this.ended) return;
    if (this.status.canDrop) this.done(); else this.fail(this.entered ? 'Get closer to the seat and slow down.' : 'Thread the opening first.');
  }
}
