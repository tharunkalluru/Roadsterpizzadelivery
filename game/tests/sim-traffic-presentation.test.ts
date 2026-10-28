import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Presentation } from '../src/game/presentation';
import { Traffic } from '../src/game/traffic';
import { RoadGraph } from '../src/game/roadgraph';
import { TrafficCurve } from '../src/game/traffic-path';
import { segmentHitsVehicle } from '../src/game/spatial-safety';
import { initTemplates } from '../src/core/util';

function fixture(yaw = 2.4) {
  const gradient = { addColorStop() {} };
  const context = new Proxy({ measureText: (s: string) => ({ width: s.length * 12 }), createLinearGradient: () => gradient, createRadialGradient: () => gradient }, { get: (o: any, p) => p in o ? o[p] : () => {} });
  (globalThis as any).document = { createElement: () => ({ width: 256, height: 128, getContext: () => context }) };
  initTemplates({ rbox: new THREE.BoxGeometry(1, 1, 1), ring: new THREE.RingGeometry(1, 1.2, 8) });
  const graph = new RoadGraph([{ id: 'main', seg: 'main', name: 'Heading regression', cls: 'primary', w: 40, lanes: 4, oneway: null, from: 'a', to: 'b', pts: [[0, 0], [-Math.sin(yaw) * 1000, -Math.cos(yaw) * 1000]], elev: null, maxspeed: null }]);
  const traffic = new Traffic(graph, new THREE.Scene(), { vBody: new THREE.MeshStandardMaterial(), vLight: new THREE.MeshBasicMaterial() }, 0);
  return { traffic, edge: graph.edges[0] };
}
const headingError = (g: THREE.Object3D, hx: number, hz: number) => {
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(g.quaternion);
  return Math.hypot(f.x - hx, f.z - hz);
};

test('presentation restores the authoritative Euler representation, including order and headings beyond 90 degrees', () => {
  for (const order of ['XYZ', 'YXZ'] as const) for (const yaw of [-3.12, -2.4, -1.7, -.2, 0, .7, 1.7, 2.4, 3.12]) {
    const g = new THREE.Object3D(), presentation = new Presentation();
    g.rotation.set(.03, yaw, -.02, order); const before = g.rotation.toArray();
    presentation.capture([g]); presentation.apply(.37); presentation.restore();
    assert.deepEqual(g.rotation.toArray(), before, `${order}, yaw ${yaw}: rendering changed simulation rotation`);
  }
});

test('actual buses and autos keep their road tangent through repeated updates and render interpolation', () => {
  for (const kind of ['bus', 'auto'] as const) for (const yaw of [-2.4, -.7, .7, 2.4]) {
    const { traffic, edge } = fixture(yaw), car = traffic.spawnAt(kind, edge, 1, 100), presentation = new Presentation();
    const a = { x: car.x, y: car.y, z: car.z, hx: car.hx, hz: car.hz };
    const b = { x: a.x + a.hx * 20 - a.hz * 20, y: a.y, z: a.z + a.hz * 20 + a.hx * 20, hx: -a.hz, hz: a.hx };
    const curve = new TrafficCurve(a, b, 12);
    car.motion = { kind: 'bend', curve, startS: 100, endS: 160, edge, dir: 1, lane: car.lane, progress: 0, cap: 20 };
    presentation.capture([car.g]);
    for (let tick = 0; tick < 180; tick++) {
      (traffic as any).advance(car, .1, { x: 1e6, y: .55, z: 1e6 }, []);
      assert.ok(headingError(car.g, car.hx, car.hz) < 1e-8, `${kind}: road/body mismatch at tick ${tick}`);
      const position = car.g.position.clone(), angles = car.g.rotation.toArray(), rotation = car.g.quaternion.clone();
      presentation.capture([car.g]);
      for (const alpha of [0, .25, .75, .999]) {
        presentation.apply(alpha); presentation.restore();
        assert.ok(car.g.position.distanceTo(position) < 1e-10);
        assert.deepEqual(car.g.rotation.toArray(), angles);
        assert.ok(1 - Math.abs(car.g.quaternion.dot(rotation)) < 1e-10);
      }
    }
    traffic.dispose();
  }
});

test('reusing a pooled vehicle never blends its new spawn with its previous occupant', () => {
  const { traffic, edge } = fixture(), car = traffic.spawnAt('bus', edge, 1, 100), presentation = new Presentation();
  presentation.capture([car.g]); traffic.clear();
  const next = traffic.spawnAt('bus', edge, -1, edge.len - 103, 0);
  assert.equal(next.g, car.g); assert.equal(next.generation, 2);
  const position = next.g.position.clone(), rotation = next.g.quaternion.clone();
  presentation.capture([next.g]); presentation.apply(.3);
  assert.ok(next.g.position.distanceTo(position) < 1e-10, 'pooled bus slides from the previous entity');
  assert.ok(1 - Math.abs(next.g.quaternion.dot(rotation)) < 1e-10, 'pooled bus rotates from the previous entity');
  presentation.restore(); traffic.dispose();
});

test('camera hiding uses the rendered vehicle footprint at every heading', () => {
  const { traffic, edge } = fixture(), car = traffic.spawnAt('bus', edge, 1, 100), presentation = new Presentation();
  // An XYZ object also exercises non-canonical Euler decompositions independently of traffic's yaw order.
  car.g.rotation.set(0, 2.4, 0, 'XYZ'); presentation.capture([car.g]);
  car.g.position.x += 2; car.g.position.z += 1; presentation.capture([car.g]); presentation.apply(.3);
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(car.g.quaternion), p = car.g.position;
  const body = { x: p.x, y: p.y - .02, z: p.z, hx: f.x, hz: f.z, size: car.size };
  for (let x = -7; x <= 7; x += .7) for (let z = -7; z <= 7; z += .7) {
    const camera = new THREE.Vector3(p.x + x, car.y + 1.5, p.z + z);
    const visible = !segmentHitsVehicle(camera, camera, body, 1.2);
    traffic.hideNear(camera);
    assert.equal(car.g.visible, visible, `camera (${x},${z}) disagrees with the displayed bus`);
  }
  presentation.restore(); traffic.dispose();
});

test('an inactive frame cannot restore a pose when interpolation was never applied', () => {
  const g = new THREE.Object3D(), presentation = new Presentation();
  presentation.capture([g]); g.position.x = 3; presentation.restore();
  assert.equal(g.position.x, 3);
});
