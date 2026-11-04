import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import type { Car } from '../../src/game/traffic';
import { CarrierMarker } from '../../src/delivery/systems/carrier-marker';
import { PICKUP_CONFIG } from '../../src/delivery/core/pickup-config';

function fixture() {
  const scene = new THREE.Scene(), system = new CarrierMarker(scene);
  const make = (group: Car['group'], x = 10, y = 0) => {
    const g = new THREE.Group(); g.position.set(x, y + .02, 0); scene.add(g);
    return { g, group, kind: group, size: [2, group === 'bus' ? 3.3 : 1.8, 4], x, y, z: 0 } as Car;
  };
  return { scene, system, make, player: { x: 0, y: .55, z: 0 } };
}

test('carrier pool caps nearby offers, retains leases and reuses objects and geometry after a reset', () => {
  const { system, make, player } = fixture();
  const cars = ['auto', 'bus', 'bike', 'car', 'truck'].map((group, i) => make(group as Car['group'], 10 + i));
  system.update(0, cars, player);
  const markers = system.markers, leases = [...markers], children = cars.flatMap(c => c.g.children);
  assert.equal(system.activeCount, PICKUP_CONFIG.maxCarriersNearby);
  assert.equal(new Set(markers.map(m => m.carrierId)).size, markers.length);
  for (let i = 0; i < 100; i++) { system.beforeFrame(); system.update(1 / 60, cars, player); }
  assert.equal(system.markers, markers); assert.deepEqual(system.markers, leases);
  system.clear(); system.update(0, cars, player);
  assert.ok(cars.flatMap(c => c.g.children).every(child => children.includes(child)), 'no new visual allocations on reassign');
  system.dispose();
});

test('all five traffic kinds may carry a slice without encoding the customer identity', () => {
  for (const group of ['auto', 'bus', 'bike', 'car', 'truck'] as const) {
    const { system, make, player } = fixture(), car = make(group);
    system.update(0, [car], player);
    assert.equal(system.activeCount, 1); assert.equal(system.markers[0].carrierId, car.g.uuid);
    assert.equal(system.markers[0].position.y, car.g.position.y + car.size[1] + PICKUP_CONFIG.boxHeightAboveRoof);
    assert.equal('celebrity' in system.markers[0], false);
    system.dispose();
  }
});

test('a carrier crossing the chase camera cannot fill the screen or change the real grab coordinates', () => {
  const {system,make,player}=fixture(),car=make('bike');system.update(0,[car],player);
  const point={...system.markers[0].position},visual=car.g.getObjectByName('delivery-box-visual')!;
  const view={forwardX:1,forwardZ:0,jumping:false,cameraX:point.x,cameraY:point.y,cameraZ:point.z+.35};
  system.update(0,[car],player,true,view);
  assert.ok(Math.abs(visual.scale.x-.05)<1e-8);assert.deepEqual(system.markers[0].position,point);
  view.cameraZ=point.z+14;system.update(0,[car],player,true,view);
  assert.equal(visual.scale.x,1);assert.deepEqual(system.markers[0].position,point);
  const hero=new THREE.Group();assert.equal(system.collect(system.markers[0].carrierId,hero),true);
  assert.equal(visual.scale.x,1,'a collected or recycled marker cannot retain the camera-proximity scale');
  system.dispose();
});

test('despawn, unloaded traffic and range recycling immediately free slots for nearby replacements', () => {
  const { system, make, player, scene } = fixture();
  const a = make('bus'), b = make('auto', 20), distant = make('car', PICKUP_CONFIG.carrierRange + 40);
  system.update(0, [a], player); const slot = system.markers[0];
  scene.remove(a.g); system.update(0, [b, distant], player);
  assert.equal(system.markers[0], slot); assert.equal(slot.carrierId, b.g.uuid); assert.equal(a.g.children.length, 0);
  b.x = 1000; b.g.position.x = b.x; const c = make('bike', 15);
  system.update(0, [b, c, distant], player);
  assert.equal(system.activeCount, 1); assert.equal(system.markers[0].carrierId, c.g.uuid);
  system.dispose();
});

test('marker world positions follow moving roof and snapshot relative movement, fresh leases never sweep from old car', () => {
  const { system, make, player } = fixture(), car = make('truck', 18);
  car.g.rotation.y = .7;
  system.update(0, [car], player);
  const marker = system.markers[0], before = { ...marker.position };
  system.beforeFrame(); car.x += 5; car.g.position.x += 5; car.y += 2; car.g.position.y += 2;
  system.update(0, [car], player);
  assert.deepEqual(marker.previousPosition, before); assert.equal(marker.position.x, before.x + 5); assert.equal(marker.position.y, before.y + 2);
  const replacement = make('auto', -12);
  system.update(0, [replacement], player);
  assert.deepEqual(marker.previousPosition, marker.position);
  system.dispose();
});

