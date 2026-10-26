// Resolve every canonical source node against shipped owner/context tiles.
// No rendering, browser state, source mutation or claims of street verification.
import { build } from '../game/node_modules/esbuild/lib/main.js';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url)), temp = await mkdtemp(join(tmpdir(), 'signal-city-'));
const at = process.argv.indexOf('--report'), reportPath = at < 0 ? null : resolve(process.argv[at + 1]);
try {
  await build({ stdin: {contents:"export * from './src/world/signals'; export * from './src/world/road-grades';",loader:'ts',resolveDir:join(root,'game')},outfile:join(temp,'audit.mjs'),bundle:true,format:'esm',platform:'node',logLevel:'error'});
  const {resolveSignalSites,prepareRoadGrades,roadGradePatches,applyRoadGradePatches}=await import(pathToFileURL(join(temp,'audit.mjs')));
  const core=JSON.parse(gunzipSync(await readFile(join(root,'game/public/city/core.pack.wasm')))), signals=core.trafficSignals || [];
  const changes=roadGradePatches(prepareRoadGrades(core.roads)), tileIndex=new Map(core.packs.flatMap(p=>p.tiles.map(([i,j])=>[`${i}_${j}`,p.file]))), wanted=new Set();
  for(const f of signals) for(let i=Math.floor((f.p[0]-80)/1000);i<=Math.floor((f.p[0]+80)/1000);i++) for(let j=Math.floor((f.p[1]-80)/1000);j<=Math.floor((f.p[1]+80)/1000);j++) if(tileIndex.has(`${i}_${j}`))wanted.add(`${i}_${j}`);
  const byPack=new Map();for(const key of wanted){const file=tileIndex.get(key),list=byPack.get(file)||[];list.push(key);byPack.set(file,list);}
  const sites=new Map(), resolvedSources=new Set(), unresolvedReasons=new Map(), buried=[], controls=[], siteSourceRoads=new Map();
  const inRing=(x,z,ring)=>{let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;};
  for(const[file,keys]of byPack){
    const pack=JSON.parse(gunzipSync(await readFile(join(root,'game/public/city',file))));
    for(const key of keys){
      const tile=pack.tiles[key];if(!tile)continue;
      const [i,j]=key.split('_').map(Number),source=signals.filter(f=>f.p[0]>=i*1000-80&&f.p[0]<(i+1)*1000+80&&f.p[1]>=j*1000-80&&f.p[1]<(j+1)*1000+80);
      const roads=applyRoadGradePatches(tile.roads,changes),r=resolveSignalSites(roads,source),byId=new Map(roads.map(e=>[e.id,e]));
      for(const s of r.sites){
        if(Math.floor(s.p[0]/1000)!==i||Math.floor(s.p[1]/1000)!==j)continue;
        sites.set(s.id,s);s.sourceIds.forEach(id=>resolvedSources.add(id));siteSourceRoads.set(s.id,key);
        for(const a of s.approaches){
          const e=byId.get(a.edge);if(!e)throw Error('Controller bound to missing road');
          if(a.dir===1?e.oneway==='forward':e.oneway==='backward')throw Error('Controller bound to illegal direction');
          controls.push({site:s.id,edge:a.edge,dir:a.dir,y:a.y,phase:a.phase});
          for(const b of tile.buildings||[]){if(b.h<a.pole[1]+5.8||!inRing(a.pole[0],a.pole[2],b.ring))continue;buried.push({site:s.id,sourceIds:s.sourceIds,approach:a.id,pole:a.pole,building:b.id});break;}
        }
      }
      for(const u of r.unresolved){const reasons=unresolvedReasons.get(u.id)||new Set();reasons.add(u.reason);unresolvedReasons.set(u.id,reasons);}
    }
  }
  const unresolved=signals.filter(s=>!resolvedSources.has(s.id)).map(s=>({id:s.id,p:s.p,name:s.name,reasons:[...unresolvedReasons.get(s.id)||['no-owned-controller']],sourceURL:s.sourceURL}));
  const report={schemaVersion:1,method:'All canonical public source nodes resolved against their shipped tile plus80m context and the exact runtime road-grade patches; not a road survey or browser test.',sourceDataTimestamp:core.trafficSignalSource?.sourceDataTimestamp,canonicalSourceNodes:signals.length,tilesVisited:wanted.size,packsVisited:byPack.size,controllers:sites.size,resolvedSourceNodes:resolvedSources.size,unresolvedSourceNodes:unresolved.length,approaches:controls.length,raisedApproaches:controls.filter(c=>c.y>1.5).length,buriedHeadPoles:buried.length,buried,unresolved,controllersByTile:[...sites].map(([id,s])=>({id,tile:siteSourceRoads.get(id),p:s.p,sourceIds:s.sourceIds,phaseCount:s.phaseCount,offset:s.offset,approaches:s.approaches.map(a=>({edge:a.edge,dir:a.dir,y:a.y,stopS:a.stopS,phase:a.phase}))}))};
  if(reportPath)await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({...report,controllersByTile:undefined,buried:buried.slice(0,8)},null,2));
}finally{await rm(temp,{recursive:true,force:true});}
