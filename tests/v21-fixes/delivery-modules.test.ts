import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDeliveryModule, registerDeliveryModule, type DeliveryModuleContext, type DeliveryPlayer } from '../../src/delivery/modules';
import type { MovingRailBody } from '../../src/game/moving-rail';
import { MovingRailInteraction } from '../../src/game/moving-rail';

function fixture() {
  const scene = new THREE.Scene(), player: DeliveryPlayer = { x: 0, y: 5, z: 40, yaw: 0, speed: 0, flying: true };
  const events: { type: string; reason?: string; step?: number }[] = [], cues: string[] = [];
  const ctx: DeliveryModuleContext = { scene, player: () => player, destination: { x: 0, y: 0, z: 0, label: 'Destination' },
    emit: (type, detail) => events.push({ type, ...detail }), cue: cue => cues.push(cue) };
  return { scene, player, events, cues, ctx };
}
const tick = (module: ReturnType<typeof createDeliveryModule>, seconds: number) => {
  for (let t = 0; t < seconds - 1e-8; t += .05) module.update(Math.min(.05, seconds - t));
};

test('registry exposes only the five requested v1 mechanics and rejects unknown names', () => {
  for (const name of ['matchAndLand', 'threadGap', 'beatDrop', 'underwater', 'chainDrop'] as const) assert.ok(createDeliveryModule(name));
  assert.throws(() => createDeliveryModule('hookAndRope' as any));
});

test('stationary rooftop drop requires proximity and low speed; retries do not lose the order', () => {
  const { ctx, player, events } = fixture(), module = createDeliveryModule('matchAndLand');
  module.setup(ctx, { vehicle: 'stationary', speed: 0 }); module.update(.05); module.onDrop();
  assert.equal(events[0].type, 'failed'); assert.equal(module.status.canDrop, false);
  player.z = 0; player.y = 3; player.speed = 10; tick(module, 1); assert.equal(module.status.canDrop, false);
  player.speed = 0; tick(module, .6); assert.equal(module.status.canDrop, true); module.onDrop(); module.onDrop();
  assert.equal(events.filter(e => e.type === 'done').length, 1); assert.equal(module.supports[0].roof, 0);
  module.teardown();
});

test('highway truck follows supplied road samples, has matching support and rejects wrong direction', () => {
  const { ctx, player, events } = fixture(), module = createDeliveryModule('matchAndLand');
  ctx.route = [{ x: 0, y: 2, z: 0 }, { x: 0, y: 2, z: 200 }];
  module.setup(ctx, { vehicle: 'truck', speed: 8, holdSeconds: .3 });
  tick(module, 3); assert.ok(module.target.z > 15 && module.target.z < 17, 'truck accelerates smoothly before cruising');
  assert.equal(module.target.y, 4.8); assert.equal(module.supports[0].roof, module.target.y);
  Object.assign(player, module.target, { y: module.target.y + 2, speed: 8, yaw: 0 });
  tick(module, .4); assert.equal(module.status.canDrop, false, 'equal speed facing the opposite direction cannot match');
  player.yaw = Math.PI;
  for (let i = 0; i < 10; i++) { Object.assign(player, module.target, { y: module.target.y + 2 }); module.update(.05); }
  assert.equal(module.status.canDrop, true); module.onDrop(); assert.equal(events.at(-1)!.type, 'done'); module.teardown();
});

test('moving truck cannot silently complete without an actual road route', () => {
  const { ctx, player, events } = fixture(), module = createDeliveryModule('matchAndLand');
  Object.assign(player, { x: 0, y: 2, z: 0 }); module.setup(ctx, { vehicle: 'truck', speed: 8 }); tick(module, 2);
  assert.match(module.status.instruction, /Loading the highway/); assert.equal(module.status.canDrop, false);
  assert.equal(module.supports.length, 0, 'no invisible truck collision while its route is missing');
  module.onDrop(); assert.equal(events.at(-1)!.type, 'failed'); module.teardown();
});

