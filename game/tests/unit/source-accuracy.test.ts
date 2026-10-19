import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { SourceAccuracyLayer, type SourceAccuracyData, type SourcePlaceListingIndex } from '../../src/world/sourceAccuracy';
import { WorldLoader } from '../../src/world/loader';
import { WorldPhysics } from '../../src/world/collision';
import { StreetSurvey } from '../../src/world/streetSurvey';
import { buildingAccessPlan, buildingAccessObstacles, buildingAccessCutouts } from '../../src/world/buildingAccess';
import type { Building, Storefront, WorldChunkV2, WorldCore, WorldManifest } from '../../src/world/schema';
import { makeFixtureCore } from './fixture';

const base='public/world/hyd-metro/v2/';
const read=<T>(file:string)=>JSON.parse(readFileSync(file,'utf8')) as T;
const hash=(file:string)=>createHash('sha256').update(readFileSync(file)).digest('hex');
const manifest=read<WorldManifest>(base+'manifest.json');
const data=read<SourceAccuracyData>(base+manifest.sourceAccuracy!.file);
const layer=new SourceAccuracyLayer(data);
const rawCore=read<WorldCore>(base+manifest.core.file);
const chunks=manifest.chunks.map(c=>read<WorldChunkV2>(base+c.file));
const building:Building={id:'example',osmId:'source',footprint:[[100,100],[100,104],[104,104],[104,100]],centroid:[102,102],heightM:32,heightStatus:'provisional',levels:10,name:null,kind:'residential',frontRoadId:null,frontSide:null};
const sf:Storefront={id:'example',placeId:'source-place',name:'Source business',nameTe:null,category:'restaurant',group:'restaurant',confidence:.9,sources:['source'],license:'source',x:101,z:102,buildingId:'example',roadId:'A1',side:'left',facade:[[100,100],[104,100]],facingHeading:0,floor:1,status:'provisional'};
const chunk=(b:Building[],fronts:Storefront[]=[]):WorldChunkV2=>({id:'test',buildings:b,storefronts:fronts,pois:[],landmarks:[]} as unknown as WorldChunkV2);
const custom=(facts:SourceAccuracyData['buildings'])=>new SourceAccuracyLayer({...data,buildings:facts,frontages:{}});

