import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MatchAndLand } from '../../src/delivery/modules/match-and-land';
import type { DeliveryPlayer } from '../../src/delivery/modules/types';
import type { MovingRailBody } from '../../src/game/moving-rail';

test('Ram requires a physical roof landing on his coach, never a matching hover or side pass',()=>{
  for(const pose of [{flying:true,x:0,y:4.75},{descending:true,x:0,y:4.75},{x:3.4,y:4.75},{x:0,y:7.5},{x:0,y:4.75}]){
    const module=new MatchAndLand(),events:string[]=[],player:DeliveryPlayer={x:0,z:0,y:4.75,speed:0,yaw:0,...pose};
    const body:MovingRailBody={id:'rail:story:1:2',x:0,y:.1,z:0,hx:0,hz:1,bottom:.3,roof:4.2,halfWidth:1.57,halfLength:11.25,previous:{x:0,y:.1,z:0,hx:0,hz:1}};
    module.setup({scene:new THREE.Scene(),player:()=>player,destination:{x:0,y:4.2,z:0},existingTrain:()=>body,canInteract:()=>true,emit:type=>events.push(type)},
      {vehicle:'train',scene:'trainRoof',holdSeconds:.35});
    for(let i=0;i<12;i++)module.update(.1);
    const expected=!player.flying&&!player.descending&&player.x===0&&player.y===4.75;
    assert.equal(module.status.canDrop,expected);module.onDrop();assert.equal(events.includes('done'),expected);
    module.teardown();
  }
});