test('train setpiece follows existing coach geometry and waits when the simulation removes it', () => {
  const { ctx, player } = fixture(), module = createDeliveryModule('matchAndLand');
  let train: MovingRailBody | null = { id: 'actual-rail:0', x: 5, y: 0, z: 20, hx: 0, hz: 1, bottom: .2, roof: 4.2,
    halfWidth: 1.6, halfLength: 11, previous: { x: 5, y: 0, z: 19.5, hx: 0, hz: 1 } };
  ctx.existingTrain = () => train;
  module.setup(ctx, { vehicle: 'train', obstacles: true }); module.update(.05);
  assert.deepEqual(module.target, { x: 5, y: 4.2, z: 20, label: 'Destination' });
  assert.equal(module.supports.length, 0, 'does not duplicate the existing train support body');
  assert.equal(ctx.scene.getObjectByName('delivery-setpiece')!.children.length, 2, 'only target ring and customer; no invented bridges');
  train = null; module.update(.05); assert.equal(module.status.canDrop, false); assert.match(module.status.instruction, /waiting for the next train/);
  module.teardown();
});

test('train clearance failure uses only the existing real-bridge query', () => {
  const { ctx, player, events } = fixture(), module = createDeliveryModule('matchAndLand');
  ctx.existingTrain = () => ({ id: 'train', x: 0, y: 0, z: 0, hx: 0, hz: 1, halfWidth: 1.6, halfLength: 10, bottom: .2, roof: 4,
    previous: { x: 0, y: 0, z: 0, hx: 0, hz: 1 } });
  ctx.clearanceAt = () => 7; player.y = 7.2; player.z = 0;
  module.setup(ctx, { vehicle: 'train', obstacles: true }); module.update(.05); module.update(.05);
  assert.equal(events.filter(e => e.type === 'failed').length, 1); assert.match(events[0].reason!, /Bridge clearance/); module.teardown();
});

test('threadGap cannot be completed by entering from the side or dropping from above', () => {
  const { ctx, player, events } = fixture(), module = createDeliveryModule('threadGap');
  module.setup(ctx, { hazards: false });
  Object.assign(player, { x: 0, y: 3, z: -7 }); module.update(.05);
  // A giant first movement crossed the entry front legally, so reset from an inside position.
  module.teardown(); module.setup(ctx, { hazards: false }); module.update(.05); module.onDrop();
  assert.equal(events.at(-1)!.type, 'failed'); assert.match(events.at(-1)!.reason!, /opening first/);
  player.z = 20; module.update(.05); player.z = 13; module.update(.05); player.z = -7; module.update(.05);
  assert.equal(module.status.canDrop, true); module.onDrop(); assert.equal(events.at(-1)!.type, 'done'); module.teardown();
});

test('threadGap rejects a swept entry outside the opening and permits a corrected approach', () => {
  const { ctx, player, events } = fixture(), module = createDeliveryModule('threadGap');
  player.x = 9; module.setup(ctx, { width: 10, height: 8, hazards: false }); player.z = 0; module.update(.05);
  assert.equal(events.at(-1)!.type, 'failed'); player.z = 20; player.x = 0; module.update(.05);
  player.z = 10; module.update(.05); player.z = -7; module.update(.05);
  assert.equal(module.status.canDrop, true); module.teardown();
});

test('projector sweep clears a previously valid hall entry and requires another attempt', () => {
  const { ctx, player, events } = fixture(), module = createDeliveryModule('threadGap');
  module.setup(ctx, { width: 10, hazards: true, sweepPeriod: 5 }); player.z = 13; module.update(.05);
  player.z = -2; player.x = Math.sin(.1 * Math.PI * 2 / 5) * 13; module.update(.05);
  assert.match(events.at(-1)!.reason!, /Projector sweep/); player.z = -7; module.update(.05); module.onDrop();
  assert.match(events.at(-1)!.reason!, /opening first/); module.teardown();
});

