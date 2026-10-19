import {describe,it,expect} from 'vitest';
import {readFileSync,existsSync} from 'node:fs';
import {makeFixtureCore} from './fixture';
import {attachTransport,type TransportData,type TransportFeature} from '../../src/traffic/placements';
import {SourceAccuracyLayer} from '../../src/world/sourceAccuracy';
import type {WorldCore,WorldManifest} from '../../src/world/schema';
import {StreetSurvey,type StreetSurveyData} from '../../src/world/streetSurvey';
const source={id:'osm',url:'https://www.openstreetmap.org',license:'ODbL-1.0',fetchedAt:'2026-10-18'};
const point=(id:string,kind:TransportFeature['kind'],x:number,z:number):TransportFeature=>({id,kind,x,z,lat:17.4,lon:78.4,sourceId:'osm',sourceElementId:`node/${id}`,status:'source_mapped'});
const data=(features:TransportFeature[]):TransportData=>({version:1,worldId:'hyd-metro',worldVersion:'fixture',sources:[source],features});
describe('sourced transport attachment',()=>{
 it('keeps source points intact, maps the left kerb to the legal travel direction and enables real nearby signals',()=>{
  const core=makeFixtureCore();core.junctions=[{id:'j1',nodeId:'n1',incoming:[],outgoing:[],movementStatus:'provisional',signalled:false}];
  const input=data([point('stop','bus_stop',-8,-450),point('signal','signal',0,-1000),point('bridge','bus_stop',100,-1500)]),before=JSON.stringify(input);
  const mapped=attachTransport(core,input);
  expect(JSON.stringify(input)).toBe(before);expect(core.junctions[0].signalled).toBe(false);expect(mapped.junctions[0].signalled).toBe(true);
  expect(mapped.transport.matches.find(m=>m.featureId==='stop')).toMatchObject({roadId:'A1',side:-1,edgeIds:['A1:f'],alongM:450,status:'provisional'});
  expect(mapped.transport.unmatched.find(m=>m.featureId==='bridge')).toBeDefined();
 });
 it('retains a point between unrelated parallel carriageways as ambiguous instead of relocating it',()=>{
  const core=makeFixtureCore(),road=core.roads[0];core.roads.push({...road,id:'parallel',fromNode:'p0',toNode:'p1',points:[[14,0],[14,-1000]]});
  core.directed.push({...core.directed[0],id:'parallel:f',roadId:'parallel',fromNode:'p0',toNode:'p1'});
  const mapped=attachTransport(core,data([point('rank','auto_stand',7,-450)]));
  expect(mapped.transport.matches).toHaveLength(0);expect(mapped.transport.unmatched[0].reason).toMatch(/Ambiguous/);
 });
 it('rejects unproven, duplicated or mismatched-version input',()=>{
  const core=makeFixtureCore(),p=point('one','crossing',-6,-300);
  expect(()=>attachTransport(core,data([p,p]))).toThrow();expect(()=>attachTransport(core,{...data([p]),worldVersion:'other'})).toThrow();
 });
});
const have=existsSync('public/research/transport.json');
describe.skipIf(!have)('full-map sourced transport inventory',()=>{
 it('audits every supplied source point and never attaches stops to elevated or pedestrian roads',()=>{
  const base='public/world/hyd-metro/v2/',read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),m=read(base+'manifest.json') as WorldManifest,raw=read(base+m.core.file) as WorldCore;
  const sourceCore=new SourceAccuracyLayer(read(base+m.sourceAccuracy!.file)).applyCore(raw);
  const core=new StreetSurvey(read('public/research/street-survey.json') as StreetSurveyData,sourceCore).applyCoreCorrections(sourceCore),mapped=attachTransport(core,read('public/research/transport.json') as TransportData);
  expect(mapped.transport.matches.length+mapped.transport.unmatched.length).toBe(mapped.transport.features.length);
  for(const match of mapped.transport.matches){const r=core.roads.find(r=>r.id===match.roadId)!;expect(r.bridge||r.tunnel).toBe(false);expect(r.elevationM).toBeLessThanOrEqual(.4);expect(match.edgeIds.length).toBeGreaterThan(0);}
  const kinds=Object.fromEntries(['signal','bus_stop','auto_stand','crossing'].map(kind=>[kind,{source:mapped.transport.features.filter(f=>f.kind===kind).length,matched:mapped.transport.matches.filter(m=>mapped.transport.features.find(f=>f.id===m.featureId)!.kind===kind).length}]));
  console.log('TRANSPORT_ATTACHMENT',JSON.stringify({kinds,signalledJunctions:mapped.junctions.filter(j=>j.signalled).length,unmatched:mapped.transport.unmatched.length}));
 });
});
