import { describe,it,expect,vi,afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import type { WorldCore,WorldChunkV2,WorldManifest } from '../../src/world/schema';
import type { StreetSurveyData,StreetSurveyBatch } from '../../src/world/streetSurveyTypes';
import { SourceAccuracyLayer,type SourceAccuracyData } from '../../src/world/sourceAccuracy';
import { ingestStreetSurveyBatch } from '../../src/world/streetSurveyBatch';
import { StreetSurvey,validateStreetSurvey } from '../../src/world/streetSurvey';
import { WorldPhysics } from '../../src/world/collision';
import { buildingAccessPlan,buildingAccessObstacles } from '../../src/world/buildingAccess';
import { buildChunk } from '../../src/art/buildings';
import { buildStorefronts,disposeStorefronts } from '../../src/art/storefronts';
import { surveyFront } from '../../src/art/researchedBuildings';
vi.mock('../../src/art/mats',async()=>{const three=await import('three');return{getWorldMats:()=>new Proxy({},{get:()=>new three.MeshBasicMaterial({vertexColors:true})})};});
vi.mock('../../src/art/frontAtlas',async importOriginal=>{const actual=await importOriginal<typeof import('../../src/art/frontAtlas')>();const three=await import('three');return{...actual,getFrontAtlas:()=>new three.Texture()};});
vi.mock('../../src/art/sign',async()=>{const three=await import('three');return{TELUGU_FAMILY:'Test',ensureTeluguFont:async()=>{},createSignTexture:async()=>new three.Texture()};});
const read=<T>(path:string)=>JSON.parse(readFileSync(path,'utf8'))as T;
const base='public/world/hyd-metro/v2/',manifest=read<WorldManifest>(base+'manifest.json');
const accuracy=new SourceAccuracyLayer(read<SourceAccuracyData>(base+manifest.sourceAccuracy!.file));
const rawCore=accuracy.applyCore(read<WorldCore>(base+'core.json'));
const batch=read<StreetSurveyBatch>('data/research/batches/madhapur-xiaomi-arched-north-face-20261018.json');
const preview=await ingestStreetSurveyBatch(read<StreetSurveyData>('public/research/street-survey.json'),batch,rawCore,validateStreetSurvey);
const survey=new StreetSurvey(preview.data,rawCore),core=survey.applyCoreCorrections(rawCore);
const before=accuracy.applyChunk(read<WorldChunkV2>(base+'chunks/c_-83_-15.json'));
const revised=survey.applyChunk(before),building=revised.buildings.find(b=>b.id==='b_d59e7d52ac')!,stores=revised.storefronts.filter(s=>s.buildingId===building.id);
const chunk:WorldChunkV2={...revised,buildings:[building],storefronts:stores};
const canvas=()=>{const context=new Proxy({measureText:(text:string)=>({width:text.length*20})},{get:(o,k)=>k in o?o[k as keyof typeof o]:()=>{}});vi.stubGlobal('document',{createElement:()=>({width:0,height:0,getContext:()=>context})});};
afterEach(()=>vi.unstubAllGlobals());

describe('dated Xiaomi arched block reconstruction',()=>{
  it('preserves its separate source footprint/height and the photographed below-road shop order without inventing tenancy status or basement depth',()=>{
    const original=before.buildings.find(b=>b.id===building.id)!;
    expect(building.footprint).toEqual(original.footprint);expect(building.heightM).toBe(original.heightM);expect(building.heightM).toBe(12.5);
    const names=['Raymond','SRINIS Designer Studio','Tupperware'],basement=stores.filter(s=>s.floor===-1).sort((a,b)=>a.x===b.x?0:b.x-a.x);
    expect(basement.map(s=>s.name)).toEqual(names);
    for(const front of basement){expect(front.category.endsWith('_signage')).toBe(true);expect(front.status).toBe('provisional');}
    expect(building.researchedProfile?.fronts.flatMap(f=>f.access?.basementOpenings??[])).toEqual([]);
    const frontage=batch.storefrontOverrides!.find(s=>s.name==='Tupperware')!;expect(frontage.replaceStorefrontIds).toEqual(['sf_7b15879354']);
    expect(batch.sources?.find(s=>s.kind==='satellite')?.captureDate).toBeNull();
  });
  it('gives both side stairs the same visible and physical road-cleared plan, with no invented excavation or missing collision on reload',()=>{
    const world=new WorldPhysics(core),plan=buildingAccessPlan(building,stores,world.roads);
    expect(plan.pits).toEqual([]);expect(plan.adjustments).toHaveLength(1);expect(plan.adjustments[0]).toMatchObject({status:'authored_estimate',depthScale:1,recessM:0});
    const steps=plan.boxes.filter(b=>b.kind==='step');expect(steps).toHaveLength(16);
    const access=building.researchedProfile!.fronts[0],frame=surveyFront(access.facade!,access.facingHeading!),origin=frame.world(0,0,0),right=frame.world(1,0,0).sub(origin);
    const positions=steps.map(step=>new THREE.Vector3(step.centre[0],0,step.centre[1]).sub(origin).dot(right));
    expect(positions.filter(x=>x<0)).toHaveLength(8);expect(positions.filter(x=>x>0)).toHaveLength(8);
    for(const solid of buildingAccessObstacles(plan)){
      const[a,b,,d]=solid.poly;
      for(let u=0;u<=1;u+=.1)for(let v=0;v<=1;v+=.1){
        const x=a[0]+(b[0]-a[0])*u+(d[0]-a[0])*v,z=a[1]+(b[1]-a[1])*u+(d[1]-a[1])*v;
        for(const road of world.roads.segmentsNear(x,z)){
          if(road.road.tunnel||road.ay>solid.top+.75)continue;
          const dx=road.bx-road.ax,dz=road.bz-road.az,t=Math.max(0,Math.min(1,((x-road.ax)*dx+(z-road.az)*dz)/(road.len*road.len)));
          expect(Math.hypot(x-road.ax-t*dx,z-road.az-t*dz),solid.id).toBeGreaterThan(road.halfWidth+.55);
        }
      }
    }
    world.addChunk(chunk);const step=steps.find(s=>s.top>.6&&s.top<.8)!;
    expect(world.contacts(step.centre[0],step.centre[1],.05,.1,.05).some(c=>c.id===step.id)).toBe(true);
    world.removeChunk(chunk.id);expect(world.contacts(step.centre[0],step.centre[1],.05,.1,.05).some(c=>c.id===step.id)).toBe(false);
    world.addChunk(chunk);expect(world.contacts(step.centre[0],step.centre[1],.05,.1,.05).filter(c=>c.id===step.id)).toHaveLength(1);
  });
  it('keeps all dated boards visible and draws a single tall central arch between two rectangular side-window rows at both qualities',()=>{
    canvas();const front=building.researchedProfile!.fronts[0],frame=surveyFront(front.facade!,front.facingHeading!),normal=frame.world(0,0,1).sub(frame.world(0,0,0)).normalize();
    for(const quality of ['low','standard']as const){
      const architecture=buildChunk(chunk,core,quality),signs=buildStorefronts(chunk,core,quality),scene=new THREE.Group();scene.add(architecture,signs);scene.updateMatrixWorld(true);
      for(const store of stores){
        const[a,b]=store.facade!,y=store.appearance!.signBaseM!+store.appearance!.signHeightM!/2,centre=new THREE.Vector3((a[0]+b[0])/2,y,(a[1]+b[1])/2);
        const ray=new THREE.Raycaster(centre.clone().addScaledVector(normal,8),normal.clone().negate(),0,9);
        expect(ray.intersectObject(scene,true)[0]?.object.name,store.name).toMatch(/^store-signs/);
      }
      const glass=architecture.getObjectByName('researched-glazing')!;
      const hit=(u:number,y:number)=>{const p=frame.world(u,y,8);return new THREE.Raycaster(p,normal.clone().negate(),0,9).intersectObject(glass,true)[0];};
      expect(hit(0,8.3)).toBeTruthy();expect(hit(0,10.8)).toBeTruthy(); // same tall arched central bay
      expect(hit(frame.W*.3,6.6)).toBeTruthy();expect(hit(frame.W*.3,9.7)).toBeTruthy(); // side rows
      expect(hit(frame.W*.3,8.3)).toBeUndefined(); // solid white band between side windows
      disposeStorefronts(signs);
    }
  });
});
