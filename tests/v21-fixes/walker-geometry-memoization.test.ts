import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import type {BufferGeometry} from 'three';
import {initTemplates,rng} from '../../src/core/util';
import {randomPerson,walkerGeometry} from '../../src/world/people';
import expected from './walker-geometry-baseline.json';
function hash(g:BufferGeometry){const h=createHash('sha256');for(const name of Object.keys(g.attributes).sort()){const a=g.attributes[name];h.update(name);h.update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));}if(g.index)h.update(Buffer.from(g.index.array.buffer,g.index.array.byteOffset,g.index.array.byteLength));return h.digest('hex');}
test('memoized source vertices preserve every body and rigged attribute byte for 150 seeded appearances',()=>{
 // Fixture generated from 5bf2b9a before source-vertex memoization. Covers
 // clipping, clothes, source bone weights, and cache eviction/reconstruction.
 initTemplates();const r=rng(9917);
 for(const row of expected){const spec=randomPerson(r),g=walkerGeometry(spec,true);try{assert.equal(spec.kind,row.kind);assert.equal(hash(g.body),row.body,`body ${row.i} ${row.kind}`);assert.equal(hash(g.rigged!),row.rigged,`rig ${row.i} ${row.kind}`);}finally{g.release();}}
});

import {drawContinuousBody,type HumanSeat} from '../../src/world/human-body';
import bodyExpected from './human-body-baseline.json';
test('standing and seated body templates retain exact bytes at both detail settings',()=>{
 initTemplates();const r=rng(1519);let cursor=0;
 for(let i=0;i<24;i++){const spec=randomPerson(r);for(const low of [false,true])for(const seat of [undefined,'bike','auto','bench'] as (HumanSeat|undefined)[]){const h=createHash('sha256');drawContinuousBody((t,...args)=>{h.update(JSON.stringify(args));for(const key of Object.keys(t).sort()){const value=t[key];h.update(key);h.update(ArrayBuffer.isView(value)?Buffer.from(value.buffer,value.byteOffset,value.byteLength):JSON.stringify(value));}},spec,low,seat);const row=bodyExpected[cursor++];assert.equal(row.kind,spec.kind);assert.equal(h.digest('hex'),row.hash,`${i}/${low}/${seat}`);}}
 assert.equal(cursor,bodyExpected.length);
});
