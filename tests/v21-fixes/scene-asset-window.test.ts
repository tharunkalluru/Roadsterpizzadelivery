import test from 'node:test';
import assert from 'node:assert/strict';
import { characterIdsForLevel, sceneAssetWindow } from '../../src/delivery/art/scene-asset-window';
import { loadLevels } from '../../src/delivery/content/levels';

test('the actor loading window follows content IDs and includes all distinct metro companions',()=>{
  const levels=loadLevels(),metro=levels.find(level=>level.module==='metroRide')!;
  assert.deepEqual(characterIdsForLevel(metro),['vakeel-saab','vakeel-woman-1','vakeel-woman-2','vakeel-woman-3']);
  for(let index=0;index<levels.length;index++){
    const expected=[...new Set([...characterIdsForLevel(levels[index]),...characterIdsForLevel(levels[index+1])])];
    assert.deepEqual(sceneAssetWindow(levels,levels[index].id),expected);
  }
});

test('retained sets stay resident while the car exits, with no entire-campaign warm-up or duplicate loads',()=>{
  const levels=loadLevels();
  assert.deepEqual(sceneAssetWindow(levels,levels[1].id,levels[0].id),['ram-vvr','devara','pushpa-raj']);
  assert.deepEqual(sceneAssetWindow(levels,levels[0].id,levels[0].id),['pushpa-raj','ram-vvr']);
  assert.deepEqual(sceneAssetWindow(levels,null),[]);
  assert.deepEqual(sceneAssetWindow(levels,null,levels.at(-1)!.id),['nani-jersey']);
  const extended=[...levels,{...levels.at(-1)!,id:'new-content-only-level',moduleParams:{characterId:'another-actor'}}];
  assert.deepEqual(sceneAssetWindow(extended,levels.at(-1)!.id),['nani-jersey','another-actor']);
});
