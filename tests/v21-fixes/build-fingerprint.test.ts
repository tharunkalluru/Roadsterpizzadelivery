import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { gameBuildFingerprint } from '../../scripts/build-fingerprint.mjs';

function fixture(){
  const root=mkdtempSync(join(tmpdir(),'roadster-build-identity-'));
  const put=(name:string,body:string)=>{const file=join(root,name);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,body);};
  for(const name of ['src/main.ts','worker/index.ts','public/city/core.json','public/delivery/characters/actor/model.glb','public/delivery/characters/actor/portrait.png','public/delivery/scenes/scene.glb','public/fonts/game.ttf','index.html','package.json','package-lock.json','vite.config.ts','wrangler.jsonc','scripts/build.mjs','scripts/build-fingerprint.mjs'])put(name,'original');
  return{root,put,dispose:()=>rmSync(root,{recursive:true,force:true})};
}

test('model, portrait, scene, font and executable changes invalidate the exact tested build identity',()=>{
  const f=fixture();try{
    const original=gameBuildFingerprint(f.root);assert.equal(gameBuildFingerprint(f.root),original);
    for(const file of ['public/delivery/characters/actor/model.glb','public/delivery/characters/actor/portrait.png','public/delivery/scenes/scene.glb','public/fonts/game.ttf','public/city/core.json','src/main.ts','worker/index.ts','vite.config.ts','scripts/build.mjs']){
      f.put(file,'changed');assert.notEqual(gameBuildFingerprint(f.root),original,file);f.put(file,'original');assert.equal(gameBuildFingerprint(f.root),original);
    }
    f.put('docs/observations.json','not shipped');assert.equal(gameBuildFingerprint(f.root),original,'test evidence alone is not a different runtime');
  }finally{f.dispose();}
});

test('a linked public input cannot silently identify or ship files outside the selected source',()=>{
  const f=fixture();try{symlinkSync(join(f.root,'package.json'),join(f.root,'public','linked.json'));assert.throws(()=>gameBuildFingerprint(f.root),/must not be a symlink/);}finally{f.dispose();}
});
