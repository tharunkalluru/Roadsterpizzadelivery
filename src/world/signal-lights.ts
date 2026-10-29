import * as THREE from 'three';
import { signalAspectIndex, type SignalSite } from './signals';

const LENS_COLORS = ['#ff2920', '#ffb527', '#21ff60'].map(hex => {
  const color = new THREE.Color(hex);
  return [color.r, color.g, color.b];
});

// One ordinary indexed mesh per tile. Avoid instanced WebGL attributes across
// devices: ANGLE documents an Xclipse/Chrome151 instancing regression, but that
// does not establish the cause of a particular player's rendering corruption.
// Pole housings/paint stay in static worker geometry; only lens colours change.
export class SignalLights {
  geometry = new THREE.BufferGeometry();
  material = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  mesh: THREE.Mesh;
  private colors: THREE.BufferAttribute;
  private verticesPerLens: number;
  private lenses: { site: SignalSite; phase: number; firstVertex: number; aspect: number }[] = [];
  constructor(sites: SignalSite[]) {
    const count = sites.reduce((n, site) => n + site.approaches.length * 3, 0);
    const sphere = new THREE.SphereGeometry(.14, 8, 6), base = sphere.getAttribute('position'), baseIndex = sphere.getIndex()!;
    this.verticesPerLens = base.count;
    const vertexCount = count * base.count, positions = new Float32Array(vertexCount * 3);
    const indices = vertexCount > 65535 ? new Uint32Array(count * baseIndex.count) : new Uint16Array(count * baseIndex.count);
    this.colors = new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('color', this.colors);
    this.geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'directional traffic signal lenses';
    const matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), scale = new THREE.Vector3(1, 1, .45), position = new THREE.Vector3(), vertex = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    let lens = 0;
    for (const site of sites) for (const a of site.approaches) {
      q.setFromAxisAngle(up, Math.atan2(-a.hx, -a.hz));
      const firstVertex = lens * base.count;
      for (let k = 0; k < 3; k++) {
        const start = lens * base.count, indexStart = lens * baseIndex.count;
        position.set(a.pole[0] - a.hx * .23, a.pole[1] + 5.65 - k * .4, a.pole[2] - a.hz * .23);
        matrix.compose(position, q, scale);
        for (let i = 0; i < base.count; i++) {
          vertex.fromBufferAttribute(base, i).applyMatrix4(matrix);
          positions[(start + i) * 3] = vertex.x;
          positions[(start + i) * 3 + 1] = vertex.y;
          positions[(start + i) * 3 + 2] = vertex.z;
        }
        for (let i = 0; i < baseIndex.count; i++) indices[indexStart + i] = start + baseIndex.getX(i);
        lens++;
      }
      this.lenses.push({ site, phase: a.phase, firstVertex, aspect: -1 });
    }
    sphere.dispose();
    this.update(0);
    this.geometry.computeBoundingSphere();
  }
  update(seconds: number) {
    let changed = false;
    for (let n = 0; n < this.lenses.length; n++) {
      const lens = this.lenses[n];
      const aspect = signalAspectIndex(lens.site, lens.phase, seconds);
      if (aspect === lens.aspect) continue;
      lens.aspect = aspect; changed = true;
      for (let k = 0; k < 3; k++) {
        const color = LENS_COLORS[k], gain = aspect === k ? 1.8 : .035;
        const start = lens.firstVertex + k * this.verticesPerLens;
        for (let i = start; i < start + this.verticesPerLens; i++) this.colors.setXYZ(i, color[0] * gain, color[1] * gain, color[2] * gain);
      }
      this.colors.addUpdateRange(lens.firstVertex * 3, this.verticesPerLens * 9);
    }
    if (changed) this.colors.needsUpdate = true;
  }
  dispose() { this.geometry.dispose(); this.material.dispose(); }
}
