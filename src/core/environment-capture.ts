import * as THREE from 'three';
import { makeSky } from './sky';

const VECTOR_UNIFORMS = ['top', 'hor', 'bot', 'sunDir', 'sunCol'] as const;

/** One private PMREM source per Engine. Keeping its material resident retains
 * the capture-specific shader variant while geometry/material ownership stays
 * bounded. The generator and returned environment targets belong to Engine.
 */
export class EnvironmentSkyCapture {
  private readonly scene = new THREE.Scene();
  private readonly sky = makeSky();
  private disposed = false;
  constructor() {
    this.sky.scale.setScalar(.03); this.scene.add(this.sky);
  }
  render(pmrem: Pick<THREE.PMREMGenerator, 'fromScene'>, source: Record<string, THREE.IUniform>): THREE.WebGLRenderTarget {
    if (this.disposed) throw new Error('Environment capture has been released.');
    const uniforms = this.sky.material.uniforms;
    // Mutate existing uniform values rather than replace the dictionary cached
    // by WebGLRenderer when this same ShaderMaterial was first rendered.
    for (const name of VECTOR_UNIFORMS) uniforms[name].value.copy(source[name].value);
    uniforms.sunAmt.value = source.sunAmt.value;
    // A retry can revisit the same current program/material after an early
    // capture failure. Refresh values without invalidating its linked program.
    this.sky.material.uniformsNeedUpdate = true;
    return pmrem.fromScene(this.scene, .02);
  }
  dispose() {
    if (this.disposed) return; this.disposed = true;
    this.sky.geometry.dispose(); this.sky.material.dispose(); this.scene.remove(this.sky);
  }
}