test('unparented, hidden and overhead vehicles do not become fresh street-level carriers', () => {
  const { system, make, player, scene } = fixture();
  const hidden = make('car'), detached = make('truck'), overhead = make('bus', 10, 12);
  hidden.g.visible = false; scene.remove(detached.g);
  system.update(0, [hidden, detached, overhead], player); assert.equal(system.activeCount, 0);
  system.update(0, [overhead], { ...player, y: 30 }); assert.equal(system.activeCount, 1, 'flight can spot streets below');
  system.dispose();
});

test('catch clears alternatives atomically, latches until reset and uses a short non-modal pooled effect', () => {
  const { system, make, player, scene } = fixture(), cars = [make('bus'), make('car', 20)];
  system.update(0, cars, player);
  assert.equal(system.collect('missing'), false);
  const id = system.markers[0].carrierId;
  assert.equal(system.collect(id), true); assert.equal(system.holding, true); assert.equal(system.activeCount, 0);
  assert.equal(system.collect(id), false); assert.ok(cars.every(c => c.g.children.length === 0));
  const effect = scene.getObjectByName('delivery-caught-effect')!; assert.equal(effect.visible, true);
  system.update(.7, cars, player); assert.equal(effect.visible, false); assert.equal(system.activeCount, 0);
  system.clear(); system.update(0, cars, player, false); assert.equal(system.activeCount, 0);
  system.update(0, cars, player); assert.equal(system.activeCount, 2);
  system.dispose();
});

test('dispose releases owned shared resources once and leaves vehicle resources and scene untouched', () => {
  const { system, make, player, scene } = fixture(), car = make('car');
  const vehicleGeometry = new THREE.BoxGeometry(), vehicleMaterial = new THREE.MeshBasicMaterial();
  car.g.add(new THREE.Mesh(vehicleGeometry, vehicleMaterial));
  system.update(0, [car], player);
  let vehicleDisposed = 0, disposed = 0;
  vehicleGeometry.addEventListener('dispose', () => vehicleDisposed++);
  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  scene.traverse(node => { if (node instanceof THREE.Mesh && node.geometry !== vehicleGeometry) {
    resources.add(node.geometry); if (Array.isArray(node.material)) node.material.forEach(m => resources.add(m)); else resources.add(node.material);
  } });
  resources.forEach(r => r.addEventListener('dispose', () => disposed++));
  system.dispose(); assert.equal(disposed, resources.size); system.dispose(); assert.equal(disposed, resources.size);
  assert.equal(vehicleDisposed, 0); assert.equal(car.g.parent, scene); assert.equal(car.g.children.length, 1);
  assert.equal(system.activeCount, 0);
});

test('caught slice leaves the forward view while the order remains held; clear reuses its pooled offer', () => {
  const { system, make, player, scene } = fixture(), car = make('bus'), hero = new THREE.Group();
  scene.add(hero); system.update(0, [car], player);
  const pooledBox = car.g.getObjectByName('delivery-carrier-box')!;
  assert.equal(system.collect(system.markers[0].carrierId, hero), true);
  assert.equal(hero.getObjectByName('delivery-box-visual'), undefined);
  assert.equal(pooledBox.parent, null, 'offer art is detached instead of obscuring the cabin');
  scene.remove(car.g); hero.position.set(50, 20, 30);
  for (let i = 0; i < 100; i++) { system.beforeFrame(); system.update(.02, [], player); }
  assert.equal(hero.children.length, 0); assert.equal(system.holding, true); assert.equal(system.activeCount, 0);
  assert.equal(scene.getObjectByName('delivery-caught-effect')!.visible, false);
  system.clear(); assert.equal(pooledBox.parent, null); assert.equal(system.holding, false);
  scene.add(car.g); system.update(0, [car], player);
  assert.equal(car.g.getObjectByName('delivery-carrier-box'), pooledBox);
  assert.equal(pooledBox.scale.x, 1); assert.equal(pooledBox.getObjectByName('delivery-box-halo')!.visible, true);
  system.dispose();
});

