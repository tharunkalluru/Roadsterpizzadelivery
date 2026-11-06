import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {loadLevels} from '../../src/delivery/content/levels';
import { createDeliveryQA } from '../../src/delivery/qa';

test('reported Tarnaka drive is an allowlisted local start with ordinary placement',()=>{
  const qa=createDeliveryQA('1',undefined,new URLSearchParams('qaRoad=tarnaka'))!;
  assert.deepEqual(qa.start,{x:3983.1,z:-2073.2,yaw:280.3*Math.PI/180,y:0});
  assert.equal(createDeliveryQA('2',undefined,new URLSearchParams('qaRoad=tarnaka'))!.start,null);
  assert.equal(createDeliveryQA('1',undefined,new URLSearchParams('qaRoad=tarnaka&qaCampaign=1&qaCampaignMode=full'))!.start,null);
});
import { ProgressSystem, MYSTERY_SAVE_KEY } from '../../src/delivery/systems/progress-system';

test('QA scenarios use the real nineteen levels and normal sequential progress with isolated storage', () => {
  for (let number = 1; number <= loadLevels().length; number++) {
    const qa = createDeliveryQA(String(number))!;
    assert.equal(qa.runtime.levels!.length, loadLevels().length);
    const progress = new ProgressSystem(qa.runtime.levels!, qa.storage);
    assert.equal(progress.currentLevel, number); assert.equal(progress.completedIds.length, number - 1);
    assert.equal(qa.area.x, qa.runtime.levels![number - 1].destination.x);
    assert.equal(qa.area.z, qa.runtime.levels![number - 1].destination.z);
    progress.complete(progress.nextLevel!.id);
    const fresh = createDeliveryQA(String(number))!;
    assert.equal(new ProgressSystem(fresh.runtime.levels!, fresh.storage).completedIds.length, number - 1, 'reload creates fresh temporary progress');
    assert.equal(qa.storage.getItem('p2ph-save-v1'), null); assert.equal(qa.storage.getItem('p2ph-area-v1'), null);
    if (number > 1) assert.ok(fresh.storage.getItem(MYSTERY_SAVE_KEY));
  }
});

test('invalid QA levels cannot launch, and the entry point gates its dynamic import on Vite DEV', () => {
  for (const value of [null, '', '0', String(loadLevels().length+1), '-1', '1.5', '1x', 'Infinity', '01']) assert.equal(createDeliveryQA(value), null);
  const main = readFileSync('src/main.ts', 'utf8');
  assert.match(main, /import\.meta\.env\.DEV && q\.has\('qaDelivery'\)/);
  assert.match(main, /await import\('\.\/delivery\/qa'\)/);
  const qa = readFileSync('src/delivery/qa.ts', 'utf8');
  assert.doesNotMatch(qa, /localStorage|__qa|setpieceDone\(|advanceCall\(|onDrop\(/);
});


test('development driving QA exposes only a finite explicit start pose and optional touch controls',()=>{
  const qa=createDeliveryQA('1',undefined,new URLSearchParams('qaTouch=1&qaStart=-12884,-3633,1.5,0'))!;
  assert.equal(qa.touch,true);assert.deepEqual(qa.start,{x:-12884,z:-3633,yaw:1.5,y:0});
  assert.deepEqual(qa.area,{name:'Road access drive',x:-12884,z:-3633});
  assert.equal(createDeliveryQA('1')!.touch,false);assert.equal(createDeliveryQA('1')!.start,null);
  for(const input of ['0,0,0','NaN,0,0,0','0,0,Infinity,0','0,0,0,0,5'])assert.equal(createDeliveryQA('1',undefined,new URLSearchParams({qaStart:input}))!.start,null);
});

test('customer-coach art staging is unavailable to normal scenarios and full campaigns',()=>{
  assert.equal(createDeliveryQA('2',undefined,new URLSearchParams('qaTrainRide=1&qaArt=scene-candidates-v1'))!.artTrainStaging,true);
  for(const [number,query] of [['2','qaTrainRide=1'],['2','qaArt=scene-candidates-v1'],['1','qaTrainRide=1&qaArt=scene-candidates-v1'],['1','qaCampaign=1&qaCampaignMode=full&qaTrainRide=1']])
    assert.equal(createDeliveryQA(number,undefined,new URLSearchParams(query))!.artTrainStaging,false);
});
