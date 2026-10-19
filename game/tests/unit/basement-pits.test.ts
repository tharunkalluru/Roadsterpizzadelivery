import {describe,expect,it}from'vitest';
import {readFileSync}from'node:fs';
import type{WorldCore,WorldChunkV2,WorldManifest}from'../../src/world/schema';
import {StreetSurvey,type StreetSurveyData}from'../../src/world/streetSurvey';
import{SourceAccuracyLayer,type SourceAccuracyData}from'../../src/world/sourceAccuracy';
import{WorldPhysics}from'../../src/world/collision';
import{buildingAccessPlan,buildingAccessObstacles,buildingAccessCutouts}from'../../src/world/buildingAccess';
import{getAccessPits,accessPitSurfaceAt,accessPitsVersion,type AccessPit}from'../../src/world/accessPits';
const read=<T>(path:string)=>JSON.parse(readFileSync(path,'utf8'))as T;
const base='public/world/hyd-metro/v2/',manifest=read<WorldManifest>(base+'manifest.json');
function fixture(){
 const layer=new SourceAccuracyLayer(read<SourceAccuracyData>(base+manifest.sourceAccuracy!.file)),sourceCore=layer.applyCore(read<WorldCore>(base+manifest.core.file)),survey=new StreetSurvey(read<StreetSurveyData>('public/research/street-survey.json'),sourceCore),core=survey.applyCoreCorrections(sourceCore),world=new WorldPhysics(core);
 const chunks=manifest.chunks.map(ref=>read<WorldChunkV2>(base+ref.file)).filter(c=>c.buildings.some(b=>['b_42a55533aa','b_743cd80e16','b_29048e3fbb','b_1e30f3f250'].includes(b.id))).map(raw=>survey.applyChunk(layer.applyChunk(raw)));
 return{core,world,chunks};
}
function worldPoint(p:AccessPit,u:number,v:number):[number,number]{const c=Math.cos(p.yaw),s=Math.sin(p.yaw);return[p.centre[0]+u*c+v*s,p.centre[1]-u*s+v*c];}
describe('shared provisional below-grade access',()=>{
 it('replaces flat painted openings with descending treads, lower floor and matching walls',()=>{
  const{world,chunks}=fixture();const pits:AccessPit[]=[];
  for(const chunk of chunks)for(const b of chunk.buildings){
   const plan=buildingAccessPlan(b,chunk.storefronts.filter(s=>s.buildingId===b.id),world.roads),solids=buildingAccessObstacles(plan);
   for(const p of plan.pits){pits.push(p);expect(p.dimensionStatus).toBe('provisional');expect(p.verticalDropBasis).toBe('authored_estimate_not_measured');expect(p.floorM).toBeLessThan(-.4);expect(p.rimM-p.floorM).toBeCloseTo(.66);expect(p.stepCount).toBe(6);
    const cuts=buildingAccessCutouts(plan);expect(cuts.some(c=>c.bottom<p.floorM&&c.poly===p.poly)).toBe(true);
    expect(plan.boxes.some(box=>box.top===p.floorM&&box.bottom<p.floorM&&box.solid)).toBe(true);
    expect(solids.some(s=>s.id===p.ceilingId&&s.bottom===p.ceilingM)).toBe(true);
    const tops=plan.boxes.filter(box=>box.kind==='step'&&box.bottom<p.floorM+.01).map(b=>b.top).sort((a,b)=>a-b);
    expect(tops).toHaveLength(6);for(let i=0;i<tops.length;i++)expect(tops[i]).toBeCloseTo(p.floorM+.11*(i+1));
    // No negative step is converted into a zero-based invisible collider.
    for(const box of plan.boxes.filter(b=>b.kind==='step'&&b.top<0))expect(solids.find(s=>s.id===box.id)?.bottom).toBe(box.bottom);
   }
  }
  expect(pits).toHaveLength(4);
 });
 it('samples the exact loaded tread tops and exposes a real lower void without a canonical ground wall',()=>{
  const{core,world,chunks}=fixture();for(const chunk of chunks)world.addChunk(chunk);expect(getAccessPits(core)).toHaveLength(4);
  for(const p of getAccessPits(core)){
   const lower=worldPoint(p,0,-p.depthM/2+p.landingDepthM/2);
   expect(accessPitSurfaceAt(core,...lower)?.height).toBe(p.floorM);expect(world.roads.groundHeight(...lower,null,0,.5)).toBe(p.floorM);
   expect(world.contacts(lower[0],lower[1],p.floorM+.02,.08,.02).filter(c=>!c.vertical),p.id).toEqual([]);
   for(let k=0;k<p.stepCount;k++){
    const point=worldPoint(p,0,-p.depthM/2+p.landingDepthM+(k+.5)*p.stairRunM/p.stepCount);
    expect(world.roads.groundHeight(...point,null,0,.5)).toBeCloseTo(p.floorM+(k+1)*.11);
   }
   const edge=worldPoint(p,p.widthM/2+.055,0);expect(world.contacts(edge[0],edge[1],p.floorM+.05,.08,.025).some(c=>c.id.includes(':opening:')),p.id).toBe(true);
   // These source-facing voids must not remove any same-level vehicle roadway.
   for(const [x,z]of p.poly)expect(world.roads.surface(x,z,{maxY:.3,margin:.55}),p.id).toBeNull();
  }
 });
 it('removes terrain holes and negative support when their collision chunk unloads',()=>{
  const{core,world,chunks}=fixture();const version=accessPitsVersion(core);for(const chunk of chunks)world.addChunk(chunk);expect(accessPitsVersion(core)).toBeGreaterThan(version);const before=getAccessPits(core).map(p=>worldPoint(p,0,0));
  for(const chunk of chunks)world.removeChunk(chunk.id);expect(getAccessPits(core)).toEqual([]);
  for(const[x,z]of before){expect(accessPitSurfaceAt(core,x,z)).toBeUndefined();expect(world.roads.groundHeight(x,z,null,0,.5)).toBeGreaterThanOrEqual(0);}
 });
});
