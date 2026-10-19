import {describe,it,expect,vi,afterEach} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {makeFixtureCore} from './fixture';
import {WorldPhysics} from '../../src/world/collision';
import type {WorldCore,MetroStation} from '../../src/world/schema';
import {attachStationGeometry,loadStationGeometry,validateStationGeometry,stationLayout,stationGeometrySummary,stationBodyBoxes,type StationGeometryData} from '../../src/world/stationGeometry';
import {buildMetro,stationObstacles} from '../../src/art/metro';
import {applyAuthoredContext} from './authored-context';
import {worldCompatibilityKey} from '../../src/world/identity';
import {SourceAccuracyLayer} from '../../src/world/sourceAccuracy';
import {StreetSurvey} from '../../src/world/streetSurvey';
import {forwardOf} from '../../src/world/roadIndex';
vi.mock('../../src/art/mats',async()=>{const three=await import('three');return{getWorldMats:()=>new Proxy({}, {get:()=>new three.MeshBasicMaterial({vertexColors:true})})};});
// Geometry tests run without a browser's canvas/fonts; text shaping is verified in browser QA.
vi.mock('../../src/art/sign',async()=>{const three=await import('three');return{TELUGU_FAMILY:'Test',ensureTeluguFont:async()=>{},createSignTexture:async()=>new three.Texture()};});
const read=<T>(p:string)=>JSON.parse(readFileSync(p,'utf8'))as T;
function fixture(){
 const core=makeFixtureCore(),station:MetroStation={id:'st_fixture',name:'Fixture Metro',sourceName:'Fixture Metro',nameTe:null,lines:['blue'],lat:0,lon:0,x:3,z:-450,osmIds:[],isDeliveryEntrance:false,inCorridor:true,status:{geometry:'scenario_overlay'}};
 core.stations=[station];
 const data:StationGeometryData={version:1,worldId:'hyd-metro',worldVersion:'fixture',sourceSnapshot:'fixture.json',snapshotSha256:'a'.repeat(64),license:'ODbL-1.0',attribution:'© OpenStreetMap contributors',sourceUrl:'https://www.openstreetmap.org/copyright',features:[{id:'envelope',stationId:station.id,sourceElementId:'way/123',sourceUrl:'https://www.openstreetmap.org/way/123',tags:{building:'train_station',layer:'1',network:'Hyderabad Metro'},footprint:[[-12,-530],[12,-530],[12,-370],[-12,-370]],centre:[0,-450],lengthM:160,widthM:24,axis:[0,-1],rectangularity:1,associationDistanceM:3,status:'source_mapped',dimensionStatus:'provisional',layoutStatus:'supported_envelope',note:'Fixture source geometry'}],unmatched:[],limitations:['Heights/details remain provisional']};
 return{core,data};
}
afterEach(()=>vi.unstubAllGlobals());
describe('conservative source station envelopes',()=>{
 it('adopts source horizontal dimensions on the matching line while preserving source coordinates and provisional heights',()=>{
  const{core,data}=fixture(),before=JSON.stringify(data),attached=attachStationGeometry(core,data),p=stationLayout(attached,core.stations[0])!;
  expect(JSON.stringify(data)).toBe(before);expect(core.stationGeometry).toBeUndefined();
  expect(p).toMatchObject({basis:'source_envelope',lengthM:160,widthM:24,x:0,z:-450,sourceFeatureId:'envelope',verticalStatus:'provisional',snapDistanceM:0});expect(p.alignment.lineId).toBe('blue');expect(attached.metro.deckHeightM).toBe(core.metro.deckHeightM);
 });
 it('does not relocate an envelope to a nearer line that does not serve the station',()=>{
  const{core,data}=fixture();core.metroLines[0].local=[[[30,-200],[30,-700]]];core.metroLines.push({...core.metroLines[0],id:'red',local:[[[0,-200],[0,-700]]]});
  const p=stationLayout(attachStationGeometry(core,data),core.stations[0])!;expect(p.alignment.lineId).toBe('blue');expect(p.basis).toBe('authored_fallback');expect(p.lengthM).toBe(140);expect(p.widthM).toBe(22);expect(p.unappliedReason).toMatch(/far/);
 });
 it.each(['MMTS','interchange','custom','orientation'] as const)('retains %s evidence without scaling the ordinary template',(kind)=>{
  const{core,data}=fixture();
  if(kind==='MMTS')data.features[0].tags={building:'train_station',operator:'South Central Railway',network:'MMTS'};
  if(kind==='interchange')core.stations[0].lines=['blue','red'];
  if(kind==='custom')data.features[0].layoutStatus='requires_custom_layout';
  if(kind==='orientation'){const f=data.features[0];f.axis=[1,0];f.footprint=[[-80,-462],[80,-462],[80,-438],[-80,-438]];}
  const attached=attachStationGeometry(core,data),p=stationLayout(attached,core.stations[0])!;expect(p.basis).toBe('authored_fallback');expect(p.lengthM).toBe(140);expect(p.widthM).toBe(22);expect(p.evidenceIds).toEqual(['envelope']);expect(stationGeometrySummary(attached).unapplied).toHaveLength(1);
 });
 it('rejects inconsistent dimensions, duplicate source elements and a mismatched world version',()=>{
  const{core,data}=fixture();expect(()=>attachStationGeometry(core,{...data,worldVersion:'wrong'})).toThrow(/another world/);
  const bad=structuredClone(data);bad.features[0].widthM=30;expect(()=>validateStationGeometry(bad)).toThrow(/dimensions/);
  const duplicate=structuredClone(data);duplicate.features.push({...duplicate.features[0],id:'another'});expect(()=>validateStationGeometry(duplicate)).toThrow();
 });
 it('hashes the exact loaded JSON for checkpoint compatibility and tolerates only an absent optional layer',async()=>{
  const{core,data}=fixture(),raw=JSON.stringify(data)+'\n';vi.stubGlobal('fetch',vi.fn(async()=>new Response(raw,{status:200})));
  const loaded=(await loadStationGeometry())!;expect(loaded.contentSha256).toBe(createHash('sha256').update(raw).digest('hex'));
  const manifest={worldId:'hyd-metro',version:'fixture',core:{sha256:'core'}}as import('../../src/world/schema').WorldManifest;
  expect(worldCompatibilityKey(manifest,null,null,{stationGeometry:loaded})).not.toBe(worldCompatibilityKey(manifest,null));
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:404})));expect(await loadStationGeometry()).toBeNull();
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:503})));await expect(loadStationGeometry()).rejects.toThrow(/503/);
 });
});
describe('shared authored station bodies',()=>{
 it.each([8.4,9,10.4])('keeps moving coaches on the rendered rails and outside platform edges on a %s m deck',async(deckWidth)=>{
  const{core,data}=fixture();core.metro.deckWidthM=deckWidth;const metro=buildMetro(attachStationGeometry(core,data),'low');await metro.userData.pending;
  metro.userData.update(45,new THREE.Vector3(0,0,-450));
  const trackX=Math.min(2.3,Math.max(1.75,Math.max(4.2,deckWidth/2)*.45)),service=metro.getObjectByName('metro-moving-service')!;
  let checked=0;service.traverse(o=>{if(!o.name.startsWith('coach-')||!o.visible||!o.parent?.visible)return;checked++;
   expect(Math.abs(o.position.x)).toBeCloseTo(trackX,8);
   // Below the platform top, the actual carriage geometry must fit inside the
   // 1.5 m rail-to-platform gap. Raised doors do not intersect that slab.
   o.traverse(child=>{if(!(child instanceof THREE.Mesh))return;const v=child.geometry.getAttribute('position');for(let i=0;i<v.count;i++)if(v.getY(i)+o.position.y<core.metro.deckHeightM+.9)expect(Math.abs(v.getX(i))).toBeLessThan(1.5);});
  });expect(checked).toBeGreaterThan(0);metro.userData.dispose?.();
 });
 it('renders and collides with the same source-sized platforms/concourse/roof, with clear ground and train passages',async()=>{
  const{core,data}=fixture(),attached=attachStationGeometry(core,data),world=new WorldPhysics(attached),solids=stationObstacles(attached);world.addStructures(solids);
  const metro=buildMetro(attached,'low');await metro.userData.pending;const station=metro.getObjectByName('station_st_fixture')!;
  expect(station.userData.horizontalEnvelope).toMatchObject({lengthM:160,widthM:24,basis:'source_envelope'});expect(station.userData.verticalGeometry).toBe('authored_provisional');
  const roof=station.getObjectByName('station-roof')as THREE.Mesh,vertices=roof.geometry.getAttribute('position'),x:number[]=[],z:number[]=[];
  for(let i=0;i<vertices.count;i++)if(vertices.getY(i)>core.metro.deckHeightM+4){x.push(vertices.getX(i));z.push(vertices.getZ(i));}
  const roofSolids=solids.filter(s=>s.id.startsWith('st_fixture:roof:')),rx=roofSolids.flatMap(s=>s.poly.map(p=>p[0])),rz=roofSolids.flatMap(s=>s.poly.map(p=>p[1]+450));
  expect(Math.min(...x)).toBeCloseTo(Math.min(...rx),4);expect(Math.max(...x)).toBeCloseTo(Math.max(...rx),4);expect(Math.min(...z)).toBeCloseTo(Math.min(...rz),4);expect(Math.max(...z)).toBeCloseTo(Math.max(...rz),4);
  const H=core.metro.deckHeightM,hit=(x:number,y:number,h=.2)=>world.contacts(x,-450,y,h,.25).filter(c=>c.id.startsWith('st_fixture:'));
  expect(hit(0,.05,1.15)).toEqual([]);expect(hit(0,H-5.3).some(c=>c.id.endsWith('concourse:floor'))).toBe(true);
  expect(hit(8,H+.2).some(c=>c.id.includes('platform:'))).toBe(true);expect(hit(0,H+1,1)).toEqual([]);
  expect(hit(0,H+6.5).some(c=>c.id.includes(':roof:'))).toBe(true);expect(hit(0,H+3,.5)).toEqual([]);
  expect(hit(11.75,H-4.4,.3).some(c=>c.id.includes('concourse:glass:'))).toBe(true);
  for(const b of stationBodyBoxes(160,24,H,2.025))expect(solids.some(s=>s.id===`st_fixture:${b.id}`)).toBe(true);
  metro.userData.dispose?.();
 });
 it('audits every actual source envelope and keeps irregular Nagole/MGBS as unapplied evidence',()=>{
  const core=read<WorldCore>('public/world/hyd-metro/v2/core.json'),data=read<StationGeometryData>('public/research/station-geometry.json');validateStationGeometry(data);
  const attached=attachStationGeometry(core,data),summary=stationGeometrySummary(attached);
  expect(summary.sourceEnvelopes).toBe(11);expect(summary.applied).toHaveLength(9);expect(summary.unapplied.map(s=>s.stationId).sort()).toEqual(['st_mahatma_gandhi_bus_station','st_nagole']);
  expect(applyAuthoredContext(core).stationGeometry?.snapshotSha256).toBe(data.snapshotSha256);
  const obstacles=stationObstacles(attached);for(const p of summary.applied){expect(p.snapDistanceM).toBeLessThanOrEqual(16);expect(obstacles.some(o=>o.id===`${p.stationId}:concourse:floor`)).toBe(true);}
  console.log('STATION_ENVELOPES',JSON.stringify(summary));
 });
 it('keeps authored elevated driving lanes clear with matching visible concourse portals',async()=>{
  const raw=read<WorldCore>('public/world/hyd-metro/v2/core.json'),source=new SourceAccuracyLayer(read('public/world/hyd-metro/v2/source-accuracy.json')).applyCore(raw),survey=new StreetSurvey(read('public/research/street-survey.json'),source),core=applyAuthoredContext(survey.applyCoreCorrections(source));
  const world=new WorldPhysics(core),solids=stationObstacles(core);world.addStructures(solids);
  const conflicts=new Set<string>();let samples=0;
  for(const e of world.nav.edges.values()){
   const road=world.roads.roads.get(e.roadId)!;if(Math.max(road.elevationM,...road.pointElevM)<1)continue;
   const lateral=road.oneway?-Math.max(0,road.widthM/2-2):-road.widthM/4;
   for(let d=3;d<e.lengthM-3;d+=2){const p=world.nav.pointOnDirected(e.id,d),[fx,fz]=forwardOf(p.heading);if(p.y<1)continue;samples++;
    for(const off of [-1,1])for(const c of world.contacts(p.x-fz*lateral+fx*off,p.z+fx*lateral+fz*off,p.y+.05,1.15,1.05))if(c.id.startsWith('st_'))conflicts.add(`${e.id}:${c.id}`);
   }
  }
  expect(samples).toBeGreaterThan(9000);expect([...conflicts]).toEqual([]);
  const metro=buildMetro(core,'low');await metro.userData.pending;
  for(const id of ['st_begumpet','st_paradise']){
   const st=core.stations.find(s=>s.id===id)!,layout=stationLayout(core,st)!,visual=metro.getObjectByName(`station_${id}`)!;
   expect(layout.clearancePortals.length).toBeGreaterThan(0);expect(visual.userData.clearancePortals).toEqual(layout.clearancePortals);
   expect(solids.some(s=>s.id.startsWith(`${id}:concourse:`)&&s.id.includes(':portal:'))).toBe(true);
  }
  metro.userData.dispose?.();
 });
});
