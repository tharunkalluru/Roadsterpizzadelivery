import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { appendObservedStock } from '../../src/art/observedDisplays';
import { GeoBuilder } from '../../src/art/geo';
import { buildStorefronts, disposeStorefronts } from '../../src/art/storefronts';
import type { Building, Storefront, WorldChunkV2, WorldCore } from '../../src/world/schema';
import type { ResearchedBuildingProfile } from '../../src/world/buildingProfile';
import { StreetSurvey } from '../../src/world/streetSurvey';
import type { StreetSurveyData } from '../../src/world/streetSurveyTypes';
vi.mock('../../src/art/frontAtlas', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/art/frontAtlas')>(); const three = await import('three'); return { ...actual, getFrontAtlas: () => new three.Texture() };
});
vi.mock('../../src/art/sign', async () => ({ TELUGU_FAMILY: 'Test', ensureTeluguFont: async () => {} }));
const canvas=()=>{
  const context=new Proxy({measureText:(text:string)=>({width:text.length*20})},{get:(object,key)=>key in object?object[key as keyof typeof object]:()=>{}});
  vi.stubGlobal('document',{createElement:()=>({width:0,height:0,getContext:()=>context})});
};
afterEach(()=>vi.unstubAllGlobals());
const core={nodes:[],roads:[],metro:{lines:[]},metroStructure:{pillars:[]},stations:[],structures:[]}as unknown as WorldCore;
const building:Building={id:'observed',osmId:'way/test',footprint:[[0,0],[8,0],[8,-5],[0,-5]],centroid:[4,-2.5],heightM:8,heightStatus:'provisional',levels:2,name:null,kind:'commercial',frontRoadId:null,frontSide:null};
const front:Storefront={id:'dated-cement-shop',placeId:'survey:dated-cement-shop',name:'Observed cement bay',nameTe:null,category:'building_materials',group:'hardware',confidence:1,sources:['dated-photo'],license:'test',x:4,z:0,buildingId:'observed',roadId:'test',side:'left',facade:[[1,0],[7,0]],facingHeading:Math.PI,floor:0,status:'provisional',appearance:{frontStyle:'open_bay',observedDisplay:'cement_bags',displaySide:'left',signBaseM:2.8,signHeightM:.8,awning:false,categoryProps:false}};
const chunk=(storefronts:Storefront[]=[front],profile?:ResearchedBuildingProfile)=>({id:'test',buildings:[{...building,researchedProfile:profile}],storefronts,pois:[],landmarks:[]}as unknown as WorldChunkV2);

