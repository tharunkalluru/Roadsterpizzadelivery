import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { Batch, initTemplates } from '../../src/core/util';
import { drawStreetLamp, streetLampVolumes, type StreetLampSite, type StreetLampVolume } from '../../src/world/street-lamps';
import { metroStreetLampClearance } from '../../src/world/metro-street-lamp-clearance';
import { metroCorridors, metroPlatformAssemblies, metroDeckHeight, sampleMetroPath } from '../../src/world/metro-geometry';
import { buildTile, type TileZone } from '../../src/world/city';
import type { CoreData } from '../../src/world/types';
import type { StructureFootprint } from '../../src/world/structure-clearance';
import { prepareRoadGrades, currentRoadGradePatches, applyRoadGradePatches } from '../../src/world/road-grades';

const core:CoreData=JSON.parse(gunzipSync(readFileSync('public/city/core.pack.wasm')).toString());
const assemblies=metroPlatformAssemblies(core.metro.stations,metroCorridors(core.metro.lines),core.metro.deckHeight);
const site=(x=500,z=500,extra:Partial<StreetLampSite>={}):StreetLampSite=>({road:'fixture-road',kind:'road',x,z,inwardX:1,inwardZ:0,height:10,reach:2.6,...extra});
const straight=(deckHeight=12.5)=>({lines:[{id:'blue',pts:[[500,0],[500,1000]] as [number,number][]}],stations:[{id:'fixture-station',name:'Fixture station',p:[500,500] as [number,number],lines:['blue']}],deckHeight});

function contains(volume:StreetLampVolume,x:number,y:number,z:number){
  if(y<volume.bottom-1e-6||y>volume.top+1e-6)return false;
  const p=volume.footprint,dx=x-p.x,dz=z-p.z;
  return 'r'in p?Math.hypot(dx,dz)<=p.r+1e-6:Math.abs(dx*p.hx+dz*p.hz)<=p.hl+1e-6&&Math.abs(-dx*p.hz+dz*p.hx)<=p.hw+1e-6;
}

test('shared lamp clearance volumes contain every actual pole, arm, housing and emissive diffuser vertex',()=>{
  initTemplates();let checked=0;
  for(const yaw of [0,.31,.93,1.57,2.7,3.3,4.6,5.9])for(const base of [-3,0,7]){
    const candidate=site(200,300,{inwardX:Math.sin(yaw),inwardZ:Math.cos(yaw),base}),volumes=streetLampVolumes(candidate),geometry:{part:StreetLampVolume['part'];pos:number[]}[]=[];
    let box=0;
    const B={st:{add(...args:any[]){const b=new Batch();(b.add as any)(...args);geometry.push({part:'pole',pos:b.pos});},box(...args:any[]){const b=new Batch();(b.box as any)(...args);geometry.push({part:box++===0?'arm':'head',pos:b.pos});}},lit:{box(...args:any[]){const b=new Batch();(b.box as any)(...args);geometry.push({part:'head',pos:b.pos});}},glow:{add(){}}};
    const fixture=drawStreetLamp(B,candidate);
    assert.equal(fixture.head[1],base+9.6,'dynamic light point is deliberately below the housing; it cannot stand in for the geometry bounds');
    for(const mesh of geometry)for(let i=0;i<mesh.pos.length;i+=3){assert.ok(contains(volumes.find(v=>v.part===mesh.part)!,mesh.pos[i],mesh.pos[i+1],mesh.pos[i+2]),`${mesh.part} escaped its actual rendered envelope at yaw${yaw}`);checked++;}
  }
  assert.ok(checked>1000);
});

test('a clear pole does not allow its projecting arm or lamp head into station passenger space',()=>{
  const clearance=metroStreetLampClearance(straight());
  const candidate=site(510.5,500,{inwardX:-1});
  assert.equal(clearance.clearVolumes(streetLampVolumes(candidate).filter(p=>p.part==='pole')),true,'pole itself is outside the real concourse');
  const conflicts=clearance.conflicts(candidate);
  assert.ok(conflicts.some(c=>c.startsWith('arm:station:')));
  assert.ok(conflicts.some(c=>c.startsWith('head:station:')));
  assert.equal(clearance.clear(candidate),false);
  assert.equal(clearance.clear(site(520,500)),true,'unrelated clear kerb fixtures stay present');
  assert.equal(clearance.clear(site(505,500,{height:7})),true,'a fixture entirely below the actual floor is clear');
});

