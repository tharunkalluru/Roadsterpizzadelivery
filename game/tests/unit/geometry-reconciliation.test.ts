import { describe, expect, it } from 'vitest';
import { SourceAccuracyLayer, type BuildingGeometryReconciliation, type SourceAccuracyData } from '../../src/world/sourceAccuracy';
import { StreetSurvey } from '../../src/world/streetSurvey';
import type { StreetSurveyData } from '../../src/world/streetSurveyTypes';
import type { Building, WorldChunkV2 } from '../../src/world/schema';
import { WorldPhysics } from '../../src/world/collision';
import { makeFixtureCore } from './fixture';

function fixture(){
  const core=makeFixtureCore();
  const building:Building={id:'original',osmId:'way/1',footprint:[[-15,-105],[15,-105],[15,-85],[-15,-85]],heightM:7,heightStatus:'provisional',levels:null,name:null,kind:'yes',frontRoadId:'A1',frontSide:'left',centroid:[0,-95],intrudesCarriageway:true};
  const geometry:BuildingGeometryReconciliation={status:'clipped',geometryStatus:'provisional',method:'source_footprint_minus_carriageway',clearanceM:.45,sourceAreaM2:600,retainedAreaM2:342,retainedFraction:.57,roadIds:['A1'],sourceIds:['way/1'],notes:'Test-only difference from a provisional12m carriageway, not a measurement.',parts:[{footprint:[[-15,-105],[-6.45,-105],[-6.45,-85],[-15,-85]],holes:[],centroid:[-10.725,-95],areaM2:171},{footprint:[[6.45,-105],[15,-105],[15,-85],[6.45,-85]],holes:[],centroid:[10.725,-95],areaM2:171}]};
  const data:SourceAccuracyData={version:1,worldId:'test',worldVersion:'1',coreSha256:'',chunkDigest:'',sources:[],limitations:[],summary:{roads:{total:6,sourceWidth:0,inferredWidth:6},buildings:{total:1,sourceHeight:0,sourceFloors:0,satelliteEstimate:0,classFallback:1,sourceClass:0,sourceFacadeColour:0,sourceFacadeMaterial:0},frontages:{total:0,sourceContained:0,nearbyAmbiguous:0,unmatched:0,facadeEligible:0,listingOnly:0,reasonCounts:{}}},buildings:{original:{geometry}},frontages:{}};
  const surveyData:StreetSurveyData={schemaVersion:1,revision:1,worldId:'test',worldVersion:'1',generatedAt:'2026-10-18',referencePolicy:'Test fixture',sources:[],observations:[],roads:core.roads.map(r=>({roadId:r.id,left:{status:'unreviewed'},right:{status:'unreviewed'}})),storefrontOverrides:[],suppressions:[],corrections:[]};
  const chunk:WorldChunkV2={id:'test',ix:0,iz:0,buildings:[building],storefronts:[]};
  return{core,building,data,surveyData,chunk};
}
describe('provisional building mass reconciliation',()=>{
  it('shares every safe component with rendering and collision without translating source geometry',()=>{
    const{core,data,surveyData,chunk}=fixture(),before=structuredClone(chunk);
    const fixed=new StreetSurvey(surveyData,core).applyChunk(new SourceAccuracyLayer(data).applyChunk(chunk));
    expect(fixed.buildings.map(b=>b.id)).toEqual(['original','original:safe:1']);
    expect(fixed.buildings.every(b=>!b.intrudesCarriageway)).toBe(true);
    expect(fixed.buildings[0].geometryReconciliation).toMatchObject({geometryStatus:'provisional',parentBuildingId:'original',sourceFootprint:chunk.buildings[0].footprint});
    const physics=new WorldPhysics(core);physics.addChunk(fixed);
    expect(physics.contacts(0,-95,.1,1.2,1.2)).toEqual([]);
    expect(physics.contacts(-12,-95,.1,1.2,1).some(c=>c.id==='original')).toBe(true);
    expect(physics.contacts(12,-95,.1,1.2,1).some(c=>c.id==='original:safe:1')).toBe(true);
    expect(chunk).toEqual(before);
    physics.removeChunk('test');expect(physics.contacts(12,-95,.1,1.2,1)).toEqual([]);
  });
  it('keeps consumed outlines unresolved instead of making them road-blocking bodies',()=>{
    const{core,data,surveyData,chunk}=fixture();data.buildings.original.geometry={...data.buildings.original.geometry!,status:'unresolved',parts:[],retainedAreaM2:0,retainedFraction:0};
    const fixed=new StreetSurvey(surveyData,core).applyChunk(new SourceAccuracyLayer(data).applyChunk(chunk));
    expect(fixed.buildings).toHaveLength(1);expect(fixed.buildings[0].intrudesCarriageway).toBe(true);
    const physics=new WorldPhysics(core);physics.addChunk(fixed);expect(physics.contacts(0,-95,.1,1.2,1)).toEqual([]);
  });
  it('does not mark an authored height estimate verified',()=>{
    const{core,surveyData,chunk}=fixture();
    surveyData.sources.push({id:'photo',kind:'street_view',title:'Test photo',position:{lat:17.4146,lon:78.5484},url:'https://example.com/photo',captureDate:'2026-01',observedDate:'2026-10-18',reviewer:'test',notes:'Unmeasured visual estimate',assetPolicy:'reference_only'});
    surveyData.corrections.push({id:'height',kind:'building_height',buildingId:'original',heightM:1.1,levels:null,sourceIds:['photo'],notes:'Unmeasured plinth estimate.'});
    expect(new StreetSurvey(surveyData,core).applyChunk(chunk).buildings[0]).toMatchObject({heightM:1.1,heightStatus:'provisional'});
    surveyData.corrections.push({id:'width',kind:'road_width',roadId:'A1',widthM:10,sourceIds:['photo'],notes:'Estimated road width.'});
    expect(new StreetSurvey(surveyData,core).applyCoreCorrections(core).roads.find(r=>r.id==='A1')).toMatchObject({widthM:10,status:{width:'provisional'}});
    surveyData.corrections[1]={...surveyData.corrections[1],dimensionStatus:'verified'} as typeof surveyData.corrections[1];
    expect(()=>new StreetSurvey(surveyData,core)).toThrow('verified width requires field measurement evidence');
    surveyData.corrections.pop();
    surveyData.corrections[0]={...surveyData.corrections[0],dimensionStatus:'verified'} as typeof surveyData.corrections[0];
    expect(()=>new StreetSurvey(surveyData,core)).toThrow('field measurement evidence');
  });
});
