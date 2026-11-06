import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ScenePreparation } from '../../src/delivery/art/scene-preparation';
import { launchPreparedGame } from '../../src/game/startup-readiness';

function deferred(){let resolve!:()=>void,reject!:(error:Error)=>void;const promise=new Promise<void>((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function fixture(){
  let now=0;const calls:{ids:readonly string[];job:ReturnType<typeof deferred>}[]=[],retained:string[][]=[],failures:string[]=[];
  const preparation=new ScenePreparation({warm:ids=>{const job=deferred();calls.push({ids:[...ids],job});return job.promise;},
    retain:ids=>retained.push([...ids]),now:()=>now,failed:(_error,priority)=>failures.push(priority)});
  return{preparation,calls,retained,failures,advance:(seconds:number)=>now+=seconds};
}

test('current actors alone resolve startup while delayed upcoming actors remain background work',async()=>{
  const f=fixture();f.preparation.select(['pushpa'],['pushpa','ram']);const boot=f.preparation.currentPreparation;
  assert.equal(f.preparation.nextRetryAt,Infinity,'pending work does not trigger preparation every displayed frame');
  await flush();assert.deepEqual(f.calls.map(call=>call.ids),[['pushpa']]);assert.equal(f.preparation.ready(['pushpa']),false);
  f.calls[0].job.resolve();await boot;await flush();assert.equal(f.preparation.ready(['pushpa']),true);
  assert.deepEqual(f.calls.map(call=>call.ids),[['pushpa'],['ram']]);
  let resolved=false;await boot.then(()=>resolved=true);assert.equal(resolved,true,'next level is deliberately unresolved');
  for(let i=0;i<20;i++)f.preparation.select(['pushpa'],['pushpa','ram']);assert.equal(f.calls.length,2);
  f.calls[1].job.resolve();await flush();f.preparation.dispose();
});

test('upcoming failure retries independently without blocking or invalidating current readiness',async()=>{
  const f=fixture();f.preparation.select(['pushpa'],['pushpa','ram']);await flush();f.calls[0].job.resolve();await flush();
  f.calls[1].job.reject(new Error('next download failed'));await flush();assert.equal(f.preparation.ready(['pushpa']),true);
  await f.preparation.currentPreparation;assert.deepEqual(f.failures,['upcoming']);assert.equal(f.preparation.nextRetryAt,5);
  f.advance(4);f.preparation.select(['pushpa'],['pushpa','ram']);await flush();assert.equal(f.calls.length,2);
  f.advance(1);f.preparation.select(['pushpa'],['pushpa','ram']);await flush();assert.deepEqual(f.calls[2].ids,['ram']);
  f.calls[2].job.resolve();await flush();assert.equal(f.preparation.ready(['pushpa']),true);assert.equal(f.preparation.nextRetryAt,Infinity);
});

test('failed current actors remain gated and startup rejects until their own retry succeeds',async()=>{
  const f=fixture();f.preparation.select(['arjun'],['arjun','nani']);const boot=f.preparation.currentPreparation;
  await flush();f.calls[0].job.reject(new Error('current verification failed'));await assert.rejects(boot,/verification/);await flush();
  assert.equal(f.preparation.ready(['arjun']),false);assert.deepEqual(f.failures,['current']);assert.equal(f.calls.length,1);
  f.advance(5);f.preparation.select(['arjun'],['arjun','nani']);await flush();assert.deepEqual(f.calls[1].ids,['arjun']);
  f.calls[1].job.resolve();await f.preparation.currentPreparation;await flush();assert.equal(f.preparation.ready(['arjun']),true);
  assert.deepEqual(f.calls[2].ids,['nani']);f.calls[2].job.resolve();await flush();
});

test('an explicit loading retry can recover current actors with a paused clock without duplicating pending work',async()=>{
  const f=fixture();f.preparation.select(['new-customer'],['new-customer']);await flush();
  const failed=f.preparation.currentPreparation;f.calls[0].job.reject(new Error('offline'));await assert.rejects(failed,/offline/);await flush();
  assert.equal(f.preparation.nextRetryAt,5);
  const retried=f.preparation.retryCurrent();await flush();assert.equal(f.calls.length,2,'retry does not depend on gameplay time advancing');
  assert.equal(f.preparation.retryCurrent(),retried);await flush();assert.equal(f.calls.length,2);
  f.calls[1].job.resolve();await retried;await flush();assert.equal(f.preparation.ready(['new-customer']),true);f.preparation.dispose();
});

test('obsolete current and background results cannot revive old selection readiness or retry notices',async()=>{
  const f=fixture();f.preparation.select(['a'],['a','b']);await flush();f.preparation.select(['c'],['c','d']);await flush();
  f.calls[0].job.resolve();await flush();assert.equal(f.preparation.ready(['a']),false);assert.equal(f.preparation.ready(['c']),false);
  assert.deepEqual(f.calls.map(call=>call.ids),[['a'],['c']],'an obsolete current result must not start its next level');
  f.calls[1].job.resolve();await flush();assert.equal(f.preparation.ready(['c']),true);assert.deepEqual(f.calls[2].ids,['d']);
  f.preparation.select(['e'],['e','f','c']);await flush();f.calls[2].job.reject(new Error('stale upcoming failure'));await flush();
  assert.deepEqual(f.failures,[]);assert.equal(f.preparation.ready(['e']),false);assert.deepEqual(f.retained.at(-1),['e','f','c']);
  f.calls[3].job.resolve();await flush();assert.equal(f.preparation.ready(['e']),true);f.calls[4].job.resolve();await flush();
});

test('all four metro actors are current priority while retained shared characters survive in the bounded window',async()=>{
  const f=fixture(),metro=['vakeel-saab','vakeel-woman-1','vakeel-woman-2','vakeel-woman-3'];
  f.preparation.select(metro,[...metro,'maruthi','pushpa']);await flush();assert.deepEqual(f.calls[0].ids,metro);
  assert.deepEqual(f.retained[0],[...metro,'maruthi','pushpa']);f.calls[0].job.resolve();await flush();
  assert.equal(f.preparation.ready(metro),true);assert.deepEqual(f.calls[1].ids,['maruthi','pushpa']);
  f.preparation.dispose();f.calls[1].job.reject(new Error('disposed background'));await flush();assert.deepEqual(f.failures,[]);
  assert.equal(f.preparation.ready(metro),false);assert.equal(f.preparation.nextRetryAt,Infinity);
});

test('same-turn selection swaps and disposal never enqueue stale loads after the old retention window is removed',async()=>{
  const f=fixture();f.preparation.select(['a'],['a','b']);f.preparation.select(['c'],['c','d']);await flush();
  assert.deepEqual(f.calls.map(call=>call.ids),[['c']],'obsolete current microtask must not reintroduce retired assets');
  f.calls[0].job.resolve();await flush();assert.deepEqual(f.calls[1].ids,['d']);f.calls[1].job.resolve();await flush();
  const stopped=fixture();stopped.preparation.select(['a'],['a','b']);stopped.preparation.dispose();await flush();assert.equal(stopped.calls.length,0);
});

test('a selection swap between current readiness and the queued background call suppresses obsolete upcoming work',async()=>{
  const f=fixture();f.preparation.select(['a'],['a','b']);await flush();
  const swap=f.preparation.currentPreparation.then(()=>f.preparation.select(['c'],['c','d']));
  f.calls[0].job.resolve();await swap;await flush();assert.deepEqual(f.calls.map(call=>call.ids),[['a'],['c']]);
  assert.equal(f.preparation.ready(['c']),false);f.calls[1].job.resolve();await flush();f.calls[2].job.resolve();await flush();
});

test('boot preloads only the current content actors before constructing the game',()=>{
  const source=readFileSync('src/main.ts','utf8');assert.match(source,/initialCharacters=characterIdsForLevel\(qaLevel\?\?progress\.nextLevel\)/);
  assert.doesNotMatch(source,/initialCharacters=sceneAssetWindow/);
  assert.match(source,/await game\.start\(\)/);
  const game=readFileSync('src/game/game.ts','utf8'),start=game.slice(game.indexOf('  start() {'),game.indexOf('  handleKeyDown('));
  const create=start.indexOf('this.story = new DeliveryRuntime'),barrier=start.indexOf('return launchPreparedGame(this.story?.initialCharacterPreparation()');
  assert.ok(create>=0&&barrier>create,'readiness is captured only after Game.start actually creates its runtime');
  assert.ok(start.indexOf('this.relocate(this.opts.initialArea)')>barrier,'initial relocation remains inside the prepared launch callback');
});

test('the production startup barrier holds initial relocation and frame scheduling until current GPU readiness',async()=>{
  const f=fixture(),actions:string[]=[];f.preparation.select(['pushpa'],['pushpa','ram']);
  const launch=launchPreparedGame(f.preparation.currentPreparation,()=>actions.push('relocate','frame-loop'));
  await flush();assert.deepEqual(actions,[]);f.calls[0].job.resolve();await launch;await flush();
  assert.deepEqual(actions,['relocate','frame-loop']);assert.deepEqual(f.calls[1].ids,['ram'],'upcoming is still unresolved when play launches');
  f.calls[1].job.reject(new Error('upcoming failed after launch'));await flush();assert.equal(f.preparation.ready(['pushpa']),true);
});

test('failed current preparation rejects startup without launching partial gameplay',async()=>{
  const current=deferred();let starts=0;const launch=launchPreparedGame(current.promise,()=>starts++);
  current.reject(new Error('current GPU failure'));await assert.rejects(launch,/current GPU/);assert.equal(starts,0);
  await launchPreparedGame(undefined,()=>starts++);assert.equal(starts,1,'a legacy/no-character startup remains available');
});