test('grade and separate deck levels are evaluated vertically rather than deleting every light below a metro line',()=>{
  const low=metroStreetLampClearance(straight()),high=metroStreetLampClearance(straight(30));
  assert.equal(low.clear(site()),false);
  assert.equal(high.clear(site()),true,'street light below an actually high station remains intact');
  assert.equal(low.clear(site(505,500,{base:40})),true,'a physically separate higher street level stays clear');
  const viaduct=metroStreetLampClearance({lines:straight().lines,stations:[],deckHeight:11});
  const headOnly=site(495.3,500,{reach:1.6});
  assert.equal(viaduct.clearVolumes(streetLampVolumes(headOnly).filter(p=>p.part==='pole')),true);
  assert.equal(viaduct.clear(headOnly),false,'arm and housing must respect the actual low viaduct slab too');
  assert.equal(viaduct.clear(site(495.3,500,{reach:1.6,height:8})),true);
  const actual=metroStreetLampClearance(core.metro);let slopeChecked=false;
  for(const c of metroCorridors(core.metro.lines))for(let s=30;s<c.center.len-30&&!slopeChecked;s+=20){
    const y=metroDeckHeight(c,s,core.metro.deckHeight),grade=(metroDeckHeight(c,s+1,core.metro.deckHeight)-metroDeckHeight(c,s-1,core.metro.deckHeight))/2;
    if(Math.abs(grade)<.005)continue;
    const p=sampleMetroPath(c.center,s);if(assemblies.some(a=>Math.hypot(a.frame.cx-p.x,a.frame.cz-p.z)<100))continue;
    const candidate=site(p.x-p.hz*5.1,p.z+p.hx*5.1,{base:y-8.5,height:9,inwardX:p.hz,inwardZ:-p.hx,reach:2.6});
    if(!actual.clearVolumes(streetLampVolumes(candidate).filter(v=>v.part==='pole')))continue;
    assert.ok(actual.conflicts(candidate).some(id=>(id.startsWith('arm:')||id.startsWith('head:'))&&id.includes(':deck')),'sampled pitched deck must reject the projecting fixture even though its mast stands outside the deck');
    slopeChecked=true;
  }
  assert.ok(slopeChecked,'exercise an actual retained interchange approach grade, not only flat synthetic levels');
});

test('all real line assemblies use their own concourse levels, including raised interchange profiles',t=>{
  const clearance=metroStreetLampClearance(core.metro),lines=new Set<string>();let raised=0;
  for(const a of assemblies){
    const {cx,cz,hx,hz}=a.frame, candidate=site(cx-hz*5,cz+hx*5,{inwardX:hz,inwardZ:-hx,height:a.deckHeight-4.2+.5});
    assert.equal(clearance.clear(candidate),false,a.key);
    assert.ok(clearance.conflicts(candidate).some(c=>c.includes(`station:${a.key}:concourse`)),a.key);
    if(a.deckHeight>core.metro.deckHeight+2)raised++;lines.add(a.lineId);
  }
  assert.deepEqual([...lines].sort(),['blue','green','red']);assert.ok(raised>0);
  assert.equal(metroStreetLampClearance(core.metro),clearance,'immutable source data shares one static index across tile workers');
  t.diagnostic(JSON.stringify({assemblies:assemblies.length,lines:[...lines],raisedInterchangeAssemblies:raised}));
});

function overlaps(a:StructureFootprint,b:StructureFootprint){
  if('r'in a&&'r'in b)return Math.hypot(a.x-b.x,a.z-b.z)<a.r+b.r;
  if('r'in a||'r'in b){const c=('r'in a?a:b) as Extract<StructureFootprint,{r:number}>,r=('r'in a?b:a) as Exclude<StructureFootprint,{r:number}>;const dx=c.x-r.x,dz=c.z-r.z;return Math.hypot(Math.max(0,Math.abs(dx*r.hx+dz*r.hz)-r.hl),Math.max(0,Math.abs(-dx*r.hz+dz*r.hx)-r.hw))<c.r;}
  for(const [x,z]of[[a.hx,a.hz],[-a.hz,a.hx],[b.hx,b.hz],[-b.hz,b.hx]]){const r=(p:typeof a)=>Math.abs(x*p.hx+z*p.hz)*p.hl+Math.abs(-x*p.hz+z*p.hx)*p.hw;if(Math.abs((a.x-b.x)*x+(a.z-b.z)*z)>=r(a)+r(b))return false;}return true;
}

