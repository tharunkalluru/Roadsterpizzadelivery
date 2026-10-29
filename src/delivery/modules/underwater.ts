import * as THREE from 'three';
import { ModuleBase, numberParam } from './base';

export class Underwater extends ModuleBase {
  private pizza!: THREE.Mesh;
  private throwTime = -1;
  private throwFrom = new THREE.Vector3();
  private bubbles: THREE.Mesh[] = [];
  protected build() {
    const depth = numberParam(this.params, 'depth', 4, 2, 12), d = this.ctx.destination;
    this.throwTime = -1; this.bubbles = [];
    this.setTarget({ x: d.x, y: d.y - depth, z: d.z, label: d.label });
    this.ring.position.y = -depth + .1;
    this.box(0, -depth - 1.5, 0, 28, 1, 28, '#265657');
    this.person(0, -depth - 1, 0, '#DF783F');
    for (let i = 0; i < 12; i++) {
      const mesh = new THREE.Mesh(this.own(new THREE.SphereGeometry(.13 + i % 3 * .06, 6, 4)), this.mat('#77D7DB'));
      mesh.position.set(Math.sin(i * 2.3) * 6, -depth + i % 4, Math.cos(i * 2.3) * 6); this.root.add(mesh); this.bubbles.push(mesh);
    }
    this.pizza = this.box(0, 0, 0, 1.2, .25, 1.2, '#FFB627'); this.pizza.visible = false;
    this.movement = { mode: 'underwater', center: { ...d }, radius: numberParam(this.params, 'approachRadius', 60, 20, 120), depth };
    this.status = { instruction: 'Dive to the glowing underwater marker', canDrop: false, actionLabel: 'THROW' };
  }
  update(dt: number) {
    if (!this.tick(dt)) return;
    const depth = numberParam(this.params, 'depth', 4, 2, 12), p = this.ctx.player();
    for (let i = 0; i < this.bubbles.length; i++) this.bubbles[i].position.y = -depth + (this.time * .65 + i * .4) % (depth + 1);
    if (this.throwTime >= 0) {
      this.throwTime += Math.max(0, Math.min(dt, .1));
      const t = Math.min(1, this.throwTime / .7), d = this.ctx.destination;
      this.pizza.position.set(this.throwFrom.x + (this.target.x - this.throwFrom.x) * t - d.x,
        this.throwFrom.y + (this.target.y - this.throwFrom.y) * t + Math.sin(t * Math.PI) * 2 - d.y,
        this.throwFrom.z + (this.target.z - this.throwFrom.z) * t - d.z);
      this.pizza.rotation.set(t * Math.PI * 4, 0, t * Math.PI * 2);
      if (t === 1) { this.pizza.visible = false; this.done(); }
      return;
    }
    this.status.canDrop = this.unlocked() && this.within(numberParam(this.params, 'throwRange', 12, 4, 25), 4) && p.y < this.ctx.destination.y - 1;
    this.status.instruction = this.status.canDrop ? 'Singamalai! Throw the pizza' : 'Dive to the glowing underwater marker';
  }
  onDrop() {
    if (!this.unlocked() || this.ended || this.throwTime >= 0) return;
    if (!this.status.canDrop) { this.fail('Get closer underwater, then throw again.'); return; }
    const p = this.ctx.player(); this.throwFrom.set(p.x, p.y, p.z); this.throwTime = 0; this.pizza.visible = true;
    this.status.canDrop = false; this.status.instruction = 'Pizza away!'; this.ctx.cue?.('throw');
  }
}
