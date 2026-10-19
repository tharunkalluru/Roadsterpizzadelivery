import { describe,expect,it,vi } from 'vitest';
import * as THREE from 'three';
import type { Building,Storefront,WorldChunkV2,WorldCore } from '../../src/world/schema';
import { buildChunk } from '../../src/art/buildings';
import { buildStorefronts } from '../../src/art/storefronts';
vi.mock('../../src/art/mats',async()=>{
  const three=await import('three');return {getWorldMats:()=>new Proxy({}, {get:()=>new three.MeshBasicMaterial({vertexColors:true})})};
});
vi.mock('../../src/art/frontAtlas',async(importOriginal)=>{
  const actual=await importOriginal<typeof import('../../src/art/frontAtlas')>();const three=await import('three');return {...actual,getFrontAtlas:()=>new three.Texture()};
});
vi.mock('../../src/art/sign',async()=>{
  const three=await import('three');return {TELUGU_FAMILY:'Test',ensureTeluguFont:async()=>{},createSignTexture:async()=>new three.Texture()};
});
const core={nodes:[],roads:[],metro:{lines:[]},metroStructure:{pillars:[]},stations:[],structures:[]}as unknown as WorldCore;
const building:Building={id:'raised-source',osmId:'way/1',footprint:[[0,0],[0,4],[4,4],[4,0]],centroid:[2,2],heightM:20,baseHeightM:12,heightStatus:'provisional',heightBasis:'source_height',levels:2,name:null,kind:'residential',frontRoadId:null,frontSide:null,sourceProperties:{class:'warehouse',heightM:20,minHeightM:12,facadeColor:'#ff0000',facadeMaterial:'brick',roofColor:'#0000ff'}};
const storefront:Storefront={id:'listing',placeId:'listing',name:'Unplaced business',nameTe:null,category:'restaurant',group:'restaurant',confidence:.9,sources:['source'],license:'test',x:2,z:0,buildingId:building.id,roadId:'road',side:'left',facade:[[0,0],[4,0]],facingHeading:0,floor:0,status:'provisional',placement:{association:'nearby_ambiguous',display:'listing_only',floorBasis:'unknown',displacementM:20,roadSide:'unknown',reasons:['outside_footprint']}};
const chunk=(fronts:Storefront[]=[]):WorldChunkV2=>({id:'source',buildings:[building],storefronts:fronts,pois:[],landmarks:[]}as unknown as WorldChunkV2);
const canvas=()=>{
  const context=new Proxy({measureText:(s:string)=>({width:s.length*24})},{get:(o,key)=>key in o?o[key as keyof typeof o]:()=>{}});
  vi.stubGlobal('document',{createElement:()=>({width:0,height:0,getContext:()=>context})});
};

