import * as THREE from 'three';

/** One shared opaque station-window material. Painted sky/room reflections
 * avoid expensive real glass and alpha sorting on mobile GPUs. */
export function stationWindowMaterial(textures: { map: THREE.Texture; emissive: THREE.Texture }) {
  return new THREE.MeshStandardMaterial({
    vertexColors: true, map: textures.map, emissiveMap: textures.emissive,
    emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0,
    roughness: .48, metalness: .12, side: THREE.DoubleSide,
    transparent: false, opacity: 1, depthWrite: true,
  });
}
