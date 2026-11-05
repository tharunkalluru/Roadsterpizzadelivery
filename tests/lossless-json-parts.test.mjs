import assert from'node:assert/strict';
import{createHash}from'node:crypto';
import{mkdtemp,rm}from'node:fs/promises';
import{tmpdir}from'node:os';import{join}from'node:path';import{pathToFileURL}from'node:url';
import{test,after}from'node:test';import{build}from'esbuild';
import{packLosslessJSONParts}from'../scripts/lossless-json-parts.mjs';
const temporary=await mkdtemp(join(tmpdir(),'lossless-json-parts-test-')),file=join(temporary,'codec.mjs');
await build({entryPoints:['src/world/lossless-json-parts.ts'],outfile:file,bundle:true,platform:'node',format:'esm',logLevel:'error'});
const{openLosslessJSONParts}=await import(pathToFileURL(file));after(()=>rm(temporary,{recursive:true,force:true}));
const sha=b=>createHash('sha256').update(b).digest('hex');
const open=d=>openLosslessJSONParts(Buffer.from(JSON.stringify(d)));
function fixture(){return{version:1,kind:'lossless-json-parts-v1',files:{source:{root:0,bytes:2,sha256:sha('{}')}},nodes:[['{}']]};}
test('preserves original numeric spellings, duplicate keys, Unicode and formatting byte for byte',()=>{
 const raw=Buffer.from(' \r\n{ "float":-0,"n":1e+03,"escaped":"\\u0061\\ud800\\\\\\\"","emoji":"🍕 తెలుగు","key":1,"key":2,"parts":['+Array(12).fill('{"profile":['+Array(20).fill('-0.000,1e-03,4.500').join(',')+']}').join(',')+']}\t\n');
 const inputs={source:raw,fittedProfiles:Buffer.concat([Buffer.from('\n'),raw,Buffer.from('\n')])},packed=packLosslessJSONParts(inputs),reader=openLosslessJSONParts(packed.dictionary);
 for(const[role,bytes]of Object.entries(inputs))assert.deepEqual(Buffer.from(reader.read(role,bytes.length,sha(bytes))),bytes);
 assert.ok(packed.dictionary.length<raw.length);assert.ok(packed.stored.length<raw.length);
 const copy=reader.read('source',raw.length,sha(raw));copy[0]^=1;assert.deepEqual(Buffer.from(reader.read('source',raw.length,sha(raw))),raw);
 assert.throws(()=>reader.read('source',raw.length,'0'.repeat(64)),/release binding/);
});
test('rejects forward, cyclic, negative, fractional and missing references',()=>{
 for(const ref of[0,1,-1,.5,null,{},true]){const d=fixture();d.nodes=[[ref]];assert.throws(()=>open(d),/references/);}
});
test('bounds exponential expansion and zero-byte exponential work before allocating a file',()=>{
 for(const literal of['x','']){const d=fixture();d.nodes=[[literal]];for(let i=1;i<30;i++)d.nodes.push([i-1,i-1]);assert.throws(()=>open(d),/size limit|too much work/);}
});
test('rejects malformed schemas, role bindings, literal Unicode and inconsistent root sizes',()=>{
 const mutations=[d=>d.extra=true,d=>d.version=2,d=>d.nodes=[],d=>d.nodes=[[]],d=>d.nodes=[['\ud800']],d=>d.files.source.bytes=1,d=>d.files.source.root=1,d=>d.files.source.sha256='bad',d=>d.files.constructor=d.files.source];
 for(const mutate of mutations){const d=fixture();mutate(d);assert.throws(()=>open(d));}
 assert.throws(()=>openLosslessJSONParts(Uint8Array.from([0xc0,0xaf])));
 assert.throws(()=>packLosslessJSONParts({source:Buffer.from('{bad}')}));
 assert.throws(()=>packLosslessJSONParts({source:Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from('{}')])}),/BOM/);
 assert.throws(()=>packLosslessJSONParts({source:Buffer.from('['.repeat(258)+'0'+']'.repeat(258))}),/nesting/);
});
