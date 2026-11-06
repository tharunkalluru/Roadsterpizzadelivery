import * as THREE from 'three';
import { Player } from '../../src/game/player';
import type { CityData } from '../../src/world/city';

/** Real production constructor, meshes, children, materials and update method.
 * Canvas drawing is stubbed only while constructing CPU-only Node fixtures.
 * No pose, contact, suspension, animation, timing or physics is replaced. */
export function actualPlayer(city: CityData) {
  const gradient = { addColorStop() {} };
  const context = new Proxy({
    measureText: (value: string) => ({ width: value.length * 12 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
  }, { get: (object: any, key) => key in object ? object[key] : () => {} });
  const before = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const radial = new THREE.Texture();
  let player: Player;
  try {
    Object.defineProperty(globalThis, 'document', { configurable: true, writable: true,
      value: { createElement: () => ({ width: 1, height: 1, getContext: () => context }) } });
    player = new Player(city, { radial });
  } finally {
    if (before) Object.defineProperty(globalThis, 'document', before);
    else delete (globalThis as any).document;
  }
  const dispose = () => {
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    const roots = [player.group, player.glow, player.light, player.gas.group];
    for (const root of roots) root.traverse(object => {
      const renderable = object as THREE.Mesh;
      if (renderable.geometry) geometries.add(renderable.geometry);
      if (renderable.material) for (const material of Array.isArray(renderable.material) ? renderable.material : [renderable.material]) materials.add(material);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    radial.dispose();
  };
  return { player, dispose };
}
