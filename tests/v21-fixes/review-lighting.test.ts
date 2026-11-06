import test from 'node:test';import assert from 'node:assert/strict';
import {lockReviewLighting} from '../../src/delivery/qa/review-lighting';
test('isolated visual review keeps actual lighting fixed while all unrelated game state and clocks keep advancing',()=>{
 const game={minutes:480,moodT:.4,position:12,simulation:0};let tick!:()=>void,cleared=0;
 const clock=lockReviewLighting(game,{every:(fn,ms)=>{tick=fn;assert.equal(ms,250);return 9;},clear:id=>{assert.equal(id,9);cleared++;}});
 assert.equal(game.minutes,1380);for(let i=0;i<80;i++){game.minutes+=.6;game.position++;game.simulation+=.25;tick();}
 assert.equal(game.minutes,1380);assert.equal(game.position,92);assert.equal(game.simulation,20);
 clock.toggle();assert.equal(clock.minute,720);assert.equal(game.minutes,720);game.minutes+=2;tick();assert.equal(game.minutes,720);clock.dispose();clock.dispose();assert.equal(cleared,1);game.minutes=800;tick();clock.toggle();assert.equal(game.minutes,800,'retired review callbacks never touch a later session');
});
