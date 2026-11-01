// Offline structural inspection. This never records or implies a visual approval.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const path=process.argv[2];if(!path)throw new Error('Provide a local candidate GLB path.');
const bytes=await readFile(path),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
if(bytes.length<20||view.getUint32(0,true)!==0x46546c67||view.getUint32(8,true)!==bytes.length)throw new Error('Not a complete GLB.');
const jsonLength=view.getUint32(12,true),json=JSON.parse(bytes.subarray(20,20+jsonLength).toString()),binaryOffset=28+jsonLength;
const components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16};
for(const [index,accessor]of(json.accessors??[]).entries()){
  if(accessor.componentType!==5126||accessor.bufferView===undefined)continue;
  const buffer=json.bufferViews[accessor.bufferView],size=components[accessor.type],stride=buffer.byteStride??size*4,start=binaryOffset+(buffer.byteOffset??0)+(accessor.byteOffset??0);
  for(let row=0;row<accessor.count;row++)for(let component=0;component<size;component++)if(!Number.isFinite(view.getFloat32(start+row*stride+component*4,true)))throw new Error(`Non-finite accessor ${index}, element ${row}.`);
}
let triangles=0;const attributes=new Set();
for(const mesh of json.meshes??[])for(const primitive of mesh.primitives){if(primitive.mode!==undefined&&primitive.mode!==4)continue;triangles+=(json.accessors[primitive.indices??primitive.attributes.POSITION].count/3);Object.keys(primitive.attributes).forEach(name=>attributes.add(name));}
const report={path,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,triangles,attributes:[...attributes],
  scenes:(json.scenes??[]).map(scene=>scene.name),skins:(json.skins??[]).map(skin=>({joints:skin.joints.length})),
  animations:(json.animations??[]).map(animation=>({name:animation.name,tracks:animation.channels.length,targets:[...new Set(animation.channels.map(channel=>json.nodes[channel.target.node].name))]})),
  materials:(json.materials??[]).map(material=>({name:material.name??'',metallic:material.pbrMetallicRoughness?.metallicFactor??1,roughness:material.pbrMetallicRoughness?.roughnessFactor??1,normalMap:material.normalTexture!==undefined,pbrMap:material.pbrMetallicRoughness?.metallicRoughnessTexture!==undefined})),
  externalResources:[...(json.buffers??[]),...(json.images??[])].filter(resource=>resource.uri&&!resource.uri.startsWith('data:')).map(resource=>resource.uri),status:'STRUCTURAL INSPECTION ONLY; no visual acceptance'};
console.log(JSON.stringify(report,null,2));
