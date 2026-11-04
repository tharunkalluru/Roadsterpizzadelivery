// Reproducible reduced derivative of the project's already licensed CC0 head.
// Facial loops retain a finer grid than the scalp/neck; no runtime mesh reduction.
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../..');
const source = JSON.parse(fs.readFileSync(path.join(root, 'src/delivery/characters/anatomical-head.json'), 'utf8'));
const clusters = new Map(), remap = [], vertices = [];
for (let i = 0; i < source.positions.length; i += 3) {
  const v = source.positions.slice(i, i + 3);
  const step = v[2] > 1 && v[1] < 7.75 && v[1] > 6.35 ? .117 : .26;
  const key = v.map(n => Math.round(n / step)).join(',');
  let entry = clusters.get(key);
  if (!entry) { entry = { index: vertices.length, sum: [0, 0, 0], count: 0 }; clusters.set(key, entry); vertices.push(entry); }
  for (let k = 0; k < 3; k++) entry.sum[k] += v[k];
  entry.count++; remap.push(entry.index);
}
const positions = vertices.flatMap(v => v.sum.map(n => Number((n / v.count).toFixed(5))));
const indices = [], seen = new Set();
for (let i = 0; i < source.indices.length; i += 3) {
  const tri = source.indices.slice(i, i + 3).map(v => remap[v]);
  if (new Set(tri).size !== 3) continue;
  const key = [...tri].sort((a, b) => a - b).join(',');
  if (seen.has(key)) continue; seen.add(key); indices.push(...tri);
}
const result = { source: source.source, license: source.license, sourceSha256: source.sourceSha256,
  derivation: 'Fine facial-loop / coarse scalp vertex clustering, averaged shared normals. See scripts/art/derive-npc-head.mjs.',
  vertexCount: positions.length / 3, triangleCount: indices.length / 3, positions, indices };
const target = path.join(root, 'src/world/npc-head.json');
fs.writeFileSync(target, JSON.stringify(result) + '\n');
console.log(`${target}: ${result.vertexCount} vertices, ${result.triangleCount} triangles`);
// Already-low-detail static crowds keep a distinct reduced anatomical mesh.
const lowClusters=new Map(),lowMap=[],lowVertices=[];
for(let i=0;i<source.positions.length;i+=3){const v=source.positions.slice(i,i+3),step=v[2]>1&&v[1]<7.75&&v[1]>6.35?.30:.50,key=v.map(n=>Math.round(n/step)).join(',');let e=lowClusters.get(key);if(!e){e={index:lowVertices.length,sum:[0,0,0],count:0};lowClusters.set(key,e);lowVertices.push(e);}for(let k=0;k<3;k++)e.sum[k]+=v[k];e.count++;lowMap.push(e.index);}
const lowPositions=lowVertices.flatMap(v=>v.sum.map(n=>Number((n/v.count).toFixed(5)))),lowIndices=[],lowSeen=new Set();
for(let i=0;i<source.indices.length;i+=3){const tri=source.indices.slice(i,i+3).map(v=>lowMap[v]),key=[...tri].sort((a,b)=>a-b).join(',');if(new Set(tri).size<3||lowSeen.has(key))continue;lowSeen.add(key);lowIndices.push(...tri);}
fs.writeFileSync(path.join(root,'src/world/npc-head-low.json'),JSON.stringify({...result,derivation:'Static-crowd head, .50 coarse/.30 facial grid; generated alongside detailed head.',positions:lowPositions,indices:lowIndices,vertexCount:lowPositions.length/3,triangleCount:lowIndices.length/3})+'\n');
console.log(`Static-crowd head: ${lowPositions.length/3} vertices, ${lowIndices.length/3} triangles`);