test('pizza slice has opaque cheese, visible thickness, pooled toppings and camera-facing art independent of its grab center', () => {
  const { system, make, player } = fixture(), car = make('auto'); car.g.rotation.y = .73;
  const view = { forwardX: 1, forwardZ: 0, jumping: false, cameraX: 0, cameraY: 8, cameraZ: 15 };
  system.update(0, [car], player, true, view);
  const marker = system.markers[0], visual = car.g.getObjectByName('delivery-box-visual')!;
  const body = visual.getObjectByName('delivery-pizza-slice') as THREE.Mesh<THREE.ExtrudeGeometry, THREE.MeshBasicMaterial>;
  assert.ok(body.geometry instanceof THREE.ExtrudeGeometry);
  body.geometry.computeBoundingBox(); const size = body.geometry.boundingBox!.getSize(new THREE.Vector3());
  assert.ok(size.x > 1.5 && size.y > 1.5 && size.z >= .14, 'a real 3D slice, not a tiny or paper-thin marker');
  assert.equal(body.material.transparent, false); assert.equal(body.material.opacity, 1);
  assert.ok(visual.children.some(node => node instanceof THREE.InstancedMesh), 'toppings share one draw');
  const point = { ...marker.position };
  for (const camera of [{ x: 0, y: 8, z: 15 }, { x: 30, y: 2, z: -20 }, { x: -40, y: 22, z: 0 }]) {
    Object.assign(view, { cameraX: camera.x, cameraY: camera.y, cameraZ: camera.z });
    system.beforeFrame(); system.update(0, [car], player, true, view);
    const world = visual.getWorldPosition(new THREE.Vector3());
    const facing = visual.getWorldDirection(new THREE.Vector3());
    const toward = new THREE.Vector3(camera.x, camera.y, camera.z).sub(world).normalize();
    assert.ok(facing.dot(toward) > .9999, 'cheese face must remain readable from camera yaw and height changes');
    assert.deepEqual(marker.position, point, 'camera billboard cannot move the grab volume');
    assert.deepEqual(marker.previousPosition, point);
  }
  const halo = car.g.getObjectByName('delivery-box-halo') as THREE.Mesh;
  assert.ok(halo.position.y < -.6, 'halo stays below the cheese face');
  system.dispose();
});

test('slice hover remains separated from every carrier roof and anonymous across vehicle types', () => {
  const fingerprints: string[] = [];
  for (const group of ['auto', 'bus', 'bike', 'car', 'truck'] as const) {
    const { system, make, player } = fixture(), car = make(group);
    const view = { forwardX: 1, forwardZ: 0, jumping: false, cameraX: 0, cameraY: 3, cameraZ: 14 };
    system.update(0, [car], player, true, view);
    const marker = system.markers[0], visual = car.g.getObjectByName('delivery-box-visual')!;
    const materials: string[] = [];
    visual.traverse(node => { if (node instanceof THREE.Mesh) materials.push((node.material as THREE.MeshBasicMaterial).color.getHexString()); });
    fingerprints.push(JSON.stringify(materials));
    for (let i = 0; i < 120; i++) {
      system.beforeFrame(); system.update(1 / 30, [car], player, true, view);
      const aboveRoof = marker.position.y - car.g.position.y - car.size[1];
      assert.ok(aboveRoof >= 1.13 && aboveRoof <= 1.27, '1.2m roof clearance with bounded breathing');
      assert.ok(new THREE.Box3().setFromObject(visual).min.y > car.g.position.y + car.size[1] + .1, 'visible slice cannot sink into a bus or car roof');
    }
    assert.equal('celebrity' in marker, false);
    assert.ok(!/\b(Allu Arjun|Nani|Jr NTR|Mahesh Babu|Pushpa|Simhadri|customer)\b/i.test(JSON.stringify(visual.toJSON())), 'marker art contains no customer identity');
    system.dispose();
  }
  assert.equal(new Set(fingerprints).size, 1, 'vehicle kind never changes the anonymous pizza appearance');
});

test('a rotated flying Roadster never reacquires a carried billboard or new offer after collection', () => {
  const { system, make, player, scene } = fixture(), car = make('bus'), hero = new THREE.Group();
  scene.add(hero); hero.position.set(40, 30, -20); hero.rotation.set(-.06, 1.2, 0, 'YXZ');
  const view = { forwardX: 0, forwardZ: -1, jumping: false, airborne: true, cameraX: 10, cameraY: 36, cameraZ: 5 };
  system.update(0, [car], player, true, view); system.collect(system.markers[0].carrierId, hero);
  for (let i = 0; i < 100; i++) {
    hero.rotation.y += .02; system.update(.02, [], hero.position, false, view);
    assert.equal(hero.getObjectByName('delivery-box-visual'), undefined);
    assert.equal(system.activeCount, 0); assert.equal(system.holding, true);
  }
  system.dispose();
});

test('fresh offers prefer vehicles in the forward view over closer vehicles behind or on side streets', () => {
  const { system, make, player } = fixture();
  const behind = [make('bus', -6), make('auto', -8), make('truck', -10)];
  const ahead = [make('car', 28), make('bus', 50), make('bike', 75)];
  const side = make('car', 2); side.z = 12; side.g.position.z = 12;
  const view = { forwardX: 4, forwardZ: 0, jumping: false, airborne: false };
  system.update(0, [...behind, side, ...ahead], player, true, view);
  assert.deepEqual(new Set(system.markers.map(m => m.carrierId)), new Set(ahead.map(c => c.g.uuid)));
  system.dispose();
});

