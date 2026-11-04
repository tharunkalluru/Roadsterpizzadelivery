import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { EventBus, type DeliveryEvents } from '../../src/delivery/core/events';
// Historical scripted-call campaign exercises the retained five original mechanics.
import { loadLegacyLevels as loadLevels } from './fixtures/legacy-levels';
import { DeliveryController } from '../../src/delivery/systems/delivery-controller';
import { createDeliveryModule, type DeliveryPlayer } from '../../src/delivery/modules';
import type { MovingRailBody } from '../../src/game/moving-rail';

/** Contract integration, not a browser playtest: real content + story gates + all mechanics. */
test('all seven configured mechanics complete through calls and unlock the next traffic pickup', () => {
  const levels = loadLevels(), events = new EventBus<DeliveryEvents>(), story = new DeliveryController(levels, events);
  const player: DeliveryPlayer = { x: 0, y: 0, z: 0, yaw: 0, speed: 0, flying: true };
  const scene = new THREE.Scene();
  for (const level of levels) {
    const context=`Level ${level.level} (${level.celebrity.name}, ${level.module})`;
    assert.equal(story.canPickup, true, `level ${level.level} must be available after prior completion`);
    assert.equal(story.pickup(), true,`${context}: pickup should assign the next configured level`); assert.equal(story.activeLevel!.id, level.id);
    const d = { ...level.destination, y: level.destination.y ?? 0 };
    Object.assign(player, d, { y: d.y + 3, z: d.z + 22, yaw: 0, speed: 0, flying: true });
    const body: MovingRailBody = { id: 'actual-train', x: d.x, y: d.y, z: d.z, hx: 0, hz: 1,
      halfWidth: 1.6, halfLength: 10, bottom: d.y + .2, roof: d.y + 4.2,
      previous: { x: d.x, y: d.y, z: d.z - .6, hx: 0, hz: 1 } };
    const module = createDeliveryModule(level.module);
    module.setup({ scene, destination: d, player: () => player, canInteract: () => story.canDrop,
      route: [{ ...d }, { ...d, z: d.z + 40 }], existingTrain: () => body,
      emit: (type, detail) => type === 'done' ? story.setpieceDone() : story.setpieceFailed(detail?.reason),
    }, level.moduleParams);
    module.onDrop(); assert.equal(story.complete, false, 'call cannot be bypassed');
    story.update(.05, 0); assert.ok(story.call(),`${context}: arrival call should be answerable`);
    for (let guard = 0; story.calls.active && guard < 20; guard++) story.advanceCall(story.calls.currentLine?.replies ? 0 : undefined);
    assert.equal(story.canDrop, true,`${context}: completed mandatory call should unlock its setpiece`);
    const tick = (seconds: number) => { for (let t = 0; t < seconds - 1e-8; t += .05) module.update(.05); };
    if (level.module === 'matchAndLand' && level.moduleParams.vehicle === 'truck') {
      if(level.moduleParams.scene==='truckInterior'){
        tick(30);const floor=module.supports.find(b=>b.id==='delivery-interior-floor')!;
        Object.assign(player,{x:floor.x+.55,y:floor.roof+.55,z:floor.z-9,speed:0,flying:false});module.update(.05);
        player.z=floor.z-7;module.update(.05);player.z=floor.z+2;tick(.8);module.onDrop();tick(1.3);
      }else{tick(20); Object.assign(player, module.target, { y: module.target.y + 3, speed: 0 }); tick(.8); module.onDrop();}
    } else if (level.module === 'matchAndLand' && level.moduleParams.vehicle === 'train') {
      Object.assign(player, { x: body.x, y: body.roof + .55, z: body.z, speed: 0, flying: false });
      for (let i = 0; i < 30; i++) { body.previous.z = body.z; body.z += .6; module.update(.05); player.z += .6; }
      module.onDrop();if(level.moduleParams.immersiveHandoff)tick(.8);
    } else if (level.module === 'matchAndLand') {
      Object.assign(player, module.target, { y: module.target.y + 3, speed: 0 }); tick(.8); module.onDrop();if(level.moduleParams.immersiveHandoff)tick(.8);
    } else if (level.module === 'beatDrop') {
      Object.assign(player, module.target, { y: module.target.y + 4 }); tick(3); assert.equal(module.status.canDrop, true,`${context}: configured beat window should allow the player at its target; ${JSON.stringify(module.status)}`); module.onDrop();if(level.moduleParams.immersiveHandoff)tick(.8);
    } else if (level.module === 'threadGap') {
      player.z = d.z + 13; module.update(.05); Object.assign(player, module.target, { y: d.y + 3, speed: 0 }); module.update(.05); module.onDrop();if(level.moduleParams.immersiveHandoff)tick(.8);
    } else if (level.module === 'underwater') {
      Object.assign(player, module.target, { y: module.target.y + 1, speed: 0 });
      if(level.moduleParams.scene==='surfaceEmergence')tick(2);
      module.update(.05); module.onDrop(); tick(level.moduleParams.scene==='surfaceEmergence'?1.6:.8);
    } else if (level.module === 'chainDrop') {
      for (let step = 0; step < 4; step++) { Object.assign(player, module.target, { y: module.target.y + 3, speed: 0 }); module.update(.05); module.onDrop();if(level.moduleParams.immersiveHandoff)tick(.8); }
    }
    assert.equal(story.complete, true, `${level.level}: ${level.celebrity.name} must be completable`);
    assert.equal(story.progress.cards.length, level.level); module.teardown(); assert.equal(scene.children.length, 0);
    assert.equal(story.continueAfterCompletion(), true,`${context}: completed delivery should return to roaming`); assert.equal(story.state, 'ROAMING');
  }
  assert.equal(story.progress.total, 7); assert.equal(story.progress.finished, true); assert.equal(story.canPickup, false);
  story.dispose();
});
