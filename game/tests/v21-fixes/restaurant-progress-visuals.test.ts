import test from 'node:test';
import assert from 'node:assert/strict';
import { restaurantArt } from '../../src/delivery/ui/restaurant';
import { loadLevels } from '../../src/delivery/content/levels';

/** Compare actual shapes/coordinates, discarding every text/label, style and
 * colour. A changed accessibility label or build-name cannot pass this test. */
const shapes=(svg:string)=>svg.replace(/<text\b[^>]*>[\s\S]*?<\/text>/g,'')
  .replace(/\s(?:aria-label|data-build|class|fill|stroke|stroke-width|font-[\w-]+|role|xmlns)="[^"]*"/g,'');
const withoutPaving=(svg:string)=>svg.replace(/<g data-build="terrace-paving">[\s\S]*?<\/g>/,'');

test('each configured delivery adds genuinely different restaurant construction geometry',()=>{
  const levels=loadLevels(),art=levels.map((level,i)=>restaurantArt(i+1,levels.length,level.restaurantStage));
  assert.equal(new Set(art.map(svg=>shapes(withoutPaving(svg)))).size,levels.length,'structural upgrades themselves are all different, even without paving stones, text or colours');
  for(let i=1;i<art.length;i++)assert.notEqual(shapes(art[i]),shapes(art[i-1]),`level${i+1} visibly advances beyond level${i}`);
  for(const[step,feature]of[[1,'cart'],[2,'canopy'],[3,'stall-frame'],[4,'counter-oven'],[5,'takeaway-counter'],[6,'shop'],[7,'shop-seating'],[8,'brick-oven'],[9,'kitchen'],[10,'dining-room'],[11,'terrace'],[12,'finished-facade'],[13,'installed-sign'],[15,'delivery-hatch'],[16,'roof-garden'],[17,'patio-lights'],[18,'delivery-garage'],[19,'grand-opening']] as const)
    assert.ok(art[step-1].includes(`data-build="${feature}"`),`${feature} is built at the matching authored milestone`);
});

test('the final neon and door-opening ceremony remain locked until every configured delivery is complete',()=>{
  for(const total of[8,14,25]){
    for(let stage=1;stage<total;stage++){
      const art=restaurantArt(stage,total,'Building');assert.ok(!art.includes('du-opening-neon-'));assert.ok(!art.includes('du-opening-door-left'));assert.ok(!art.includes('du-opening-rays'));
    }
    const complete=restaurantArt(total,total,'Open');assert.ok(complete.includes('du-opening-neon-text'));assert.ok(complete.includes('du-opening-door-left'));assert.ok(complete.includes('du-opening-rays'));
    assert.ok(!complete.includes('<filter'));assert.ok(!complete.includes('<animate'),'the existing reduced-motion ceremony remains the only animation owner');
  }
});

test('longer content sets continue actual paving construction after every delivery, with a bounded SVG node count',()=>{
  for(const total of[8,15,19,25,1000]){
    const art=Array.from({length:total},(_,i)=>restaurantArt(i+1,total,'Same accessibility label'));
    assert.equal(new Set(art.map(shapes)).size,total,`${total}-level content has${total} distinct physical construction stages`);
    assert.ok((art.at(-1)!.match(/<rect\b/g)??[]).length<160,'large authored totals cannot create thousands of DOM nodes');
  }
});

test('original seven-level art retains its cart, canopy, shop, oven, seating, plants and final neon sequence',()=>{
  const art=Array.from({length:7},(_,i)=>restaurantArt(i+1,7,'Same label'));
  assert.equal(new Set(art.map(shapes)).size,7);
  assert.ok(art[0].includes('<circle cx="94"'));assert.ok(!art[0].includes('l-8-34'));
  assert.ok(art[1].includes('l-8-34'));assert.ok(art[2].includes('class="du-opening-window"'));assert.ok(art[3].includes('class="du-opening-oven"'));
  assert.ok(art[4].includes('M12 158h28'));assert.ok(art[5].includes('M49 170h19'));assert.ok(art[6].includes('du-opening-door-left'));
  assert.ok(!art[5].includes('du-opening-rays'));assert.ok(art[6].includes('du-opening-rays'));
});

test('restaurant art clamps invalid progress and escapes supplied labels without leaking markup',()=>{
  assert.equal(restaurantArt(999,14,'Open'),restaurantArt(14,14,'Open'));assert.equal(restaurantArt(-4,14,'Dream'),restaurantArt(0,14,'Dream'));
  assert.equal(restaurantArt(NaN,14,'Dream'),restaurantArt(0,14,'Dream'));assert.equal(restaurantArt(3,NaN,'Dream'),restaurantArt(0,0,'Dream'));
  const art=restaurantArt(5,14,'<script onload="x">&');assert.ok(art.includes('&lt;script'));assert.ok(!art.includes('<script'));assert.ok(!/\b(?:NaN|Infinity)\b/.test(art));
});
