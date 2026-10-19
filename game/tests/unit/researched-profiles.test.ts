import { describe,expect,it,vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { StreetSurvey } from '../../src/world/streetSurvey';
import type { WorldCore,WorldChunkV2 } from '../../src/world/schema';
import type { StreetSurveyData } from '../../src/world/streetSurveyTypes';
import { buildChunk } from '../../src/art/buildings';
import { appendResearchedBuilding,appendBuildingAccess,type ResearchedBuilders } from '../../src/art/researchedBuildings';
import { GeoBuilder } from '../../src/art/geo';
import { buildingAccessPlan } from '../../src/world/buildingAccess';
import { RoadIndex } from '../../src/world/roadIndex';
vi.mock('../../src/art/mats',async()=>{
  const three=await import('three');return {getWorldMats:()=>new Proxy({}, {get:()=>new three.MeshBasicMaterial({vertexColors:true})})};
});
vi.mock('../../src/art/sign',async()=>{
  const three=await import('three');return {createSignTexture:async()=>new three.Texture()};
});
const json=<T>(path:string)=>JSON.parse(readFileSync(path,'utf8'))as T;
const actual=()=>{
  const core=json<WorldCore>('public/world/hyd-metro/v2/core.json'),raw=json<WorldChunkV2>('public/world/hyd-metro/v2/chunks/c_-33_-15.json');
  const survey=new StreetSurvey(json<StreetSurveyData>('public/research/street-survey.json'),core),chunk=survey.applyChunk(raw);
  return {core:survey.applyCoreCorrections(core),chunk,building:chunk.buildings.find(b=>b.id==='b_8490a44a37')!};
};

describe('reusable researched building profiles',()=>{
  it('renders the dated Paradise curtain-wall block from profile data with its cladding and access',()=>{
    const {core,chunk,building}=actual();
    expect(building.researchedProfile).toMatchObject({appearanceStatus:'observed',dimensionStatus:'provisional',material:'mixed'});
    const group=buildChunk({...chunk,buildings:[building]},core,'standard');
    for(const name of ['researched-cladding','researched-glazing','researched-details'])expect(group.getObjectByName(name)).toBeTruthy();
    const glass=group.getObjectByName('researched-glazing')as THREE.Mesh;
    const bounds=new THREE.Box3().setFromObject(glass);expect(bounds.max.y).toBeLessThan(14.1);expect(bounds.max.y).toBeGreaterThan(13.5);
    group.updateMatrixWorld(true);
    const ray=new THREE.Raycaster(new THREE.Vector3(-6504,9,-3015),new THREE.Vector3(0,0,1),0,10);
    expect(ray.intersectObject(group,true)[0]?.object.name).toBe('researched-glazing');
    expect(group.getObjectByName('madhapur-blue-window-ribbons')).toBeUndefined();
  });
  it('keeps a researched recessed face visible instead of leaving a generic opaque skin over it',()=>{
    const {core,chunk,building}=actual(),copy=structuredClone(building);
    copy.researchedProfile!.fronts[0].setbackM=.8;
    const group=buildChunk({...chunk,buildings:[copy]},core,'standard');group.updateMatrixWorld(true);
    const ray=new THREE.Raycaster(new THREE.Vector3(-6504,9,-3015),new THREE.Vector3(0,0,1),0,10);
    const hit=ray.intersectObject(group,true)[0];expect(hit.object.name).toBe('researched-glazing');expect(hit.point.z).toBeGreaterThan(-3007);
  });
  it('batches many independent profiles into three builders while keeping low-quality observed composition',()=>{
    const {building}=actual(),roads=new RoadIndex({nodes:[],roads:[]}as unknown as WorldCore),B:ResearchedBuilders={cladding:new GeoBuilder(true),glazing:new GeoBuilder(true),details:new GeoBuilder(true)};
    const one:ResearchedBuilders={cladding:new GeoBuilder(true),glazing:new GeoBuilder(true),details:new GeoBuilder(true)};
    appendResearchedBuilding(building,building.researchedProfile!,[],one,'low');
    appendBuildingAccess(buildingAccessPlan(building,[],roads),one);
    for(let i=0;i<20;i++){
      const b=structuredClone(building),dx=i*60;b.id=`profile-${i}`;
      b.footprint=b.footprint.map(([x,z])=>[x+dx,z]);b.centroid=[b.centroid[0]+dx,b.centroid[1]];
      for(const f of b.researchedProfile!.fronts)if(f.facade)f.facade=f.facade.map(([x,z])=>[x+dx,z])as typeof f.facade;
      appendResearchedBuilding(b,b.researchedProfile!,[],B,'low');
      appendBuildingAccess(buildingAccessPlan(b,[],roads),B);
    }
    for(const key of ['cladding','glazing','details']as const){expect(B[key].vcount).toBe(one[key].vcount*20);expect(B[key].vcount).toBeGreaterThan(0);}
    // All profiles share the same three output meshes; no branding or material-per-shop allocation occurs here.
    expect(Object.keys(B)).toHaveLength(3);
  });
  it('preserves arched opening silhouettes and balcony rails in the shared low-quality geometry',()=>{
    const {building}=actual(),b={...building,heightM:8,researchedProfile:{sourceIds:['test-observation'],appearanceStatus:'observed' as const,dimensionStatus:'provisional' as const,wallColor:'#ddd2bc',fronts:[{facade:[[0,0],[8,0]]as [[number,number],[number,number]],facingHeading:Math.PI,floors:[{baseM:4,heightM:3,glazingRatio:.8,openingShape:'arched' as const,glassColor:'#16211f',balustrade:{heightM:.72,color:'#85694f',spacingM:.2}}]}]}};
    const B:ResearchedBuilders={cladding:new GeoBuilder(true),glazing:new GeoBuilder(true),details:new GeoBuilder(true)};
    appendResearchedBuilding(b,b.researchedProfile,[],B,'low');
    const scene=new THREE.Group();for(const [key,builder]of Object.entries(B)){const mesh=new THREE.Mesh(builder.build(),new THREE.MeshBasicMaterial());mesh.name=key;scene.add(mesh);}scene.updateMatrixWorld(true);
    const hit=(x:number)=>new THREE.Raycaster(new THREE.Vector3(x,6.8,5),new THREE.Vector3(0,0,-1),0,10).intersectObject(scene,true)[0]?.object.name;
    expect(hit(4)).toBe('glazing');expect(hit(6.9)).toBe('cladding'); // opaque arch shoulders, open curved centre
    const rails=new THREE.Box3().setFromObject(scene.getObjectByName('details')!);expect(rails.min.y).toBeGreaterThan(4.3);expect(rails.max.y).toBeLessThan(5.2);
    expect(B.glazing.vcount).toBeGreaterThan(4); // native curve, not a rectangular texture patch
  });

});
