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
 for(let i=0;i<100;i++)dialogue.update(.1,true);
 assert.equal(dialogue.line?.text,'First line');
 state.position=3.05;dialogue.update(.1,true);assert.equal(dialogue.line?.text,'Second line');
 state.status='failed';
 for(let i=0;i<30;i++)dialogue.update(.1,true);
 assert.equal(dialogue.done,true);
 dialogue.start([],clip,player);dialogue.update(.1,true);dialogue.reset();
 assert.deepEqual(events,['/story.mp3','stopped','/story.mp3','stopped']);
});
