import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { buildTrafficSignals } from '../../src/art/trafficSignals';
import { SignalSystem } from '../../src/traffic/signals';
import { WorldPhysics } from '../../src/world/collision';
import { forwardOf } from '../../src/world/roadIndex';
import { makeFixtureCore } from './fixture';

type Junction = { x: number; z: number; y?: number; angle?: number; length?: number };
function fixture(junctions: Junction[] = [{ x: 64, z: 64 }]) {
  const core = makeFixtureCore(), roadTemplate = core.roads[0];
  core.roads = []; core.nodes = []; core.directed = []; core.junctions = []; core.deliveries = [];
  for (const [j, junction] of junctions.entries()) {
    const nodeId = `j${j}`, roads: string[] = [], incoming: string[] = [];
    for (let arm = 0; arm < 4; arm++) {
      const id = `${nodeId}_${arm}`, fromNode = `${id}_start`, edge = `${id}:f`;
      const length = junction.length ?? 40, y = junction.y ?? 0;
      const [fx, fz] = forwardOf((junction.angle ?? 0) + arm * Math.PI / 2);
      const x = junction.x - fx * length, z = junction.z - fz * length;
      core.roads.push({ ...roadTemplate, id, fromNode, toNode: nodeId, points: [[x, z], [junction.x, junction.z]],
        pointElevM: [y, y], elevationM: y, lengthM: length, widthM: 8 + arm * 2 });
      core.nodes.push({ id: fromNode, osmNodeId: 0, x, z, level: 0, edges: [id], isJunction: false });
      core.directed.push({ id: edge, roadId: id, forward: true, fromNode, toNode: nodeId, lengthM: length, next: [] });
      roads.push(id); incoming.push(edge);
    }
    core.nodes.push({ id: nodeId, osmNodeId: 0, x: junction.x, z: junction.z, level: 0, edges: roads, isJunction: true });
    core.junctions.push({ id: nodeId, nodeId, incoming, outgoing: [], movementStatus: 'scenario_overlay', signalled: true });
  }
  const world = new WorldPhysics(core);
  return { world, signals: new SignalSystem(world) };
}

// Deliberately retain the old Group + five Mesh construction as an independent oracle.
function legacy(signals: SignalSystem, world: WorldPhysics) {
  const root = new THREE.Group();
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.11, 5.2, 8);
  const boxGeo = new THREE.BoxGeometry(0.45, 1.25, 0.35);
  const lampGeo = new THREE.SphereGeometry(0.14, 12, 8);
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1f24, roughness: 0.6, metalness: 0.4 });
  const heads: { edge: string; lamps: THREE.MeshStandardMaterial[] }[] = [];
  for (const node of signals.nodes) for (const approach of node.approaches) {
    const edge = world.nav.edges.get(approach.edge)!;
    const road = world.roads.roads.get(edge.roadId)!;
    const point = world.nav.pointOnDirected(approach.edge, Math.max(0, edge.lengthM - 5));
    const [fx, fz] = forwardOf(point.heading), side = road.widthM / 2 + 0.8;
    const group = new THREE.Group();
    group.position.set(point.x + fz * side, point.y, point.z - fx * side);
    group.rotation.y = point.heading + Math.PI;
    const pole = new THREE.Mesh(poleGeo, dark); pole.position.y = 2.6; group.add(pole);
    const box = new THREE.Mesh(boxGeo, dark); box.position.set(0, 4.6, 0); group.add(box);
    const lamps = [0xff3b30, 0xffb020, 0x34c759].map((emissive, i) => {
      const material = new THREE.MeshStandardMaterial({ color: 0x222222, emissive, emissiveIntensity: 0.05 });
      const lamp = new THREE.Mesh(lampGeo, material); lamp.position.set(0, 5.0 - i * 0.4, -0.2); group.add(lamp);
      return material;
    });
    root.add(group); heads.push({ edge: approach.edge, lamps });
  }
  return {
    root,
    update(current: SignalSystem, tick: number) {
      for (const head of heads) {
        const color = current.colorFor(head.edge, tick);
        head.lamps.forEach((material, i) => { material.emissiveIntensity = color === ['red', 'amber', 'green'][i] ? 3 : 0.05; });
      }
    },
    dispose() {
      poleGeo.dispose(); boxGeo.dispose(); lampGeo.dispose(); dark.dispose();
      heads.forEach(head => head.lamps.forEach(material => material.dispose()));
    },
  };
}