test('beatDrop requires both position and the open timing window, with retry on misses', () => {
  const { ctx, player, events, cues } = fixture(), module = createDeliveryModule('beatDrop');
  module.setup(ctx, { period: 4, windowStart: .5, windowEnd: .8, radius: 10 });
  player.z = 0; module.update(.05); module.onDrop(); assert.equal(events.at(-1)!.type, 'failed');
  tick(module, 2.2); assert.equal(module.status.canDrop, true); assert.equal(module.status.timing!.ready, true);
  player.z = 30; module.update(.01); assert.equal(module.status.canDrop, false);
  player.z = 0; module.update(.01); module.onDrop(); assert.equal(events.at(-1)!.type, 'done'); assert.ok(cues.includes('beat')); module.teardown();
});

test('underwater requests local floaty movement and completes only after the thrown pizza arrives', () => {
  const { ctx, player, events } = fixture(), module = createDeliveryModule('underwater');
  module.setup(ctx, { depth: 4, throwRange: 12 });
  assert.equal(module.target.y, -4); assert.equal(module.movement.mode, 'underwater');
  player.z = 0; player.y = 1; module.update(.05); module.onDrop(); assert.equal(events.at(-1)!.type, 'failed');
  player.y = -3; module.update(.05); assert.equal(module.status.canDrop, true); module.onDrop(); module.onDrop();
  assert.equal(events.filter(e => e.type === 'done').length, 0); tick(module, .8);
  assert.equal(events.filter(e => e.type === 'done').length, 1); module.teardown(); assert.equal(module.movement.mode, 'normal');
});

test('chainDrop changes targets four times and never finishes early or penalizes a failed take', () => {
  const { ctx, player, events } = fixture(), module = createDeliveryModule('chainDrop');
  module.setup(ctx, {}); module.update(.05); module.onDrop(); assert.match(events.at(-1)!.reason!, /Retake #47/);
  for (let i = 0; i < 4; i++) {
    Object.assign(player, module.target, { speed: 0, y: module.target.y + 3 }); module.update(.05); assert.equal(module.status.canDrop, true);
    module.onDrop(); assert.equal(events.filter(e => e.type === 'done').length, i === 3 ? 1 : 0);
  }
  module.onDrop(); assert.equal(events.filter(e => e.type === 'done').length, 1); module.teardown();
});

test('chainDrop target count and names come entirely from content', () => {
  const { ctx, player, events } = fixture(), module = createDeliveryModule('chainDrop');
  module.setup(ctx, { targets: [{ label: 'Only set', dx: 20, dy: 3, dz: -10 }] });
  assert.equal(module.target.label, 'Only set'); assert.equal(module.target.x, 20); assert.equal(module.target.y, 3);
  Object.assign(player, module.target, { speed: 0 }); module.update(.05); module.onDrop(); assert.equal(events.at(-1)!.type, 'done'); module.teardown();
});

test('all module teardown paths dispose owned resources exactly once and preserve the shared world', () => {
  for (const name of ['matchAndLand', 'threadGap', 'beatDrop', 'underwater', 'chainDrop'] as const) {
    const { ctx, scene } = fixture(), worldGeo = new THREE.BoxGeometry(), worldMat = new THREE.MeshBasicMaterial();
    const world = new THREE.Mesh(worldGeo, worldMat); scene.add(world);
    const module = createDeliveryModule(name); module.setup(ctx, { vehicle: 'stationary', speed: 0 });
    let worldDisposed = 0, ownedDisposed = 0; worldGeo.addEventListener('dispose', () => worldDisposed++);
    const resources = new Set<THREE.BufferGeometry | THREE.Material>();
    scene.getObjectByName('delivery-setpiece')!.traverse(n => { if (n instanceof THREE.Mesh) { resources.add(n.geometry); (Array.isArray(n.material) ? n.material : [n.material]).forEach(m => resources.add(m)); } });
    for (const resource of resources) resource.addEventListener('dispose', () => ownedDisposed++);
    module.teardown(); module.teardown(); assert.equal(ownedDisposed, resources.size); assert.equal(worldDisposed, 0);
    assert.deepEqual(scene.children, [world]); assert.equal(module.supports.length, 0); module.update(1); module.onDrop();
    worldGeo.dispose(); worldMat.dispose();
  }
});

test('non-loop truck brakes at the route end without teleporting or going against traffic', () => {
  const { ctx } = fixture(), module = createDeliveryModule('matchAndLand');
  ctx.route = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 40 }];
  module.setup(ctx, { vehicle: 'truck', speed: 8 });
  let prior = 0, maxStep = 0;
  for (let i = 0; i < 500; i++) {
    module.update(.05); assert.ok(module.target.z >= prior, 'position never reverses'); maxStep = Math.max(maxStep, module.target.z - prior); prior = module.target.z;
  }
  assert.equal(module.target.z, 40); assert.ok(maxStep <= .401); assert.equal(module.supports[0].hz, 1);
  assert.equal(module.status.canDrop, true, 'the stopped endpoint remains deliverable'); module.teardown();
});

