import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { initTemplates, rng } from '../../../../src/core/util';
import { Traffic } from '../../../../src/game/traffic';
import { RoadGraph } from '../../../../src/game/roadgraph';
import { buildTile } from '../../../../src/world/city';
import * as M from '../../../../src/world/traffic_models';
import type { RoadEdge, XZ } from '../../../../src/world/types';

const gradient = { addColorStop() {} }, context = new Proxy({ measureText: (s: string) => ({ width: s.length * 12 }), createLinearGradient: () => gradient, createRadialGradient: () => gradient }, { get: (o: any, k) => k in o ? o[k] : () => {} });
(globalThis as any).document = { createElement: () => ({ width: 256, height: 128, getContext: () => context }) };
initTemplates({ rbox: new RoundedBoxGeometry(1, 1, 1, 3, .12), ring: new THREE.RingGeometry(1, 1.35, 40) });
const material = new THREE.MeshBasicMaterial({ vertexColors: true });
const prototypes = [M.bus(rng(1)), M.auto(rng(2)), M.car('sedan', '#eeeeee', rng(3))].map(m => ({ group: m.kind, size: m.size, body: m.body.geometry(), lights: m.lights.geometry(), decals: m.decals ?? [] }));
const roads: RoadEdge[] = Array.from({ length: 5 }, (_, n) => {
  const pts: XZ[] = Array.from({ length: 301 }, (_, i) => [10 + i * 2, 80 + n * 45]);
  return { id: `cpu-${n}`, seg: `cpu-${n}`, cls: 'primary', name: 'Bounded CPU fixture', w: 13, lanes: 3, oneway: null, from: `a${n}`, to: `b${n}`, pts, elev: pts.map(p => 40 - 9 * Math.cos((p[0] - 10) / 120)), maxspeed: 40 };
});
const built = buildTile({ i: 0, j: 0, roads, nodes: {}, buildings: [], boards: [], furniture: [], areas: [], osm: [] }, { lowQ: true });
const city: any = { surfaceGrid: built.surfaceGrid, buildingGrid: built.buildingGrid, walls: built.walls, obstacles: built.obstacles, waterGrid: new Map(), landmarkSurfaceGrid: new Map(), movingRail: [] };
const player = { x: -5000, z: -5000, y: .55, speed: 0 };
export function sample(disabled: boolean, warmFrames = 120, timedFrames = 180) {
  const graph = new RoadGraph(roads), traffic: Traffic = Object.assign(Object.create(Traffic.prototype), { graph, city, cars: [], max: 55, scene: new THREE.Scene(), mats: { vBody: material, vLight: material }, byGroup: Object.fromEntries(prototypes.map(p => [p.group, [p]])), r: rng(77), t: 0, plans: 0, stopsByEdge: new Map(), passengerExchanges: [], services: null, onHorn() {} });
  if (disabled) (traffic as any).placeVisual = (g: THREE.Group, p: any) => { g.position.set(p.x, p.y + .02, p.z); g.rotation.set(0, Math.atan2(-p.hx, -p.hz), 0); };
  for (let row = 0; row < 5; row++) for (let i = 0; i < 11; i++) {
    const group = prototypes[(row + i) % prototypes.length].group as 'bus' | 'auto' | 'car';
    const c = traffic.spawnAt(group, graph.byId.get(`cpu-${row}`)!, 1, 15 + i * 50, 2.4); c.speed = c.want = 8;
  }
  for (let i = 0; i < warmFrames; i++) traffic.update(1 / 60, 310, 180, player, []);
  const start = performance.now();
  for (let i = 0; i < timedFrames; i++) traffic.update(1 / 60, 310, 180, player, []);
  const elapsed = performance.now() - start;
  return { millisecondsPerFrame: elapsed / timedFrames, microsecondsPerVehicle: elapsed * 1000 / timedFrames / traffic.cars.length,
    frames: timedFrames, vehicles: traffic.cars.length, seconds: traffic.t, final: traffic.cars.map(c => [c.edge.e.id, c.s, c.speed, c.lane, c.x, c.y, c.z, c.hx, c.hz]) };
}
