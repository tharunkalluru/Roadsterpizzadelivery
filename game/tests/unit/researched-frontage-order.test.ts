import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { StreetSurvey } from '../../src/world/streetSurvey';
import { SourceAccuracyLayer } from '../../src/world/sourceAccuracy';
import type { WorldChunkV2, WorldCore } from '../../src/world/schema';
import type { StreetSurveyData,StreetSurveyBatch } from '../../src/world/streetSurveyTypes';
import { buildChunk } from '../../src/art/buildings';
import { buildStorefronts, disposeStorefronts } from '../../src/art/storefronts';
import { profileFacades } from '../../src/art/profileFacades';
import { surveyFront, researchedFacesOf } from '../../src/art/researchedBuildings';
import type { ResearchedBuildingProfile } from '../../src/world/buildingProfile';
import { accessRoadIndex,buildingAccessPlan,buildingAccessObstacles,buildingAccessCutouts } from '../../src/world/buildingAccess';
vi.mock('../../src/art/mats', async () => {
  const three = await import('three'); return { getWorldMats: () => new Proxy({}, { get: () => new three.MeshBasicMaterial({ vertexColors: true }) }) };
});
vi.mock('../../src/art/frontAtlas', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/art/frontAtlas')>(); const three = await import('three');
  return { ...actual, getFrontAtlas: () => new three.Texture() };
});
vi.mock('../../src/art/sign', async () => {
  const three = await import('three'); return { TELUGU_FAMILY: 'Test', ensureTeluguFont: async () => {}, createSignTexture: async () => new three.Texture() };
});
const json = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const canvas = () => {
  const context = new Proxy({ measureText: (text: string) => ({ width: text.length * 24 }) }, { get: (target, key) => key in target ? target[key as keyof typeof target] : () => {} });
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });
};
afterEach(() => vi.unstubAllGlobals());