test('all interaction and failure emissions stay locked until the story call gate opens', () => {
  for (const name of ['matchAndLand', 'threadGap', 'beatDrop', 'underwater', 'chainDrop'] as const) {
    const { ctx, player, events } = fixture(), module = createDeliveryModule(name);
    let unlocked = false; ctx.canInteract = () => unlocked;
    module.setup(ctx, { vehicle: 'stationary', speed: 0, hazards: false, period: 2, windowStart: 0, windowEnd: 1 });
    Object.assign(player, module.target); tick(module, 1); module.onDrop();
    assert.equal(module.status.canDrop, false); assert.equal(events.length, 0);
    unlocked = true; player.z += 1000; module.update(.05); module.onDrop();
    assert.equal(events[0]?.type, 'failed', `${name} should become retryable after call`); module.teardown();
  }
});

test('a custom mechanic can register without changing level config format', () => {
  const Concrete = createDeliveryModule('beatDrop').constructor as new () => ReturnType<typeof createDeliveryModule>;
  registerDeliveryModule('customFilmScene', Concrete); assert.ok(createDeliveryModule('customFilmScene'));
  assert.throws(() => registerDeliveryModule('customFilmScene', Concrete));
});

test('a car carried on a moving train at commanded speed zero can complete the handover', () => {
  const { ctx, player, events } = fixture(), module = createDeliveryModule('matchAndLand');
  const body: MovingRailBody = { id: 'train', x: 0, y: 0, z: 0, hx: 0, hz: 1, halfWidth: 1.6, halfLength: 10,
    roof: 4.2, bottom: .2, previous: { x: 0, y: 0, z: -.6, hx: 0, hz: 1 } };
  ctx.existingTrain = () => body;
  Object.assign(player, { x: 0, y: 4.75, z: 0, speed: 0, flying: false });
  module.setup(ctx, { vehicle: 'train', matchTolerance: 3, holdSeconds: .4 });
  for (let i = 0; i < 20; i++) {
    body.previous.z = body.z; body.z += .6;
    module.update(.05); player.z += .6; // Existing RailContacts carry after module update.
  }
  assert.equal(module.status.canDrop, true); module.onDrop(); assert.equal(events.at(-1)!.type, 'done'); module.teardown();
});

test('delivered chain scenery stays visible wherever its physical platform remains nearby', () => {
  const { ctx, scene, player } = fixture(), module = createDeliveryModule('chainDrop'); module.setup(ctx, {});
  Object.assign(player, module.target, { y: module.target.y + 3, speed: 0 }); module.update(.05); module.onDrop(); module.update(.05);
  const completed = scene.getObjectByName('delivery-set-0')!;
  assert.equal(completed.visible, true); assert.ok(module.supports.some(body => body.id === 'delivery-set:0'));
  assert.equal(scene.getObjectByName('delivery-target-ring')!.position.x, module.target.x - ctx.destination.x);
  player.x = -2000; module.update(.05); assert.equal(completed.visible, false, 'distance culling remains bounded');
  player.x = 0; module.update(.05); assert.equal(completed.visible, true, 'returning restores completed set visuals'); module.teardown();
});

