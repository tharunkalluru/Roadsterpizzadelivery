import {describe,it,expect}from'vitest';
import {makeFixtureCore}from'./fixture';
import {buildStreetLife}from'../../src/art/streetLife';
import {hashString}from'../../src/art/geo';
import type {Building,Storefront,WorldChunkV2}from'../../src/world/schema';
const building:Building={id:'block',osmId:'test',footprint:[[-15,-210],[-11,-210],[-11,-200],[-15,-200]],centroid:[-13,-205],heightM:6,levels:2,heightStatus:'provisional',name:null,kind:'commercial',frontRoadId:'A1',frontSide:'left'};
const id=Array.from({length:100},(_,i)=>`candidate-${i}`).find(s=>hashString(s)%5===0)!;
const front:Storefront={id,placeId:'raw-listing',name:'Unreviewed food listing',nameTe:null,category:'restaurant',group:'restaurant',confidence:.9,sources:['source'],license:'test',x:-11,z:-205,buildingId:'block',roadId:'A1',side:'left',facade:[[-11,-210],[-11,-200]],facingHeading:-Math.PI/2,floor:0,status:'provisional'};
const chunk=(b=building,fronts=[front]):WorldChunkV2=>({id:'test',ix:0,iz:0,buildings:[b],storefronts:fronts});
describe('researched street-life fidelity',()=>{
 it('keeps invented carts out of researched blocks and neighbouring surveyed chunks while retaining generic scenarios',()=>{
  const core=makeFixtureCore(),generic=buildStreetLife(chunk(),core,'low');expect(generic.userData.features).toHaveLength(1);expect(generic.children.length).toBeGreaterThan(0);
  for(const b of [{...building,surveyStyle:'observed-commercial'},{...building,researchedProfile:{sourceIds:['view'],appearanceStatus:'observed',dimensionStatus:'provisional',wallColor:'#ffffff',fronts:[]}}as Building]){
    expect(buildStreetLife(chunk(b),core,'low').userData.features).toHaveLength(0);
  }
  const neighbour={...front,id:'survey-neighbour',placeId:'survey:observed',buildingId:'next-building'};
  expect(buildStreetLife(chunk(building,[front,neighbour]),core,'low').userData.features).toHaveLength(0);
  const observed=buildStreetLife(chunk(building,[front,neighbour]),core,'low',[{id:'observed-pottery',kind:'pottery',x:-9,z:-220,heading:0,status:'street_observed'}]);
  expect(observed.userData.features).toHaveLength(1);expect(observed.userData.features[0].status).toBe('street_observed');expect(observed.userData.fidelity).toBe('source_positioned_provisional');
 });
});
