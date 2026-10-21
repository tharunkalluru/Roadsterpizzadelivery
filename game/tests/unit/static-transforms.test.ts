import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { freezeStaticTransforms } from '../../src/art/staticTransforms';

function scenery() {
  const scene = new THREE.Scene();
  const block = new THREE.Group();
  block.position.set(37, 2, -81);
  block.rotation.y = .73;
  const facade = new THREE.Object3D();
  facade.position.set(4, 3, -2);
  facade.scale.set(2, 1, .5);
  block.add(facade);
  scene.add(block);
  return { scene, block, facade };
}

describe('static scenery transforms', () => {
  it('preserves transformed world placement through culling without recomposing or multiplying cached matrices', () => {
    const { scene, block, facade } = scenery();
    scene.position.set(-5, 0, 7);
    scene.updateMatrixWorld(true);
    const expected = [block.matrixWorld.clone(), facade.matrixWorld.clone()];
    expect(freezeStaticTransforms(block)).toBe(2);
    const compose = vi.spyOn(facade.matrix, 'compose');
    const multiply = vi.spyOn(facade.matrixWorld, 'multiplyMatrices');

    for (const visible of [false, true, false, true]) {
      block.visible = visible;
      // The renderer still traverses invisible objects and forces descendants when
      // its unfrozen scene root updates. Both cached matrices must remain intact.
      scene.updateMatrixWorld();
      expect(block.matrixWorld.elements).toEqual(expected[0].elements);
      expect(facade.matrixWorld.elements).toEqual(expected[1].elements);
    }
    expect(compose).not.toHaveBeenCalled();
    expect(multiply).not.toHaveBeenCalled();
    expect(scene.matrixAutoUpdate).toBe(true);
    expect(scene.matrixWorldAutoUpdate).toBe(true);
  });

  it('keeps an explicitly excluded train and its sliding doors identical to an unfrozen scene', () => {
    const make = () => {
      const fixture = scenery();
      const train = new THREE.Group();
      train.name = 'metro-moving-service';
      const door = new THREE.Object3D();
      door.position.set(1.4, 1.8, -4.7);
      train.add(door);
      fixture.block.add(train);
      return { ...fixture, train, door };
    };
    const actual = make(), reference = make();
    freezeStaticTransforms(actual.block, object => object.name === 'metro-moving-service');
    for (const elapsed of [0, .25, .5, 1, 2]) {
      for (const fixture of [actual, reference]) {
        fixture.train.position.set(elapsed * 12, 6, 3);
        fixture.train.rotation.y = elapsed * .2;
        fixture.door.position.z = -4.7 + Math.min(elapsed, 1) * .66;
        fixture.scene.updateMatrixWorld();
      }
      expect(actual.facade.matrixWorld.elements).toEqual(reference.facade.matrixWorld.elements);
      expect(actual.train.matrixWorld.elements).toEqual(reference.train.matrixWorld.elements);
      expect(actual.door.matrixWorld.elements).toEqual(reference.door.matrixWorld.elements);
    }
    expect(actual.train.matrixAutoUpdate).toBe(true);
    expect(actual.door.matrixWorldAutoUpdate).toBe(true);
  });

  it('updates late children under a frozen parent and can freeze them after final attachment', () => {
    const { scene, block } = scenery();
    freezeStaticTransforms(block);
    const sign = new THREE.Object3D();
    sign.position.set(-3, 5, 1);
    block.add(sign);
    scene.updateMatrixWorld();
    const expected = block.matrixWorld.clone().multiply(sign.matrix);
    expect(sign.matrixWorld.elements).toEqual(expected.elements);
    expect(sign.matrixAutoUpdate).toBe(true);

    sign.position.y = 7;
    expect(freezeStaticTransforms(sign)).toBe(1);
    const final = sign.matrixWorld.clone();
    expect(final.elements).not.toEqual(expected.elements);
    scene.updateMatrixWorld();
    expect(sign.matrixWorld.elements).toEqual(final.elements);
    expect(sign.matrixAutoUpdate).toBe(false);
    expect(sign.matrixWorldAutoUpdate).toBe(false);
  });

  it('preserves entire update-hook subtrees by default', () => {
    const { scene, block, facade } = scenery();
    block.userData.update = () => { facade.rotation.y += .1; };
    expect(freezeStaticTransforms(block)).toBe(0);
    block.userData.update();
    scene.updateMatrixWorld();
    expect(facade.matrixAutoUpdate).toBe(true);
    expect(facade.matrixWorldAutoUpdate).toBe(true);
    expect(facade.matrixWorld.elements).toEqual(block.matrixWorld.clone().multiply(facade.matrix).elements);
  });
});
