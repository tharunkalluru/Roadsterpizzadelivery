import {describe,it,expect,vi}from'vitest';
import {readFileSync}from'node:fs';
import * as THREE from'three';
import {makeFixtureCore}from'./fixture';
import {RoadIndex}from'../../src/world/roadIndex';
import {attachTransport,type TransportData}from'../../src/traffic/placements';
import {attachPublicRealm,mergePublicRealmData,planPublicRealm,publicRealmHeightAt,publicRealmSurfaceHeight,publicRealmWithTransport,validatePublicRealm,type PublicRealmData,type PublicRealmFeature}from'../../src/world/publicRealm';
import {SourceAccuracyLayer}from'../../src/world/sourceAccuracy';
import {StreetSurvey,type StreetSurveyData}from'../../src/world/streetSurvey';
import {GeoBuilder,makeSamples}from'../../src/art/geo';
import {appendPatchedRoadSurface}from'../../src/art/roads';
import {buildPublicRealm}from'../../src/art/publicRealm';
import {atmosphereLighting}from'../../src/art/environment';
import {createMetroService}from'../../src/art/metroTrains';
import {createTrafficTemplates}from'../../src/art/traffic';
vi.mock('../../src/art/mats',()=>({getWorldMats:()=>({})}));
const source={id:'test',url:'https://www.openstreetmap.org',license:'ODbL-1.0'};
const feature=(id:string,kind:PublicRealmFeature['kind'],x:number,z:number,extra:Partial<PublicRealmFeature>={}):PublicRealmFeature=>({id,kind,x,z,sourceId:'test',status:'source_mapped',geometryStatus:'provisional',...extra});
const data=(features:PublicRealmFeature[]):PublicRealmData=>({version:1,sources:[source],features});