describe('dated researched frontage fidelity', () => {
  it('preserves the observed road-view neighbour order independently of record insertion order',()=>{
    const data=json<StreetSurveyData>('public/research/street-survey.json');
    const chains=[
      ['survey-madhapur-mounika-communications','survey-madhapur-ss-computers','survey-madhapur-truecare-surgicals'],
      ['survey-madhapur-slns-printers','survey-madhapur-kotak-mutual-fund'],
      ['survey-madhapur-evania','survey-madhapur-trend-tags'],
      ['survey-madhapur-nothing-service-centre','survey-madhapur-purple-spa'],
      ['survey-madhapur-vave-salon','survey-madhapur-neoclassic-concepts'],
      ['survey-madhapur-rajadhani-bank','survey-madhapur-fit-hive-gym'],
      ['survey-habsiguda-pan-mahal','survey-habsiguda-food-junction','survey-habsiguda-suprabhat-ground-brand'],
      ['survey-madhapur-dsk-global-express','survey-madhapur-madhav-marketing-services','survey-madhapur-sri-madhav-acc','survey-madhapur-apollo-pharmacy-dsk-row'],
      ['survey-madhapur-dhruvanth-forex','survey-madhapur-vista-dental-studio'],
      ['survey-madhapur-balaji-art-gallery','survey-madhapur-bosch-ss-estates'],
      ['survey-madhapur-imfs-study-abroad','survey-madhapur-gvr-luxury-beauty'],
      ['survey-madhapur-wood-world-r328-ground','survey-madhapur-shri-krishna-mobile-r328-ground','survey-madhapur-ambika-r328-ground'],
      ['survey-madhapur-medplus-low-yellow','survey-madhapur-vijaya-sai-photo-studio'],
      ['survey-madhapur-r223-surya-plywood-hardware','survey-madhapur-r223-rajasthan-restaurant-entry','survey-madhapur-r223-laxmi-electro-vision','survey-madhapur-r223-sri-laxmi-sanitation'],
      ['survey-madhapur-r223-sri-sai-saritha-dental','survey-madhapur-r223-viras-homeopathy'],
      ['survey-madhapur-r223-oxrich-admissions','survey-madhapur-r223-magic-look'],
      ['survey-madhapur-raymond-basement-board','survey-madhapur-srinis-designer-studio-basement-board','survey-madhapur-tupperware-basement-board'],
    ];
    for(const records of [data.storefrontOverrides,[...data.storefrontOverrides].reverse()])for(const chain of chains){
      const fronts=chain.map(id=>records.find(record=>record.id===id)!);
      const heading=fronts[0].facingHeading,right=[-Math.cos(heading),Math.sin(heading)];
      const offsets=fronts.map(front=>{const[a,b]=front.facade;return ((a[0]+b[0])/2)*right[0]+((a[1]+b[1])/2)*right[1];});
      for(let i=1;i<offsets.length;i++)expect(offsets[i],chain.join(' → ')).toBeGreaterThan(offsets[i-1]);
      for(const front of fronts){expect(front.placementStatus).toBe('provisional');expect(front.sourceIds.length).toBeGreaterThan(0);}
    }
  });
  it('keeps every researched tenant board visible from its own dated face at low and standard quality', () => {
    canvas();
    const base = 'public/world/hyd-metro/v2/', rawCore = json<WorldCore>(base + 'core.json');
    const manifest = json<{ sourceAccuracy: { file: string } }>(base + 'manifest.json');
    const accuracy = new SourceAccuracyLayer(json(base + manifest.sourceAccuracy.file));
    const sourceCore = accuracy.applyCore(rawCore), data = json<StreetSurveyData>('public/research/street-survey.json');
    const survey = new StreetSurvey(data, sourceCore, { worldVersion: sourceCore.manifestVersion }), core = survey.applyCoreCorrections(sourceCore);
    let checked = 0; const hidden: string[] = [];
    for (const chunkId of new Set(data.storefrontOverrides.map(front => front.chunkId))) {
      const revised = survey.applyChunk(accuracy.applyChunk(json<WorldChunkV2>(base + 'chunks/' + chunkId + '.json')));
      const stores = revised.storefronts.filter(front => front.placeId.startsWith('survey:'));
      const ids = new Set(stores.map(front => front.buildingId));
      const chunk = { ...revised, buildings: revised.buildings.filter(building => ids.has(building.id)), storefronts: stores };
      for (const quality of ['low', 'standard'] as const) {
        const architecture = buildChunk(chunk, core, quality), signs = buildStorefronts(chunk, core, quality);
        const scene = new THREE.Group(); scene.add(architecture, signs); scene.updateMatrixWorld(true);
        const hotel=chunk.buildings.find(building=>building.surveyStyle==='hotel_suprabhat');
        if(hotel){
          const face=profileFacades(hotel,stores.filter(front=>front.buildingId===hotel.id))[0],frame=surveyFront(face.facade,face.heading);
          const centre=frame.world(0,8,0),right=frame.world(1,8,0).sub(centre).normalize();
          const bay=architecture.getObjectByName('suprabhat-glazed-bay')as THREE.Mesh,pos=bay.geometry.getAttribute('position');
          // The January2026 road-view notes place the vertical glass bay on the right.
          for(let i=0;i<pos.count;i++)expect(new THREE.Vector3(pos.getX(i),pos.getY(i),pos.getZ(i)).sub(centre).dot(right)).toBeGreaterThan(frame.W*.25);
        }
        for (const front of stores) {
          const appearance = front.appearance!, [a, b] = front.facade!;
          const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
          let nx = dz / length, nz = -dx / length;
          if (nx * -Math.sin(front.facingHeading) + nz * -Math.cos(front.facingHeading) < 0) { nx = -nx; nz = -nz; }
          const centre = new THREE.Vector3((a[0] + b[0]) / 2, appearance.signBaseM! + appearance.signHeightM! / 2, (a[1] + b[1]) / 2);
          const normal = new THREE.Vector3(nx, 0, nz);
          const ray = new THREE.Raycaster(centre.clone().addScaledVector(normal, 8), normal.negate(), 0, 9);
          const first = ray.intersectObject(scene, true)[0];
          if(!first?.object.name.startsWith('store-signs'))hidden.push(`${quality}: ${front.id} is hidden by ${first?.object.name}`);
          checked++;
        }
        for(const building of chunk.buildings){
          const profile=building.researchedProfile;if(!profile)continue;
          const panels=[...(profile.nameBand&&building.name?[{...profile.nameBand,text:building.name}]:[]),...(profile.signPanels??[])];
          for(const panel of panels){
            const rule=profile.fronts[panel.frontIndex??0];if(!rule)continue;
            const face=researchedFacesOf(building,rule,stores.filter(front=>front.buildingId===building.id))[0];if(!face)continue;
            const frame=surveyFront(face.facade,face.heading),u=((panel.at??.5)-.5)*frame.W,centre=frame.world(u,panel.baseM+panel.heightM/2,0);
            const normal=frame.world(u,panel.baseM+panel.heightM/2,1).sub(centre).normalize();
            const ray=new THREE.Raycaster(centre.clone().addScaledVector(normal,8),normal.negate(),0,9);
            const first=ray.intersectObject(scene,true)[0];
            if(!first?.object.name.startsWith('store-signs'))hidden.push(`${quality}: panel ${panel.text} is hidden by ${first?.object.name}`);
          }
        }
        disposeStorefronts(signs);
      }
    }
    expect(checked).toBe(data.storefrontOverrides.length * 2);
    expect(hidden).toEqual([]);
  });
  it('keeps corner merchant plates and supplier boards mutually visible, with observed floor order and unchanged physical bodies',()=>{
    canvas();const base='public/world/hyd-metro/v2/',manifest=json<{sourceAccuracy:{file:string}}>(base+'manifest.json');
    const accuracy=new SourceAccuracyLayer(json(base+manifest.sourceAccuracy.file)),rawCore=accuracy.applyCore(json<WorldCore>(base+'core.json'));
    const data=json<StreetSurveyData>('public/research/street-survey.json'),batch=json<StreetSurveyBatch>('data/research/batches/madhapur-r177-r223-corner-foodcourt-20261018.json');
    const current=new StreetSurvey(data,rawCore),core=current.applyCoreCorrections(rawCore),raw=accuracy.applyChunk(json<WorldChunkV2>(base+'chunks/c_-83_-15.json'));
    const ids=new Set(['b_47f0ce2c81','b_f0bce3a163']),chunk=current.applyChunk(raw),corner=chunk.buildings.find(b=>b.id==='b_47f0ce2c81')!;
    const newStores=chunk.storefronts.filter(s=>batch.storefrontOverrides!.some(r=>r.id===s.id));expect(newStores).toHaveLength(9);
    for(const store of newStores){
      const expected=/sri-sai-saritha|viras-homeopathy/.test(store.id)?1:/oxrich|magic-look/.test(store.id)?2:0;
      expect(store.floor,store.id).toBe(expected);
    }
    const priorData=structuredClone(data),correctionIds=new Set(batch.corrections!.map(c=>c.id));priorData.corrections=priorData.corrections.filter(c=>!correctionIds.has(c.id));
    const prior=new StreetSurvey(priorData,rawCore).applyChunk(raw),roads=accessRoadIndex(core);
    for(const building of chunk.buildings.filter(b=>ids.has(b.id))){
      const before=prior.buildings.find(b=>b.id===building.id)!;
      const body=(b:typeof building)=>({footprint:b.footprint,holes:b.holes,heightM:b.heightM,baseHeightM:b.baseHeightM});
      expect(body(building)).toEqual(body(before));
      const plan=buildingAccessPlan(building,newStores.filter(s=>s.buildingId===building.id),roads),oldPlan=buildingAccessPlan(before,[],roads);
      expect(buildingAccessObstacles(plan)).toEqual(buildingAccessObstacles(oldPlan));expect(buildingAccessCutouts(plan)).toEqual(buildingAccessCutouts(oldPlan));expect(plan.pits).toEqual(oldPlan.pits);
    }
    expect(chunk.buildings.find(b=>b.id==='b_f0bce3a163')!.researchedProfile?.signageOnly).toBe(true);
    const section={...chunk,buildings:chunk.buildings.filter(b=>ids.has(b.id)),storefronts:newStores};
    for(const quality of ['low','standard']as const){
      const scene=new THREE.Group(),signs=buildStorefronts(section,core,quality);scene.add(buildChunk(section,core,quality),signs);scene.updateMatrixWorld(true);
      const checkPlate=(frame:ReturnType<typeof surveyFront>,u:number,baseY:number,height:number,width:number,expectedDepth:number,label:string)=>{
        const normal=frame.world(0,0,1).sub(frame.world(0,0,0)).normalize();
        for(const offset of [-.35,0,.35]){
          const centre=frame.world(u+offset*width,baseY+height/2,0),hit=new THREE.Raycaster(centre.clone().addScaledVector(normal,8),normal.clone().negate(),0,9).intersectObject(scene,true)[0];
          expect(hit,label).toBeTruthy();expect(hit.object.name,label).toMatch(/^store-(signs|boards)/);
          // All these boards are merged: depth proves this is the intended plate,
          // rather than another supplier/merchant from the same atlas mesh.
          expect(hit.point.clone().sub(centre).dot(normal),label).toBeCloseTo(expectedDepth,2);
        }
      };
      for(const store of newStores.filter(s=>/surya-plywood|laxmi-electro|sri-laxmi-sanitation/.test(s.id))){
        const a=store.appearance!,frame=surveyFront(store.facade!,store.facingHeading);
        checkPlate(frame,0,a.signBaseM!,a.signHeightM!,a.signWidthM!,(a.signOutsetM??0)+.264,store.name);
      }
      const profile=corner.researchedProfile!,rule=profile.fronts[0],frame=surveyFront(rule.facade!,rule.facingHeading!);
      for(const panel of profile.signPanels!)checkPlate(frame,((panel.at??.5)-.5)*frame.W,panel.baseM,panel.heightM,(panel.widthRatio??.65)*frame.W,(panel.outsetM??.65)+.104,panel.text);
      disposeStorefronts(signs);
    }
  });
  it('renders the Gayathri basement observation as its board only, without a fabricated hotel door or vertical blade', () => {
    canvas();
    const base = 'public/world/hyd-metro/v2/', rawCore = json<WorldCore>(base + 'core.json');
    const data = json<StreetSurveyData>('public/research/street-survey.json'), survey = new StreetSurvey(data, rawCore);
    const chunk = survey.applyChunk(json<WorldChunkV2>(base + 'chunks/c_-78_-44.json'));
    const board = chunk.storefronts.find(front => front.id === 'survey-kphb-gayathri-residency-basement-board')!;
    const ownChunk = { ...chunk, buildings: chunk.buildings.filter(building => building.id === board.buildingId).map(building=>({...building,researchedProfile:building.researchedProfile?{...building.researchedProfile,nameBand:undefined,signPanels:undefined}:undefined})), storefronts: [board] };
    for (const quality of ['low', 'standard', 'high'] as const) {
      const scene = buildStorefronts(ownChunk, survey.applyCoreCorrections(rawCore), quality);
      expect(scene.userData.stats.storefronts).toBe(1); expect(scene.getObjectByName('store-fronts')).toBeUndefined();
      const signs = scene.children.filter(mesh => mesh.name.startsWith('store-signs'));
      expect(signs).toHaveLength(1);
      expect(new THREE.Box3().setFromObject(signs[0]).min.y).toBeGreaterThan(.79);
      expect(new THREE.Box3().setFromObject(signs[0]).max.y).toBeLessThan(1.91);
      const body = scene.getObjectByName('store-body')!;
      expect(new THREE.Box3().setFromObject(body).min.y).toBeGreaterThan(.6); // board brackets, no invented ground doorway
      disposeStorefronts(scene);
    }
    expect(board.floor).toBe(-1);
  });
  it('adds independently observed sign panels without replacing MedPlus or brown-block architecture',()=>{
    canvas();const base='public/world/hyd-metro/v2/',core=json<WorldCore>(base+'core.json');
    const survey=new StreetSurvey(json<StreetSurveyData>('public/research/street-survey.json'),core);
    const revised=survey.applyChunk(json<WorldChunkV2>(base+'chunks/c_-84_-15.json')),corrected=survey.applyCoreCorrections(core);
    for(const id of ['b_743cd80e16','b_42a55533aa']){
      const building={...revised.buildings.find(b=>b.id===id)!,researchedProfile:undefined};
      const stores=revised.storefronts.filter(front=>front.buildingId===id),face=profileFacades(building,stores)[0];
      const profile:ResearchedBuildingProfile={signageOnly:true,sourceIds:['dated-sign-observation'],appearanceStatus:'observed',dimensionStatus:'provisional',wallColor:'#ff00ff',fronts:[{facade:face.facade,facingHeading:face.heading,floors:[]}],signPanels:[{text:'SAMSUNG MOBILE | ACCESSORIES | REPAIR',baseM:2.2,heightM:.4,widthRatio:.3,color:'#ddd8cc',textColor:'#272927'}]};
      const before={...revised,buildings:[building],storefronts:stores},after={...before,buildings:[{...building,researchedProfile:profile}]};
      for(const quality of ['low','standard']as const){
        const original=buildChunk(before,corrected,quality),withPanel=buildChunk(after,corrected,quality);
        expect(withPanel.children.map(child=>child.name)).toEqual(original.children.map(child=>child.name));
        for(const object of original.children){
          const geometry=(object as THREE.Mesh).geometry;if(!geometry)continue;
          const updated=(withPanel.getObjectByName(object.name)as THREE.Mesh).geometry;
          for(const attribute of ['position','normal','color','uv']){
            const expected=geometry.getAttribute(attribute);if(!expected)continue;
            expect(Array.from(updated.getAttribute(attribute).array),`${id}/${quality}/${object.name}/${attribute}`).toEqual(Array.from(expected.array));
          }
        }
        const originalSigns=buildStorefronts(before,corrected,quality),withSigns=buildStorefronts(after,corrected,quality);
        expect(withSigns.userData.stats.storefronts).toBe(originalSigns.userData.stats.storefronts+1);
        expect(after.storefronts).toBe(stores);expect(profile.dimensionStatus).toBe('provisional');
        disposeStorefronts(originalSigns);disposeStorefronts(withSigns);
      }
    }
  });
});
