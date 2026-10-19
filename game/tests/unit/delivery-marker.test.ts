import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createDeliveryMarker, createLandingMarker, deliveryGuidanceFade } from '../../src/art/markers';
import { GameView } from '../../src/app/view';
import type { ArtApi } from '../../src/art/api';

function stubCanvas(): void {
  const context = new Proxy({}, { get: () => () => undefined });
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });
}
afterEach(() => vi.unstubAllGlobals());
const polygon: [number, number][] = [[-5, -8], [5, -8], [5, 8], [-5, 8]];

describe('unobstructed ground delivery marker', () => {
  it('preserves the stop footprint and hides elevated guidance near the parked car without additive washout', () => {
    stubCanvas(); const elevation = 6.5, marker = createDeliveryMarker(polygon, elevation);
    const fill = marker.getObjectByName('delivery-fill') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    const outline = marker.getObjectByName('delivery-outline') as THREE.Mesh;
    const beam = marker.getObjectByName('delivery-beam') as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
    const icon = marker.getObjectByName('delivery-icon') as THREE.Sprite;
    const footprint = new THREE.Box3().setFromObject(fill);
    expect(footprint.min.x).toBe(-5); expect(footprint.max.x).toBe(5);
    expect(footprint.min.z).toBe(-8); expect(footprint.max.z).toBe(8);
    expect(fill.material.opacity).toBeLessThan(.05);
    for (const name of ['delivery-fill', 'delivery-outline', 'delivery-outline-glow']) {
      const ground = marker.getObjectByName(name) as THREE.Mesh;
      expect(new THREE.Box3().setFromObject(ground).max.y).toBeLessThan(elevation + .1);
      expect((ground.material as THREE.Material).depthTest).toBe(true);
    }
    expect(new THREE.Box3().setFromObject(outline).max.x).toBeLessThan(5.2);
    beam.geometry.computeBoundingBox(); const beamBounds = beam.geometry.boundingBox!;
    expect(beamBounds.max.x - beamBounds.min.x).toBeLessThan(.27);
    expect(beamBounds.max.y - beamBounds.min.y).toBe(12);
    marker.traverse(object => {
      const material = (object as THREE.Mesh).material;
      for (const m of material ? Array.isArray(material) ? material : [material] : []) {
        expect(m.blending).toBe(THREE.NormalBlending); expect(m.depthWrite).toBe(false);
      }
    });
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
    const sample = (distance: number) => {
      camera.position.set(0, elevation + 3, distance); camera.updateMatrixWorld(true);
      beam.onBeforeRender({} as THREE.WebGLRenderer, scene, camera, beam.geometry, beam.material, null!);
      return { alpha: beam.material.uniforms.uAlpha.value, icon: icon.material.opacity };
    };
    expect(sample(10)).toEqual({ alpha: 0, icon: 0 });
    expect(sample(18)).toEqual({ alpha: 0, icon: 0 });
    expect(sample(30).alpha).toBeCloseTo(.09);
    expect(sample(100)).toEqual({ alpha: .18, icon: .78 });
    expect(deliveryGuidanceFade(24)).toBeLessThan(deliveryGuidanceFade(36));
    expect(icon.scale.x).toBeLessThan(1.5);
    marker.userData.dispose();
  });
  it('disposes replaced marker resources without freeing Three.js shared sprite geometry or changing landing guidance', () => {
    stubCanvas();
    const view = new GameView({ domElement: new EventTarget() } as unknown as THREE.WebGLRenderer, { createDeliveryMarker } as ArtApi);
    view.setDeliveryMarker(polygon, 0, 'pickup');
    const marker = view.scene.getObjectByName('delivery-marker')!, icon = marker.getObjectByName('delivery-icon') as THREE.Sprite;
    let geometryDisposed = 0, textureDisposed = 0, sharedQuadDisposed = 0;
    const beam = marker.getObjectByName('delivery-beam') as THREE.Mesh;
    beam.geometry.addEventListener('dispose', () => geometryDisposed++);
    icon.material.map!.addEventListener('dispose', () => textureDisposed++);
    icon.geometry.addEventListener('dispose', () => sharedQuadDisposed++);
    view.setDeliveryMarker(polygon, 0, 'pickup'); expect(geometryDisposed).toBe(0);
    view.setDeliveryMarker(null, 0, null);
    expect(geometryDisposed).toBe(1); expect(textureDisposed).toBe(1); expect(sharedQuadDisposed).toBe(0);
    expect(view.scene.getObjectByName('delivery-marker')).toBeUndefined();
    const landing = createLandingMarker(); landing.setState('clear');
    expect(landing.object.name).toBe('landing-marker'); expect(landing.object.visible).toBe(true);
    const ring = landing.object.children.find(child => (child as THREE.Mesh).geometry?.type === 'RingGeometry') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    expect(ring.material.color.getHex()).toBe(0x38e07a);
    landing.setState('blocked'); expect(ring.material.color.getHex()).toBe(0xff4a4a);
    view.disposeCameraControls();
  });
});
