import test from 'node:test';
import assert from 'node:assert/strict';
import {StoryDialogue} from '../../src/delivery/systems/story-dialogue';
import type {Sound} from '../../src/game/audio';

test('subtitles and speaker changes follow playback through buffering, pause and recovery',()=>{
 const dialogue=new StoryDialogue();
 const state:Sound['dialoguePlayback']={status:'loading',position:0,duration:12};
 const events:string[]=[];
 const player={startDialogue:(url:string)=>events.push(url),stopDialogue:()=>events.push('stopped'),dialoguePlayback:state};
 const lines=[{who:'player' as const,text:'First line'},{who:'customer' as const,text:'Second line'}];
 const clip={url:'/story.mp3',duration:12,lineEnds:[3,12]};
 dialogue.start(lines,clip,player);
 dialogue.update(.1,false);assert.equal(dialogue.line,null);assert.deepEqual(events,[]);
 dialogue.update(.1,true);assert.deepEqual(events,['/story.mp3']);
 state.status='playing';state.position=2.9;
 for(let i=0;i<10;i++)dialogue.update(.1,true);
 assert.equal(dialogue.line?.text,'First line');
 state.position=3.05;dialogue.update(.1,true);assert.equal(dialogue.line?.text,'Second line');
 state.status='failed';
 for(let i=0;i<30;i++)dialogue.update(.1,true);
 assert.equal(dialogue.done,true);
 dialogue.start([],clip,player);dialogue.update(.1,true);dialogue.reset();
 assert.deepEqual(events,['/story.mp3','stopped','/story.mp3','stopped']);
});

import { DELIVERY_LEVELS } from '../../src/delivery/content/levels';

test('every current recording switches shots at its edit cues and articulates only the customer voice', () => {
 const levels = DELIVERY_LEVELS.filter(level => level.storyAudio);
 assert.equal(levels.length, 12);
 for (const level of levels) {
  const clip = level.storyAudio!;
  const cues = clip.speakers!;
  assert.equal(cues[0].who, [4,19].includes(level.level) ? 'customer' : 'player');
  assert.ok(cues.some(cue => cue.who==='customer') && cues.some(cue => cue.who==='player'));
  const clock:Sound['dialoguePlayback'] = {status:'playing',duration:clip.duration,position:0,speechLevel:.73};
  const dialogue = new StoryDialogue();
  dialogue.start(level.storyScript, clip, {dialoguePlayback:clock,startDialogue(){},stopDialogue(){}});
  for (const [i,cue] of cues.entries()) {
   if (i>0) {
    clock.position=cue.at-.001;
    dialogue.update(.016,true);
    assert.equal(dialogue.speaker,cues[i-1].who);
   }
   clock.position=cue.at;
   dialogue.update(.016,true);
   assert.equal(dialogue.speaker,cue.who);
   assert.equal(dialogue.speechEnvelope,cue.who==='customer'?.73:0);
   assert.equal(dialogue.driverVoiceLevel,cue.who==='player'?.73:0);
  }
  clock.status='ended';dialogue.update(.016,true);
  assert.equal(dialogue.speaker,undefined);assert.equal(dialogue.speechEnvelope,0);
  assert.equal(dialogue.done,true);
 }
});

test('a silent reaction leaves delivery ready and returns to a closed mouth',()=>{
 const dialogue=new StoryDialogue();dialogue.start();assert.equal(dialogue.done,true);
 dialogue.update(.1,true);assert.ok(dialogue.speechEnvelope>0);
 for(let i=0;i<20;i++)dialogue.update(.1,true);
 assert.equal(dialogue.speechEnvelope,0);assert.equal(dialogue.done,true);
});

test('a stalled mobile clock cannot hold a story forever or play a late recording after handoff',()=>{
 for(const status of ['loading','playing'] as const){
  const dialogue=new StoryDialogue();let stops=0;
  const clock:Sound['dialoguePlayback']={status,position:0,duration:status==='loading'?0:6};
  dialogue.start([{who:'player',text:'Hello'},{who:'customer',text:'Thank you'}],{url:'/story.mp3',duration:6},
   {dialoguePlayback:clock,startDialogue(){},stopDialogue(){stops++;}});
  for(let i=0;i<400;i++)dialogue.update(.1,false);
  assert.equal(stops,0);
  for(let i=0;i<200;i++)dialogue.update(.1,true);
  assert.equal(stops,1);assert.equal(dialogue.done,true);
 }
});