describe('source-aware world art',()=>{
  it('uses sourced colours and min-height without rendering a wall down to the road',()=>{
    const group=buildChunk(chunk(),core,'low');
    const walls=group.getObjectByName('facades')as THREE.Mesh,roof=group.getObjectByName('roofs')as THREE.Mesh;
    const bounds=new THREE.Box3().setFromObject(walls);expect(bounds.min.y).toBe(12);expect(bounds.max.y).toBe(20);
    const roofBounds=new THREE.Box3().setFromObject(roof);expect(roofBounds.min.y).toBe(20);expect(roofBounds.max.y).toBe(20);
    const colours=roof.geometry.getAttribute('color');for(let i=0;i<colours.count;i++){expect(colours.getX(i)).toBe(0);expect(colours.getZ(i)).toBe(1);}
    expect(group.userData.architectureEvidence).toMatchObject({sourceColours:1,sourceMaterials:1,inferredAppearance:0,heightBasis:{source_height:1}});
    const low=buildChunk({...chunk(),buildings:[{...building,heightM:2.2,baseHeightM:0}]},core,'low');
    expect(new THREE.Box3().setFromObject(low.getObjectByName('facades')!).max.y).toBeCloseTo(2.2); // do not force sourced low structures up to a generic3m minimum
  });
  it('keeps unsupported listings out of facade art while source-contained unknown-floor entries stay neutral',()=>{
    canvas();try{
      const hidden=buildStorefronts(chunk([storefront]),core,'standard');expect(hidden.userData.stats.storefronts).toBe(0);expect(hidden.children).toHaveLength(0);
      const contained={...storefront,placement:{...storefront.placement!,association:'source_contained' as const,display:'facade' as const,displacementM:0}};
      const neutral=buildStorefronts(chunk([contained]),core,'standard');
      expect(neutral.userData.stats.storefronts).toBe(1);expect(neutral.userData.stats.upperBoards).toBe(0);
      expect(neutral.getObjectByName('store-fronts')).toBeUndefined(); // no fabricated shop entrance/windows
      const boards=neutral.getObjectByName('store-boards')as THREE.Mesh;
      expect(new THREE.Box3().setFromObject(boards).min.y).toBeGreaterThan(14); // attached to raised body, not a ghost ground tenant
      const short=buildStorefronts({...chunk([contained]),buildings:[{...building,heightM:2.2,baseHeightM:0}]},core,'standard');
      expect(new THREE.Box3().setFromObject(short.getObjectByName('store-boards')!).max.y).toBeLessThan(2.2);
    }finally{vi.unstubAllGlobals();}
  });
  it('shows only researched tenant boards on reviewed architecture while retaining the raw listing inventory',()=>{
    canvas();try{
      const raw={...storefront,id:'unreviewed-vivo',name:'Vivo Mobile Store',placement:{...storefront.placement!,association:'source_contained' as const,display:'facade' as const,displacementM:0}};
      const reviewed={...storefront,id:'observed-restaurant',placeId:'survey:observed-restaurant',name:'Observed restaurant',appearance:{signBaseM:4.5,signHeightM:1,categoryProps:false,awning:false}};
      const input={...chunk([raw,reviewed]),buildings:[{...building,surveyStyle:'madhapur_brown_commercial'}]};
      const snapshot=structuredClone(input.storefronts),scene=buildStorefronts(input,core,'standard');
      expect(scene.userData.stats.storefronts).toBe(1);expect(input.storefronts).toEqual(snapshot);
      expect(input.storefronts.map(s=>s.name)).toContain('Vivo Mobile Store'); // map/search keeps the unaltered factual source record
    }finally{vi.unstubAllGlobals();}
  });
  it('renders a dated observed advertisement without inventing a business record or building name',()=>{
    canvas();try{
      const input=chunk();input.buildings=[{...building,name:null,researchedProfile:{sourceIds:['dated-photo'],appearanceStatus:'observed',dimensionStatus:'provisional',wallColor:'#eeebe0',fronts:[{facade:[[0,0],[4,0]],facingHeading:0,floors:[{baseM:0,heightM:3,glazingRatio:.6}]}],signPanels:[{text:'Proddaturi Silks · 26 June–25 July 2025',baseM:3.3,heightM:1.8,widthRatio:.96,color:'#d8c34d',textColor:'#a64233'}]}}];
      const scene=buildStorefronts(input,core,'standard');
      expect(scene.userData.stats.storefronts).toBe(1);expect(scene.getObjectByName('store-signs')).toBeTruthy();
      expect(input.storefronts).toEqual([]);expect(input.buildings[0].name).toBeNull();
      expect(new THREE.Box3().setFromObject(scene.getObjectByName('store-boards')!).min.y).toBeGreaterThan(3.1);
    }finally{vi.unstubAllGlobals();}
  });
  it('preserves reviewed overrides and the photographed doorway within closed shutters',()=>{
    canvas();try{
      const reviewed={...storefront,id:'observed',placeId:'survey:observed',name:'Observed business',appearance:{frontStyle:'shutter' as const,frontOpening:{at:.5,widthM:1.5},frontBaseM:1,signBaseM:3.5,signHeightM:1,awning:false,categoryProps:false}};
      const group=buildStorefronts(chunk([reviewed]),core,'standard');expect(group.userData.stats.storefronts).toBe(1);
      const fronts=group.getObjectByName('store-fronts')as THREE.Mesh,pos=fronts.geometry.getAttribute('position');
      // No shutter triangle crosses the source-observed central opening (x1.25..2.75).
      const index=fronts.geometry.index!;
      for(let i=0;i<index.count;i+=3){const xs=[0,1,2].map(k=>pos.getX(index.getX(i+k)));expect(Math.max(...xs)<=1.251||Math.min(...xs)>=2.749).toBe(true);}
      expect(group.getObjectByName('store-signs')).toBeTruthy();
    }finally{vi.unstubAllGlobals();}
  });
});
