import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Batch, initTemplates } from '../../src/core/util';
import { dividerStripeDistance, drawClosedDivider } from '../../src/world/road-divider-mesh';
import { continuousPaintStroke, paintOnRoad } from '../../src/world/road-paint-mesh';
import { roadQuadHeight } from '../../src/world/road-surface';
import { buildTile } from '../../src/world/city';
import { makeRailwayNetwork } from '../../src/world/railway-geometry';
import type { RoadEdge } from '../../src/world/types';
import type { OsmFeature } from '../../src/world/extras';

test('a graded divider is a finite outward closed solid with painted terminal faces', () => {
  const batch = new Batch();
  drawClosedDivider(batch, [10, 20], [18, 26], .4, .42, -.3, .5, '#FFC21A', 1.2, 11.2);
  assert.equal(batch.pos.length / 9, 12, 'top, bottom, two sides and two end caps');
  assert.ok([...batch.pos, ...batch.nor, ...batch.uv].every(Number.isFinite));
  const edges = new Map<string, number>(), center = new THREE.Vector3(14, .31, 23);
  for (let i = 0; i < batch.pos.length; i += 9) {
    const points = [0, 3, 6].map(k => batch.pos.slice(i + k, i + k + 3));
    const face = new THREE.Vector3(...points[0] as [number, number, number]).add(new THREE.Vector3(...points[1] as [number, number, number])).add(new THREE.Vector3(...points[2] as [number, number, number])).multiplyScalar(1 / 3);
    const normal = new THREE.Vector3(...batch.nor.slice(i, i + 3) as [number, number, number]);
    assert.ok(normal.dot(face.sub(center)) > 0, 'every face points out of the solid');
    for (let k = 0; k < 3; k++) {
      const key = [points[k].join(','), points[(k + 1) % 3].join(',')].sort().join('|');
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }
  assert.ok([...edges.values()].every(n => n === 2), 'no unmatched/open mesh edge');
  const capUVs = batch.uv.slice(-24);
  assert.ok(capUVs.filter((_, i) => i % 2 === 0).every(u => u === .25), 'end paint stays on the light/yellow texture half');
});

test('short pieces and clipped runs keep the same physical metre stripe repeat', () => {
  for (const length of [.7071067811872711, 1.0630145812733964, 1.1, 2.4, 7.787810988975429, 52.07044206470006, 137.3, 1349.7]) {
    const count = dividerStripeDistance(length, length);
    assert.equal(count, length, 'source length never compresses or stretches the physical repeat');
    assert.equal(dividerStripeDistance(0, length), 0);
    assert.equal(dividerStripeDistance(.5, length), .5, 'the same half-metre colour block survives even on a sub-metre piece');
    const cut = length * .37;
    const batch = new Batch();
    drawClosedDivider(batch, [0, 0], [cut, 0], .4, .42, 0, 0, '#FFC21A', 0, dividerStripeDistance(cut, length));
    drawClosedDivider(batch, [cut, 0], [length, 0], .4, .42, 0, 0, '#FFC21A', dividerStripeDistance(cut, length), count);
    const boundaryUV = (start: number) => Array.from({ length: 6 }, (_, i) => start + i).filter(i => Math.abs(batch.pos[i * 3] - cut) < 1e-8).map(i => batch.uv[i * 2]);
    assert.deepEqual([...new Set(boundaryUV(0))], [...new Set(boundaryUV(36))], 'both emitted top faces share the same phase at a split');
    assert.ok(boundaryUV(36).every(u => u > 0), 'the second emitted run does not restart the stripe texture');
  }
  assert.equal(dividerStripeDistance(1, 0), 0);
});

test('actual continuous yellow edge markings share their bend vertices and keep their painted width', () => {
  initTemplates();
  const road: RoadEdge = { id: 'yellow-bend', name: null, cls: 'primary', w: 12, lanes: 4, oneway: null, from: 'a', to: 'b', pts: [[200, 200], [500, 200], [650, 400]], elev: null, maxspeed: 40 };
  const tile = buildTile({ i: 0, j: 0, roads: [road], nodes: {}, buildings: [], boards: [], furniture: [], areas: [], osm: [] }, { lowQ: true });
  const vertices: string[][] = [];
  for (const buffer of tile.buffers.filter(b => b.mat === 'marks')) for (let i = 0; i < buffer.pos.length; i += 9) vertices.push([0, 3, 6].map(k => Array.from(buffer.pos.slice(i + k, i + k + 3)).join(',')));
  assert.ok(vertices.length >= 8, 'actual edge paint is triangulated at the asphalt diagonal');
  const remaining = new Set(vertices.map((_, i) => i)), components: number[][] = [];
  while (remaining.size) {
    const queue = [remaining.values().next().value!], component: number[] = [];
    while (queue.length) { const i = queue.pop()!; if (!remaining.delete(i)) continue; component.push(i); for (const j of remaining) if (vertices[i].some(v => vertices[j].includes(v))) queue.push(j); }
    components.push(component);
  }
  assert.equal(components.length, 2, 'neither yellow line breaks into disconnected rectangles at the bend');
  const flatY = tile.buffers.filter(b => b.mat === 'marks').flatMap(b => Array.from(b.pos).filter((_, i) => i % 3 === 1));
  const asphaltY = tile.buffers.find(b => b.mat === 'road')!.pos[1];
  assert.ok(flatY.every(y => Math.abs(y - asphaltY - .012) < 1e-6), 'yellow paint remains the same film above its actual emitted road');
});

test('paint joins keep physical normal width or a finite bounded bevel', () => {
  for (const points of [
    [[0, 0], [300, 0], [300, 300]], [[0, 0], [300, 0], [300, 3]],
    [[0, 0], [300, 0], [297, .05]], [[0, 0], [300, 0], [0, 0]],
    [[0, 0], [0, 0], [3, 0]],
  ] as [number, number][][]) {
    const stroke = continuousPaintStroke(points, .12);
    for (let i = 0; i < stroke.segments.length; i++) {
      const segment = stroke.segments[i], dx = points[i + 1][0] - points[i][0], dz = points[i + 1][1] - points[i][1], length = Math.hypot(dx, dz);
      assert.ok(Object.values(segment).flat().every(Number.isFinite));
      if (length < 1e-9) continue;
      for (const [a, b] of [[segment.left0, segment.right0], [segment.left1, segment.right1]])
        assert.ok(Math.abs((a[0] - b[0]) * -dz / length + (a[1] - b[1]) * dx / length - .12) < 1e-10);
    }
    for (const bevel of stroke.bevels) for (const point of bevel.points)
      assert.ok(Math.hypot(point[0] - points[bevel.index][0], point[1] - points[bevel.index][1]) <= .06 + 1e-9);
  }
});

test('paint triangles inherit literal asphalt planes through a twisted diagonal', () => {
  const road = [[0, 0, 0], [3, .1, 0], [3, .25, 3], [0, .1, 3]] as const;
  const output = paintOnRoad([[-1, 1], [4, 1], [4, 1.12], [-1, 1.12]], road, .012);
  assert.ok(output.length >= 2);
  for (const triangle of output) for (const vertex of triangle) {
    assert.ok(vertex[0] >= -1e-9 && vertex[0] <= 3 + 1e-9 && vertex[2] >= -1e-9 && vertex[2] <= 3 + 1e-9);
    assert.ok(Math.abs(vertex[1] - roadQuadHeight(road, vertex[0], vertex[2])! - .012) < 1e-10);
  }
});

test('actual median end caps are visible from a real railway opening, while geometry and collision retain the gap', () => {
  initTemplates();
  const road: RoadEdge = { id: 'test-road', name: null, cls: 'primary', w: 12, lanes: 4, oneway: null, from: 'a', to: 'b', pts: [[100, 500], [900, 500]], elev: null, maxspeed: 40 };
  const railway = makeRailwayNetwork([-2.6, 2.6].map((offset, i) => ({ id: 'rail-' + i, k: 'rail', l: [[500 + offset, 100], [500 + offset, 900]], t: { railway: 'rail' } } as OsmFeature)));
  for (const lowQ of [true, false]) {
    const tile = buildTile({ i: 0, j: 0, roads: [road], nodes: {}, buildings: [], boards: [], furniture: [], areas: [], osm: [] }, { lowQ, railway });
    const buffers = tile.buffers.filter(b => b.mat === 'kerb');
    assert.ok(buffers.length);
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const meshes = buffers.map(b => { const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(b.pos, 3)); return new THREE.Mesh(geometry, material); });
    for (const direction of [-1, 1]) {
      const ray = new THREE.Raycaster(new THREE.Vector3(500, .18, 500), new THREE.Vector3(direction, 0, 0), 0, 20);
      const hit = ray.intersectObjects(meshes)[0];
      assert.ok(hit, 'looking along the opening must see a closed divider end');
      assert.ok(hit.point.x < 493.7 || hit.point.x > 506.3);
      assert.ok(Math.abs(hit.face!.normal.x) > .99, 'the hit is an end face, not a distant side');
    }
    for (const b of buffers) for (let i = 0; i < b.pos.length; i += 3) assert.ok(!(b.pos[i] >= 493.7 && b.pos[i] <= 506.3 && Math.abs(b.pos[i + 2] - 500) < 10), 'the new caps do not close the actual railway gap');
    for (const wall of new Set([...tile.walls.values()].flat())) if (wall.kind === 'median') {
      assert.equal(wall.y1a - wall.y0a, .36);
      assert.ok(Math.max(wall.ax, wall.bx) < 493.7 || Math.min(wall.ax, wall.bx) > 506.3);
    }
    for (const mesh of meshes) mesh.geometry.dispose(); material.dispose();
  }
});
