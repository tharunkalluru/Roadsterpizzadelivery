import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve,dirname } from 'node:path';
import * as THREE from 'three';
import { actualWorldWorker } from '../../tests/fixtures/actual-world-worker';
import { actualPlayer } from '../../tests/fixtures/actual-player';
import { EmittedPlayerGeometry,actualPlayerContactProbe } from '../../tests/fixtures/emitted-player-contact';
import { collideBuildings,collideWalls } from '../../src/game/physics';
import type { RoadEdge } from '../../src/world/types';
import { triangleHeight,type TriangleRecord } from './road-release-finite';

const args=process.argv.slice(2),option=(name:string)=>{const i=args.indexOf(name);if(i<0||!args[i+1])throw Error(`Missing ${name}`);return args[i+1];};
const manifestPath=resolve(option('--manifest')),output=resolve(option('--output'));if(existsSync(output))throw Error('Preserve existing actual-Player evidence; choose a new output.');
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex'),manifestBytes=readFileSync(manifestPath),manifest=JSON.parse(manifestBytes.toString()),inputs:Record<string,string>={};
function read(ref:{path:string;sha256:string}){assert.match(ref.sha256,/^[a-f0-9]{64}$/);const file=resolve(dirname(manifestPath),ref.path),bytes=readFileSync(file);assert.equal(hash(bytes),ref.sha256,`Held artifact changed ${file}`);inputs[file]=ref.sha256;return JSON.parse(bytes.toString());}
const model=read(manifest.candidate.model),caseData=read(manifest.knownCases),cases=caseData.cases;
assert.equal(cases.length,30,'Retain every historical case, not only the candidate unresolved list');
assert.equal(new Set(cases.map((c:any)=>`${c.node}/${c.roads.join('/')}`)).size,30);
const runtime=await actualWorldWorker({verifiedCache:args.includes('--verified-cache')});assert.equal(runtime.sourceCoreSHA256,manifest.sourceCoreSHA256);
const roads=runtime.core.roads,byId=new Map(roads.map(e=>[e.id,e])),heldById=new Map<string,RoadEdge>(model.roads.map((e:RoadEdge)=>[e.id,e]));
const physical=(e:RoadEdge)=>({id:e.id,pts:e.pts,elev:e.elev,w:e.w,lanes:e.lanes,from:e.from,to:e.to,oneway:e.oneway,joinedPavement:e.joinedPavement,scenerySource:e.scenerySource});
for(const e of roads){const held=heldById.get(e.id);assert.ok(held,`Actual World road missing from held model ${e.id}`);assert.deepEqual(physical(e),physical(held),`Actual World differs from held conditioned geometry ${e.id}`);}
const idle={allowReverse:false,throttle:0,brake:0,steer:0,flyPressed:false,boost:false,jumpPressed:false};
const results:any[]=[];
function path(e:RoadEdge,reverse:boolean){
  const points=e.pts.map((p,i)=>[p[0],e.elev?.[i]??0,p[1]] as[number,number,number]);if(reverse)points.reverse();const arc=[0];
  for(let i=1;i<points.length;i++)arc.push(arc[i-1]+Math.hypot(points[i][0]-points[i-1][0],points[i][2]-points[i-1][2]));
  const at=(s:number)=>{let i=1;while(i<arc.length-1&&arc[i]<s)i++;const a=points[i-1],b=points[i],length=arc[i]-arc[i-1],u=Math.max(0,Math.min(1,(s-arc[i-1])/(length||1)));return{x:a[0]+(b[0]-a[0])*u,y:a[1]+(b[1]-a[1])*u,z:a[2]+(b[2]-a[2])*u,hx:(b[0]-a[0])/(length||1),hz:(b[2]-a[2])/(length||1)};};return{total:arc.at(-1)!,at};
}
try{
  for(const c of cases){
    assert.ok(c.groundRoad,'Historical bypass selection must be explicit and retained');const e=byId.get(c.groundRoad);assert.ok(e,`Missing historical bypass ${c.groundRoad}`);
    const route=path(e,e.to===c.node),limit=Math.min(250,route.total-4),poses:any[]=[];
    for(let s=5;s<=limit;s+=2.5){const p=route.at(s);for(const side of[0,-1.3,1.3])poses.push({...p,x:p.x-p.hz*side,z:p.z+p.hx*side,distance:s,side,yaw:Math.atan2(-p.hx,-p.hz)});}
    assert.ok(poses.length,`No retained path samples ${e.id}`);
    const bounds={minX:Math.min(...poses.map(p=>p.x))-12,maxX:Math.max(...poses.map(p=>p.x))+12,minZ:Math.min(...poses.map(p=>p.z))-12,maxZ:Math.max(...poses.map(p=>p.z))+12};
    const geometry=new EmittedPlayerGeometry(bounds),city:any={group:new THREE.Group(),surfaceGrid:new Map(),buildingGrid:new Map(),walls:new Map(),obstacles:new Map(),movingRail:[],railwayWalls:[],landmarkSurfaceGrid:new Map(),waterGrid:new Map(),metroFlightClearance:runtime.world.metroFlightClearance};
    const structural=new Map<string,{mat:string;triangle:TriangleRecord}[]>(),tiles=new Set<string>();
    for(const p of poses)for(const dx of[-12,12])for(const dz of[-12,12])tiles.add(`${Math.floor((p.x+dx)/1000)}_${Math.floor((p.z+dz)/1000)}`);
    for(const key of tiles){
      const tile=await runtime.build(key);geometry.collect(tile);
      for(const name of['surfaceGrid','buildingGrid','walls','obstacles','landmarkSurfaceGrid','waterGrid']as const)for(const[cell,list]of tile[name]??[])city[name].set(cell,[...(city[name].get(cell)??[]),...list]);
      // Keep actual non-road civil buffers for screenshot3 class diagnostics.
      // A flagged face is not itself an automatic closed-volume assertion.
      for(const b of tile.buffers){if(!['st','foot','kerb','wall'].includes(b.mat))continue;
        for(let n=0;n<b.pos.length;n+=9){const p=[Array.from(b.pos.slice(n,n+3)),Array.from(b.pos.slice(n+3,n+6)),Array.from(b.pos.slice(n+6,n+9))] as TriangleRecord['points'];
          const minX=Math.min(...p.map(p=>p[0])),maxX=Math.max(...p.map(p=>p[0])),minZ=Math.min(...p.map(p=>p[2])),maxZ=Math.max(...p.map(p=>p[2]));if(maxX<bounds.minX||minX>bounds.maxX||maxZ<bounds.minZ||minZ>bounds.maxZ)continue;
          const triangle:TriangleRecord={road:'civil:'+b.mat,points:p,arc:[0,0],centre:[[p[0][0],p[0][2]],[p[1][0],p[1][2]]],tile:key};
          if(triangleHeight(triangle,(p[0][0]+p[1][0]+p[2][0])/3,(p[0][2]+p[1][2]+p[2][2])/3)===null)continue;
          for(let x=Math.floor(minX/4);x<=Math.floor(maxX/4);x++)for(let z=Math.floor(minZ/4);z<=Math.floor(maxZ/4);z++){const k=`${x},${z}`;(structural.get(k)??structural.set(k,[]).get(k)!).push({mat:b.mat,triangle});}
        }
      }
      tile.buffers.length=0;
    }
    const actual=actualPlayer(city),player=actual.player,probe=actualPlayerContactProbe(player,geometry),stagingFailures:any[]=[],solidWitnesses:any[]=[],civilFaces:any[]=[];
    let frames=0;
    try{
      for(const pose of poses){
        player.place(pose.x,pose.z,pose.yaw,pose.y);const placed=player.pos.clone();
        // If ordinary placement picks a competing layer, do not silently stage
        // the car above its obstruction or report that as bypass clearance.
        if(Math.abs(player.pos.y-.55-pose.y)>.05)stagingFailures.push({pose,actual:player.pos.toArray(),expectedSupport:pose.y});
        probe.measure(frames++);
        for(let f=1;f<=20;f++)player.update(1/60,idle,f/60);
        probe.measure(frames++);
        if(Math.hypot(player.pos.x-placed.x,player.pos.z-placed.z)>.02&&stagingFailures.length<30)stagingFailures.push({pose,reason:'actual collision displaced the stationary vehicle',before:placed.toArray(),after:player.pos.toArray()});
        for(const along of[-1.25,0,1.25]){
          const p={x:player.pos.x+player.forward.x*along,z:player.pos.z+player.forward.z*along},bottom=player.pos.y-.4;
          if(collideWalls(city,p,{...p},1.15,bottom,player.pos.y+.8).hit>.02||collideBuildings(city,{...p},1.15,bottom,player.pos.y+.8)>.02)if(solidWitnesses.length<30)solidWitnesses.push({pose,point:p,player:player.pos.toArray()});
          for(const entry of structural.get(`${Math.floor(p.x/4)},${Math.floor(p.z/4)}`)??[]){const top=triangleHeight(entry.triangle,p.x,p.z);if(top===null||top-pose.y<.15||top-pose.y>1.8)continue;if(civilFaces.length<100)civilFaces.push({pose,point:p,material:entry.mat,height:top,gapAboveSelectedRoad:top-pose.y,triangle:entry.triangle.points,tile:entry.triangle.tile});}
        }
      }
      const contact=probe.result();results.push({node:c.node,roads:c.roads,bypass:e.id,classification:'actual production World/tileworker + stationary actual Player placement/settling; not input-driven route proof',stepMetres:2.5,sideOffsets:[0,-1.3,1.3],maximumRunMetres:250,poses:poses.length,measuredFrames:frames,geometry:geometry.counts,contact,stagingFailures,solidWitnesses,civilFaceDiagnostics:civilFaces,
        slabGatePassed:contact.slabFrames===0,layerAndObstacleGatePassed:stagingFailures.length===0&&solidWitnesses.length===0,
        strictContactGatePassed:contact.wheelFramesOutside1cm===0&&contact.missingWheelFrames===0&&(contact.minTyreSupport===null||contact.minTyreSupport>=-.01)&&(contact.minBodySupport===null||contact.minBodySupport>=-.02),civilDiagnosticsReviewed:false});
      console.log(JSON.stringify({bypass:e.id,poses:poses.length,slabFrames:contact.slabFrames,stagingFailures:stagingFailures.length,solidWitnesses:solidWitnesses.length,civilFaces:civilFaces.length}));
    }finally{actual.dispose();}
  }
  runtime.verifySources();for(const[file,sha]of Object.entries(runtime.sourcePackHashes))inputs[file]=sha;
  const changedInputs=Object.entries(inputs).filter(([f,sha])=>hash(readFileSync(f))!==sha).map(([f])=>f);assert.equal(hash(readFileSync(manifestPath)),hash(manifestBytes));
  const report={schemaVersion:1,scope:'Thirty retained historical bypass cases, actual production World and actual tileworker with Node message/file adapters, actual visible Player transforms; stationary placement/settling scope, not native or physical-phone performance',inputs,changedInputs,sourceCoreSHA256:runtime.sourceCoreSHA256,modelSHA256:manifest.candidate.model.sha256,modelOverlay:runtime.world.modeledRoadReport,conditionedProfiles:runtime.world.conditionedProfileReport,roadCache:runtime.roadCache,actualWorldModelParity:true,workerTransfers:runtime.messageTransfers,results,
    cases:results.length,slabFailures:results.filter(r=>!r.slabGatePassed).length,layerOrObstacleFailures:results.filter(r=>!r.layerAndObstacleGatePassed).length,strictContactFailures:results.filter(r=>!r.strictContactGatePassed).length,civilDiagnosticsComplete:false,releaseApproved:false};
  writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,cases:report.cases,slabFailures:report.slabFailures,layerOrObstacleFailures:report.layerOrObstacleFailures,strictContactFailures:report.strictContactFailures,changedInputs,releaseApproved:false}));
  process.exitCode=report.slabFailures||report.layerOrObstacleFailures||report.strictContactFailures||changedInputs.length?1:0;
}finally{runtime.dispose();}