describe('explicitly observed shop stock',()=>{
  it('preserves left/right cement stacks and original soft bag geometry within the frontage at every quality',()=>{
    for(const quality of ['low','standard','high']as const)for(const side of ['left','right']as const){
      const body=new GeoBuilder(true),lit=new GeoBuilder(true),result=appendObservedStock('cement_bags',side,{widthM:4,baseY:.25,topY:2.8,insetM:0,yaw:0,at:(u,n)=>[u,n]},quality,body,lit);
      const geometry=body.build();geometry.computeBoundingBox();const bounds=geometry.boundingBox!;
      expect(result.pieces).toBeGreaterThan(5);expect(bounds.min.x).toBeGreaterThan(-2);expect(bounds.max.x).toBeLessThan(2);
      expect(side==='left'?bounds.max.x<-.5:bounds.min.x>.5).toBe(true);
      expect(bounds.min.y).toBeGreaterThan(.24);expect(bounds.max.y).toBeLessThan(2.8);
      expect(bounds.min.z).toBeGreaterThan(0);expect(bounds.max.z).toBeLessThan(.4);
      expect(geometry.getAttribute('position').count).toBeGreaterThan(result.pieces*24); // rounded sacks rather than a painted stock rectangle
      geometry.dispose();
    }
  });
  it('keeps an open bay free of guessed glass/door handles and adds stock only when observation explicitly asks for it',()=>{
    canvas();const scene=buildStorefronts(chunk(),core,'low');scene.updateMatrixWorld(true);
    expect(scene.getObjectByName('store-fronts')).toBeUndefined();expect(scene.userData.stats.drawCalls).toBeLessThanOrEqual(4);
    expect(scene.userData.observedDisplays).toEqual([{storefrontId:front.id,kind:'cement_bags',pieces:10,placementStatus:'provisional'}]);
    const ray=new THREE.Raycaster(new THREE.Vector3(4,1.2,4),new THREE.Vector3(0,0,-1),0,5),hit=ray.intersectObject(scene,true)[0];
    expect(hit.object.name).toBe('store-boards');expect(hit.point.z).toBeCloseTo(.018,6); // clear bay centre, no glass/handle in front
    const unspecified={...front,appearance:{...front.appearance,observedDisplay:undefined}};
    const plain=buildStorefronts(chunk([unspecified]),core,'low');expect(plain.userData.observedDisplays).toBeUndefined();
    expect(plain.userData.stats.storefronts).toBe(scene.userData.stats.storefronts); // stock does not invent another operator
    for(const kind of ['medicines','appliances','framed_art','hardware_goods','luggage_goods']as const){
      const body=new GeoBuilder(true),lit=new GeoBuilder(true),result=appendObservedStock(kind,'both',{widthM:4,baseY:.1,topY:2.8,insetM:0,yaw:0,at:(u,n)=>[u,n]},'low',body,lit);
      expect(result.pieces).toBeGreaterThan(0);const geometry=body.build();geometry.computeBoundingBox();expect(geometry.boundingBox!.max.y).toBeLessThan(2.8);expect(geometry.boundingBox!.max.z).toBeLessThan(.4);expect(geometry.boundingBox!.min.x).toBeGreaterThan(-2);expect(geometry.boundingBox!.max.x).toBeLessThan(2);geometry.dispose();
    }
    const pharmacy={...front,group:'pharmacy' as const,appearance:{...front.appearance,frontStyle:'glazed' as const,observedDisplay:'medicines' as const,displaySide:'both' as const}};
    for(const quality of ['low','standard','high']as const){
      const glass=buildStorefronts(chunk([pharmacy]),core,quality);glass.updateMatrixWorld(true);
      // Most of the window remains the original dark glazed plane, not a white stock wall.
      for(const x of [2.9,4.7,6.2])for(const y of [1.1,1.7,2.3]){
        const first=new THREE.Raycaster(new THREE.Vector3(x,y,4),new THREE.Vector3(0,0,-1),0,5).intersectObject(glass,true)[0];
        expect(first.point.z).toBeCloseTo(.05,5);
      }
      expect(glass.userData.observedDisplays[0]).toMatchObject({kind:'medicines',pieces:12});
      expect(glass.userData.stats.drawCalls).toBe(2+glass.userData.stats.atlasPages);disposeStorefronts(glass);
    }
    disposeStorefronts(scene);disposeStorefronts(plain);
  });
  it('renders the actual dated Madhapur cement/gallery/appliance/hardware/luggage records as observed stock without another tenant or mesh per item',()=>{
    canvas();const json=<T>(path:string)=>JSON.parse(readFileSync(path,'utf8'))as T,base='public/world/hyd-metro/v2/';
    const sourceCore=json<WorldCore>(base+'core.json'),data=json<StreetSurveyData>('public/research/street-survey.json'),survey=new StreetSurvey(data,sourceCore);
    const ids=['survey-madhapur-madhav-marketing-services','survey-madhapur-sri-madhav-acc','survey-madhapur-balaji-art-gallery','survey-madhapur-bosch-ss-estates','survey-madhapur-wood-world-r328-ground','survey-madhapur-ambika-r328-ground','survey-madhapur-apollo-pharmacy-dsk-row','survey-madhapur-medplus-low-yellow'];
    const records=ids.map(id=>data.storefrontOverrides.find(record=>record.id===id)!);
    expect(records[0].appearance).toMatchObject({observedDisplay:'cement_bags',displaySide:'left',frontStyle:'open_bay'});
    expect(records[1].appearance).toMatchObject({observedDisplay:'cement_bags',displaySide:'right',frontStyle:'open_bay'});
    expect(records[4].appearance).toMatchObject({observedDisplay:'hardware_goods',frontStyle:'open_bay',categoryProps:false});
    expect(records[5].appearance).toMatchObject({observedDisplay:'luggage_goods',frontStyle:'open_bay',categoryProps:false});
    const rendered:string[]=[];
    for(const chunkId of new Set(records.map(record=>record.chunkId))){
      const revised=survey.applyChunk(json<WorldChunkV2>(base+'chunks/'+chunkId+'.json'));
      const selected={...revised,storefronts:revised.storefronts.filter(front=>ids.includes(front.id))};
      const snapshot=structuredClone(selected.storefronts),scene=buildStorefronts(selected,survey.applyCoreCorrections(sourceCore),'low');
      const displays=scene.userData.observedDisplays as {storefrontId:string;kind:string;pieces:number;placementStatus:string}[];
      for(const display of displays){rendered.push(display.storefrontId);expect(display.pieces).toBeGreaterThan(0);expect(display.placementStatus).toBe('provisional');}
      expect(scene.userData.stats.drawCalls).toBe(2+scene.userData.stats.atlasPages);
      expect(selected.storefronts).toEqual(snapshot);disposeStorefronts(scene);
    }
    expect(rendered.sort()).toEqual([...ids].sort());
  });
});

