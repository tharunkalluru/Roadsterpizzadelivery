import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/game';

test('rejected area changes preserve active interaction pins and presentation state', async () => {
  const actions: string[] = [];
  const game: any = Object.create(Game.prototype);
  game.traffic = { clearRetention: () => actions.push('clear pins') };
  game.routeSearchGate = { reset: () => actions.push('reset routing') };
  game.presentation = { reset: () => actions.push('reset presentation') };
  game.hud = { toast: (text: string) => actions.push(text) };
  game.order = { state: 'toDrop' };
  game.validArea = () => true;
  await game.relocate({name: 'Gachibowli', x: 10, z: 10});
  assert.deepEqual(actions, ['Finish this delivery first!']);
  actions.length = 0; game.order = null; game.validArea = () => false;
  await game.relocate({name: 'Invalid', x: Infinity, z: 10});
  assert.deepEqual(actions, ['Choose a spot inside the playable Hyderabad map.']);
});

test('graphics restoration blocks simulation input using the same lifecycle gate as frames', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {configurable: true, value: {hidden: false}});
  try {
    const game: any = Object.create(Game.prototype);
    Object.assign(game, {paused: false, choosing: false, area: {}, engine: {graphicsReady: false},
      hud: {modalOpen: false, tipOpen: false, rotationBlocked: false},
      bugReports: {retryPending() {}}, tutorialTick() {}, updateJumpState() {},
      tickOfferQueue() {}, sound: {vehicle() {}}, player: {speed: 0}, keys: new Set(),
      t: 12, input() { throw new Error('must not consume input while graphics is unavailable'); }});
    assert.equal(game.gameplayActive(), false);
    game.simulationStep(0);
    assert.equal(game.t, 12);
    game.engine.graphicsReady = true;
    assert.equal(game.gameplayActive(), true);
    game.hud.rotationBlocked = true;
    assert.equal(game.gameplayActive(), false);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else delete (globalThis as any).document;
  }
});

test('flight and keyboard actions cannot queue behind the graphics recovery loader',()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'document');Object.defineProperty(globalThis,'document',{configurable:true,value:{hidden:false}});
 try{
  const game:any=Object.create(Game.prototype);Object.assign(game,{engine:{graphicsReady:false},paused:false,choosing:false,relocating:false,area:{},order:null,hud:{modalOpen:false,tipOpen:false,rotationBlocked:false},player:{descending:false,jumping:false},flyQueued:false,jumpQueued:false,keys:new Set()});
  game.queueFlight();game.handleKeyDown({code:'Space',preventDefault(){throw Error('blocked input reached motion handling');}});assert.equal(game.flyQueued,false);assert.equal(game.keys.size,0);
  game.engine.graphicsReady=true;game.queueFlight();assert.equal(game.flyQueued,true);
 }finally{if(previous)Object.defineProperty(globalThis,'document',previous);else delete(globalThis as any).document;}
});
