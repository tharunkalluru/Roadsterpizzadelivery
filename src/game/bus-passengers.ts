import * as THREE from 'three';
import { rng } from '../core/util';
import { randomPerson, walkerGeometry, legsVisible } from '../world/people';

// A bounded, visual exchange at the two left-hand doors. Service stop identity
// and timing remain owned by Traffic/BusServices; these figures never steer it.
export class BusPassengerExchange {
  group = new THREE.Group();
  elapsed = 0;
  people: { group: THREE.Group; legs: THREE.Mesh[]; mode: 'board' | 'alight'; start: number; travel: number; progress: number }[] = [];
  constructor(bus: { x: number; y: number; z: number; hx: number; hz: number }, public duration: number, material: THREE.Material) {
    this.group.name = 'bus-passenger-exchange';
    this.group.position.set(bus.x, bus.y + .02, bus.z);
    this.group.rotation.y = Math.atan2(-bus.hx, -bus.hz);
    const r = rng(5291);
    for (let i = 0; i < 4; i++) {
      const spec = randomPerson(r), geometry = walkerGeometry(spec), group = new THREE.Group(), legs: THREE.Mesh[] = [];
      const body = new THREE.Mesh(geometry.body, material); body.castShadow = true; group.add(body);
      if (geometry.leg && legsVisible(spec.kind)) for (const sign of [-1, 1]) {
        const leg = new THREE.Mesh(geometry.leg, material); leg.position.set(sign * .085, .84, 0); leg.castShadow = true; group.add(leg); legs.push(leg);
      }
      group.scale.setScalar(spec.s); this.group.add(group);
      this.people.push({ group, legs, mode: i < 2 ? 'alight' : 'board', start: [.02, .13, .43, .58][i] * duration,
        travel: .31 * duration, progress: 0 });
    }
    this.update(0);
  }
  update(dt: number) {
    this.elapsed += dt;
    for (const [i, person] of this.people.entries()) {
      const p = Math.max(0, Math.min(1, (this.elapsed - person.start) / person.travel)); person.progress = p;
      const alight = person.mode === 'alight', extra = Math.max(0, this.elapsed - person.start - person.travel);
      person.group.visible = alight ? this.elapsed >= person.start : this.elapsed < person.start + person.travel;
      // Alight at the middle door, then walk away; board at the front door.
      const x = alight ? -.85 - 1.7 * p : -2.55 + 1.7 * p;
      const z = alight ? .6 + (i ? .8 : -.5) * p + extra * .85 : -2.7 - (4.1 - 2.7) * p + (i - 2) * .45 * (1 - p);
      person.group.position.set(x, alight ? .35 * (1 - p) : .35 * p, z);
      person.group.rotation.y = alight ? p >= 1 ? Math.PI : Math.atan2(1.7, -(i ? .8 : -.5)) : Math.atan2(-1.7, 1.4 + (i - 2) * .45);
      const walk = (p > 0 && p < 1 || alight && extra > 0) ? Math.sin(this.elapsed * 7.4 + i) * .45 : 0;
      person.legs.forEach((leg, j) => { leg.rotation.x = walk * (j ? -1 : 1); });
    }
  }
  get finished() { return this.elapsed >= this.duration + 5; }
}
