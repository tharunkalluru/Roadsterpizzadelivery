import * as THREE from 'three';
import { signalAspect, type SignalSite } from './signals';

// One inexpensive emissive-colour instance batch per tile. Pole housings and
// road paint are static worker geometry; only the three lenses change colour.
export class SignalLights {
  geometry = new THREE.SphereGeometry(.14, 8, 6);
  material = new THREE.MeshBasicMaterial({ toneMapped: false });
  mesh: THREE.InstancedMesh;
  private last = '';
  private lenses: { site: SignalSite; phase: number; index: number }[] = [];
  constructor(sites: SignalSite[]) {
    const count = sites.reduce((n, site) => n + site.approaches.length * 3, 0);
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, count);
    this.mesh.name = 'directional traffic signal lenses';
    const matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), scale = new THREE.Vector3(1, 1, .45);
    for (const site of sites) for (const a of site.approaches) {
      const face = Math.atan2(-a.hx, -a.hz); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), face);
      const index = this.lenses.length * 3;
      for (let k = 0; k < 3; k++) {
        matrix.compose(new THREE.Vector3(a.pole[0] - a.hx * .23, a.pole[1] + 5.65 - k * .4, a.pole[2] - a.hz * .23), q, scale);
        this.mesh.setMatrixAt(index + k, matrix);
      }
      this.lenses.push({ site, phase: a.phase, index });
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.update(0);
    this.mesh.computeBoundingSphere();
  }
  update(seconds: number) {
    const aspects = this.lenses.map(l => signalAspect(l.site, l.phase, seconds)), key = aspects.join(',');
    if (key === this.last) return;
    this.last = key;
    const colors = ['#ff2920', '#ffb527', '#21ff60'], names = ['red', 'amber', 'green'];
    for (let i = 0; i < this.lenses.length; i++) for (let k = 0; k < 3; k++) {
      this.mesh.setColorAt(this.lenses[i].index + k, new THREE.Color(colors[k]).multiplyScalar(aspects[i] === names[k] ? 1.8 : .035));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  dispose() { this.geometry.dispose(); this.material.dispose(); }
}
