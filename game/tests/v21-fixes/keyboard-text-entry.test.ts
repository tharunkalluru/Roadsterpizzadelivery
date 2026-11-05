import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../src/game/game';

function fixture(){
  const calls:string[]=[];
  const game:any=Object.assign(Object.create(Game.prototype),{keys:new Set<string>(),
    engine:{renderer:{domElement:{focus:()=>calls.push('driving-focus')}}},
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
  assert.deepEqual(f.calls.filter(x=>!['feedback','driving-focus'].includes(x)),['fly','jump','map','recover']);
  assert.ok(f.game.keys.has('Space'));assert.ok(f.game.keys.has('KeyS'));
});
test('resuming movement transfers minimap focus to driving before the next Space brake',()=>{
  for(const code of ['KeyW','KeyA','KeyD','KeyS','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyQ','KeyE']){
    const f=fixture();f.game.handleKeyDown(event(code));
    assert.equal(f.calls[0],'driving-focus',code);
    f.game.handleKeyDown(event('Space'));
    assert.ok(f.game.keys.has('Space'));assert.equal(f.calls.filter(x=>x==='driving-focus').length,1);
  }
});
test('Tab and direct Space do not steal explicit keyboard button focus, and blocked movement does not escape a dialog',()=>{
  const f=fixture();for(const code of ['Tab','Enter','Space'])f.game.handleKeyDown(event(code));
  assert.ok(!f.calls.includes('driving-focus'));
  for(const blocked of ['tipOpen','rotationBlocked','modalOpen']){
    const b=fixture();b.game.hud[blocked]=true;b.game.handleKeyDown(event('KeyW'));
    assert.deepEqual(b.calls,[]);assert.equal(b.game.keys.size,0);
  }
});