describe('observed board horizontal placement',()=>{
  const profile=(offsets:boolean):ResearchedBuildingProfile=>({signageOnly:true,sourceIds:['dated-photo'],appearanceStatus:'observed',dimensionStatus:'provisional',wallColor:'#ddd',fronts:[{facade:[[8,0],[0,0]],facingHeading:Math.PI,floors:[]}],signPanels:[{text:'LEFT BOARD',at:offsets ? .2 : undefined,widthRatio:.25,baseM:4,heightM:.8,color:'#ddd',textColor:'#222'},{text:'RIGHT BOARD',at:offsets ? .8 : undefined,widthRatio:.25,baseM:4,heightM:.8,color:'#ddd',textColor:'#222'}]});
  it('places different observed boards on their own photographed segments even when footprint endpoints are reversed',()=>{
    canvas();const data=chunk([],profile(true)),before=structuredClone(data),scene=buildStorefronts(data,core,'standard');scene.updateMatrixWorld(true);
    const hit=(x:number)=>new THREE.Raycaster(new THREE.Vector3(x,4.4,5),new THREE.Vector3(0,0,-1),0,6).intersectObject(scene,true)[0];
    expect(hit(1.6)?.object.name).toBe('store-signs');expect(hit(6.4)?.object.name).toBe('store-signs');expect(hit(4)).toBeUndefined();
    expect(scene.userData.stats.storefronts).toBe(2);expect(data).toEqual(before);disposeStorefronts(scene);
    const small=profile(true);small.signPanels=small.signPanels!.slice(0,1);small.signPanels[0].widthRatio=.05;
    const narrow=buildStorefronts(chunk([],small),core,'low'),bounds=new THREE.Box3().setFromObject(narrow.getObjectByName('store-boards')!);
    expect(narrow.userData.stats.storefronts).toBe(1);expect(bounds.max.x-bounds.min.x).toBeCloseTo(.4,5);disposeStorefronts(narrow);
  });
  it('keeps the former centred panel geometry when at is omitted',()=>{
    canvas();const old=profile(false);old.signPanels=old.signPanels!.slice(0,1);
    const explicit=structuredClone(old);explicit.signPanels![0].at=.5;
    const original=buildStorefronts(chunk([],old),core,'low'),centred=buildStorefronts(chunk([],explicit),core,'low');
    for(const name of ['store-boards','store-signs']){
      const a=(original.getObjectByName(name)as THREE.Mesh).geometry.getAttribute('position'),b=(centred.getObjectByName(name)as THREE.Mesh).geometry.getAttribute('position');
      expect(Array.from(b.array)).toEqual(Array.from(a.array));
    }
    disposeStorefronts(original);disposeStorefronts(centred);
  });
});
