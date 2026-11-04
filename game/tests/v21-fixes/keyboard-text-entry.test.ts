import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../src/game/game';

function fixture(){
  const calls:string[]=[];
  const game:any=Object.assign(Object.create(Game.prototype),{keys:new Set<string>(),
    hud:{controlFeedback:()=>calls.push('feedback')},queueFlight:()=>calls.push('fly'),queueJump:()=>calls.push('jump'),
    openMap:()=>calls.push('map'),rescue:()=>calls.push('recover'),openPause:()=>calls.push('pause')});
  return{game,calls};
}
const event=(code:string,target:unknown=null,modifier:Record<string,boolean>={})=>({code,target,repeat:false,preventDefault(){},...modifier}) as KeyboardEvent;

test('typing in an input, textarea, select or editable descendant cannot drive, recover or open the map',()=>{
  for(const kind of ['input','textarea','select','contenteditable']){
    const f=fixture(),target={closest:(selector:string)=>selector.includes(kind)?{}:null};
    for(const code of ['KeyW','KeyS','KeyR','KeyM','KeyQ','KeyE','Space','KeyP'])f.game.handleKeyDown(event(code,target));
    assert.deepEqual(f.calls,[],kind);assert.equal(f.game.keys.size,0);
  }
});
test('browser shortcut modifiers do not trigger game actions, while ordinary controls retain their mapping',()=>{
  for(const modifier of ['ctrlKey','metaKey','altKey']){
    const f=fixture();for(const code of ['KeyR','KeyQ','KeyE','Space'])f.game.handleKeyDown(event(code,null,{[modifier]:true}));
    assert.deepEqual(f.calls,[]);assert.equal(f.game.keys.size,0);
  }
  const f=fixture();for(const code of ['KeyW','Space','KeyS','KeyQ','KeyE','KeyM','KeyR'])f.game.handleKeyDown(event(code));
  assert.deepEqual(f.calls.filter(x=>x!=='feedback'),['fly','jump','map','recover']);
  assert.ok(f.game.keys.has('Space'));assert.ok(f.game.keys.has('KeyS'));
});
