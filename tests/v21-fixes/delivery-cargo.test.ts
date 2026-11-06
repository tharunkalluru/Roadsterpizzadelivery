import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { roadster } from '../../src/world/vehicles';
import { Player } from '../../src/game/player';

test('one compact trunk cargo assembly toggles completely without modifying the car or jump equipment',()=>{
  const material=new THREE.MeshBasicMaterial(),model=roadster(new Proxy({},{get:()=>material}),{logo:material,plate:material});
  const cargo=model.cargo;assert.equal(cargo.children.length,4,'carton, lid, and both straps share visibility');
  assert.equal(model.box.parent,cargo);assert.equal(model.group.getObjectByName('delivery-pizza-slice'),undefined);
  const before=new THREE.Box3().setFromObject(cargo).getSize(new THREE.Vector3());
  assert.ok(before.x<.8&&before.y<.2&&before.z<.5,'trunk carton cannot become a cabin-sized marker');
  const podVisibility=model.pods.map(p=>p.visible);
  const owner={pizzaCargo:cargo,jumpBoundsDirty:false} as unknown as Player;
  Player.prototype.setCarryingPizza.call(owner,false);assert.equal(cargo.visible,false);
  assert.equal((owner as any).jumpBoundsDirty,true);
  (owner as any).jumpBoundsDirty=false;Player.prototype.setCarryingPizza.call(owner,false);
  assert.equal((owner as any).jumpBoundsDirty,false,'stable cargo does not invalidate cached jump bounds every frame');
  Player.prototype.setCarryingPizza.call(owner,true);assert.equal(cargo.visible,true);
  assert.deepEqual(model.pods.map(p=>p.visible),podVisibility);
});