describe('shared sourced public realm',()=>{
  it('preserves raw positions, honours no shelter and rejects furniture in a carriageway',()=>{
    const core=makeFixtureCore(),input=data([feature('stop','bus_stop',-6,-350,{tags:{shelter:'no'}}),feature('tree','tree',0,-400),feature('tree-side','tree',-10,-400)]),before=JSON.stringify(input),plan=planPublicRealm(input,core);
    expect(JSON.stringify(input)).toBe(before);expect(plan.rejected).toContainEqual({id:'tree',reason:'furniture_overlaps_carriageway'});
    const stop=plan.features.find(f=>f.source.id==='stop')!;expect(stop.source.x).toBe(-6);expect(stop.x).toBeLessThan(-6);expect(stop.widthM).toBe(.55);
    expect(plan.solids.filter(s=>s.id.includes(':stop:'))).toHaveLength(1);
    const rendered=buildPublicRealm(plan,core,'low');expect(rendered.userData.sourceFeatures).toBe(2);
    const mesh=rendered.getObjectByName('public-furniture')as THREE.Mesh;expect(mesh.geometry.getAttribute('position').count).toBeGreaterThan(30);
  });
  it('only uses matched transport points, preserving an unmatched listing instead of inventing a shelter',()=>{
    const core=makeFixtureCore(),a=feature('stop','bus_stop',-8,-450),b=feature('far','bus_stop',-2500,-2500);
    const transport={version:1,worldId:'hyd-metro',worldVersion:'fixture',sources:[{...source,fetchedAt:'2026-10-18'}],features:[a,b].map(f=>({...f,lat:17.4,lon:78.4,sourceElementId:`node/${f.id}`}))}as TransportData;
    const mapped=attachTransport(core,transport),combined=publicRealmWithTransport(mapped,data([a,b]));
    expect(mapped.transport.unmatched.some(f=>f.featureId==='far')).toBe(true);expect(combined.features.map(f=>f.id)).toEqual(['stop']);expect(combined.features[0].roadId).toBe('A1');expect(combined.features[0].side).toBe(-1);
  });
  it('shares smooth physical and rendered humps, depressions and low rumble strips without changing neighbouring roads',()=>{
    const core=makeFixtureCore(),plan=attachPublicRealm(core,data([feature('hump','speed_breaker',0,-450,{variant:'hump'}),feature('hole','pothole',-3,-500),feature('rumble','speed_breaker',0,-600,{variant:'rumble_strip'})]));
    expect(plan.surfaces).toHaveLength(3);const hump=plan.surfaces[0],hole=plan.surfaces[1],rumble=plan.surfaces[2];
    expect(publicRealmSurfaceHeight(hump,0,-450)).toBeCloseTo(.11);expect(publicRealmSurfaceHeight(hole,-3,-500)).toBeCloseTo(-.09);expect(publicRealmSurfaceHeight(rumble,0,-600)).toBeCloseTo(.025);
    expect(publicRealmHeightAt(plan,'B',0,-450)).toBe(0);expect(publicRealmSurfaceHeight(hump,0,-460)).toBe(0);
    for(const sign of [-1,1])expect(Math.abs(publicRealmSurfaceHeight(hump,hump.x,hump.z+sign*hump.lengthM/2))).toBeLessThan(1e-6);
    const builder=new GeoBuilder(),samples=makeSamples([[0,0],[0,-1000]],0);appendPatchedRoadSurface(builder,samples,12,plan.surfaces);
    // Long untouched portions remain coarse; each affected vertex obeys exactly the shared height function.
    expect(builder.vcount).toBeLessThan(30000);
    for(let i=0;i<builder.pos.length;i+=3)expect(builder.pos[i+1]).toBeCloseTo(publicRealmHeightAt(plan,'A1',builder.pos[i],builder.pos[i+2]),6);
    for(let i=0;i<builder.idx.length;i+=3){const p=builder.idx.slice(i,i+3).map(j=>new THREE.Vector3(...builder.pos.slice(j*3,j*3+3)));expect(p[1].clone().sub(p[0]).cross(p[2].clone().sub(p[0])).y).toBeGreaterThanOrEqual(0);}
    expect(new RoadIndex(core).groundHeight(0,-450,'A1',0,1)).toBeCloseTo(.11);
  });
  it('validates the actual source snapshot and avoids solid street furniture in every mapped carriageway',()=>{
    const base='public/world/hyd-metro/v2/',manifest=JSON.parse(readFileSync(base+'manifest.json','utf8')),raw=JSON.parse(readFileSync(base+'core.json','utf8'));
    const accuracy=new SourceAccuracyLayer(JSON.parse(readFileSync(base+manifest.sourceAccuracy.file,'utf8'))),sourceCore=accuracy.applyCore(raw),survey=new StreetSurvey(JSON.parse(readFileSync('public/research/street-survey.json','utf8'))as StreetSurveyData,sourceCore,{worldVersion:sourceCore.manifestVersion});
    const core=attachTransport(survey.applyCoreCorrections(sourceCore),JSON.parse(readFileSync('public/research/transport.json','utf8')));
    const layers=['public-realm','observed-public-realm','scenario-public-realm'].map(n=>JSON.parse(readFileSync(`public/research/${n}.json`,'utf8'))as PublicRealmData),input=publicRealmWithTransport(core,mergePublicRealmData(...layers));
    expect(()=>validatePublicRealm(input)).not.toThrow();const plan=planPublicRealm(input,core);
    expect(plan.features.filter(f=>f.source.kind==='streetlight').length).toBeGreaterThan(100);expect(plan.features.filter(f=>f.source.kind==='tree').length).toBeGreaterThan(100);expect(plan.surfaces.length).toBeGreaterThan(0);expect(plan.surfaces.filter(f=>f.kind==='speed_breaker').length+plan.rejected.filter(r=>input.features.find(f=>f.id===r.id)?.kind==='speed_breaker').length).toBe(input.features.filter(f=>f.kind==='speed_breaker').length);
    for(const f of layers[1].features)expect(plan.features.some(p=>p.source.id===f.id),JSON.stringify(plan.rejected.find(p=>p.id===f.id))).toBe(true);
    expect(layers[2].features).toHaveLength(72);expect(layers[2].features.every(f=>f.status==='scenario_overlay'&&f.geometryStatus==='provisional')).toBe(true);
    expect(plan.features.filter(f=>f.source.status==='scenario_overlay'&&f.source.kind==='pothole')).toHaveLength(36);
    const roads=new RoadIndex(core);
    for(const s of plan.solids)for(const [x,z]of s.poly)expect(roads.surface(x,z,{maxY:.4,margin:.1}),s.id).toBeNull();
    const counts=(items:{kind:string}[])=>Object.fromEntries([...new Set(items.map(f=>f.kind))].map(k=>[k,items.filter(f=>f.kind===k).length]));
    console.info('Public realm audit',JSON.stringify({input:counts(input.features),planned:counts(plan.features.map(f=>f.source)),status:counts(plan.features.map(f=>({kind:f.source.status}))),rejected:counts(plan.rejected.map(f=>({kind:f.reason}))),solidBodies:plan.solids.length,surfacePatches:plan.surfaces.length}));
  });
  it('changes daylight/rain lighting coherently and derives metro sound from moving nearby services',()=>{
    const day=atmosphereLighting({timeOfDay:'day',weather:'clear'}),night=atmosphereLighting({timeOfDay:'night',weather:'clear'}),rain=atmosphereLighting({timeOfDay:'day',weather:'rain'});
    expect(night.sunIntensity).toBeLessThan(day.sunIntensity*.1);expect(rain.sunIntensity).toBeLessThan(day.sunIntensity);expect(night.environment).toBeLessThan(day.environment);
    const service=createMetroService([{samples:makeSamples([[0,0],[0,-1500]],12),stations:[750],color:'#0088bb'}],'low',2.2);service.userData.update(45,new THREE.Vector3(0,0,-500));
    const coach=service.getObjectByName('coach-2')!;service.userData.update(45,coach.position.clone());expect(service.userData.nearbySound).toBeGreaterThan(.2);
    service.userData.update(45,new THREE.Vector3(20000,0,20000));expect(service.userData.nearbySound).toBe(0);service.userData.dispose();
    const cycle=createTrafficTemplates('low').bicycle;expect(cycle).toMatchObject({kind:'bicycle',length:1.85,width:.65,height:1.65});
    for(const n of ['bicycle-cranks','bicycle-wheel-front','bicycle-wheel-rear'])expect(cycle.object.getObjectByName(n)).toBeDefined();
  });
});
