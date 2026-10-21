import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { buildRoads } from '../../src/art/roads';
import { GeoBuilder } from '../../src/art/geo';
import { makeFixtureCore } from './fixture';
import type { Quality } from '../../src/art/api';
import type { RoadEdge, Vec2, WorldCore } from '../../src/world/schema';

// The assertions concern emitted geometry; image loading and canvas atlases are
// independent of tile selection and are intentionally outside this Node test.
vi.mock('../../src/art/mats', async () => {
  const { MeshBasicMaterial } = await import('three');
  const materials = Object.fromEntries(['asphalt', 'paving', 'concrete', 'lineWhite', 'verge'].map(name => [name, new MeshBasicMaterial({ name })]));
  return { getWorldMats: () => materials };
});

function multiTileCore(): WorldCore {
  const core = makeFixtureCore();
  const add = (id: string, fromNode: string, toNode: string, points: Vec2[], heights: number[], widthM = 10) => {
    const lengthM = points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]), 0);
    const elevationM = Math.max(...heights);
    const road: RoadEdge = {
      ...core.roads[0], id, name: id, fromNode, toNode, points, lengthM, widthM,
      bridge: elevationM > 0, level: elevationM > 0 ? 1 : 0, elevationM,
      pointElevM: heights, surfaceId: `fixture_${id}`,
    };
    core.roads.push(road);
    for (const [nodeId, point] of [[fromNode, points[0]], [toNode, points.at(-1)!]] as [string, Vec2][]) {
      let node = core.nodes.find(n => n.id === nodeId);
      if (!node) {
        node = { id: nodeId, osmNodeId: 0, x: point[0], z: point[1], level: road.level, edges: [], isJunction: false };
        core.nodes.push(node);
      }
      node.edges.push(id);
    }
  };
  // A bent elevated continuation spans tiles, then forks into a three-way deck cap.
  add('E2', 'n6', 'e7', [[150, -1500], [1000, -1450]], [6.5, 6.5]);
  add('E3', 'e7', 'e8', [[1000, -1450], [1300, -1550]], [6.5, 6.5]);
  add('E4', 'e7', 'e9', [[1000, -1450], [1000, -1100]], [6.5, 6.5]);
  add('R', 'e8', 'r10', [[1300, -1550], [1500, -1500]], [6.5, 0]);
  // Its midpoint owns tile 1_-3, but it affects piers of E2 in tile 1_-4.
  add('CROSS', 'c0', 'c1', [[587.5, -1900], [587.5, -900]], [0, 0]);
  for (const node of core.nodes) node.isJunction = node.edges.length >= 3;
  return core;
}

function geometryRecord(group: THREE.Object3D) {
  const meshes: unknown[] = [];
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry;
    meshes.push({
      name: object.name,
      attributes: Object.fromEntries((Object.entries(geometry.attributes) as [string, THREE.BufferAttribute][]).map(([name, attribute]) => [name, {
        itemSize: attribute.itemSize, normalized: attribute.normalized,
        array: Array.from(attribute.array),
      }])),
      index: geometry.index ? Array.from(geometry.index.array) : null,
      groups: geometry.groups,
      castShadow: object.castShadow, receiveShadow: object.receiveShadow,
      renderOrder: object.renderOrder,
      material: (Array.isArray(object.material) ? object.material : [object.material]).map(m => m.name),
      instanceCount: object instanceof THREE.InstancedMesh ? object.count : null,
      instances: object instanceof THREE.InstancedMesh ? Array.from(object.instanceMatrix.array) : null,
      matrix: object.matrixWorld.elements.slice(),
    });
  });
  return meshes;
}

function release(group: THREE.Group) {
  const geometries = new Set<THREE.BufferGeometry>(group.userData.sharedGeometries ?? []);
  group.traverse(object => {
    if (object instanceof THREE.Mesh) geometries.add(object.geometry);
    if (object instanceof THREE.InstancedMesh) object.dispose();
  });
  for (const geometry of geometries) geometry.dispose();
}

describe('road tile geometry selection', () => {
  it.each<Quality>(['low', 'standard', 'high'])('retains exact full-build geometry, junctions and bridge instances on %s', quality => {
    const core = multiTileCore(), source = JSON.stringify(core);
    const full = buildRoads(core, quality);
    expect(full.children.length).toBeGreaterThan(4);
    expect(full.getObjectByName('bridge-piers')).toBeDefined();
    expect(full.userData.info.junctions).toBeGreaterThan(0);
    try {
      for (const tile of full.children) {
        const key = tile.name.slice('roads_'.length);
        const selected = buildRoads(core, quality, key);
        try {
          expect(selected.children).toHaveLength(1);
          expect(geometryRecord(selected.children[0])).toEqual(geometryRecord(tile));
          expect(selected.userData.info.edges).toBe(full.userData.info.edges);
          expect(selected.userData.info.junctions).toBe(full.userData.info.junctions);
        } finally { release(selected); }
      }
      expect(JSON.stringify(core)).toBe(source);
    } finally { release(full); }
  });

  it('retains an off-tile crossing that determines selected-tile pier placement', () => {
    const core = multiTileCore();
    const withCrossing = buildRoads(core, 'standard', '1_-4');
    const withoutCrossing = buildRoads({ ...core, roads: core.roads.filter(r => r.id !== 'CROSS') }, 'standard', '1_-4');
    try {
      const piers = withCrossing.getObjectByName('bridge-piers') as THREE.InstancedMesh;
      const other = withoutCrossing.getObjectByName('bridge-piers') as THREE.InstancedMesh;
      expect(piers).toBeDefined();
      expect(piers.count).toBe(other.count);
      expect(Array.from(piers.instanceMatrix.array)).not.toEqual(Array.from(other.instanceMatrix.array));
    } finally { release(withCrossing); release(withoutCrossing); }
  });

  it('does not allocate builder vertices for excluded tiles', () => {
    const core = multiTileCore();
    const vertex = vi.spyOn(GeoBuilder.prototype, 'vert');
    try {
      const full = buildRoads(core, 'standard');
      const fullVertices = vertex.mock.calls.length;
      release(full); vertex.mockClear();
      const selected = buildRoads(core, 'standard', '1_-4');
      const selectedVertices = vertex.mock.calls.length;
      release(selected); vertex.mockClear();
      const empty = buildRoads(core, 'standard', '99_99');
      expect(empty.children).toHaveLength(0);
      expect(vertex).not.toHaveBeenCalled();
      expect(selectedVertices).toBeGreaterThan(0);
      expect(selectedVertices).toBeLessThan(fullVertices / 2);
      release(empty);
    } finally { vertex.mockRestore(); }
  });
});