function meshes(root: THREE.Object3D) {
  const result: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[] = [];
  root.traverse(object => { if (object instanceof THREE.Mesh) result.push(object); });
  return result;
}

function materialRecord(material: THREE.MeshStandardMaterial) {
  return { color: material.color.getHex(), emissive: material.emissive.getHex(), emissiveIntensity: material.emissiveIntensity,
    roughness: material.roughness, metalness: material.metalness, opacity: material.opacity, transparent: material.transparent,
    side: material.side, depthWrite: material.depthWrite, depthTest: material.depthTest, toneMapped: material.toneMapped };
}

function expanded(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const records = meshes(root).flatMap(mesh => {
    const count = mesh instanceof THREE.InstancedMesh ? mesh.count : 1;
    return Array.from({ length: count }, (_, i) => {
      const matrix = new THREE.Matrix4();
      if (mesh instanceof THREE.InstancedMesh) { mesh.getMatrixAt(i, matrix); matrix.premultiply(mesh.matrixWorld); }
      else matrix.copy(mesh.matrixWorld);
      return { mesh, matrix, material: materialRecord(mesh.material) };
    });
  });
  return records.sort((a, b) => a.mesh.geometry.type.localeCompare(b.mesh.geometry.type)
    || a.matrix.elements[12] - b.matrix.elements[12]
    || a.matrix.elements[14] - b.matrix.elements[14]
    || a.matrix.elements[13] - b.matrix.elements[13]);
}

function expectEquivalent(actual: THREE.Object3D, expected: THREE.Object3D) {
  const a = expanded(actual), b = expanded(expected);
  expect(a).toHaveLength(b.length);
  for (let i = 0; i < a.length; i++) {
    expect(a[i].mesh.geometry.type).toBe(b[i].mesh.geometry.type);
    expect(a[i].material).toEqual(b[i].material);
    expect(a[i].mesh.castShadow).toBe(b[i].mesh.castShadow);
    expect(a[i].mesh.receiveShadow).toBe(b[i].mesh.receiveShadow);
    // Three's instance buffer is Float32; a 128m local tile bounds translation error.
    for (let e = 0; e < 16; e++) expect(Math.abs(a[i].matrix.elements[e] - b[i].matrix.elements[e])).toBeLessThan(0.00001);
  }
}

function instances(root: THREE.Object3D): THREE.InstancedMesh[] {
  const result: THREE.InstancedMesh[] = [];
  root.traverse(object => { if (object instanceof THREE.InstancedMesh) result.push(object); });
  return result;
}

function versions(root: THREE.Object3D) {
  return new Map(instances(root).map(mesh => [mesh.name, mesh.instanceMatrix.version]));
}