test('same-direction traffic wins over equally close oncoming traffic without excluding any vehicle kind', () => {
  const { system, make, player } = fixture();
  const oncoming = [make('bus', 25), make('auto', 30), make('bike', 35)];
  const aligned = [make('truck', 25), make('car', 30), make('bus', 35)];
  oncoming.forEach(c => { c.hx = -1; c.hz = 0; }); aligned.forEach(c => { c.hx = 1; c.hz = 0; });
  system.update(0, [...oncoming, ...aligned], player, true, { forwardX: 1, forwardZ: 0, jumping: false });
  assert.deepEqual(new Set(system.markers.map(m => m.carrierId)), new Set(aligned.map(c => c.g.uuid)));
  system.dispose();
});

test('three seconds without a forward offer swaps only one behind lease and resets its swept position', () => {
  const { system, make, player } = fixture(), behind = [make('auto', -20), make('bus', -30), make('car', -40)];
  const view = { forwardX: 1, forwardZ: 0, jumping: false, airborne: false };
  system.update(0, behind, player, true, view);
  const ids = system.markers.map(m => m.carrierId), slots = [...system.markers], ahead = [make('bike', 28), make('truck', 45)];
  system.update(2.9, [...behind, ...ahead], player, true, view);
  assert.deepEqual(system.markers.map(m => m.carrierId), ids);
  system.beforeFrame(); system.update(.11, [...behind, ...ahead], player, true, view);
  assert.equal(system.markers.filter(m => ids.includes(m.carrierId)).length, 2, 'one lease changes, never the whole pool');
  assert.ok(system.markers.every(m => slots.includes(m)), 'all marker objects reused');
  const changed = system.markers.find(m => !ids.includes(m.carrierId))!;
  assert.deepEqual(changed.previousPosition, changed.position, 'no synthetic pickup sweep across the street');
  const stable = system.markers.map(m => m.carrierId);
  system.update(10, [...behind, ...ahead], player, true, view);
  assert.deepEqual(system.markers.map(m => m.carrierId), stable, 'a visible forward offer prevents further churn');
  system.dispose();
});

test('jump and airborne hover preserve valid leases; jump cannot add offers or recycle by range or height', () => {
  const { system, make, player } = fixture(), cars = [make('bus', -20), make('auto', -30), make('car', -40)];
  const view = { forwardX: 1, forwardZ: 0, jumping: false, airborne: false };
  system.update(0, cars, player, true, view); const ids = system.markers.map(m => m.carrierId);
  const ahead = make('truck', 25);
  view.jumping = true;
  system.update(10, [...cars, ahead], { x: 300, y: 6, z: 0 }, true, view);
  assert.deepEqual(system.markers.map(m => m.carrierId), ids, 'range and surface changes during a jump cannot remove its box');
  view.jumping = false; view.airborne = true;
  system.update(10, [...cars, ahead], { ...player, y: 20 }, true, view);
  assert.deepEqual(system.markers.map(m => m.carrierId), ids, 'hovering does not silently move offers');
  view.jumping = true; cars[0].g.removeFromParent();
  system.update(0, [...cars.slice(1), ahead], player, true, view);
  assert.equal(system.activeCount, 2, 'removed vehicle detaches safely, but jump never assigns a new sweep');
  view.jumping = false; view.airborne = false;
  system.update(0, [...cars.slice(1), ahead], player, true, view);
  assert.equal(system.activeCount, 3); assert.ok(system.markers.some(m => m.carrierId === ahead.g.uuid));
  system.dispose();
});

test('direction-aware offers stay on the current surface and never choose descendants of hidden traffic groups', () => {
  const { system, make, player, scene } = fixture();
  const below = make('bus', 10, -6), overhead = make('truck', 12, 8), hidden = make('car', 14), valid = make('auto', 30);
  const hiddenTraffic = new THREE.Group(); hiddenTraffic.visible = false; scene.add(hiddenTraffic); hiddenTraffic.add(hidden.g);
  const view = { forwardX: 1, forwardZ: 0, jumping: false, airborne: false };
  system.update(0, [below, overhead, hidden, valid], player, true, view);
  assert.deepEqual(system.markers.map(m => m.carrierId), [valid.g.uuid]);
  view.airborne = true;
  system.update(0, [below, overhead, hidden, valid], { ...player, y: 20 }, true, view);
  assert.equal(system.activeCount, 3, 'flight may spot real streets below');
  assert.ok(!system.markers.some(m => m.carrierId === hidden.g.uuid));
  system.dispose();
});