test('actual retained city fixtures and emitters clear every generated station floor, access structure and source pillar',t=>{
  initTemplates();const packs=new Map<string,any>(),seen=new Set<string>(),patches=currentRoadGradePatches(prepareRoadGrades(core.roads));let fixtures=0,stationTiles=0;const otherConflicts:any[]=[];
  for(const a of assemblies){
    const i=Math.floor(a.source.p[0]/1000),j=Math.floor(a.source.p[1]/1000),key=`${i}_${j}`;if(seen.has(key))continue;seen.add(key);
    const pack=core.packs.find(p=>p.tiles.some(([x,z])=>x===i&&z===j))!;let data=packs.get(pack.file);if(!data){data=JSON.parse(gunzipSync(readFileSync(`public/city/${pack.file}`)).toString());packs.set(pack.file,data);}
    const zone:TileZone=data.tiles[key],tile=buildTile({...zone,roads:applyRoadGradePatches(zone.roads,patches)},{lowQ:true,metro:core.metro});stationTiles++;
    for(const f of tile.lampFixtures??[]){
      const reach=Math.hypot(f.head[0]-f.pole[0],f.head[2]-f.pole[2]);
      const candidate=site(f.pole[0],f.pole[2],{road:f.road,kind:f.kind,base:f.pole[1],height:f.head[1]-f.pole[1]+.4,reach,inwardX:f.head[0]-f.pole[0],inwardZ:f.head[2]-f.pole[2]});
      assert.ok(tile.lamps.some(p=>p.every((v,k)=>Math.abs(v-f.head[k])<1e-7)),'every retained dynamic emitter matches a retained physical fixture');
      for(const part of streetLampVolumes(candidate))for(const support of tile.structureSupports??[]){
        if(support.part!=='station_concourse'&&support.part!=='station_stairs'&&support.part!=='metro_pillar')continue;
        if(part.top<=support.bottom||part.bottom>=support.top||!overlaps(part.footprint,support.footprint))continue;
        if(support.part==='station_concourse')assert.fail(`${key} ${f.road} ${part.part} penetrates ${support.source} actual retained concourse`);
        else otherConflicts.push({tile:key,road:f.road,kind:f.kind,fixture:f,part:part.part,support,source:support.source});
      }
      fixtures++;
    }
    const reported = key==='-12_-11'?[-11404.722244529303,8.6,-10237.387563297874]:key==='-2_2'?[-1650.5065599078753,8.6,2632.0042877965016]:null;
    if(reported)assert.ok(!tile.lamps.some(p=>p.every((v,k)=>Math.abs(v-reported[k])<1e-6)),`${key}: a removed access-conflicting fixture must not leave its old light emitter`);
  }
  assert.ok(stationTiles>15&&fixtures>100,'exercise actual packed city geometry and preserve unrelated street lights');
  assert.deepEqual(otherConflicts,[],'keep the real retained external stairs, lift links and metro piers clear too');
  t.diagnostic(JSON.stringify({stationTiles,retainedStreetFixtures:fixtures,otherStructureConflicts:otherConflicts}));
});

test('mapped park lights retain clear fixtures and never leave an emissive head or emitter in a station concourse',()=>{
  initTemplates();const zone:TileZone={i:0,j:0,roads:[],nodes:{},buildings:[],boards:[],areas:[],furniture:[{kind:'street_lamp',name:null,p:[505,500]},{kind:'street_lamp',name:null,p:[530,500]}]};
  const built=buildTile(zone,{lowQ:true,metro:{...straight(),pillars:[]}});
  assert.ok(!built.lamps.some(p=>p[0]===505&&p[2]===500));
  assert.ok(built.lamps.some(p=>p[0]===530&&p[1]===8.6&&p[2]===500));
  for(const buffer of built.buffers.filter(b=>b.mat==='lit'))for(let i=0;i<buffer.pos.length;i+=3)
    assert.ok(!(Math.abs(buffer.pos[i]-505)<.3&&Math.abs(buffer.pos[i+1]-8.9)<.05&&Math.abs(buffer.pos[i+2]-500)<.3),'rejected park lamp emitted orphan diffuser geometry');
});

test('median pole obstacles are registered only for physically retained street fixtures',()=>{
  initTemplates();const road={id:'median-lamp-fixture',seg:'median-lamp-fixture',pts:[[100,500],[900,500]] as [number,number][],w:14,cls:'motorway',lanes:4,name:null,oneway:'forward' as const,elev:null,from:null,to:null,maxspeed:null};
  const built=buildTile({i:0,j:0,roads:[road],nodes:{},buildings:[],boards:[],furniture:[],areas:[]},{lowQ:false,metro:{...straight(),pillars:[]}}),obstacles=[...built.obstacles.values()].flat().filter(o=>o.r===.2);
  const medians=(built.lampFixtures??[]).filter(f=>f.kind==='median');assert.ok(medians.length>5);
  for(const f of medians)assert.ok(obstacles.some(o=>Math.hypot(o.x-f.pole[0],o.z-f.pole[2])<1e-6&&Math.abs(o.top-f.head[1]-.4)<1e-6));
  for(const obstacle of obstacles)assert.ok(medians.some(f=>Math.hypot(obstacle.x-f.pole[0],obstacle.z-f.pole[2])<1e-6),'a rejected pending mast cannot leave an invisible collider');
});