test('each chain platform clears its own footprint roof including high edge and corner samples', () => {
  const { ctx, scene } = fixture(), module = createDeliveryModule('chainDrop');
  const sampled: [number, number][] = [];
  ctx.surfaceHeightAt = (x, z) => { sampled.push([x, z]); return x === 109 && z === -89 ? 40 : x === -81 && z === -130 ? 32 : 0; };
  module.setup(ctx, {});
  const waterfall = module.supports.find(body => body.id === 'delivery-set:1')!, battle = module.supports.find(body => body.id === 'delivery-set:2')!;
  assert.equal(waterfall.roof, 40.6); assert.equal(battle.roof, 32.6);
  assert.equal(scene.getObjectByName('delivery-set-1')!.position.y, waterfall.roof);
  assert.ok(sampled.some(([x, z]) => x === 109 && z === -89)); module.teardown();
});

test('IMAX physical boxes preserve the same open aperture drawn between front columns', () => {
  const { ctx, scene } = fixture(), module = createDeliveryModule('threadGap'); module.setup(ctx, { width: 10, height: 8 });
  const blocked = (x: number, y: number, z: number) => module.supports.some(body => Math.abs(x - body.x) < body.halfWidth && Math.abs(z - body.z) < body.halfLength && y > body.bottom && y < body.roof);
  assert.equal(blocked(0, 4, 14), false, 'no giant collider spans the entrance');
  assert.equal(blocked(8, 4, 14), true, 'visible right column is physical');
  assert.equal(blocked(-8, 4, 14), true, 'visible left column is physical');
  assert.equal(blocked(0, 9, 14), true, 'visible lintel is physical');
  assert.equal(blocked(0, 4, 0), false, 'central flying aisle is unobstructed');
  for (const body of module.supports.filter(b => b.id.startsWith('delivery-structure:'))) {
    let exact = false;
    scene.getObjectByName('delivery-setpiece')!.traverse(node => {
      if (!(node instanceof THREE.Mesh) || !(node.geometry instanceof THREE.BoxGeometry)) return;
      node.updateWorldMatrix(true, false); const p = new THREE.Vector3(); node.getWorldPosition(p);
      const size = node.geometry.parameters;
      if (p.x === body.x && p.z === body.z && Math.abs(p.y + size.height / 2 - body.roof) < 1e-8 && size.width / 2 === body.halfWidth && size.depth / 2 === body.halfLength) exact = true;
    });
    assert.equal(exact, true, 'every structural collider matches a visible box');
  }
  module.teardown();
});

test('delivery truck obeys NPC speed limits and never commits a blocked prospective pose', () => {
  const { ctx } = fixture(), module = createDeliveryModule('matchAndLand');
  ctx.route = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 100 }];
  let speedLimit = 2, blocked = false, checks = 0;
  ctx.vehicleSpeedLimit = () => speedLimit;
  ctx.vehiclePoseClear = body => { checks++; return !blocked; };
  module.setup(ctx, { vehicle: 'truck', speed: 8 }); tick(module, 3);
  assert.ok(module.target.z < 6 && module.target.z > 4, 'follows the2m/s NPC limit');
  const before = { ...module.target }; blocked = true; speedLimit = 8; tick(module, 1);
  assert.deepEqual(module.target, before, 'blocked truck remains at same rendered and physical pose');
  assert.equal(module.supports[0].z, before.z); assert.ok(checks > 0);
  blocked = false; tick(module, 1); assert.ok(module.target.z > before.z, 'traffic clearing lets truck continue'); module.teardown();
});

test('real player contact solver passes the IMAX aperture but stops at its visible column', () => {
  const { ctx } = fixture(), module = createDeliveryModule('threadGap'); module.setup(ctx, { width: 10, height: 8 });
  const pass = (x: number) => {
    const contact = new MovingRailInteraction();
    const player = { pos: { x, y: 5, z: 20 }, yaw: 0, speed: 15, vy: 0, flying: true, descending: false, jumping: false };
    contact.beforePlayer(player, module.supports, false, .05); player.pos.z = 13;
    return { hit: contact.afterPlayer(player, .05).hit, player };
  };
  assert.equal(pass(0).hit, false, 'full Roadster envelope fits the rendered aperture');
  const column = pass(8); assert.equal(column.hit, true); assert.ok(column.player.pos.z > 14, 'front column prevents tunnelling');
  module.teardown();
});

