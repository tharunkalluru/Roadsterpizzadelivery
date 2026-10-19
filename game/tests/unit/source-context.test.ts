import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {attachLandscape,validateLandscape,type LandscapeData} from '../../src/world/landscape';
import {attachStationEntrances,validateStationEntrances,type StationEntranceData} from '../../src/world/stationEntrances';
import {buildSourceLandscape} from '../../src/art/sourceLandscape';
import {project} from '../../src/world/geo';
import type {WorldCore} from '../../src/world/schema';
import {attachPublicRealm,mergePublicRealmData,publicRealmWithTransport,publicRealmHeightAt,type PublicRealmData} from '../../src/world/publicRealm';
import {attachTransport,type TransportData} from '../../src/traffic/placements';
import {WorldPhysics} from '../../src/world/collision';
import {makeFixtureCore} from './fixture';
const read=<T>(path:string)=>JSON.parse(readFileSync(path,'utf8'))as T;
describe('source-backed environment context',()=>{
 it('keeps source polygons, holes, unknown elevations and front-facing geometry',()=>{
  const core=read<WorldCore>('public/world/hyd-metro/v2/core.json'),data=read<LandscapeData>('public/research/landscape.json');validateLandscape(data);attachLandscape(core,data);
  expect(data.features.filter(f=>f.kind==='water').length).toBe(data.summary.water);expect(data.features.filter(f=>f.kind==='land_use').length).toBe(data.summary.land_use);
  expect(data.features.every(f=>f.elevationStatus==='unknown')).toBe(true);
  const group=buildSourceLandscape(core);expect(group.children.length).toBeGreaterThan(1);
  for(const child of group.children){const mesh=child as import('three').Mesh;const normal=mesh.geometry.getAttribute('normal');for(let i=0;i<normal.count;i++)expect(normal.getY(i)).toBeGreaterThan(.99);mesh.geometry.dispose();for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])material.dispose();}
 });
 it('retains exact seven OSM entrance points with same-site association and no authored stairs',()=>{
  const core=read<WorldCore>('public/world/hyd-metro/v2/core.json'),data=read<StationEntranceData>('public/research/station-entrances.json');validateStationEntrances(data,core);const attached=attachStationEntrances(core,data);
  expect(data.entrances).toHaveLength(7);expect(attached.stations.flatMap(s=>s.entrances??[])).toHaveLength(7);
  for(const e of data.entrances){const[x,z]=project(e.lat,e.lon);expect(e.x).toBeCloseTo(x,3);expect(e.z).toBeCloseTo(z,3);expect(e.associationStatus).toBe('provisional');expect(e.distanceM).toBeLessThanOrEqual(150);expect(e).not.toHaveProperty('stairs');}
  expect(core.stations.every(s=>!s.entrances)).toBe(true);
 });
 it('audits actual mapped, photographed and scenario roadside layers as separate provenance',()=>{
  const raw=read<WorldCore>('public/world/hyd-metro/v2/core.json'),transport=read<TransportData>('public/research/transport.json'),core=attachTransport(raw,transport);
  const input=mergePublicRealmData(...['public-realm','observed-public-realm','scenario-public-realm'].map(name=>read<PublicRealmData>(`public/research/${name}.json`))),before=JSON.stringify(input),plan=attachPublicRealm(core,publicRealmWithTransport(core,input)),world=new WorldPhysics(core);
  expect(JSON.stringify(input)).toBe(before);expect(plan.features.some(f=>f.source.status==='street_observed')).toBe(true);expect(plan.features.some(f=>f.source.status==='scenario_overlay')).toBe(true);
  const transportMatched=new Set(core.transport.matches.map(m=>m.featureId));
  for(const f of plan.features)if(f.source.status==='source_mapped'&&['bus_stop','auto_stand'].includes(f.source.kind))expect(transportMatched.has(f.source.id)).toBe(true);
  for(const solid of plan.solids)for(let i=0;i<solid.poly.length;i++){const a=solid.poly[i],b=solid.poly[(i+1)%solid.poly.length];for(const t of [0,.5,1])expect(world.roads.surface(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,{maxY:.4,margin:0}),solid.id).toBeNull();}
  const kinds=Object.fromEntries([...new Set(plan.features.map(f=>f.source.kind))].sort().map(kind=>[kind,plan.features.filter(f=>f.source.kind===kind).length]));
  const scenarioIds=new Set(plan.features.filter(f=>f.source.status==='scenario_overlay').map(f=>f.source.id));
  expect(plan.surfaces.filter(p=>scenarioIds.has(p.id))).toHaveLength(36);
  console.log('PUBLIC_REALM_ATTACHMENT',JSON.stringify({kinds,applied:plan.features.length,rejected:plan.rejected.length,solids:plan.solids.length,surfaces:plan.surfaces.length,scenarioSurfaces:plan.surfaces.filter(p=>scenarioIds.has(p.id)).length}));
 });
 it('uses one smooth road-hazard surface and roadside solid plan for art and physics',()=>{
  const core=makeFixtureCore(),data:PublicRealmData={version:1,sources:[{id:'source',url:'https://www.openstreetmap.org/node/1'}],features:[{id:'speed',kind:'speed_breaker',sourceId:'source',x:0,z:-90,roadId:'A1',status:'source_mapped',heightM:.12},{id:'tree',kind:'tree',sourceId:'source',x:-15,z:-90,status:'source_mapped',widthM:.5,lengthM:.5,heightM:8}]};
  const plan=attachPublicRealm(core,data);expect(plan.surfaces).toHaveLength(1);expect(plan.solids).toHaveLength(1);const world=new WorldPhysics(core),p=plan.surfaces[0];
  expect(world.roads.groundHeight(p.x,p.z,'A1',0,.4)).toBeCloseTo(publicRealmHeightAt(plan,'A1',p.x,p.z));
  expect(world.roads.groundHeight(p.x,p.z,'A1',0,.4)).toBeGreaterThan(.1);
  expect(world.roads.groundHeight(p.x,p.z+10,'A1',0,.4)).toBe(0);
  expect(world.contacts(-15,-90,.2,.1,1).some(c=>c.id.startsWith('public:tree:'))).toBe(true);
  expect(world.contacts(0,-90,.2,.1,1)).toHaveLength(0);
 });
});
