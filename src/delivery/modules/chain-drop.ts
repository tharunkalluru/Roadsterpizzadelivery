import * as THREE from 'three';
import { ModuleBase, numberParam } from './base';
import type { DeliveryPoint } from './types';

export class ChainDrop extends ModuleBase {
  private targets: DeliveryPoint[] = [];
  private index = 0;
  private targetGroups: THREE.Group[] = [];
  protected build() {
    this.index = 0; this.targetGroups = [];
    const d = this.ctx.destination;
    const defaults = [
      { label: 'Palace gate', dx: 0, dy: 2, dz: 0 },
      { label: 'Waterfall', dx: 100, dy: 14, dz: -80 },
      { label: 'Battle arena', dx: -90, dy: 2, dz: -130 },
      { label: "Director's crane", dx: -70, dy: 22, dz: 80 },
    ];
    const configured = Array.isArray(this.params.targets) && this.params.targets.length ? this.params.targets : defaults;
    this.targets = configured.map((raw, index) => {
      const t = raw as Record<string, unknown>, fallback = defaults[index % defaults.length];
      const number = (key: string, value: number) => typeof t[key] === 'number' && Number.isFinite(t[key]) ? t[key] as number : value;
      const target = { x: number('x', d.x + number('dx', fallback.dx)), y: number('y', d.y + number('dy', fallback.dy)),
        z: number('z', d.z + number('dz', fallback.dz)), label: String(t.label || fallback.label) };
      // A nearby roof can intersect one stage even when the main anchor is clear.
      // Sample the full platform footprint, including every edge and corner.
      for (const dx of [-9, 0, 9]) for (const dz of [-9, 0, 9]) {
        const surface = this.ctx.surfaceHeightAt?.(target.x + dx, target.z + dz);
        if (surface != null && Number.isFinite(surface)) target.y = Math.max(target.y, surface + .6);
      }
      return target;
    });
    this.targets.forEach((target, index) => {
      const group = new THREE.Group(); group.name = `delivery-set-${index}`; group.position.set(target.x - d.x, target.y - d.y, target.z - d.z); this.root.add(group); this.targetGroups.push(group);
      this.box(0, -.3, 0, 18, .6, 18, '#AD8C63', group);
      this.person(3, 0, 0, '#D4BC8B', group);
      if (index % 4 === 0) {
        for (const x of [-8, 8]) this.solidBox(x, 5, -4, 3, 10, 4, '#D2B185', group);
        this.solidBox(0, 10.5, -4, 19, 2, 4, '#C29D70', group);
      } else if (index % 4 === 1) {
        this.box(0, -7, -6, 24, 14, 8, '#6B745F', group);
        this.box(0, -7, -1.7, 9, 15, .5, '#7FDED8', group);
        for (let i = 0; i < 6; i++) this.box(-4 + i * 1.6, -6, -1.4, .5, 14, .25, '#D3F3E5', group);
      } else if (index % 4 === 2) {
        for (const x of [-8, 8]) for (const z of [-8, 8]) { this.box(x, 4, z, .3, 8, .3, '#59412F', group); this.box(x + 1.5, 7, z, 3, 1.5, .12, '#CF633A', group); }
      } else {
        this.solidBox(-7, -8, 0, 1, 20, 1, '#E6B83E', group); this.solidBox(0, 2, 0, 16, .7, .7, '#E6B83E', group);
        this.box(5, 0, 0, 5, .5, 5, '#514551', group); this.box(6, 1.8, -2, 1.3, 1, 2, '#2B2436', group);
      }
      this.bodies.push({ id: `delivery-set:${index}`, x: target.x, y: target.y, z: target.z, hx: 0, hz: 1, halfWidth: 9, halfLength: 9,
        bottom: target.y - .6, roof: target.y, previous: { x: target.x, y: target.y, z: target.z, hx: 0, hz: 1 } });
    });
    this.setTarget(this.targets[0]); this.status = { instruction: 'Deliver to the palace gate', canDrop: false, actionLabel: 'DROP', progress: `1 / ${this.targets.length}` };
  }
  update(dt: number) {
    if (!this.tick(dt)) return;
    const radius = numberParam(this.params, 'radius', 8, 4, 20);
    this.status.canDrop = this.unlocked() && this.within(radius, 7) && Math.abs(this.ctx.player().speed) <= 10;
    this.status.instruction = this.status.canDrop ? `Drop at ${this.target.label}` : `Next take: ${this.target.label}`;
    this.status.progress = `${this.index + 1} / ${this.targets.length}`;
    this.root.visible = true;
    // Delivered sets remain physical scenery. Only the ring/nav moves on;
    // hiding their meshes would strand visible collision platforms behind.
    for (let i = 0; i < this.targetGroups.length; i++) this.targetGroups[i].visible = Math.hypot(this.ctx.player().x - this.targets[i].x, this.ctx.player().z - this.targets[i].z) < 800;
    this.movement = { mode: 'approach', center: { ...this.target }, radius: 85, altitude: this.target.y + 4 };
  }
  onDrop() {
    if (!this.unlocked() || this.ended) return;
    if (!this.status.canDrop) { this.fail('Retake #47 — same spot, one more try!', this.index + 1); return; }
    this.index++;
    if (this.index === this.targets.length) { this.done(); return; }
    this.ctx.cue?.('success'); this.setTarget(this.targets[this.index]); this.status.canDrop = false;
    this.status.instruction = `Retake! Move to ${this.target.label}`;
    this.status.progress = `${this.index + 1} / ${this.targets.length}`;
  }
}