test('IMAX seat instancing preserves all64parts, palette, positions and local culling bounds in two draws', () => {
  const { ctx, scene } = fixture(), module = createDeliveryModule('threadGap'); module.setup(ctx, {});
  const bases = scene.getObjectByName('delivery-imax-seat-bases') as THREE.InstancedMesh;
  const backs = scene.getObjectByName('delivery-imax-seat-backs') as THREE.InstancedMesh;
  assert.ok(bases.isInstancedMesh && backs.isInstancedMesh); assert.equal(bases.count, 32); assert.equal(backs.count, 32);
  assert.equal((bases.material as THREE.MeshBasicMaterial).color.getHexString(), '753246');
  assert.equal((backs.material as THREE.MeshBasicMaterial).color.getHexString(), '962f45');
  const matrix = new THREE.Matrix4(), p = new THREE.Vector3(); let index = 0, meshes = 0;
  for (let row=0; row<4; row++) for (const side of [-1,1]) for (let col=0; col<4; col++) {
    const x = side * (6 + col * 2.4), z = -6 + row * 4;
    bases.getMatrixAt(index, matrix); p.setFromMatrixPosition(matrix);
    assert.ok(p.distanceTo(new THREE.Vector3(x,.9,z)) < .00001);
    backs.getMatrixAt(index, matrix); p.setFromMatrixPosition(matrix);
    assert.ok(p.distanceTo(new THREE.Vector3(x,1.8,z+.8)) < .00001);
    for (const mesh of [bases,backs]) assert.ok(mesh.boundingSphere!.containsPoint(p));
    index++;
  }
  assert.ok(Math.abs(bases.boundingBox!.min.x + 14.1) < .00001); assert.ok(Math.abs(bases.boundingBox!.max.z - 6.9) < .00001);
  scene.getObjectByName('delivery-setpiece')!.traverse(node => { if (node instanceof THREE.Mesh) meshes++; });
  assert.equal(meshes, 17, 'batched seated character and instanced seats retain a bounded hall draw count');
  let disposed = 0; bases.addEventListener('dispose', () => disposed++); backs.addEventListener('dispose', () => disposed++);
  module.teardown(); module.teardown(); assert.equal(disposed,2,'instance GPU buffers release once');
});

test('truck customer sits inside an open-window cab with an opaque lesson book in his lap', () => {
  const { ctx, scene } = fixture(), module = createDeliveryModule('matchAndLand');
  ctx.route = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 100 }];
  module.setup(ctx, { vehicle: 'truck', speed: 8 });
  const reader = scene.getObjectByName('delivery-truck-seated-reader') as THREE.Mesh;
  const book = scene.getObjectByName('delivery-truck-japanese-lesson-book') as THREE.Mesh;
  const cab = scene.getObjectByName('delivery-truck-open-window-cab') as THREE.Mesh;
  for (const mesh of [reader, book, cab]) {
    assert.ok(mesh.isMesh); mesh.geometry.computeBoundingBox();
    assert.equal((mesh.material as THREE.Material).transparent, false);
  }
  const personBounds = reader.geometry.boundingBox!, bookBounds = book.geometry.boundingBox!;
  assert.ok(personBounds.max.y < 3.06, 'head remains under the cab ceiling');
  assert.ok(personBounds.min.y > 1.3, 'bent legs sit above the cab floor');
  assert.ok(bookBounds.min.y > 2 && bookBounds.max.y < 2.4, 'book rests at lap/hand height');
  assert.ok(bookBounds.max.z > 4 && bookBounds.min.z > 3.7, 'book faces the seated reader');
  let meshes = 0, lights = 0, disposed = 0;
  scene.getObjectByName('delivery-setpiece')!.traverse(node => { if (node instanceof THREE.Mesh) meshes++; if (node instanceof THREE.Light) lights++; });
  assert.equal(meshes, 15, 'cab, seated pose and book are three batched draws'); assert.equal(lights, 0);
  for (const mesh of [reader, book, cab]) mesh.geometry.addEventListener('dispose', () => disposed++);
  module.teardown(); module.teardown(); assert.equal(disposed, 3);
});

