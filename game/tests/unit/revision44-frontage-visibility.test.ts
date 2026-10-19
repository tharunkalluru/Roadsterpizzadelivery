import {afterEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {SourceAccuracyLayer} from '../../src/world/sourceAccuracy';
import {StreetSurvey} from '../../src/world/streetSurvey';
import type {WorldCore,WorldChunkV2} from '../../src/world/schema';
import type {StreetSurveyData,StreetSurveyBatch} from '../../src/world/streetSurveyTypes';
import {buildChunk} from '../../src/art/buildings';
import {buildStorefronts,disposeStorefronts} from '../../src/art/storefronts';
import {researchedFacesOf,surveyFront} from '../../src/art/researchedBuildings';
vi.mock('../../src/art/mats',async()=>{const t=await import('three');return{getWorldMats:()=>new Proxy({},{get:()=>new t.MeshBasicMaterial({vertexColors:true})})};});
vi.mock('../../src/art/frontAtlas',async original=>{const actual=await original<typeof import('../../src/art/frontAtlas')>(),t=await import('three');return{...actual,getFrontAtlas:()=>new t.Texture()};});
vi.mock('../../src/art/sign',async()=>{const t=await import('three');return{TELUGU_FAMILY:'Test',ensureTeluguFont:async()=>{},createSignTexture:async()=>new t.Texture()};});
const json=<T>(p:string):T=>JSON.parse(readFileSync(p,'utf8'))as T;
afterEach(()=>vi.unstubAllGlobals());
it('keeps the seven actual revision44 shop plates and both profiles’ sourced panels visible on their own faces at low/standard quality',()=>{
 const painted:string[]=[];
 const context=new Proxy({font:'20px sans-serif',measureText(text:string){return{width:text.length*(Number(/([\d.]+)px/.exec(this.font)?.[1]??20))*.55};},fillText(text:string){painted.push(text);}},{get:(o,k)=>k in o?o[k as keyof typeof o]:()=>{}});
 vi.stubGlobal('document',{createElement:()=>({width:0,height:0,getContext:()=>context})});
 const base='public/world/hyd-metro/v2/',manifest=json<{sourceAccuracy:{file:string}}>(base+'manifest.json'),accuracy=new SourceAccuracyLayer(json(base+manifest.sourceAccuracy.file)),raw=accuracy.applyCore(json<WorldCore>(base+'core.json'));
 const data=json<StreetSurveyData>('public/research/street-survey.json'),batch=json<StreetSurveyBatch>('data/research/batches/madhapur-after-compound-next-20261018.json');expect(data.revision).toBeGreaterThanOrEqual(44);
 const survey=new StreetSurvey(data,raw),core=survey.applyCoreCorrections(raw),revised=survey.applyChunk(accuracy.applyChunk(json<WorldChunkV2>(base+'chunks/c_-81_-14.json'))),ids=new Set(batch.storefrontOverrides!.map(s=>s.id)),stores=revised.storefronts.filter(s=>ids.has(s.id)),buildingIds=new Set(stores.map(s=>s.buildingId));
 expect(stores).toHaveLength(7);const chunk={...revised,buildings:revised.buildings.filter(b=>buildingIds.has(b.id)),storefronts:stores};expect(chunk.buildings).toHaveLength(2);
 let merchantRays=0,panelRays=0;
 for(const quality of ['low','standard']as const){
  painted.length=0;const signs=buildStorefronts(chunk,core,quality),scene=new THREE.Group();scene.add(buildChunk(chunk,core,quality),signs);scene.updateMatrixWorld(true);
  const check=(frame:ReturnType<typeof surveyFront>,u:number,y:number,h:number,w:number,depth:number,label:string)=>{
   const normal=frame.world(0,0,1).sub(frame.world(0,0,0)).normalize();
   for(const off of [-.35,0,.35]){const point=frame.world(u+w*off,y+h/2,0),hit=new THREE.Raycaster(point.clone().addScaledVector(normal,8),normal.clone().negate(),0,9).intersectObject(scene,true)[0];expect(hit,`${quality}: ${label}`).toBeTruthy();expect(hit.object.name,`${quality}: ${label}`).toMatch(/^store-(signs|boards)/);expect(hit.point.clone().sub(point).dot(normal),`${quality}: ${label} intended plate`).toBeCloseTo(depth,2);}
  };
  for(const s of stores){const a=s.appearance!,frame=surveyFront(s.facade!,s.facingHeading),w=Math.max(.7,Math.min(frame.W,a.signWidthM!));check(frame,0,a.signBaseM!,a.signHeightM!,w,(a.signOutsetM??0)+(s.floor>0?.104:.264),s.name);merchantRays+=3;}
  for(const b of chunk.buildings){const p=b.researchedProfile!;expect(p.dimensionStatus).toBe('provisional');const panels=[...(p.nameBand&&b.name?[{...p.nameBand,text:b.name}]:[]),...(p.signPanels??[])];
   for(const panel of panels){const rule=p.fronts[panel.frontIndex??0],face=researchedFacesOf(b,rule,stores.filter(s=>s.buildingId===b.id))[0],frame=surveyFront(face.facade,face.heading);check(frame,((panel.at??.5)-.5)*frame.W,panel.baseM,panel.heightM,frame.W*(panel.widthRatio??.65),(panel.outsetM??.65)+.104,panel.text);panelRays+=3;}
  }
  const paintedWords=painted.join(' ').replace(/\s+/g,' ');
  for(const store of stores)expect(paintedWords,`${quality}: complete source label ${store.id}`).toContain((store.appearance?.displayName??store.name).replace(/\s+/g,' '));
  for(const building of chunk.buildings){const profile=building.researchedProfile!,labels=[...(profile.nameBand&&building.name?[building.name]:[]),...(profile.signPanels??[]).map(p=>p.text)];for(const label of labels)expect(paintedWords,`${quality}: complete sourced panel`).toContain(label.replace(/\s+/g,' '));}
  expect(painted).toContain('ప్రింటో');expect(paintedWords).toContain('5th Floor · Lift in Cellar');expect(paintedWords).toContain('TVS ELECTRONICS LIMITED');expect(paintedWords).toContain('CHARTERED ACCOUNTANTS');
  disposeStorefronts(signs);
 }
 expect(merchantRays).toBe(42);expect(panelRays).toBe(54);
});