afterEach(()=>vi.unstubAllGlobals());
describe('whole-map source accuracy',()=>{
  it('binds the overlay to the exact core and all frozen building chunks, with no missing frontages',()=>{
    expect(hash(base+manifest.core.file)).toBe(data.coreSha256);
    expect(hash(base+manifest.sourceAccuracy!.file)).toBe(manifest.sourceAccuracy!.sha256);
    const digest=createHash('sha256').update(manifest.chunks.slice().sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0).map(c=>`${c.id}:${c.sha256}`).join('\n')).digest('hex');
    expect(digest).toBe(data.chunkDigest);
    for(const c of manifest.chunks)expect(hash(base+c.file),c.id).toBe(c.sha256);
    expect([rawCore.roads.length,chunks.reduce((n,c)=>n+c.buildings.length,0),chunks.reduce((n,c)=>n+c.storefronts.length,0)]).toEqual([10276,80076,19507]);
    expect(Object.keys(data.frontages)).toHaveLength(19507);
    const b=data.summary.buildings,f=data.summary.frontages;
    expect(b.sourceHeight+b.sourceFloors+b.satelliteEstimate+b.classFallback).toBe(b.total);
    expect(f.sourceContained+f.nearbyAmbiguous+f.unmatched).toBe(f.total);
    expect(f.facadeEligible+f.listingOnly).toBe(f.total);
  });
  it('preserves sourced heights and floor counts before estimates, without inventing observed levels',()=>{
    const satellite={heightM:17,samplePixels:5,footprintPixels:5,validFraction:1,iqrM:1,presenceMedian:.9,year:2023 as const,effectiveResolutionM:4 as const};
    const apply=(facts:SourceAccuracyData['buildings']['example'])=>custom({example:facts}).applyChunk(chunk([building])).buildings[0];
    expect(apply({source:{heightM:20,numFloors:5,minHeightM:12},satellite})).toMatchObject({heightM:20,baseHeightM:12,heightBasis:'source_height',levels:5,heightStatus:'provisional'});
    expect(apply({source:{numFloors:3},satellite})).toMatchObject({heightM:10.2,heightBasis:'source_floors',levels:3});
    expect(apply({source:{class:'warehouse',subtype:'commercial',facadeColor:'#123456'},satellite})).toMatchObject({kind:'warehouse',heightM:17,heightBasis:'satellite_estimate',levels:null,facadeColor:'#123456'});
    expect(apply({})).toMatchObject({heightM:7,heightBasis:'class_fallback',levels:null,heightStatus:'provisional'});
    expect(custom({}).applyChunk(chunk([{...building,heightM:23,heightBasis:'street_review'}])).buildings[0].heightM).toBe(23);
  });
  it('applies all source/satellite facts to the full map and retains only quality-gated roof samples',()=>{
    const counts:Record<string,number>={};let bad=0,changed=0;
    for(const raw of chunks){const updated=layer.applyChunk(raw);for(let i=0;i<updated.buildings.length;i++){
      const b=updated.buildings[i],facts=data.buildings[b.id],s=facts?.satellite;counts[b.heightBasis!]=(counts[b.heightBasis!]??0)+1;
      changed+=Math.abs(b.heightM-raw.buildings[i].heightM)>.05?1:0;
      if(!Number.isFinite(b.heightM)||b.heightM<=0||b.heightStatus==='verified'||(!facts?.source?.numFloors&&b.levels!==null))bad++;
      if(s&&(s.samplePixels<2||s.samplePixels>s.footprintPixels||s.validFraction<.5||s.presenceMedian<.5||s.heightM<2.5||s.heightM>100||s.iqrM>Math.max(8,.75*s.heightM)+.11))bad++;
      if(facts?.source?.heightM&&Math.abs(b.heightM-facts.source.heightM)>.011)bad++;
      if(facts?.source?.numFloors&&b.levels!==facts.source.numFloors)bad++;
      if(facts?.source?.class&&b.kind!==facts.source.class)bad++;
      if(facts?.source?.facadeColor&&b.facadeColor!==facts.source.facadeColor)bad++;
    }}
    expect(bad).toBe(0);expect(changed).toBe(71283);
    expect(counts).toEqual({source_height:28,source_floors:231,satellite_estimate:50286,class_fallback:29531});
  });
  it('keeps every original business point and name, while rejecting displaced or opposite-side facade claims',()=>{
    let total=0,eligible=0,hidden=0,bad=0;
    for(const raw of chunks){const updated=layer.applyChunk(raw);for(let i=0;i<raw.storefronts.length;i++){
      const a=raw.storefronts[i],b=updated.storefronts[i],p=b.placement!;total++;
      if(a.id!==b.id||a.name!==b.name||a.x!==b.x||a.z!==b.z||a.facade!==b.facade||b.floor!==0||p.floorBasis!=='unknown')bad++;
      if(p.display==='facade'){eligible++;if(p.association!=='source_contained'||p.roadSide!=='supported'||p.displacementM>20||p.reasons.some(r=>r!=='legacy_inferred_floor'))bad++;}else hidden++;
      if((!a.buildingId||p.roadSide==='conflict')&&p.display!=='listing_only')bad++;
    }}
    expect([total,eligible,hidden,bad]).toEqual([19507,7641,11866,0]);
    expect(data.frontages.sf_b25085daf0).toMatchObject({display:'listing_only',association:'nearby_ambiguous',displacementM:136.16});
    expect(data.frontages.sf_735ea81866).toMatchObject({display:'listing_only',displacementM:82.61});
    const surveyed={...sf,id:'reviewed',placeId:'survey:reviewed',floor:1};
    expect(custom({}).applyChunk(chunk([], [sf,surveyed])).storefronts).toEqual([{...sf,floor:0,placement:{association:'unmatched',display:'listing_only',floorBasis:'unknown',displacementM:0,roadSide:'unknown',reasons:['missing_source_audit']}},surveyed]);
  });
  it('retains all 37,583 raw named listings independently of facade eligibility and loaded chunks',()=>{
    const listing=read<SourcePlaceListingIndex>(base+manifest.listingIndex!.file),byId=new Map(listing.places.map(p=>[p.id,p]));
    expect(hash(base+manifest.listingIndex!.file)).toBe(manifest.listingIndex!.sha256);
    expect([listing.count,listing.places.length,byId.size]).toEqual([37583,37583,37583]);
    let bad=0,linked=0;const roads=new Set(rawCore.roads.map(r=>r.id));
    for(const p of listing.places)if(p.positionStatus!=='source_listing'||!p.name.trim()||!Number.isFinite(p.x)||!Number.isFinite(p.z)||!roads.has(p.roadId)||!Array.isArray(p.licenses)||!Array.isArray(p.sources))bad++;
    for(const c of chunks)for(const sf of c.storefronts){const p=byId.get(sf.placeId);if(!p||p.frontageId!==sf.id||Math.abs(p.x-sf.x)>.011||Math.abs(p.z-sf.z)>.011)bad++;else linked++;}
    expect([bad,linked]).toEqual([0,19507]);
  });
  it('uses the same raised source building body for render-ready geometry and physical contacts',()=>{
    const raised=layer.applyChunk(chunk([{...building,id:'b_96d1c6da37'}])).buildings[0];
    expect(raised).toMatchObject({heightM:20,baseHeightM:12,heightBasis:'source_height'});
    const world=new WorldPhysics(makeFixtureCore(),500);world.addChunk(chunk([raised]));
    expect(world.contacts(102,102,.05,1.2,.5)).toEqual([]);
    expect(world.contacts(102,102,13,1.2,.5).some(c=>c.id===raised.id)).toBe(true);
    expect(world.contacts(102,102,21,1.2,.5)).toEqual([]);
  });
  it('preserves source courtyards as open space and collides with their inner walls',()=>{
    const world=new WorldPhysics(makeFixtureCore(),500);
    const courtyard={...building,footprint:[[100,100],[100,120],[120,120],[120,100]],holes:[[[104,104],[116,104],[116,116],[104,116]]]} as Building;
    world.addChunk(chunk([courtyard]));
    expect(world.buildingAt(110,110)).toBeNull();expect(world.contacts(110,110,.1,1.2,1)).toEqual([]);
    expect(world.buildingAt(102,110)?.id).toBe(courtyard.id);
    const insideHole=world.contacts(104.5,110,.1,1.2,1);expect(insideHole).toHaveLength(1);expect(insideHole[0]).toMatchObject({id:courtyard.id,nx:1,depth:.5});
    const insideWall=world.contacts(103.5,110,.1,1.2,.25);expect(insideWall).toHaveLength(1);expect(insideWall[0].nx).toBe(1);
    expect(world.contacts(103.5,110,33,1.2,.25)).toEqual([]);
    const originals=chunks.flatMap(c=>c.buildings).filter(b=>b.holes?.length);
    expect([originals.length,originals.reduce((n,b)=>n+b.holes!.length,0)]).toEqual([211,355]);
    for(const c of chunks)expect(layer.applyChunk(c).buildings.every((b,i)=>b.holes===c.buildings[i].holes)).toBe(true);
  });
  it('registers the shared researched stair bodies with chunk lifetime and height-aware clearance',()=>{
    const world=new WorldPhysics(makeFixtureCore(),500);
    const profiled:Building={...building,id:'access-fixture',footprint:[[-30,-100],[-14,-100],[-14,-80],[-30,-80]],centroid:[-22,-90],researchedProfile:{sourceIds:['dated-source'],appearanceStatus:'observed',dimensionStatus:'provisional',wallColor:'#dddddd',fronts:[{facade:[[-14,-100],[-14,-80]],facingHeading:-Math.PI/2,floors:[{baseM:0,heightM:4,glazingRatio:.3}],access:{landingHeightM:.8,landingDepthM:2,railings:true,stairs:[{at:.5,widthM:2,risers:4,runM:2}]}}]}};
    const plan=buildingAccessPlan(profiled,[],world.roads),bodies=buildingAccessObstacles(plan),step=plan.boxes.find(b=>b.kind==='step')!;
    expect(bodies.some(b=>b.id===step.id)).toBe(true);
    const [x,z]=step.centre;
    expect(world.contacts(x,z,.05,.1,.05)).toEqual([]);
    world.addChunk(chunk([profiled]));
    expect(world.contacts(x,z,.05,.1,.05).some(c=>c.id===step.id)).toBe(true);
    expect(world.contacts(x,z,step.top+.1,.1,.05).some(c=>c.id===step.id)).toBe(false);
    world.removeChunk('test');expect(world.contacts(x,z,.05,.1,.05)).toEqual([]);
    world.addChunk(chunk([profiled]));expect(world.contacts(x,z,.05,.1,.05).filter(c=>c.id===step.id)).toHaveLength(1);
    world.addChunk(chunk([profiled]));expect(world.contacts(x,z,.05,.1,.05).filter(c=>c.id===step.id)).toHaveLength(1);
    world.removeChunk('test');world.addChunk(chunk([{...profiled,intrudesCarriageway:true}]));
    expect(world.contacts(x,z,.05,.1,.05)).toEqual([]); // a dropped profile must not leave invisible steps
  });
  it('opens the lower recessed entrance with radius-safe side/back walls and a finite ceiling',()=>{
    const world=new WorldPhysics(makeFixtureCore(),500),frontX=-6.8;
    const profiled:Building={...building,id:'recess-fixture',heightM:12,footprint:[[-25,-100],[frontX,-100],[frontX,-80],[-25,-80]],centroid:[-16,-90],researchedProfile:{sourceIds:['dated-source'],appearanceStatus:'observed',dimensionStatus:'provisional',wallColor:'#dddddd',fronts:[{facade:[[frontX,-100],[frontX,-80]],facingHeading:-Math.PI/2,floors:[{baseM:0,heightM:4.4,glazingRatio:.3}],access:{landingHeightM:.8,landingDepthM:2,railings:false,stairs:[{at:.5,widthM:2,risers:4,runM:2}]}}]}};
    const plan=buildingAccessPlan(profiled,[],world.roads),cutout=buildingAccessCutouts(plan)[0];expect(cutout).toBeTruthy();
    world.addChunk(chunk([profiled]));
    const [a,b,,d]=cutout.poly,at=(u:number,n:number):[number,number]=>[a[0]+(b[0]-a[0])*u+(d[0]-a[0])*n,a[1]+(b[1]-a[1])*u+(d[1]-a[1])*n];
    // The canonical source facade used to act as an invisible wall across this open bay.
    for(let i=0;i<=8;i++){const [x,z]=at(.5,i/10);expect(world.contacts(x,z,2,.2,.12),`entrance step ${i}`).toEqual([]);}
    const [bx,bz]=at(.5,.99);expect(world.contacts(bx,bz,2,.2,.2).some(c=>c.id===profiled.id)).toBe(true);
    const [sx,sz]=at(.002,.5);expect(world.contacts(sx,sz,2,.2,.2).some(c=>c.id.startsWith('access:'))).toBe(true);
    const [x,z]=at(.5,.5),ceiling=world.contacts(x,z,cutout.top-.1,.2,.1).filter(c=>c.id===cutout.ceilingId);
    expect(ceiling.length).toBeGreaterThan(0);expect(ceiling.every(c=>c.vertical==='below'&&Math.abs(c.depth-.1)<1e-6)).toBe(true);
    expect(world.contacts(x,z,cutout.top+.2,.2,.1).some(c=>c.id===profiled.id)).toBe(true);
    world.removeChunk('test');expect(world.contacts(x,z,2,.2,.1)).toEqual([]);
  });
  it('applies surveyed dimensions last, keeping street-review classification stronger than satellite estimates',()=>{
    const survey=new StreetSurvey(read('public/research/street-survey.json'),layer.applyCore(rawCore));
    let count=0;
    for(const raw of chunks){const updated=survey.applyChunk(layer.applyChunk(raw));for(const b of updated.buildings)if(b.heightBasis==='street_review'){
      count++;const authored=survey.data.corrections.find(c=>(c.kind==='building_profile'||c.kind==='building_height')&&c.buildingId===b.id&&c.heightM!==undefined);
      expect(b.heightM).toBe(authored && 'heightM' in authored ? authored.heightM : undefined);
      expect(layer.applyChunk(chunk([b])).buildings[0].heightM).toBe(b.heightM);
    }}
    expect(count).toBeGreaterThan(0);
  });
  it('loads the hashed overlay before chunks and refuses a layer bound to a different core',async()=>{
    let wrong:'core'|'chunks'|null=null;
    const invalidData=()=>({...data,...(wrong==='core'?{coreSha256:'wrong'}:{chunkDigest:'wrong'})});
    vi.stubGlobal('fetch',async(url:string)=>{
      const path=url.replace('/test/','');
      if(path===manifest.sourceAccuracy!.file&&wrong)return new Response(JSON.stringify(invalidData()));
      if(path==='manifest.json'&&wrong){const changed={...manifest,sourceAccuracy:{...manifest.sourceAccuracy!,sha256:createHash('sha256').update(JSON.stringify(invalidData())).digest('hex')}};return new Response(JSON.stringify(changed));}
      return new Response(new Uint8Array(readFileSync(base+path)));
    });
    const signal=new AbortController().signal,loader=new WorldLoader('/test/');await loader.loadManifest(signal);await loader.loadCore(signal);
    expect(loader.integrityChecked).toBe(true);
    const ref=manifest.chunks.find(c=>chunks.find(q=>q.id===c.id)?.buildings.some(b=>b.id==='b_96d1c6da37'))!;
    expect((await loader.loadChunk(ref.id,signal)).buildings.find(b=>b.id==='b_96d1c6da37')).toMatchObject({heightM:20,baseHeightM:12});
    const index=await loader.loadPlaceListings(signal);expect(index?.count).toBe(37583);expect(await loader.loadPlaceListings(signal)).toBe(index);
    wrong='core';const mismatch=new WorldLoader('/test/');await mismatch.loadManifest(signal);await expect(mismatch.loadCore(signal)).rejects.toThrow('does not match this map');
    wrong='chunks';const wrongChunks=new WorldLoader('/test/');await wrongChunks.loadManifest(signal);await expect(wrongChunks.loadCore(signal)).rejects.toThrow('does not match these buildings');
  });
});
