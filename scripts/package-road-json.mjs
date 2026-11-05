/** Package independently bound JSON inputs. This does not approve a road fit. */
import{createHash}from'node:crypto';
import{mkdtemp,readFile,writeFile,mkdir,rm}from'node:fs/promises';
import{tmpdir}from'node:os';import{join,resolve,dirname}from'node:path';import{fileURLToPath,pathToFileURL}from'node:url';
import{build}from'esbuild';import{packLosslessJSONParts}from'./lossless-json-parts.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..'),SHA=/^[a-f0-9]{64}$/,sha=b=>createHash('sha256').update(b).digest('hex');
const ROLES=new Set(['source','sourceCopies','geometry','modelProjection','fittedProfiles','fittedProjection','acceptance','highBranchScenery']);
export async function packageRoadJSON(bindings,outputDirectory){
  bindings=structuredClone(bindings);
  const codePaths=['scripts/package-road-json.mjs','scripts/lossless-json-parts.mjs','src/world/lossless-json-parts.ts'],code={};for(const p of codePaths)code[p]=sha(await readFile(join(ROOT,p)));
  const inputs={};
  if(!bindings||!Object.keys(bindings).length)throw Error('Road JSON input inventory is empty');
  for(const[role,binding]of Object.entries(bindings)){
    if(!ROLES.has(role)||!binding||Object.keys(binding).sort().join('|')!=='path|sha256'||!SHA.test(binding.sha256))throw Error('An independent road JSON role/path/digest is required');
    const bytes=await readFile(binding.path);if(sha(bytes)!==binding.sha256)throw Error('Road JSON input changed: '+role);inputs[role]=bytes;
  }
  const packed=packLosslessJSONParts(inputs),temporary=await mkdtemp(join(tmpdir(),'road-json-byte-verifier-'));
  try{
    const modulePath=join(temporary,'codec.mjs');await build({entryPoints:[join(ROOT,'src/world/lossless-json-parts.ts')],outfile:modulePath,bundle:true,platform:'node',format:'esm',logLevel:'error'});
    const{openLosslessJSONParts}=await import(pathToFileURL(modulePath)),reader=openLosslessJSONParts(packed.dictionary);
    for(const[role,bytes]of Object.entries(inputs))if(!Buffer.from(reader.read(role,bytes.length,bindings[role].sha256)).equals(bytes))throw Error('Exact road JSON byte round trip failed: '+role);
    // Hold the complete external inputs across building and byte verification.
    for(const[role,binding]of Object.entries(bindings))if(sha(await readFile(binding.path))!==binding.sha256)throw Error('Road JSON input changed during packaging: '+role);
    for(const[p,digest]of Object.entries(code))if(sha(await readFile(join(ROOT,p)))!==digest)throw Error('Road JSON codec changed during packaging: '+p);
    const output=resolve(outputDirectory);await mkdir(output); // Never overwrite an earlier package.
    const path=`roads-${packed.storedSHA256}.pack.wasm`,files={};
    for(const[role,file]of Object.entries(packed.files))files[role]={path,encoding:'json-parts-gzip',storedBytes:packed.stored.length,storedSHA256:packed.storedSHA256,decodedBytes:file.bytes,decodedSHA256:bindings[role].sha256,dictionaryBytes:packed.dictionary.length,dictionarySHA256:packed.dictionarySHA256,dictionaryRole:role};
    await writeFile(join(output,path),packed.stored,{flag:'wx'});
    const receipt={schema:'independently-bound-lossless-road-json-transport-v1',inputs:bindings,files,code,summary:{rawBytes:Object.values(inputs).reduce((n,v)=>n+v.length,0),dictionaryBytes:packed.dictionary.length,storedBytes:packed.stored.length},allOriginalBytesReconstructedAndCompared:true,sourceOrPhysicalAcceptanceGranted:false,runtimeActivated:false};
    await writeFile(join(output,'transport.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});return receipt;
  }finally{await rm(temporary,{recursive:true,force:true});}
}
