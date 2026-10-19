import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createTrafficTemplates } from '../../src/art/traffic';
import { bicycleLegPose, updateBicycleAnimation } from '../../src/art/bicycleAnimation';
import { GameView } from '../../src/app/view';
import type { ArtApi } from '../../src/art/api';

const transform = new THREE.Matrix4();
function point(mesh: THREE.InstancedMesh, index: number, local: THREE.Vector3): THREE.Vector3 {
  mesh.getMatrixAt(index, transform); return local.applyMatrix4(transform);
}
const expectNear = (a: THREE.Vector3, b: THREE.Vector3) => expect(a.distanceTo(b)).toBeLessThan(1e-6);

describe('bicycle rider articulation', () => {
  it('keeps soles on level pedals, connected knees/ankles and fixed leg lengths throughout a complete crank turn', () => {
    for (const quality of ['low', 'standard', 'high'] as const) {
      const cycle = createTrafficTemplates(quality).bicycle;
      const root = cycle.object, legs = root.getObjectByName('bicycle-legs') as THREE.InstancedMesh, feet = root.getObjectByName('bicycle-footrests') as THREE.InstancedMesh;
      expect(cycle).toMatchObject({ length: 1.85, width: .65, height: 1.65 });
      for (let step = 0; step <= 24; step++) {
        const phase = step / 24 * Math.PI * 2;
        updateBicycleAnimation(root, phase / 3); root.updateMatrixWorld(true);
        const crank = root.getObjectByName('bicycle-cranks')!;
        for (const [i, side] of [[0, -1], [1, 1]] as const) {
          const pedal = crank.localToWorld(new THREE.Vector3(side * .18, side * .13, 0));
          const sole = point(feet, i * 2, new THREE.Vector3(0, -.5, .175));
          const pedalTop = point(feet, i * 2 + 1, new THREE.Vector3(0, .5, 0));
          expectNear(sole, pedalTop); expectNear(pedalTop, pedal.clone().add(new THREE.Vector3(0, .0175, 0)));
          // Two independent links meet at the knee and terminate inside the shoe.
          const hip = point(legs, i * 2, new THREE.Vector3(0, -.5, 0));
          const upperKnee = point(legs, i * 2, new THREE.Vector3(0, .5, 0));
          const lowerKnee = point(legs, i * 2 + 1, new THREE.Vector3(0, -.5, 0));
          const ankle = point(legs, i * 2 + 1, new THREE.Vector3(0, .5, 0));
          expectNear(upperKnee, lowerKnee);
          expectNear(hip, new THREE.Vector3(side * .12, .94, .26));
          expectNear(ankle, pedal.clone().add(new THREE.Vector3(0, .075, .015)));
          expect(hip.distanceTo(upperKnee)).toBeCloseTo(.395, 6);
          expect(lowerKnee.distanceTo(ankle)).toBeCloseTo(.395, 6);
          const pose = bicycleLegPose(phase, side);
          expect(pose.knee[2]).toBeLessThan((pose.hip[2] + pose.ankle[2]) / 2);
        }
      }
    }
  });
  it('keeps independently cloned actors in different pedal poses without modifying shared template geometry', () => {
    const template = createTrafficTemplates('low').bicycle.object;
    const first = template.clone(), second = template.clone();
    updateBicycleAnimation(first, 0); updateBicycleAnimation(second, Math.PI / 6);
    const firstFeet = first.getObjectByName('bicycle-footrests') as THREE.InstancedMesh;
    const secondFeet = second.getObjectByName('bicycle-footrests') as THREE.InstancedMesh;
    const templateFeet = template.getObjectByName('bicycle-footrests') as THREE.InstancedMesh;
    expect(firstFeet.geometry).toBe(secondFeet.geometry);
    expect(firstFeet.instanceMatrix).not.toBe(secondFeet.instanceMatrix);
    expect(point(firstFeet, 0, new THREE.Vector3()).distanceTo(point(secondFeet, 0, new THREE.Vector3()))).toBeGreaterThan(.1);
    expectNear(point(firstFeet, 0, new THREE.Vector3()), point(templateFeet, 0, new THREE.Vector3()));
    let disposedInstances = 0, disposedGeometry = 0, disposedMaterial = 0;
    for (const name of ['bicycle-legs', 'bicycle-footrests']) first.getObjectByName(name)!.addEventListener('dispose', () => disposedInstances++);
    firstFeet.geometry.addEventListener('dispose', () => disposedGeometry++);
    (firstFeet.material as THREE.Material).addEventListener('dispose', () => disposedMaterial++);
    const view = new GameView({ domElement: new EventTarget() } as unknown as THREE.WebGLRenderer, {} as ArtApi);
    (view as unknown as { actorObjs: Map<number, THREE.Object3D> }).actorObjs.set(1, first); view.scene.add(first);
    view.clearActors(); view.disposeCameraControls();
    expect(disposedInstances).toBe(2); expect(disposedGeometry).toBe(0); expect(disposedMaterial).toBe(0);
  });
});