describe('batched traffic signal presentation', () => {
  it('retains original geometry, material defaults, placement and initial dim state', () => {
    const { signals, world } = fixture([
      { x: -0.001, z: 127.999, angle: 0.73, y: 6.5 },
      { x: 128.001, z: -128.001, angle: -1.13, length: 3 },
      { x: 42130.173, z: -17321.439, angle: 2.81, y: 12.25 },
    ]);
    const source = JSON.stringify(world.core), actual = buildTrafficSignals(signals, world), expected = legacy(signals, world);
    try {
      expectEquivalent(actual.root, expected.root);
      const a = new Map(meshes(actual.root).map(mesh => [mesh.geometry.type, mesh.geometry]));
      const b = new Map(meshes(expected.root).map(mesh => [mesh.geometry.type, mesh.geometry]));
      expect(a.size).toBe(3);
      for (const [type, geometry] of a) {
        const reference = b.get(type)!;
        expect(geometry.index?.array).toEqual(reference.index?.array);
        expect(geometry.groups).toEqual(reference.groups);
        for (const name of Object.keys(geometry.attributes)) {
          expect(geometry.getAttribute(name).array).toEqual(reference.getAttribute(name).array);
        }
      }
      expect(new Set(meshes(actual.root).map(mesh => mesh.material)).size).toBe(7);
      expect(JSON.stringify(world.core)).toBe(source);
    } finally { actual.dispose(); expected.dispose(); }
  });

  it('matches both signal phases, offsets, walk/clearance and positive/negative cycle wraps', () => {
    const { signals, world } = fixture([{ x: 64, z: 64, angle: 0.37 }, { x: 576, z: 64, angle: -0.29 }]);
    signals.nodes[0].pedestrian = true;
    for (const approach of signals.nodes[0].approaches) signals.approach.get(approach.edge)!.pedestrian = true;
    const actual = buildTrafficSignals(signals, world), expected = legacy(signals, world);
    const { GREEN: g, AMBER: a, CYCLE: c, WALK: w, WALK_CLEAR: clear } = SignalSystem;
    try {
      for (const tick of [0, 1, g - 1, g, g + a - 1, g + a, c - a, c - 1, c, c + w - 1, c + w,
        c + w + clear - 1, c + w + clear, 2 * (c + w + clear) + 1, -1, -g, -c]) {
        actual.update(signals, tick); expected.update(signals, tick);
        expectEquivalent(actual.root, expected.root);
      }
    } finally { actual.dispose(); expected.dispose(); }
  });

  it('skips duplicate input/tick queries and leaves buffers unchanged until a tile changes state', () => {
    const { signals, world } = fixture([{ x: 64, z: 64 }, { x: 320, z: 64 }]);
    const actual = buildTrafficSignals(signals, world), query = vi.spyOn(signals, 'colorFor');
    try {
      actual.update(signals, 0);
      const initial = versions(actual.root), rebuilds = actual.stats.lampRebuilds;
      query.mockClear(); actual.update(signals, 0);
      expect(query).not.toHaveBeenCalled();
      actual.update(signals, 1);
      expect(query).toHaveBeenCalledTimes(actual.stats.heads);
      expect(versions(actual.root)).toEqual(initial);
      expect(actual.stats.lampRebuilds).toBe(rebuilds);
      actual.update(signals, SignalSystem.GREEN - 1);
      const before = versions(actual.root), beforeRebuilds = actual.stats.lampRebuilds;
      actual.update(signals, SignalSystem.GREEN);
      expect(actual.stats.lampRebuilds).toBe(beforeRebuilds + 1);
      for (const [name, version] of versions(actual.root)) {
        const changed = name.startsWith('traffic-signal:0_0:') && !name.endsWith(':pole') && !name.endsWith(':box');
        expect(version).toBe(before.get(name)! + Number(changed));
      }
    } finally { query.mockRestore(); actual.dispose(); }
  });

  it('accepts a new signal input at the same tick, with missing approaches returning all lamps to dim', () => {
    const { signals, world } = fixture();
    const actual = buildTrafficSignals(signals, world), expected = legacy(signals, world), missing = new SignalSystem(world);
    missing.approach.clear();
    try {
      actual.update(signals, 0); expected.update(signals, 0);
      expectEquivalent(actual.root, expected.root);
      actual.update(missing, 0); expected.update(missing, 0);
      expectEquivalent(actual.root, expected.root);
      expect(expanded(actual.root).filter(record => record.mesh.geometry.type === 'SphereGeometry')
        .every(record => record.material.emissiveIntensity === 0.05)).toBe(true);
    } finally { actual.dispose(); expected.dispose(); }
  });

  it('refreshes local bounds across zero counts and never culls an individually visible instance at tile boundaries', () => {
    const { signals, world } = fixture([
      { x: -128.001, z: -0.001, angle: 0.31 }, { x: 0.001, z: 128.001, angle: -0.63 },
      { x: 128.001, z: -128.001, angle: 1.17, y: 6.5 },
    ]);
    const actual = buildTrafficSignals(signals, world);
    const camera = new THREE.PerspectiveCamera(60, 1.5, 0.1, 250), frustum = new THREE.Frustum();
    const local = new THREE.Matrix4(), sphere = new THREE.Sphere(), box = new THREE.Box3();
    try {
      expect(actual.stats.tiles).toBeGreaterThan(3);
      for (const tick of [0, SignalSystem.GREEN, SignalSystem.GREEN + SignalSystem.AMBER, SignalSystem.CYCLE, 0]) {
        actual.update(signals, tick); actual.root.updateMatrixWorld(true);
        for (const mesh of instances(actual.root)) {
          expect(mesh.visible).toBe(mesh.count > 0);
          if (!mesh.count) {
            expect(mesh.boundingBox!.isEmpty()).toBe(true);
            expect(mesh.boundingSphere!.isEmpty()).toBe(true);
            continue;
          }
          mesh.geometry.computeBoundingBox(); mesh.geometry.computeBoundingSphere();
          for (let i = 0; i < mesh.count; i++) {
            mesh.getMatrixAt(i, local);
            sphere.copy(mesh.geometry.boundingSphere!).applyMatrix4(local);
            expect(mesh.boundingSphere!.center.distanceTo(sphere.center) + sphere.radius).toBeLessThanOrEqual(mesh.boundingSphere!.radius + 1e-8);
            box.copy(mesh.geometry.boundingBox!).applyMatrix4(local);
            expect(mesh.boundingBox!.containsBox(box)).toBe(true);
          }
        }
        for (const eye of [[-250, 8, -180], [100, 12, 220], [180, 7, -160], [0, 90, 0]]) {
          camera.position.set(eye[0], eye[1], eye[2]); camera.lookAt(0, 3, 0); camera.updateMatrixWorld();
          frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
          for (const record of expanded(actual.root)) {
            sphere.copy(record.mesh.geometry.boundingSphere!).applyMatrix4(record.matrix);
            if (frustum.intersectsSphere(sphere)) expect(frustum.intersectsObject(record.mesh)).toBe(true);
          }
        }
      }
    } finally { actual.dispose(); }
  });

  it('reduces scene/material objects for 176 heads while preserving every body and lamp', () => {
    const junctions = Array.from({ length: 44 }, (_, i) => ({ x: i % 8 * 256 + 64, z: Math.floor(i / 8) * 256 + 64, angle: i % 3 * 0.13 }));
    const { signals, world } = fixture(junctions), actual = buildTrafficSignals(signals, world), expected = legacy(signals, world);
    try {
      let actualNodes = 0, originalNodes = 0;
      actual.root.traverse(() => actualNodes++); expected.root.traverse(() => originalNodes++);
      expect(actual.stats.heads).toBe(176);
      expect(actual.stats.tiles).toBe(44);
      expect(actualNodes).toBe(353);
      expect(actualNodes).toBeLessThan(originalNodes * 0.34);
      expect(new Set(meshes(actual.root).map(mesh => mesh.material)).size).toBe(7);
      expect(new Set(meshes(expected.root).map(mesh => mesh.material)).size).toBe(529);
      expect(new Set(meshes(actual.root).map(mesh => mesh.geometry)).size).toBe(3);
      expect(expanded(actual.root)).toHaveLength(176 * 5);
    } finally { actual.dispose(); expected.dispose(); }
  });

  it('disposes each instance buffer and each shared resource exactly once, including an empty presentation', () => {
    for (const junctions of [[{ x: 64, z: 64 }, { x: 320, z: 64 }], []]) {
      const { signals, world } = fixture(junctions), actual = buildTrafficSignals(signals, world);
      const meshDispose = vi.spyOn(THREE.InstancedMesh.prototype, 'dispose');
      const geometryDispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
      const materialDispose = vi.spyOn(THREE.Material.prototype, 'dispose');
      const scene = new THREE.Scene(); scene.add(actual.root);
      try {
        const count = actual.stats.meshes;
        actual.dispose(); actual.dispose(); actual.update(signals, 0);
        expect(actual.root.parent).toBeNull(); expect(actual.root.children).toHaveLength(0);
        expect(meshDispose).toHaveBeenCalledTimes(count);
        expect(geometryDispose).toHaveBeenCalledTimes(3);
        expect(materialDispose).toHaveBeenCalledTimes(7);
        expect(new Set(meshDispose.mock.contexts).size).toBe(count);
        expect(new Set(geometryDispose.mock.contexts).size).toBe(3);
        expect(new Set(materialDispose.mock.contexts).size).toBe(7);
      } finally { meshDispose.mockRestore(); geometryDispose.mockRestore(); materialDispose.mockRestore(); }
    }
  });
});
