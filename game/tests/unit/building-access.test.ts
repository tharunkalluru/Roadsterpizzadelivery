import { describe,expect,it,vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import type { Building,WorldChunkV2,WorldCore,WorldManifest } from '../../src/world/schema';
import { StreetSurvey } from '../../src/world/streetSurvey';
import type { StreetSurveyData } from '../../src/world/streetSurveyTypes';
import { SourceAccuracyLayer,type SourceAccuracyData } from '../../src/world/sourceAccuracy';
import { WorldPhysics } from '../../src/world/collision';
import { buildingAccessPlan,buildingAccessObstacles,buildingAccessCutouts,accessBoxPolygon } from '../../src/world/buildingAccess';
import { appendBuildingAccess,type ResearchedBuilders } from '../../src/art/researchedBuildings';
import { GeoBuilder } from '../../src/art/geo';
import { buildChunk } from '../../src/art/buildings';
vi.mock('../../src/art/mats',async()=>{const three=await import('three');return {getWorldMats:()=>new Proxy({}, {get:()=>new three.MeshBasicMaterial({vertexColors:true})})};});
vi.mock('../../src/art/sign',async()=>{const three=await import('three');return {createSignTexture:async()=>new three.Texture()};});
const read=<T>(path:string)=>JSON.parse(readFileSync(path,'utf8'))as T;
const base='public/world/hyd-metro/v2/',manifest=read<WorldManifest>(base+'manifest.json');
const source=new SourceAccuracyLayer(read<SourceAccuracyData>(base+manifest.sourceAccuracy!.file));
const rawCore=read<WorldCore>(base+manifest.core.file),survey=new StreetSurvey(read<StreetSurveyData>('public/research/street-survey.json'),rawCore);
const core=survey.applyCoreCorrections(rawCore),world=new WorldPhysics(core);
const chunks=manifest.chunks.map(c=>read<WorldChunkV2>(base+c.file)).filter(c=>c.buildings.some(b=>survey.data.corrections.some(q=>'buildingId'in q&&q.buildingId===b.id))).map(c=>survey.applyChunk(source.applyChunk(c)));
const hasAccess=(b:Building)=>b.researchedProfile?.fronts.some(f=>f.access)||['madhapur_commercial','madhapur_brown_commercial','habsiguda_gatsi_block'].includes(b.surveyStyle??'');

describe('shared roadside building access',()=>{
  it('clears every actual researched landing, stair and rail from same-level vehicle carriageways',()=>{
    const visited:string[]=[],recessed:string[]=[],fitted:string[]=[],conflicts:string[]=[];
    for(const chunk of chunks)for(const b of chunk.buildings.filter(hasAccess)){
      const plan=buildingAccessPlan(b,chunk.storefronts.filter(s=>s.buildingId===b.id),world.roads);visited.push(b.id);
      expect(plan.adjustments.some(a=>a.status==='omitted_no_clearance'),b.id).toBe(false);
      expect(plan.boxes.some(p=>p.kind==='step'),b.id).toBe(true);
      if(b.id==='b_b5036a537e'){
        expect(plan.adjustments).toHaveLength(9);
        expect(plan.recesses).toHaveLength(0); // source-local entry sections fit without pulling back the whole arcade wall
        for(const [i,front]of b.researchedProfile!.fronts.entries())if(front.accessOnly){
          const [a,z]=front.facade!,dx=z[0]-a[0],dz=z[1]-a[1],W=Math.hypot(dx,dz);
          const boxes=plan.boxes.filter(p=>p.id.includes(`:profile-${i}-0:`));expect(boxes.length).toBeGreaterThan(0);
          for(const box of boxes)for(const p of accessBoxPolygon(box)){
            const u=((p[0]-a[0])*dx+(p[1]-a[1])*dz)/W;
            expect(u).toBeGreaterThan(-.2);expect(u).toBeLessThan(W+.2);
          }
        }
      }

      if(plan.adjustments.some(a=>a.status==='recessed_for_road_clearance'))recessed.push(b.id);
      if(plan.adjustments.some(a=>a.depthScale<1))fitted.push(b.id);
      for(const shape of buildingAccessObstacles(plan)){
        // Dense interior sampling catches roads crossing a broad landing, not just corner hits.
        const [a,b,c,d]=shape.poly;
        const nu=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.25)),nv=Math.max(1,Math.ceil(Math.hypot(d[0]-a[0],d[1]-a[1])/.25));
        for(let i=0;i<=nu;i++)for(let j=0;j<=nv;j++){
          const x=a[0]+(b[0]-a[0])*i/nu+(d[0]-a[0])*j/nv,z=a[1]+(b[1]-a[1])*i/nu+(d[1]-a[1])*j/nv;
          for(const road of world.roads.segmentsNear(x,z)){
            if(road.road.tunnel||/^(footway|pedestrian|path|steps|cycleway|track)$/.test(road.road.highway))continue;
            const dx=road.bx-road.ax,dz=road.bz-road.az,t=Math.max(0,Math.min(1,((x-road.ax)*dx+(z-road.az)*dz)/(road.len*road.len))),y=road.ay+(road.by-road.ay)*t;
            if(y<-.5||y>shape.top+.75)continue;
            if(Math.hypot(x-road.ax-dx*t,z-road.az-dz*t)<road.halfWidth+.55)conflicts.push(`${shape.id}:${road.road.id}`);
          }
        }
      }
    }
    expect(visited).toEqual(expect.arrayContaining(['b_29048e3fbb','b_8490a44a37','b_42a55533aa','b_743cd80e16','b_1f09a30466']));
    expect(recessed).toContain('b_29048e3fbb');expect(fitted).toContain('b_8490a44a37');
    expect([...new Set(conflicts)]).toEqual([]);
  });
  it('uses exactly the road-cleared plan in actual chunk meshes and honours absent Bawarchi railings',()=>{
    const chunk=chunks.find(c=>c.buildings.some(b=>b.id==='b_29048e3fbb'))!,building=chunk.buildings.find(b=>b.id==='b_29048e3fbb')!;
    const stores=chunk.storefronts.filter(s=>s.buildingId===building.id),plan=buildingAccessPlan(building,stores,world.roads);
    expect(plan.beams).toHaveLength(0);expect(plan.boxes.some(b=>b.kind==='post'||b.kind==='rail')).toBe(false);
    const B:ResearchedBuilders={cladding:new GeoBuilder(true),glazing:new GeoBuilder(true),details:new GeoBuilder(true)};appendBuildingAccess(plan,B);
    const sceneChunk:WorldChunkV2={...chunk,buildings:[building],storefronts:stores};
    const scene=buildChunk(sceneChunk,core,'standard');
    const actual=(scene.getObjectByName('researched-cladding')as THREE.Mesh).geometry.getAttribute('position');
    // Every access vertex is present in the final scene; stale un-cleared art cannot be used instead.
    const vertices=new Set<string>();for(let i=0;i<actual.count;i++)vertices.add([actual.getX(i),actual.getY(i),actual.getZ(i)].map(n=>n.toFixed(3)).join(','));
    for(let i=0;i<B.cladding.pos.length;i+=3)expect(vertices.has(B.cladding.pos.slice(i,i+3).map(n=>Math.fround(n).toFixed(3)).join(','))).toBe(true);
    const solids=buildingAccessObstacles(plan);expect(solids.some(s=>s.id.includes(':landing:')&&s.bottom===0&&s.top>1)).toBe(true);
    for(const box of plan.boxes.filter(b=>b.solid))expect(solids.find(s=>s.id===box.id)?.poly).toEqual(accessBoxPolygon(box));
    expect(scene.userData.buildingAccess).toEqual(expect.arrayContaining([expect.objectContaining({buildingId:building.id,adjustments:plan.adjustments})]));
    scene.updateMatrixWorld(true);
    const step=plan.boxes.find(b=>b.kind==='step'&&b.top>.7&&b.top<.8)!,nx=Math.sin(step.yaw),nz=Math.cos(step.yaw);
    const ray=new THREE.Raycaster(new THREE.Vector3(step.centre[0]+nx*20,.61,step.centre[1]+nz*20),new THREE.Vector3(-nx,0,-nz),0,30),hit=ray.intersectObject(scene,true)[0];
    expect(hit?.object.name).toBe('researched-cladding');
    // A leftover canonical ground wall would be hit before these recessed step risers.
    expect((hit.point.x-step.centre[0])*nx+(hit.point.z-step.centre[1])*nz).toBeCloseTo(step.depthM/2,2);
    const cutout=buildingAccessCutouts(plan)[0];expect(cutout.ceilingId).toBeTruthy();expect(solids.some(s=>s.id===cutout.ceilingId&&s.bottom===cutout.top)).toBe(true);

  });
});
