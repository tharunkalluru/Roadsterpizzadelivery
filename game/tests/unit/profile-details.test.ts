import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {appendResearchedBuilding,type ResearchedBuilders} from '../../src/art/researchedBuildings';
import {GeoBuilder} from '../../src/art/geo';
import type {Building} from '../../src/world/schema';
import type {ResearchedBuildingProfile} from '../../src/world/buildingProfile';
const builders=():ResearchedBuilders=>({cladding:new GeoBuilder(true),glazing:new GeoBuilder(true),details:new GeoBuilder(true)});
const building:Building={id:'facade',osmId:'test',footprint:[[0,0],[4,0],[4,-2],[0,-2]],centroid:[2,-1],heightM:4,heightStatus:'provisional',levels:1,name:null,kind:'yes',frontRoadId:null,frontSide:null};
const profile=(details:Partial<ResearchedBuildingProfile['fronts'][number]>):ResearchedBuildingProfile=>({sourceIds:['dated-source'],appearanceStatus:'observed',dimensionStatus:'provisional',wallColor:'#ddd8ce',fronts:[{facade:[[0,0],[4,0]],facingHeading:Math.PI,floors:[],...details}]});
describe('observed fine facade geometry',()=>{
 it('keeps actual holes in a patterned screen, with the solid facade visible behind them',()=>{
  for(const quality of ['low','standard','high']as const){
   const B=builders(),p=profile({screens:[{outline:[[0,1],[1,1],[1,3],[0,3]],color:'#ffffff',outsetM:.4,cellM:.5,pattern:'lattice'}]});
   appendResearchedBuilding(building,p,[],B,quality);
   const mesh=new THREE.Mesh(B.cladding.build(),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.updateMatrixWorld(true);
   const z=(x:number)=>new THREE.Raycaster(new THREE.Vector3(x,1.5,3),new THREE.Vector3(0,0,-1),0,5).intersectObject(mesh)[0].point.z;
   expect(z(.5)).toBeLessThan(0); // see through a real perforation
   expect(z(.75)).toBeCloseTo(.4,4); // adjacent cladding remains
   expect(new THREE.Box3().setFromObject(mesh).max.y).toBeLessThanOrEqual(4.01);
   mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();
  }
 });
 it('draws light strings as small cables/bulbs instead of structural bars',()=>{
  const B=builders(),p=profile({accents:[{start:.5,end:.501,baseM:1,heightM:2,color:'#bba977',outsetM:.24,depthM:.012,kind:'light_string'}]});
  appendResearchedBuilding(building,p,[],B,'standard');
  const g=B.details.build();g.computeBoundingBox();const bounds=g.boundingBox!;
  expect(bounds.max.x-bounds.min.x).toBeLessThan(.025);
  expect(bounds.max.z-bounds.min.z).toBeLessThan(.035);
  expect(bounds.max.y-bounds.min.y).toBeCloseTo(2,3);
  expect(B.details.vcount).toBeGreaterThan(24);g.dispose();
 });
 it('places newly researched opposite shops on their own south carriageways without promoting measurement status',()=>{
  const data=JSON.parse(readFileSync('public/research/street-survey.json','utf8'));
  const neo=data.storefrontOverrides.find((s:{id:string})=>s.id==='survey-madhapur-neoskin-upper');
  const pink=data.storefrontOverrides.find((s:{id:string})=>s.id==='survey-madhapur-orange-rooms-entry');
  expect(neo).toMatchObject({roadId:'r_40440366761_0',floor:2,placementStatus:'provisional'});
  expect(pink).toMatchObject({roadId:'r_68215911684_0',floor:0,placementStatus:'provisional'});
  expect(data.corrections.find((c:{id:string})=>c.id==='profile-madhapur-sculpt-bestvision-block').profile.dimensionStatus).toBe('provisional');
 });
});
