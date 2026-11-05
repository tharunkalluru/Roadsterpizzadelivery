import test from 'node:test';
import assert from 'node:assert/strict';
import { StoryLandingGate } from '../../src/delivery/systems/story-landing';
import type { DeliveryPlayer, ModuleStoryFrame } from '../../src/delivery/modules/types';

const player=():DeliveryPlayer=>({x:0,y:.55,z:0,yaw:0,speed:0,verticalSpeed:0});
const frame:ModuleStoryFrame={entry:true,point:{x:0,y:.55,z:0}};
test('entry waits for a continuous settled stop inside the actual blue marker',()=>{
  const gate=new StoryLandingGate(),p=player();
  for(let i=0;i<3;i++)assert.equal(gate.update(.1,p,frame,0,true),false);
  assert.equal(gate.update(.1,p,frame,0,true),true);
  p.x=3.16;assert.equal(gate.update(.1,p,frame,0,true),false);
  p.x=0;assert.equal(gate.update(.1,p,frame,0,true),false,'leaving clears the hold');
});
test('flying, falling, jumps, rolling, wrong decks, invalid inputs and locked calls never capture',()=>{
  const cases:Partial<DeliveryPlayer>[]=[{flying:true},{descending:true},{jumping:true},{speed:.36},{speed:-.36},
    {verticalSpeed:.16},{verticalSpeed:-.16},{y:5},{x:NaN},{speed:Infinity}];
  for(const override of cases){const gate=new StoryLandingGate();for(let i=0;i<30;i++)
    assert.equal(gate.update(.1,{...player(),...override},frame,0,true),false,JSON.stringify(override));}
  for(const [f,s,allowed,glide] of [[undefined,0,true,false],[{...frame,entry:false},0,true,false],
    [frame,2,true,false],[frame,0,false,false],[frame,0,true,true]] as const){
    const gate=new StoryLandingGate();for(let i=0;i<30;i++)assert.equal(gate.update(.1,player(),f,s,allowed,0,glide),false);
  }
});
test('relocation and suspension reset the stop; long wall-clock frames cannot bypass it',()=>{
  const gate=new StoryLandingGate();for(let i=0;i<3;i++)gate.update(.1,player(),frame,0,true,1);
  assert.equal(gate.update(.1,player(),frame,0,true,2),false);
  gate.reset();assert.equal(gate.update(12,player(),frame,0,true,2),false);
});
test('genuine elevated roof and buoyant water arrivals qualify without global-speed assumptions',()=>{
  for(const support of [18,-1.28/3]){
    const p={...player(),y:support+.55},f={...frame,landing:{point:{x:0,y:support+.55,z:0},radius:3.15}};
    const gate=new StoryLandingGate();for(let i=0;i<3;i++)assert.equal(gate.update(.1,p,f,support,true),false);
    assert.equal(gate.update(.1,p,f,support,true),true);
  }
});
