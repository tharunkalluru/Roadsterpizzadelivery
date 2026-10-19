import { describe,expect,it,vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { makeFixtureCore } from './fixture';
import { WorldPhysics } from '../../src/world/collision';
import { forwardOf } from '../../src/world/roadIndex';
import { structureObstacles,buildStructures } from '../../src/art/structures';
import { StreetSurvey } from '../../src/world/streetSurvey';
import type { WorldCoreV2 } from '../../src/world/schema';
import type { StreetSurveyData } from '../../src/world/streetSurveyTypes';
vi.mock('../../src/art/mats',async()=>{
  const three=await import('three');return {getWorldMats:()=>new Proxy({}, {get:()=>new three.MeshBasicMaterial({vertexColors:true})})};
});
const read=<T>(path:string)=>JSON.parse(readFileSync(path,'utf8')) as T;

describe('shared pedestrian access clearance',()=>{
  it('moves road-filled access ends onto pavements and visibly connects the relocated stairs',()=>{
    const core={...makeFixtureCore(),lines:['blue'],structures:[{id:'fixture-bridge',kind:'footbridge',name:null,path:[[-4,-500],[4,-500]],elevM:[6,6],widthM:3,supports:[[0,-500]],stairs:[{x:-4,z:-500,heading:Math.PI/2},{x:4,z:-500,heading:-Math.PI/2}],status:{geometry:'provisional'},provenance:{source:'authored',sourceIds:[]}}]} as WorldCoreV2;
    const world=new WorldPhysics(core),obstacles=structureObstacles(core);world.addStructures(obstacles);
    expect(obstacles.filter(o=>/:stairs:\d+$/.test(o.id))).toHaveLength(2);
    expect(obstacles.filter(o=>o.id.endsWith(':connector'))).toHaveLength(2);
    for(let z=-530;z<-470;z+=.5)expect(world.contacts(-3,z,0,1.15,1.05).filter(c=>c.id.startsWith('fixture-bridge'))).toEqual([]);
    const visual=buildStructures(core,'low'),walk=visual.getObjectByName('struct-walkway')!;
    const bounds=new THREE.Box3().setFromObject(walk);expect(bounds.min.x).toBeLessThan(-8);expect(bounds.max.x).toBeGreaterThan(8);
    const columns=visual.getObjectByName('struct-columns') as THREE.InstancedMesh;
    if(columns){const matrix=new THREE.Matrix4(),position=new THREE.Vector3();for(let i=0;i<columns.count;i++){
      columns.getMatrixAt(i,matrix);position.setFromMatrixPosition(matrix);
      const actual=obstacles.find(o=>o.id===`fixture-bridge:column:${i}`)!;
      expect(actual.poly.reduce((n,p)=>n+p[0],0)/actual.poly.length).toBeCloseTo(position.x,5);
      expect(actual.poly.reduce((n,p)=>n+p[1],0)/actual.poly.length).toBeCloseTo(position.z,5);
    }}
  });
  it('keeps all real mapped pedestrian access flights and clears every routable left driving lane',()=>{
    const raw=read<WorldCoreV2>('public/world/hyd-metro/v2/core.json');
    const survey=new StreetSurvey(read<StreetSurveyData>('public/research/street-survey.json'),raw),core=survey.applyCoreCorrections(raw);
    const world=new WorldPhysics(core),obstacles=structureObstacles(core);world.addStructures(obstacles);
    const expected=core.structures.reduce((n,s)=>n+(s.stairs?.length??0),0);
    expect(obstacles.filter(o=>/:stairs:\d+$/.test(o.id))).toHaveLength(expected);
    const conflicts=new Set<string>(),structureIds=new Set(obstacles.map(o=>o.id));
    for(const e of world.nav.edges.values()){
      if(!world.nav.inCore(e.id))continue;
      const r=world.roads.roads.get(e.roadId)!,offset=r.oneway?-Math.max(0,r.widthM/2-2):-r.widthM/4;
      for(let d=3;d<e.lengthM-3;d+=2){
        const p=world.nav.pointOnDirected(e.id,d),[fx,fz]=forwardOf(p.heading);
        for(const c of world.contacts(p.x-fz*offset,p.z+fx*offset,Math.max(0,p.y)+.05,1.15,1.05))if(structureIds.has(c.id))conflicts.add(c.id);
      }
    }
    expect([...conflicts]).toEqual([]);
  });
});
