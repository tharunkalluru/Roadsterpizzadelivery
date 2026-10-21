import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { buildEnvironment } from '../../src/art/environment';
import { makeFixtureCore } from './fixture';

vi.mock('../../src/art/textures', async () => {
  const { Texture } = await import('three');
  return { getSoftSprite: () => new Texture() };
});

vi.mock('../../src/art/mats', async () => {
  const { MeshStandardMaterial, Texture } = await import('three');
  return {
    getWorldMats: () => ({
      ground: new MeshStandardMaterial({ map: new Texture() }),
      asphalt: new MeshStandardMaterial({ color: 0x596062, roughness: 1 }),
    }),
  };
});

function environment() {
  const scene = new THREE.Scene();
  const renderer = { shadowMap: { enabled: true, type: THREE.PCFShadowMap } } as THREE.WebGLRenderer;
  const handle = buildEnvironment(scene, renderer, 'low');
  const blob = scene.getObjectByName('blob-shadow') as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  return { scene, renderer, handle, blob };
}

describe('low quality surface contact shadow', () => {
  it('stays under an elevated car, aligns with its heading and fades by ground clearance', () => {
    const { handle, blob, renderer } = environment();
    expect(renderer.shadowMap.enabled).toBe(false);
    expect(blob.visible).toBe(false);

    const target = new THREE.Vector3(10, 24, -20);
    const surface = { groundY: 24, heightM: 0, heading: Math.PI / 2 };
    handle.update(target, 1 / 60, surface);
    expect(blob.visible).toBe(true);
    expect(blob.position.toArray()).toEqual([10, 24.06, -20]);
    expect(blob.rotation.y).toBeCloseTo(surface.heading);
    const groundedOpacity = blob.material.opacity;
    expect(groundedOpacity).toBeGreaterThan(.7);
    expect(blob.geometry.parameters.width).toBeLessThan(3.5);
    expect(blob.geometry.parameters.height).toBeLessThan(6);

    // Translating both car and road vertically must not change the contact cue.
    target.y = 64; surface.groundY = 64;
    handle.update(target, 1 / 60, surface);
    expect(blob.material.opacity).toBe(groundedOpacity);
    expect(blob.position.y).toBeCloseTo(64.06);

    target.y = 78; surface.heightM = 14;
    handle.update(target, 1 / 60, surface);
    expect(blob.material.opacity).toBeLessThan(groundedOpacity);
    expect(blob.scale.x).toBeGreaterThan(1);
    expect(blob.scale.x).toBeLessThan(1.5);
    target.y = 92; surface.heightM = 28;
    handle.update(target, 1 / 60, surface);
    expect(blob.visible).toBe(false);
    handle.dispose();
  });

  it('synchronizes the terrain clone, hides for menus, and releases owned resources', () => {
    const { handle, blob, scene } = environment();
    const original = blob.material;
    const ownedGeometry = blob.geometry;
    const geometryReleased = vi.fn(), materialReleased = vi.fn();
    ownedGeometry.addEventListener('dispose', geometryReleased);
    original.addEventListener('dispose', materialReleased);
    handle.setTerrainCore(makeFixtureCore());
    expect(blob.material).not.toBe(original);

    handle.update(new THREE.Vector3(0, 2, 0), 1 / 60, { groundY: 0, heightM: 2, heading: .7 });
    const camera = new THREE.PerspectiveCamera();
    (scene.onBeforeRender as (...args: unknown[]) => void)({}, scene, camera, null);
    expect(blob.material.opacity).toBe(original.opacity);
    expect(blob.visible).toBe(true);
    handle.update(new THREE.Vector3());
    expect(blob.visible).toBe(false);

    handle.dispose();
    expect(scene.getObjectByName('blob-shadow')).toBeUndefined();
    expect(geometryReleased).toHaveBeenCalledTimes(1);
    expect(materialReleased).toHaveBeenCalledTimes(1);
    expect(scene.children).toHaveLength(0);
  });
});
