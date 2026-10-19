/** Real data integration check: canvas/font painting is stubbed; all geometry and survey logic are real. */
import { describe,expect,it,vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { StreetSurvey } from '../../src/world/streetSurvey';
import type { WorldCore,WorldChunkV2 } from '../../src/world/schema';
import type { StreetSurveyData } from '../../src/world/streetSurveyTypes';
import { buildChunk } from '../../src/art/buildings';
import { buildStorefronts } from '../../src/art/storefronts';
vi.mock('../../src/art/mats',async()=>{
  const three=await import('three');
  return {getWorldMats:()=>new Proxy({}, {get:()=>new three.MeshBasicMaterial({vertexColors:true})})};
});
vi.mock('../../src/art/frontAtlas',async(importOriginal)=>{
  const actual=await importOriginal<typeof import('../../src/art/frontAtlas')>();
  const three=await import('three');return {...actual,getFrontAtlas:()=>new three.Texture()};
});
vi.mock('../../src/art/sign',async()=>{
  const three=await import('three');return {TELUGU_FAMILY:'Test',ensureTeluguFont:async()=>{},createSignTexture:async()=>new three.Texture()};
});
const json=<T>(path:string)=>JSON.parse(readFileSync(path,'utf8')) as T;

describe('real researched frontage integration',()=>{
  it('keeps raised Madhapur fronts, separate entrances and researched signs visible ahead of their custom architecture',()=>{
    const core=json<WorldCore>('public/world/hyd-metro/v2/core.json'),raw=json<WorldChunkV2>('public/world/hyd-metro/v2/chunks/c_-84_-15.json');
    const survey=new StreetSurvey(json<StreetSurveyData>('public/research/street-survey.json'),core),revised=survey.applyChunk(raw),corrected=survey.applyCoreCorrections(core);
    const snId=revised.storefronts.find(s=>s.id==='survey-madhapur-vave-salon')!.buildingId!;
    const ids=new Set(['b_42a55533aa','b_743cd80e16',snId]);
    // Keep original snapped shops too: their order and alley-facing headings must never orient the researched architecture.
    const chunk={...revised,buildings:revised.buildings.filter(b=>ids.has(b.id)),storefronts:revised.storefronts.filter(s=>s.buildingId&&ids.has(s.buildingId))};
    expect(chunk.buildings.map(b=>b.surveyStyle).sort()).toEqual(['madhapur_brown_commercial','madhapur_commercial','madhapur_sn_heights']);
    const med=chunk.storefronts.find(s=>s.id==='survey-madhapur-medplus')!;
    expect(med.appearance).toMatchObject({frontBaseM:1.25,frontStyle:'glazed',signOutsetM:.65});
    expect(chunk.storefronts.filter(s=>s.floor<0).map(s=>s.name)).toEqual(['MOUNIKA COMMUNICATIONS','S.S. COMPUTERS','Truecare Surgicals']);
    expect(chunk.storefronts.some(s=>!s.placeId.startsWith('survey:'))).toBe(true);
    const context=new Proxy({measureText:(s:string)=>({width:s.length*32})},{get:(o,key)=>key in o?o[key as keyof typeof o]:()=>{}});
    vi.stubGlobal('document',{createElement:()=>({width:0,height:0,getContext:()=>context})});
    try{
      for(const quality of ['low','standard'] as const){
        const buildings=buildChunk(chunk,corrected,quality),stores=buildStorefronts(chunk,corrected,quality),scene=new THREE.Group();
        scene.add(buildings,stores);scene.updateMatrixWorld(true);
        expect(buildings.userData.madhapurAccess).toMatchObject({mainStairCount:1,risers:8,landingHeightM:1.25});
        expect(buildings.userData.madhapurEastAccess).toMatchObject({mainStairCount:1,risers:6});
        expect(buildings.userData.madhapurBrownAccess).toMatchObject({mainStairCount:2,risers:6});
        for(const name of ['madhapur-white-frame','madhapur-brown-piers','researched-cladding'])expect(buildings.getObjectByName(name)).toBeTruthy();
        for(const sf of chunk.storefronts.filter(s=>s.placeId.startsWith('survey:'))){
          const [a,b]=sf.facade!,dx=b[0]-a[0],dz=b[1]-a[1],W=Math.hypot(dx,dz);
          let nx=dz/W,nz=-dx/W;if(nx*-Math.sin(sf.facingHeading)+nz*-Math.cos(sf.facingHeading)<0){nx=-nx;nz=-nz;}
          const y=sf.appearance!.signBaseM!+sf.appearance!.signHeightM!/2;
          const target=new THREE.Vector3((a[0]+b[0])/2,y,(a[1]+b[1])/2),normal=new THREE.Vector3(nx,0,nz);
          const ray=new THREE.Raycaster(target.clone().addScaledVector(normal,12),normal.clone().negate(),0,12);
          const hits=ray.intersectObjects([buildings,stores],true);
          // This catches projecting columns/glass silently hiding source-backed shop boards.
          expect(hits[0]?.object.name,`${quality}: ${sf.name}`).toBe('store-signs');
        }
        const lit=stores.getObjectByName('store-boards') as THREE.Mesh;
        const positions=lit.geometry.getAttribute('position');
        const [a,b]=med.facade!,dx=b[0]-a[0],dz=b[1]-a[1],W=Math.hypot(dx,dz),cx=(a[0]+b[0])/2,cz=(a[1]+b[1])/2;
        const glazing=[];
        for(let i=0;i<positions.count;i++){
          const x=positions.getX(i)-cx,z=positions.getZ(i)-cz,u=(x*dx+z*dz)/W,n=(-x*dz+z*dx)/W;
          if(Math.abs(u)<W/2-.1&&Math.abs(n-.05)<.006&&positions.getY(i)<3)glazing.push(positions.getY(i));
        }
        expect(glazing.length).toBeGreaterThan(0);expect(Math.min(...glazing)).toBeCloseTo(1.25);
        const probes=[
          {a:[-16657.49,-2968.06],b:[-16657.71,-2958.06],y:8.3,t:.25,name:'researched-glazing'},
          {a:[-16657.49,-2968.06],b:[-16657.71,-2958.06],y:8.3,t:.97,name:'researched-cladding'},
          {a:[-16729.09,-2957.44],b:[-16716.64,-2956.63],y:12,t:.25,name:'madhapur-brown-glazing'},
          {a:[-16709.29,-2953.98],b:[-16694,-2953.13],y:12,t:.35,name:'madhapur-blue-window-ribbons'},
        ];
        for(const p of probes){
          const dx=p.b[0]-p.a[0],dz=p.b[1]-p.a[1],W=Math.hypot(dx,dz),normal=new THREE.Vector3(-dz/W,0,dx/W);
          const target=new THREE.Vector3(p.a[0]+dx*p.t,p.y,p.a[1]+dz*p.t);
          const ray=new THREE.Raycaster(target.clone().addScaledVector(normal,10),normal.clone().negate(),0,10);
          expect(ray.intersectObject(buildings,true)[0]?.object.name,`${quality}: current provisional survey face ${p.name}`).toBe(p.name);
        }
        // Reordering all unreviewed candidates cannot choose or mirror an observed face.
        const reordered={...chunk,storefronts:[...chunk.storefronts].reverse()};
        const reorderedBuildings=buildChunk(reordered,corrected,quality);
        for(const name of ['researched-cladding','madhapur-brown-piers','madhapur-blue-window-ribbons']){
          const before=(buildings.getObjectByName(name) as THREE.Mesh).geometry.getAttribute('position').array;
          const after=(reorderedBuildings.getObjectByName(name) as THREE.Mesh).geometry.getAttribute('position').array;
          expect(Array.from(after),`${name} must ignore raw listing order`).toEqual(Array.from(before));
        }
      }
    }finally{vi.unstubAllGlobals();}
  });
  it('keeps the photographed Gatsi/Amaravathi block on the upstream facade without random awnings or props',()=>{
    const core=json<WorldCore>('public/world/hyd-metro/v2/core.json'),raw=json<WorldChunkV2>('public/world/hyd-metro/v2/chunks/c_-5_-3.json');
    const survey=new StreetSurvey(json<StreetSurveyData>('public/research/street-survey.json'),core),chunk=survey.applyChunk(raw);
    const block=chunk.buildings.find(b=>b.id==='b_1f09a30466')!;
    expect(block).toMatchObject({intrudesCarriageway:false,surveyStyle:'habsiguda_gatsi_block',heightM:16.5});
    const fronts=chunk.storefronts.filter(s=>s.placeId.startsWith('survey:')&&s.buildingId===block.id);
    expect(fronts.map(s=>s.name).sort()).toEqual(['AMARAVATHI','GATSI SPORTS']);
    for(const sf of fronts)expect(sf).toMatchObject({roadId:'r_53082489897_0',side:'left',floor:0,status:'provisional',appearance:{awning:false,categoryProps:false}});
    const visible={...chunk,buildings:chunk.buildings.filter(b=>!b.intrudesCarriageway)},group=buildChunk(visible,survey.applyCoreCorrections(core),'standard');
    const facade=group.getObjectByName('gatsi-charcoal-frame')!;
    expect(facade).toBeTruthy();
    const box=new THREE.Box3().setFromObject(facade);
    expect(box.min.x).toBeGreaterThan(-810);expect(box.max.x).toBeLessThan(-780);expect(box.max.y).toBeCloseTo(16.5);
    group.updateMatrixWorld(true);
    const normal=new THREE.Vector3(19.48,0,-15.87).normalize(),target=new THREE.Vector3(-794.165,9.8,-518.21);
    const ray=new THREE.Raycaster(target.clone().addScaledVector(normal,8),normal.clone().negate(),0,8);
    expect(ray.intersectObject(group,true)[0]?.object.name).toBe('gatsi-window-ribbons');
  });
  it('restores Hotel Suprabhat and creates its bespoke architecture and road-facing upper sign',()=>{
    const core=json<WorldCore>('public/world/hyd-metro/v2/core.json'),raw=json<WorldChunkV2>('public/world/hyd-metro/v2/chunks/c_-5_-3.json');
    const survey=new StreetSurvey(json<StreetSurveyData>('public/research/street-survey.json'),core);
    const revised=survey.applyChunk(raw),hotel=revised.buildings.find(b=>b.id==='b_a88aeb5138')!;
    expect(hotel).toMatchObject({intrudesCarriageway:false,heightM:14.2,surveyStyle:'hotel_suprabhat'});
    const corrected=survey.applyCoreCorrections(core);
    const visible={...revised,buildings:revised.buildings.filter(b=>!b.intrudesCarriageway)};
    const group=buildChunk(visible,corrected,'standard');
    for(const name of ['suprabhat-stone','suprabhat-balconies','suprabhat-glazed-bay'])expect(group.getObjectByName(name)).toBeTruthy();
    const box=new THREE.Box3().setFromObject(group.getObjectByName('suprabhat-stone')!);
    expect(box.min.x).toBeGreaterThan(-860);expect(box.max.x).toBeLessThan(-810);expect(box.max.y).toBeGreaterThan(13);
    expect(new THREE.Box3().setFromObject(group.getObjectByName('suprabhat-balconies')!).max.y).toBeGreaterThan(14);
    group.updateMatrixWorld(true);
    const outward=new THREE.Vector3(27.82,0,-23.16).normalize(),target=new THREE.Vector3(-827.24,8,-551.2);
    const architectureRay=new THREE.Raycaster(target.clone().addScaledVector(outward,8),outward.clone().negate(),0,8);
    expect(architectureRay.intersectObject(group,true)[0]?.object.name).toBe('suprabhat-balconies');
    const context=new Proxy({measureText:(s:string)=>({width:s.length*32})},{get:(o,key)=>key in o?o[key as keyof typeof o]:()=>{}});
    vi.stubGlobal('document',{createElement:()=>({width:0,height:0,getContext:()=>context})});
    try {
      const stores=buildStorefronts(visible,corrected,'standard');
      const signs=stores.getObjectByName('store-signs') as THREE.Mesh;
      const pos=signs.geometry.getAttribute('position'),normal=signs.geometry.getAttribute('normal');
      const vertices=[];
      for(let i=0;i<pos.count;i++)if(pos.getY(i)>11.4&&pos.getY(i)<12.5&&pos.getX(i)>-840&&pos.getX(i)<-820)vertices.push(i);
      expect(vertices.length).toBeGreaterThanOrEqual(4);
      for(const i of vertices){expect(normal.getX(i)).toBeGreaterThan(.7);expect(normal.getZ(i)).toBeLessThan(-.5);}
      expect(stores.userData.stats.upperBoards).toBeGreaterThanOrEqual(1);
    } finally {vi.unstubAllGlobals();}
  });
});
