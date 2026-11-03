import * as THREE from 'three';
import { rng } from '../core/util';
import { randomPerson, walkerGeometry, legsVisible } from '../world/people';
import { makeHumanWalkRig, type HumanWalkRig } from '../world/human-gait';

// A bounded, visual exchange at the two left-hand doors. Service stop identity
// and timing remain owned by Traffic/BusServices; these figures never steer it.
export class BusPassengerExchange {
  group = new THREE.Group();
  elapsed = 0;
  people: { group: THREE.Group; legs: THREE.Mesh[]; rig: HumanWalkRig; mode: 'board' | 'alight'; start: number; travel: number; progress: number }[] = [];
  constructor(bus: { x: number; y: number; z: number; hx: number; hz: number }, public duration: number, material: THREE.Material) {
    this.group.name = 'bus-passenger-exchange';
    this.group.position.set(bus.x, bus.y + .02, bus.z);
    this.group.rotation.y = Math.atan2(-bus.hx, -bus.hz);
    const r = rng(5291);
    for (let i = 0; i < 4; i++) {
      const spec = randomPerson(r), geometry = walkerGeometry(spec,true), group = new THREE.Group(), legs: THREE.Mesh[] = [];
      // Traffic finally removes the exchange on completion, distance or bus release.
      const rig=makeHumanWalkRig(geometry.rigged!,material,spec,!legsVisible(spec.kind));group.add(rig.mesh);
      this.group.addEventListener('removed', () => {rig.dispose();geometry.release();});
      group.scale.setScalar(spec.s); this.group.add(group);
      this.people.push({ group, legs, rig, mode: i < 2 ? 'alight' : 'board', start: [.02, .13, .43, .58][i] * duration,
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
      // The 11m City Ordinary's second LH entrance is behind the rear axle,
      // matching the production body and TGSRTC body specification.
      const x = alight ? -.85 - 1.7 * p : -2.55 + 1.7 * p;
      // Walk beside the body before turning into the front opening; a single
      // diagonal from the old sidewalk start cuts through the door jamb.
      // Keep the same x/time schedule and complete the z approach while there
      // is still shoulder clearance outside the bus.
      const approach=Math.min(1,p/.55),leaving=Math.max(0,(p-.55)/.45);
      const startZ=-2.7+(i-2)*.45;
      const z=alight?4.4+(i?.8:-.5)*leaving+extra*.85:startZ+(-4.7-startZ)*approach;
      // Inside feet meet the modeled .94m saloon floor; the short descent
      // follows its three open LH steps instead of emerging through paint.
      const stairY=.94*Math.max(0,Math.min(1,(1.30-Math.abs(x))/.45));
      person.group.position.set(x,stairY,z);
      person.group.rotation.y = alight ? p>=1?Math.PI:p<=.55?Math.PI/2:Math.atan2(1.7,-(i?.8:-.5)/.45) : p<.55?Math.atan2(-1.7,(4.7+startZ)/.55):-Math.PI/2;
      const walk = (p > 0 && p < 1 || alight && extra > 0) ? Math.sin(this.elapsed * 7.4 + i) * .45 : 0;
      person.legs.forEach((leg, j) => { leg.rotation.x = walk * (j ? -1 : 1); });
      person.rig.update(this.elapsed*7.4+i,walk!==0,dt);
    }
  }
  get finished() { return this.elapsed >= this.duration + 5; }
}
