import * as THREE from 'three';
import type { SignalColor, SignalSystem } from '../traffic/signals';
import type { WorldPhysics } from '../world/collision';
import { forwardOf } from '../world/roadIndex';

// Keep culling local to a junction-sized area rather than one map-wide batch.
const TILE_SIZE = 128;
const COLORS = ['red', 'amber', 'green'] as const;
const EMISSIVE = [0xff3b30, 0xffb020, 0x34c759];

type SignalMesh = THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
type HeadLayout = { edge: string; x: number; y: number; z: number; heading: number };
type SignalTile = {
  heads: { edge: string; color: SignalColor | null }[];
  lamps: SignalMesh[];
  lampMatrices: Float32Array;
};

export interface TrafficSignalPresentation {
  readonly root: THREE.Group;
  readonly stats: Readonly<{
    heads: number; tiles: number; meshes: number; geometries: number; materials: number;
    lampRebuilds: number;
  }>;
  update(signals: SignalSystem, tick: number): void;
  dispose(): void;
}

/**
 * The original pole, housing and three lamps, grouped by tile and material.
 * Signal plans and head placement still come exclusively from the simulation.
 * Only lamp membership changes; body geometry and all instance transforms stay fixed.
 */
export function buildTrafficSignals(signals: SignalSystem, world: WorldPhysics): TrafficSignalPresentation {
  const root = new THREE.Group();
  root.name = 'traffic-signals';
  root.matrixAutoUpdate = false;
  const geometries = [
    new THREE.CylinderGeometry(0.09, 0.11, 5.2, 8),
    new THREE.BoxGeometry(0.45, 1.25, 0.35),
    new THREE.SphereGeometry(0.14, 12, 8),
  ];
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1f24, roughness: 0.6, metalness: 0.4 });
  const lampMaterials = EMISSIVE.flatMap(emissive => [0.05, 3].map(emissiveIntensity =>
    new THREE.MeshStandardMaterial({ color: 0x222222, emissive, emissiveIntensity })));
  const stats = { heads: 0, tiles: 0, meshes: 0, geometries: 3, materials: 7, lampRebuilds: 0 };
  const layouts = new Map<string, { x: number; z: number; heads: HeadLayout[] }>();
  for (const node of signals.nodes) for (const approach of node.approaches) {
    const edge = world.nav.edges.get(approach.edge)!;
    const road = world.roads.roads.get(edge.roadId)!;
    const point = world.nav.pointOnDirected(approach.edge, Math.max(0, edge.lengthM - 5));
    const [fx, fz] = forwardOf(point.heading);
    const side = road.widthM / 2 + 0.8;
    const x = point.x + fz * side, z = point.z - fx * side;
    const tx = Math.floor(x / TILE_SIZE), tz = Math.floor(z / TILE_SIZE);
    const key = `${tx}_${tz}`;
    let layout = layouts.get(key);
    if (!layout) layouts.set(key, layout = { x: tx * TILE_SIZE, z: tz * TILE_SIZE, heads: [] });
    layout.heads.push({ edge: approach.edge, x, y: point.y, z, heading: point.heading + Math.PI });
    stats.heads++;
  }

  const meshes: SignalMesh[] = [];
  const tiles: SignalTile[] = [];
  const frame = new THREE.Object3D(), matrix = new THREE.Matrix4();
  const finishBounds = (mesh: SignalMesh) => {
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    mesh.visible = mesh.count > 0;
  };
  const rebuildLamps = (tile: SignalTile) => {
    for (const mesh of tile.lamps) mesh.count = 0;
    for (let head = 0; head < tile.heads.length; head++) for (let lamp = 0; lamp < COLORS.length; lamp++) {
      const bright = tile.heads[head].color === COLORS[lamp];
      const mesh = tile.lamps[lamp * 2 + Number(bright)];
      const source = (head * 3 + lamp) * 16, target = mesh.count++ * 16;
      // Copy cached Float32 values without allocating temporary matrix/view objects.
      for (let i = 0; i < 16; i++) mesh.instanceMatrix.array[target + i] = tile.lampMatrices[source + i];
    }
    for (const mesh of tile.lamps) {
      mesh.instanceMatrix.needsUpdate = true;
      // Bounds depend on both membership and count, including empty/nonempty changes.
      finishBounds(mesh);
    }
    stats.lampRebuilds++;
  };

  for (const [key, layout] of layouts) {
    const create = (part: string, geometry: THREE.BufferGeometry, material: THREE.MeshStandardMaterial, dynamic = false) => {
      const mesh = new THREE.InstancedMesh(geometry, material, layout.heads.length);
      mesh.name = `traffic-signal:${key}:${part}`;
      // Local coordinates keep instance-buffer quantization below a few micrometres.
      mesh.position.set(layout.x, 0, layout.z);
      mesh.updateMatrix();
      mesh.matrixAutoUpdate = false;
      if (dynamic) mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      root.add(mesh);
      meshes.push(mesh);
      return mesh;
    };
    const pole = create('pole', geometries[0], dark), box = create('box', geometries[1], dark);
    const tile: SignalTile = {
      heads: layout.heads.map(head => ({ edge: head.edge, color: null })),
      lamps: lampMaterials.map((material, i) => create(`${COLORS[Math.floor(i / 2)]}:${i % 2 ? 'bright' : 'dim'}`, geometries[2], material, true)),
      lampMatrices: new Float32Array(layout.heads.length * 3 * 16),
    };
    layout.heads.forEach((head, i) => {
      frame.position.set(head.x - layout.x, head.y, head.z - layout.z);
      frame.rotation.y = head.heading;
      frame.updateMatrix();
      pole.setMatrixAt(i, matrix.makeTranslation(0, 2.6, 0).premultiply(frame.matrix));
      box.setMatrixAt(i, matrix.makeTranslation(0, 4.6, 0).premultiply(frame.matrix));
      for (let lamp = 0; lamp < COLORS.length; lamp++) {
        matrix.makeTranslation(0, 5.0 - lamp * 0.4, -0.2).premultiply(frame.matrix);
        matrix.toArray(tile.lampMatrices, (i * 3 + lamp) * 16);
      }
    });
    finishBounds(pole); finishBounds(box);
    rebuildLamps(tile); // Preserve the original all-dim state before the first update.
    tiles.push(tile);
  }
  stats.tiles = tiles.length;
  stats.meshes = meshes.length;
  let disposed = false;
  let lastSignals: SignalSystem | undefined, lastTick: number | undefined;
  return {
    root, stats,
    update(current, tick) {
      if (disposed || current === lastSignals && tick === lastTick) return;
      lastSignals = current; lastTick = tick;
      for (const tile of tiles) {
        let changed = false;
        for (const head of tile.heads) {
          const color = current.colorFor(head.edge, tick);
          if (color !== head.color) { head.color = color; changed = true; }
        }
        if (changed) rebuildLamps(tile);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      root.clear();
      for (const mesh of meshes) mesh.dispose();
      for (const geometry of geometries) geometry.dispose();
      dark.dispose();
      for (const material of lampMaterials) material.dispose();
      meshes.length = 0; tiles.length = 0;
      lastSignals = undefined;
    },
  };
}
