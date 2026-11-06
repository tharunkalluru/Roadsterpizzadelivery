import test from 'node:test';import assert from 'node:assert/strict';
import { Game } from '../../src/game/game';
import type { Input } from '../../src/game/player';
const idle:Input={throttle:0,brake:0,steer:0,flyPressed:false,boost:false};
function fixture(intentionalStop:boolean){
 const notices:boolean[]=[];let recoveries=0;
 const game=Object.assign(Object.create(Game.prototype),{player:{pos:{x:5,y:2,z:8},lastKind:'roof',speed:0},paused:false,
  story:{intentionalStop},stuckT:15,slowT:28,stuckRef:[5,8],slowRef:[5,8],
  hud:{rescue:(show:boolean)=>notices.push(show)},rescue:()=>recoveries++});
 return {game,notices,recoveries:()=>recoveries};
}
test('a deliberate delivery stop clears stale rooftop recovery warnings without moving the player',()=>{
 const f=fixture(true);f.game.watchStuck(.05,idle);assert.deepEqual(f.notices,[false]);assert.equal(f.recoveries(),0);
 assert.equal(f.game.stuckT,0);assert.equal(f.game.slowT,0);assert.deepEqual(f.game.player.pos,{x:5,y:2,z:8});
 f.game.stuckT=15;f.game.watchStuck(.05,{...idle,brake:1,allowReverse:false});assert.equal(f.notices.at(-1),false,'holding Space brake is a valid parked stop');
});
test('the same bay retains recovery when the driver actually tries to leave and remains blocked',()=>{
 for(const input of [{...idle,throttle:1},{...idle,brake:1,allowReverse:true}]){
  const f=fixture(true);f.game.watchStuck(.05,input);assert.equal(f.notices.at(-1),true);assert.ok(f.game.stuckT>15);
  // Roof recovery stays manual as before; this change cannot teleport the car.
  assert.equal(f.recoveries(),0);
 }
});
test('an unrelated rooftop still gets its normal recovery guidance',()=>{
 const f=fixture(false);f.game.watchStuck(.05,idle);assert.equal(f.notices.at(-1),true);assert.ok(f.game.stuckT>15);
});