function trainPassageFixture() {
  const f = fixture(), module = createDeliveryModule('matchAndLand');
  const train: MovingRailBody = { id: 'rail:3:0', x: 0, y: 0, z: 0, hx: 0, hz: 1, halfWidth: 1.6, halfLength: 10,
    roof: 4.2, bottom: .2, previous: { x: 0, y: 0, z: 0, hx: 0, hz: 1 } };
  let passage: ReturnType<NonNullable<DeliveryModuleContext['trainPassage']>> = {
    id: 'mapped-road:8', trainId: train.id, x: 0, z: 60, radius: 8, ceiling: 7, distanceAhead: 60,
  };
  f.ctx.existingTrain = () => train; f.ctx.trainPassage = () => passage;
  Object.assign(f.player, { x: 0, y: 4.75, z: 0, speed: 0, flying: false });
  module.setup(f.ctx, { vehicle: 'train', obstacles: true, holdSeconds: .2 });
  const move = (x: number, z: number, y = 4.75) => {
    // Both bodies at rest at each observed pose: passage progression is tested
    // independently of the existing carried-speed regression above.
    Object.assign(train, { x, z }); Object.assign(train.previous, { x, z }); Object.assign(f.player, { x, y, z });
    if (passage) passage.distanceAhead = passage.z - z;
    tick(module, .3);
  };
  return { ...f, module, train, move, passage: () => passage, setPassage: (value: typeof passage) => { passage = value; } };
}

test('verified train passage requires travelling below the mapped bridge and clearing its far edge', () => {
  const f = trainPassageFixture(); f.move(0, 0);
  assert.equal(f.module.status.canDrop, false); assert.match(f.module.status.progress!, /Real bridge passage ahead/);
  f.module.onDrop(); assert.equal(f.events.at(-1)!.type, 'failed');
  f.move(0, 60); assert.equal(f.module.status.canDrop, false); assert.match(f.module.status.progress!, /Under the bridge/);
  f.move(0, 70); assert.equal(f.module.status.canDrop, true); assert.match(f.module.status.progress!, /Bridge cleared/);
  f.module.onDrop(); assert.equal(f.events.at(-1)!.type, 'done'); f.module.teardown();
});

test('passing above a real bridge or encountering one before the call does not satisfy the passage', () => {
  const f = trainPassageFixture(); let unlocked = false; f.ctx.canInteract = () => unlocked;
  f.move(0, 60); unlocked = true; f.move(0, 70);
  assert.equal(f.module.status.canDrop, false); assert.doesNotMatch(f.module.status.progress!, /Bridge cleared/);
  f.move(0, 60, 8); assert.doesNotMatch(f.module.status.progress!, /Under the bridge/);
  f.move(0, 70); assert.equal(f.module.status.canDrop, false);
  f.setPassage(null); f.move(0, 70);
  assert.equal(f.module.status.canDrop, true, 'no remaining verified crossing must not strand the delivery');
  assert.match(f.module.status.progress!, /No verified bridge ahead/); f.module.teardown();
});

test('train passage exit follows the real crossing heading even if the route turned since assignment', () => {
  const f = trainPassageFixture(); f.move(0, 0);
  f.train.hx = 1; f.train.hz = 0; f.move(0, 60); f.move(10, 60);
  assert.match(f.module.status.progress!, /Bridge cleared/); assert.equal(f.module.status.canDrop, true); f.module.teardown();
});

test('replacement trains and missing or unsafe passage evidence never inherit a completed bridge challenge', () => {
  const f = trainPassageFixture(); f.move(0, 60); f.move(0, 70); assert.match(f.module.status.progress!, /Bridge cleared/);
  f.train.id = 'rail:4:0'; f.move(0, 70);
  assert.match(f.module.status.progress!, /No verified bridge ahead/); assert.equal(f.module.status.canDrop, true);
  f.setPassage({ ...f.passage()!, trainId: f.train.id, ceiling: 4.9 }); f.move(0, 70);
  assert.match(f.module.status.progress!, /No verified bridge ahead/, 'insufficient physical headroom cannot become a mandatory target');
  f.module.teardown();
});
