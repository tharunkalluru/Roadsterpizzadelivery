import * as THREE from 'three';
import data from './assets/devara-skeleton-v2.json';

/** Selected anatomical bones, shared as one opaque draw. Decode once at scene
 * creation; animation and camera updates never traverse this static surface.
 * Attribution and the modified, reusable GLB are available in /credits.html. */
export function devaraSkeletonGeometry(): THREE.BufferGeometry {
  const bytes = (encoded: string, expected: number) => {
    const decoded = atob(encoded);
    if (decoded.length !== expected) throw Error('Invalid bundled skeleton buffer');
    // Avoid the string iterator/callback path: it allocates many temporary
    // values and can turn a small one-off scene decode into a visible pause.
    const buffer = new Uint8Array(decoded.length);
    for (let i = 0; i < buffer.length; i++) buffer[i] = decoded.charCodeAt(i);
    return buffer;
  };
  const count = data.vertexCount;
  if (data.schemaVersion !== 1 || count < 3 || count > 65535 || data.triangleCount < 1 || data.positionUnitMetres !== .0001) {
    throw Error('Invalid bundled skeleton metadata');
  }
  const positionBytes = bytes(data.positionInt16LE, count * 6);
  const normalBytes = bytes(data.normalInt8, count * 3);
  const indexBytes = bytes(data.indexUint16LE, data.triangleCount * 6);
  const positionView = new DataView(positionBytes.buffer);
  const indexView = new DataView(indexBytes.buffer);
  const positions = new Float32Array(count * 3);
  const indices = new Uint16Array(data.triangleCount * 3);
  for (let i = 0; i < positions.length; i++) positions[i] = positionView.getInt16(i * 2, true) * data.positionUnitMetres;
  for (let i = 0; i < indices.length; i++) {
    const index = indexView.getUint16(i * 2, true);
    if (index >= count) throw Error('Invalid bundled skeleton index');
    indices[i] = index;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(normalBytes.buffer), 3, true));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData = { sourceGlbSha256: data.sourceGlbSha256, license: data.license, attribution: data.attribution };
  return geometry;
}
