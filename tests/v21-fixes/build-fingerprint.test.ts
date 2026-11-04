import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { gameBuildFingerprint, BUILD_DECLARED_INPUTS } from '../../scripts/build-fingerprint.mjs';

function fixture(){
  const root=mkdtempSync(join(tmpdir(),'roadster-build-identity-'));
  const put=(name:string,body:string)=>{const file=join(root,name);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,body);};
  for(const name of ['src/main.ts','worker/index.ts','public/city/core.json','public/delivery/characters/actor/model.glb','public/delivery/characters/actor/portrait.png','public/delivery/scenes/scene.glb','public/fonts/game.ttf'])put(name,'original');
  for(const name of BUILD_DECLARED_INPUTS)put(name,'original');
  return{root,put,dispose:()=>rmSync(root,{recursive:true,force:true})};
}

test('model, portrait, scene, font and executable changes invalidate the exact tested build identity',()=>{
  const f=fixture();try{
    const original=gameBuildFingerprint(f.root);assert.equal(gameBuildFingerprint(f.root),original);
    for(const file of ['public/delivery/characters/actor/model.glb','public/delivery/characters/actor/portrait.png','public/delivery/scenes/scene.glb','public/fonts/game.ttf','public/city/core.json','src/main.ts','worker/index.ts','vite.config.ts','scripts/build.mjs','scripts/asset-transport.mjs','scripts/compile-road-profile-cache.mjs','scripts/generate-road-profile-corrections.mjs','scripts/verify-road-profile-corrections.mjs','scripts/road-profile-inputs.mjs',
      'scripts/export-road-tile-transports.mjs','scripts/export-historical-road-model.mjs','scripts/solve-road-profiles.py','scripts/road-profile-solver-requirements.txt','docs/qa/evidence/reported-roads/historical-lowering-profiles-a679b72.json','docs/qa/evidence/reported-roads/langar-de9-source-bridge-binding.json']){
      f.put(file,'changed');assert.notEqual(gameBuildFingerprint(f.root),original,file);f.put(file,'original');assert.equal(gameBuildFingerprint(f.root),original);
    }
    f.put('docs/observations.json','not shipped');assert.equal(gameBuildFingerprint(f.root),original,'test evidence alone is not a different runtime');
    f.put('docs/qa/evidence/reported-roads/east-93f-source-bridge-binding.json','changed source authority');
    assert.notEqual(gameBuildFingerprint(f.root),original,'declared source authority is part of the preparation identity');
  }finally{f.dispose();}
});

test('a linked public input cannot silently identify or ship files outside the selected source',()=>{
  const f=fixture();try{symlinkSync(join(f.root,'package.json'),join(f.root,'public','linked.json'));assert.throws(()=>gameBuildFingerprint(f.root),/must not be a symlink/);}finally{f.dispose();}
});
