import * as THREE from 'three';
import { Batch } from '../core/util';
import type { RailwayCrossings, RailwayCrossingState } from '../game/railway-crossings';

interface GateVisual { root: THREE.Group; arms: THREE.Group[]; lamps: THREE.MeshBasicMaterial[]; state: RailwayCrossingState; signature: string }

// Barrier centers, widths, elevations and closure are the controller's exact
// physical plan. The red warning lamps use simulation time, so pause freezes.
export class RailwayCrossingGates {
  readonly group = new THREE.Group();
  private visuals = new Map<string, GateVisual>();
  private material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .72, metalness: .12 });
  constructor(private crossings: RailwayCrossings) { this.group.name = 'railway-level-crossing-gates'; }
  private remove(visual: GateVisual) {
    visual.root.traverse(object => { const mesh = object as THREE.Mesh; if (mesh.isMesh) mesh.geometry.dispose(); });
    visual.lamps.forEach(material => material.dispose()); this.group.remove(visual.root);
  }
  private signature(state: RailwayCrossingState) { return JSON.stringify([state.site.width, state.site.gates]); }
  private build(state: RailwayCrossingState) {
      const root = new THREE.Group(), arms: THREE.Group[] = [], lamps: THREE.MeshBasicMaterial[] = [];
      root.name = state.site.id;
      for (const gate of state.site.gates) {
        const half = state.site.width / 2 + .65, side = gate.side;
        const stand = new Batch();
        const x = gate.x + gate.hz * half * side, z = gate.z - gate.hx * half * side;
        stand.box(x, gate.y + .45, z, .5, .9, .5, '#e0a81c');
        stand.box(x, gate.y + 1.45, z, .16, 2.3, .16, '#3a3432');
        stand.box(x, gate.y + 2.5, z, 1.05, .5, .18, '#242127', { ry: Math.atan2(gate.hx, gate.hz) });
        const staticMesh = new THREE.Mesh(stand.geometry(), this.material); staticMesh.castShadow = true; root.add(staticMesh);
        const pivot = new THREE.Group(); pivot.position.set(x, gate.y + 1.05, z);
        // Local +X points from this gate's kerb to the opposite kerb.
        pivot.rotation.y = Math.atan2(-gate.hx * side, -gate.hz * side);
        const arm = new THREE.Group(), beam = new Batch(), width = half * 2;
        for (let start = 0; start < width; start += .6) {
          const length = Math.min(.6, width - start);
          beam.box(start + length / 2, 0, 0, length, .16, .16, Math.floor(start / .6) % 2 ? '#1f1d22' : '#f4c341');
        }
        const mesh = new THREE.Mesh(beam.geometry(), this.material); mesh.castShadow = true; arm.add(mesh); pivot.add(arm); root.add(pivot); arms.push(arm);
        for (const offset of [-.28, .28]) {
          const mat = new THREE.MeshBasicMaterial({ color: '#2b1010', toneMapped: false }); lamps.push(mat);
          const lamp = new THREE.Mesh(new THREE.SphereGeometry(.13, 8, 6), mat);
          lamp.position.set(x + gate.hx * offset, gate.y + 2.5, z + gate.hz * offset); root.add(lamp);
        }
      }
      this.group.add(root);
      const visual = { root, arms, lamps, state, signature: this.signature(state) };
      this.visuals.set(state.site.id, visual); return visual;
  }
  update(px: number, pz: number) {
    const states = new Map(this.crossings.states.map(state => [state.site.id, state]));
    for (const [id, visual] of this.visuals) {
      const state = states.get(id);
      if (!state || Math.hypot(state.site.x - px, state.site.z - pz) > 1500 || visual.signature !== this.signature(state)) {
        this.remove(visual); this.visuals.delete(id);
      } else visual.state = state;
    }
    // Build at most two nearby sites per frame. Streamed road updates retain
    // unchanged meshes, and the whole-city controller owns no distant meshes.
    let budget = 2;
    const nearby = this.crossings.states.filter(state => Math.hypot(state.site.x - px, state.site.z - pz) < 1200)
      .sort((a,b) => Math.hypot(a.site.x-px,a.site.z-pz)-Math.hypot(b.site.x-px,b.site.z-pz));
    for (const state of nearby) if (!this.visuals.has(state.site.id) && budget-- > 0) this.build(state);
    for (const visual of this.visuals.values()) {
      const { state } = visual;
      visual.root.visible = Math.hypot(state.site.x - px, state.site.z - pz) < 1200;
      if (!visual.root.visible) continue;
      for (const arm of visual.arms) arm.rotation.z = (1 - state.closure) * Math.PI / 2;
      const flash = Math.floor(this.crossings.seconds * 2) % 2;
      visual.lamps.forEach((lamp, i) => lamp.color.setHex(state.warning && i % 2 === flash ? 0xff3024 : 0x2b1010));
    }
  }
  dispose() {
    for (const visual of this.visuals.values()) {
      visual.root.traverse(object => { const mesh = object as THREE.Mesh; if (mesh.isMesh) mesh.geometry.dispose(); });
      visual.lamps.forEach(material => material.dispose());
    }
    this.visuals.clear(); this.material.dispose(); this.group.clear(); this.group.removeFromParent();
  }
}
