import test from 'node:test';
import assert from 'node:assert/strict';
import { Hud } from '../../src/ui/hud';

function fixture() {
  const states=new Map<string,{pressed:boolean;disabled:boolean;aria:string}>();
  const el:any={modal:{hidden:true},'tip-layer':{hidden:true}};
  for(const id of ['t-left','t-right','t-gas','t-brake','t-fly','t-jump']){
    const state={pressed:false,disabled:false,aria:'false'};states.set(id,state);
    el[id]={get disabled(){return state.disabled;},classList:{toggle(_name:string,value:boolean){state.pressed=value;}},setAttribute(_name:string,value:string){state.aria=value;}};
  }
  const hud:any=Object.assign(Object.create(Hud.prototype),{el,root:{classList:{contains:()=>false}},storyBlocked:false,rotationBlocked:false,cancelOfferSwipe(){},controlReleases:[],prompt(){}});
  return{hud,states};
}

test('keyboard feedback aggregates alternate held keys and preserves simultaneous steering',()=>{
  const {hud,states}=fixture();
  hud.controlFeedback('KeyW',true);hud.controlFeedback('ArrowUp',true);hud.controlFeedback('KeyA',true);
  assert.equal(states.get('t-gas')!.pressed,true);assert.equal(states.get('t-left')!.pressed,true);
  hud.controlFeedback('KeyW',false);assert.equal(states.get('t-gas')!.pressed,true,'the second accelerator key is still held');
  hud.controlFeedback('ArrowUp',false);assert.equal(states.get('t-gas')!.pressed,false);assert.equal(states.get('t-left')!.pressed,true);
  hud.controlFeedback('KeyA',false);assert.equal(states.get('t-left')!.aria,'false');
});

test('touch and keyboard feedback share a control until both sources release',()=>{
  const {hud,states}=fixture();
  hud.paintControl('t-brake',true);hud.controlFeedback('KeyS',true);hud.paintControl('t-brake',false);
  assert.equal(states.get('t-brake')!.pressed,true,'lifting the thumb retains a held keyboard brake');
  hud.controlFeedback('KeyS',false);assert.equal(states.get('t-brake')!.pressed,false);
  for(const [key,id]of [['Space','t-brake'],['KeyQ','t-fly'],['KeyE','t-jump']]){
    hud.controlFeedback(key,true);assert.equal(states.get(id)!.aria,'true');hud.controlFeedback(key,false);assert.equal(states.get(id)!.aria,'false');
  }
});

test('blocked and disabled controls stay unpressed and resets clear every input presentation',()=>{
  const {hud,states}=fixture();
  states.get('t-jump')!.disabled=true;hud.controlFeedback('KeyE',true);assert.equal(states.get('t-jump')!.pressed,false);
  hud.storyBlocked=true;hud.controlFeedback('KeyQ',true);assert.equal(states.get('t-fly')!.pressed,false);
  hud.storyBlocked=false;hud.controlFeedback('KeyW',true);hud.paintControl('t-left',true);
  hud.resetControls();for(const state of states.values()){assert.equal(state.pressed,false);assert.equal(state.aria,'false');}
  hud.controlFeedback('KeyS',true);assert.equal(states.get('t-brake')!.pressed,true,'reset permits a new input');
});
