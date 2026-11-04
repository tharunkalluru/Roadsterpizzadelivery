import test from 'node:test';
import assert from 'node:assert/strict';
import { trafficPopulationLimit } from '../../src/game/traffic-density';
test('local traffic is denser on arterials without forcing market density into colonies',()=>{
  for(const low of [true,false]){
    let prior=0;
    for(let i=0;i<=100;i++){
      const activity=i/100,count=trafficPopulationLimit(low,activity,0);
      assert.ok(Number.isInteger(count)&&count>=prior);prior=count;
    }
    const oldArterial=Math.round((low?16:26)+(low?18:38)*.75);
    assert.ok(trafficPopulationLimit(low,0,.75)>oldArterial*1.3);
    assert.ok(trafficPopulationLimit(low,0,.1)<trafficPopulationLimit(low,0,.75));
  }
  assert.equal(trafficPopulationLimit(true,1,0),48);
  assert.equal(trafficPopulationLimit(false,1,0),86);
});
test('streaming or malformed activity values cannot create an unbounded population',()=>{
  for(const low of [true,false])for(const value of [-100,Infinity,NaN,100]){
    const count=trafficPopulationLimit(low,value,value);assert.ok(count>0&&count<=(low?48:86));
  }
});
