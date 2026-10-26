// A bounded, attributable input for the visible development component review.
// It extracts source records; it never changes alignments or vehicle behavior.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
const root=new URL('../',import.meta.url);
const read=async path=>JSON.parse(gunzipSync(await readFile(new URL(path,root))));
const source=process.argv[2]||new URL('game/public/transit/tgsrtc.pack.wasm',root);
const bytes=await readFile(source);
const feed=JSON.parse(gunzipSync(bytes)),id='754b5b9e50b5f96cc704',alignment=feed.alignments[id];
if(alignment?.status!=='inferred_legal_road_path')throw new Error('The original failing leg must be resolved before preparing its review.');
const pattern=feed.patterns.find(p=>p.alignmentIds.includes(id)),index=pattern.alignmentIds.indexOf(id);
const wanted=new Set(alignment.steps.map(s=>s.edge)),roads=new Map(),keep=edge=>{if(wanted.has(edge.id)&&!edge.ctx&&!roads.has(edge.id))roads.set(edge.id,edge);};
const core=await read('game/public/city/core.pack.wasm');core.roads.forEach(keep);
for(const pack of [...core.packs].sort((a,b)=>a.file.localeCompare(b.file))){const data=await read(`game/public/city/${pack.file}`);for(const tile of Object.values(data.tiles))tile.roads.forEach(keep);}
if(roads.size!==wanted.size)throw new Error('Every alignment edge must have its canonical source geometry.');
const stops=pattern.stops.slice(index,index+2),bounded={...feed,stops:Object.fromEntries(stops.map(s=>[s,feed.stops[s]])),patterns:[{...pattern,stops,alignmentIds:[id]}],alignments:{[id]:alignment}};
const keys=new Set();for(const edge of roads.values())for(const[x,z]of edge.pts)for(const dx of [-20,0,20])for(const dz of [-20,0,20])keys.add(`${Math.floor((x+dx)/1000)}_${Math.floor((z+dz)/1000)}`);
const tiles=[];for(const pack of core.packs.filter(p=>p.tiles.some(([i,j])=>keys.has(`${i}_${j}`)))){const data=await read(`game/public/city/${pack.file}`);for(const[key,tile]of Object.entries(data.tiles))if(keys.has(key))tiles.push(tile);}
const result={method:'Real-time isolated production component, prescribed placement, source tiles available for collision review; no other traffic',source:String(source),sourceSha256:createHash('sha256').update(bytes).digest('hex'),alignmentId:id,roadCount:roads.size,roads:[...roads.values()],origin:core.origin,indexedTiles:core.packs.flatMap(p=>p.tiles),metro:core.metro,tiles,feed:bounded};
await writeFile(new URL('game/bus-readiness-fixture.json',root),JSON.stringify(result));
console.log(JSON.stringify({alignment:id,route:pattern.number,from:feed.stops[stops[0]][0],to:feed.stops[stops[1]][0],lengthM:alignment.lengthM,roadCount:roads.size,sourceTileCount:tiles.length,sourceSha256:result.sourceSha256}));
