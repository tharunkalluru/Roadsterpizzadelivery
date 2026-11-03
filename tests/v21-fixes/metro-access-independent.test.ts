import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {Batch,initTemplates} from '../../src/core/util';
import {buildTile,type Surface,type TileBuilt} from '../../src/world/city';
import {metroCorridors,metroPlatformAssemblies,sampleMetroPath,type MetroPlatformAssembly} from '../../src/world/metro-geometry';
import {stationAccessPlan,stationInterchangeTransfers,stationBuildingOccupied,flightClear,landingClear,drawStationLanding,drawStationFlight,drawStationLift,drawStationEntryPortal,type StationAccessLanding,type StationAccessFlight,type StationAccessBuildObservation} from '../../src/world/metro-station-access';
import {metroFlightClearance} from '../../src/world/metro-flight-clearance';
import type {StructureFootprint,StructureSupport} from '../../src/world/structure-clearance';
import {prepareRoadGrades,currentRoadGradePatches,applyRoadGradePatches} from '../../src/world/road-grades';
import type {CoreData,Building} from '../../src/world/types';

const core:CoreData=JSON.parse(gunzipSync(readFileSync('public/city/core.pack.wasm')).toString());
const assemblies=metroPlatformAssemblies(core.metro.stations,metroCorridors(core.metro.lines),core.metro.deckHeight);
const patches=currentRoadGradePatches(prepareRoadGrades(core.roads));
const packs=new Map<string,any>(),tiles=new Map<string,Surface[]>(),supports=new Map<string,StructureSupport[]>(),built=new Map<string,TileBuilt>(),observations=new Map<string,StationAccessBuildObservation>();
const tileKey=(a:MetroPlatformAssembly)=>`${Math.floor(a.source.p[0]/1000)}_${Math.floor(a.source.p[1]/1000)}`;
function productionSurfaces(a:MetroPlatformAssembly){
  const i=Math.floor(a.source.p[0]/1000),j=Math.floor(a.source.p[1]/1000),key=`${i}_${j}`;
  if(tiles.has(key))return tiles.get(key)!;
  const pack=core.packs.find(p=>p.tiles.some(([x,z])=>x===i&&z===j))!;
  let data=packs.get(pack.file);if(!data){data=JSON.parse(gunzipSync(readFileSync(`public/city/${pack.file}`)).toString());packs.set(pack.file,data);}
  const zone=data.tiles[key],roads=applyRoadGradePatches(zone.roads,patches),tile=buildTile({...zone,roads},{lowQ:true,metro:core.metro,observeStationAccess:o=>observations.set(o.assembly.key,o)});
  built.set(key,tile);
  const surfaces=[...new Set([...tile.surfaceGrid.values()].flat())];tiles.set(key,surfaces);supports.set(key,tile.structureSupports);return surfaces;
}
function horizontalSupport(surfaces:readonly Surface[],x:number,z:number,y:number){
  return surfaces.some(s=>{
    if(s.kind!=='pad'||Math.abs(s.ya-y)>.015||Math.abs(s.yb-y)>.015)return false;
    const dx=s.bx-s.ax,dz=s.bz-s.az,length=Math.hypot(dx,dz)||1;
    const u=((x-s.ax)*dx+(z-s.az)*dz)/length,v=(-(x-s.ax)*dz+(z-s.az)*dx)/length;
    return u>=-.015&&u<=length+.015&&Math.abs(v)<=s.hw+.015;
  });
}

test('every retained production platform stair has a usable lower connection to its real concourse floor',t=>{
  initTemplates();let retained=0;const gaps:any[]=[];
  for(const a of assemblies){
    const surfaces=productionSurfaces(a),floor=a.deckHeight-4.2;
    for(const f of stationAccessPlan(a).platformFlights){
      // Omitted unsafe flights must not be mistaken for detached generated ones.
      if(!surfaces.some(s=>Math.hypot(s.ax-f.from.x,s.az-f.from.z)<1e-6&&Math.hypot(s.bx-f.to.x,s.bz-f.to.z)<1e-6&&Math.abs(s.ya-floor)<1e-6))continue;
      retained++;const dx=f.to.x-f.from.x,dz=f.to.z-f.from.z,len=Math.hypot(dx,dz),nx=-dz/len,nz=dx/len;
      let supportedWidth=0;
      for(let v=-f.width/2+.025;v<f.width/2;v+=.05)if(horizontalSupport(surfaces,f.from.x+nx*v,f.from.z+nz*v,floor))supportedWidth+=.05;
      if(supportedWidth<.6)gaps.push({station:a.key,side:f.side,end:f.end,from:f.from,supportedWidth});
    }
  }
  t.diagnostic(JSON.stringify({assemblies:assemblies.length,retainedPlatformFlights:retained,gaps}));
  assert.ok(retained>100,'exercise the actual packed generated stairs, not only an empty plan');
  assert.deepEqual(gaps,[],'curved stairs need a real lower landing or sufficient overlap with the actual concourse slab');
});

function footprintContains(p:StructureFootprint,x:number,z:number,pad=0){
  if('r' in p)return Math.hypot(x-p.x,z-p.z)<=p.r+pad;
  return Math.abs((x-p.x)*p.hx+(z-p.z)*p.hz)<=p.hl+pad&&Math.abs(-(x-p.x)*p.hz+(z-p.z)*p.hx)<=p.hw+pad;
}

test('retained curved lower landing links enter a real concourse slab through an open full-width parapet gap',t=>{
  initTemplates();let retained=0,guardChecks=0;
  for(const a of assemblies){
    const surfaces=productionSurfaces(a),solid=supports.get(tileKey(a))!,floor=a.deckHeight-4.2;
    const {cx,cz,hx,hz}=a.frame;
    for(const lower of stationAccessPlan(a).platformLinks.filter(l=>l.id.endsWith(':concourse-landing'))){
      if(!surfaces.some(s=>Math.hypot(s.ax-lower.from.x,s.az-lower.from.z)<1e-6&&Math.hypot(s.bx-lower.to.x,s.bz-lower.to.z)<1e-6&&Math.abs(s.ya-floor)<1e-6&&Math.abs(s.yb-floor)<1e-6))continue;
      retained++;
      assert.ok(solid.some(s=>s.source===a.key&&s.part==='station_concourse'&&Math.abs(s.top-floor)<1e-6&&footprintContains(s.footprint,lower.to.x,lower.to.z)),'lower landing must enter the actually retained concourse floor, not end in another isolated pad');
      const dx=lower.to.x-lower.from.x,dz=lower.to.z-lower.from.z,length=Math.hypot(dx,dz),nx=-dz/(length||1),nz=dx/(length||1),n=Math.max(1,Math.ceil(length/.1));
      for(let i=0;i<=n;i++)for(const v of [-lower.width/2+.12,0,lower.width/2-.12]){
        const x=lower.from.x+dx*i/n+nx*v,z=lower.from.z+dz*i/n+nz*v;
        const localV=-(x-cx)*hz+(z-cz)*hx;
        if(Math.abs(Math.abs(localV)-10.02)>.3)continue;
        guardChecks++;
        assert.ok(!solid.some(s=>s.source===a.key&&s.part==='station_concourse'&&s.bottom>floor-.05&&s.top>floor+.9&&footprintContains(s.footprint,x,z,.015)),`${a.key}: concourse parapet blocks a lower landing`);
      }
    }
  }
  assert.ok(retained>100&&guardChecks>0,'exercise real retained lower links and their guard crossings');
  t.diagnostic(JSON.stringify({retainedLowerLinks:retained,guardCrossingSamples:guardChecks}));
});

test('new curved lower landing vertices remain inside the indexed static flight envelope',t=>{
  initTemplates();const lookup=metroFlightClearance(core.metro);let vertices=0;
  for(const a of assemblies){
    const batch=new Batch();
    for(const l of stationAccessPlan(a).platformLinks.filter(l=>l.id.endsWith(':concourse-landing')))drawStationLanding(l,{st:batch});
    for(let i=0;i<batch.pos.length;i+=3){const [x,y,z]=[batch.pos[i],batch.pos[i+1],batch.pos[i+2]];assert.ok([x,y,z].every(Number.isFinite));assert.ok(lookup.heightAt(x,z)+.01>=y,`${a.key}: new lower link exceeds the indexed flight envelope`);vertices++;}
  }
  assert.ok(vertices>10000);t.diagnostic(JSON.stringify({newLowerLandingVertices:vertices}));
});

test('all access geometry including both platform landing links retains the per-station static vertex budget',t=>{
  initTemplates();let total=0,max=0,maxStation='';
  for(const a of assemblies){
    const batch=new Batch(),B={st:batch},plan=stationAccessPlan(a);
    for(const f of [...plan.arms.flatMap(arm=>arm.flights),...plan.platformFlights])drawStationFlight(f,B,true,a.lineId);
    for(const arm of plan.arms){drawStationLanding(arm.rest,B);drawStationLanding(arm.link,B);drawStationEntryPortal(arm,B,a.lineId);}
    for(const l of plan.platformLinks)drawStationLanding(l,B);
    for(const lift of plan.lifts)drawStationLift(lift,a,B);
    const vertices=batch.pos.length/3;assert.ok(vertices<48000,`${a.key}: access geometry exceeds its declared static budget`);
    total+=vertices;if(vertices>max){max=vertices;maxStation=a.key;}
  }
  t.diagnostic(JSON.stringify({assemblies:assemblies.length,totalAccessVertices:total,maxAccessVertices:max,maxStation}));
});

function syntheticAssembly(){
  const metro={lines:[{id:'blue',pts:[[500,100],[500,900]] as [number,number][]}],stations:[{id:'fixture',p:[500,500] as [number,number],lines:['blue']}],deckHeight:11};
  return metroPlatformAssemblies(metro.stations,metroCorridors(metro.lines),metro.deckHeight)[0];
}
function occupancy(a:MetroPlatformAssembly,u:number,v:number){
  const P=(u:number,v:number)=>[a.frame.cx+a.frame.hx*u-a.frame.hz*v,a.frame.cz+a.frame.hz*u+a.frame.hx*v] as [number,number];
  const b={id:'visible-untrimmed-adjacent-building',h:22,ring:[P(u-2,v-.45),P(u+2,v-.45),P(u+2,v+.45),P(u-2,v+.45)]} as Building;
  const grid=new Map<string,Building[]>();for(let i=8;i<=11;i++)for(let j=8;j<=11;j++)grid.set(`${i},${j}`,[b]);
  return (x:number,z:number,pad:number,bottom=0)=>stationBuildingOccupied(grid,x,z,pad,bottom);
}
function blockedLink(link:StationAccessLanding,occupied:ReturnType<typeof occupancy>){
  const length=Math.hypot(link.to.x-link.from.x,link.to.z-link.from.z),n=Math.max(1,Math.ceil(length/.25));
  for(let i=0;i<=n;i++){const u=i/n;if(occupied(link.from.x+(link.to.x-link.from.x)*u,link.from.z+(link.to.z-link.from.z)*u,link.width/2,link.from.y-.35))return true;}
  return false;
}

function actualAccess(a:MetroPlatformAssembly){
  productionSurfaces(a);const key=tileKey(a),tile=built.get(key)!,observation=observations.get(a.key)!;
  assert.ok(observation,`${a.key}: inspect actual emitted station plans, not a reconstructed ghost plan`);
  const {clear,occupied,plan}=observation;
  const sameTile=assemblies.filter(other=>tileKey(other)===key),transfers=stationInterchangeTransfers(sameTile,clear,occupied),shared=transfers.some(tr=>tr.stationId===a.stationId);
  return{key,tile,clear,occupied,shared,plan};
}

test('moving a street stair past an adjacent building cannot route its upper landing through that same building',()=>{
  const a=syntheticAssembly(),occupied=occupancy(a,37.5,14),plan=stationAccessPlan(a,()=>true,occupied);
  assert.ok(plan.arms.length>0);
  assert.ok(plan.arms.every(arm=>!blockedLink(arm.link,occupied)),'flight clearance alone does not protect its horizontal concourse link');
});

test('a clear lift shaft cannot leave its concourse/platform links inside a visible neighboring building',()=>{
  const a=syntheticAssembly(),occupied=occupancy(a,20,16),plan=stationAccessPlan(a,()=>true,occupied);
  assert.ok(plan.lifts.length>0);
  assert.ok(plan.lifts.every(lift=>lift.links.every(link=>!blockedLink(link,occupied))),'check the full links as well as the shaft position');
});

test('actual packed buildings and runtime road grades retain at least one ground entry for every station identity',t=>{
  initTemplates();
  const stations=new Map<string,{key:string;arms:number;lifts:number;platformFlights:number;shared:boolean}[]>(),fallbackProbes:any[]=[];
  for(const a of assemblies){
    const {key,clear,occupied,shared,plan}=actualAccess(a),list=stations.get(a.stationId)||[];
    list.push({key:a.key,arms:plan.arms.length,lifts:plan.lifts.length,platformFlights:plan.platformFlights.length,shared});stations.set(a.stationId,list);
    if(!shared&&!plan.arms.length&&!plan.lifts.length){
      const {cx,cz,hx,hz}=a.frame,floor=a.deckHeight-4.2,platform=a.deckHeight+1.2;
      const P=(u:number,v:number,y:number)=>({x:cx+hx*u-hz*v,y,z:cz+hz*u+hx*v});
      const candidate:any[]=[],stairCandidates:any[]=[],perimeterCandidates:any[]=[];
      for(const side of [-1,1])for(let u=-36;u<=36;u+=2)for(let attempt=0;attempt<7;attempt++){
        const point=P(u,side*(14.7+attempt*2.5),0),p=sampleMetroPath(a.corridor.center,(a.frame.s??0)+u);
        const lower={id:'probe-lower',from:{...point,y:floor},to:P(u,side*8.6,floor),width:2.4};
        const upper={id:'probe-upper',from:{...point,y:platform},to:{x:p.x-p.hz*side*5.6,y:platform,z:p.z+p.hx*side*5.6},width:2.4};
        if(occupied(point.x,point.z,1.4)||!clear({x:point.x,z:point.z,hx,hz,hw:1.35,hl:1.35},0,platform+2.6)||![lower,upper].every(l=>landingClear(l,clear,occupied)))continue;
        if(!horizontalSupport(tiles.get(key)!,lower.to.x,lower.to.z,floor))continue;
        candidate.push({side,u,v:side*(14.7+attempt*2.5),point});break;
      }
      for(const side of [-1,1])for(const end of [-1,1])for(const baseU of [12,16,20,24,28,32])for(let attempt=0;attempt<7;attempt++){
        const u=end*baseU,v=side*(14.7+attempt*2.5),run=Math.max(13,floor/Math.tan(Math.PI/6))+2.8;
        const foot=P(u+end*run,v,.12),top=P(u,v,floor),middle0=P(u+end*(run/2+1.4),v,(floor+.12)/2),middle1=P(u+end*(run/2-1.4),v,(floor+.12)/2);
        const lower:StationAccessFlight={id:'probe-street-lower',kind:'street',side,end,from:foot,to:middle0,width:3.8},upper={...lower,id:'probe-street-upper',from:middle1,to:top};
        const rest={id:'probe-rest',from:middle0,to:middle1,width:3.8,covered:true},link={id:'probe-link',from:top,to:P(u,side*8.6,floor),width:3.8,covered:true};
        if(![lower,upper].every(f=>flightClear(f,clear,occupied))||![rest,link].every(l=>landingClear(l,clear,occupied)))continue;
        if(!horizontalSupport(tiles.get(key)!,link.to.x,link.to.z,floor))continue;
        stairCandidates.push({side,end,u,v,foot});break;
      }
      if(!candidate.length&&!stairCandidates.length)for(const side of [-1,1])for(const u of [-52,-48,-44,-40,40,44,48,52])for(let attempt=0;attempt<7;attempt++){
        const concourseU=Math.max(-36,Math.min(36,u)),point=P(u,side*(14.7+attempt*2.5),0),p=sampleMetroPath(a.corridor.center,(a.frame.s??0)+u);
        const lower={id:'probe-perimeter-lower',from:{...point,y:floor},to:P(concourseU,side*8.6,floor),width:2.4};
        const upper={id:'probe-perimeter-upper',from:{...point,y:platform},to:{x:p.x-p.hz*side*5.6,y:platform,z:p.z+p.hx*side*5.6},width:2.4};
        if(occupied(point.x,point.z,1.4)||!clear({x:point.x,z:point.z,hx,hz,hw:1.35,hl:1.35},0,platform+2.6)||![lower,upper].every(l=>landingClear(l,clear,occupied)))continue;
        if(!horizontalSupport(tiles.get(key)!,lower.to.x,lower.to.z,floor))continue;
        perimeterCandidates.push({side,u,concourseU,v:side*(14.7+attempt*2.5),point});break;
      }
      const roadOnly=stationAccessPlan(a,clear),buildingOnly=stationAccessPlan(a,()=>true,occupied);
      fallbackProbes.push({station:a.key,roadRailOnly:{arms:roadOnly.arms.length,lifts:roadOnly.lifts.length},buildingOnly:{arms:buildingOnly.arms.length,lifts:buildingOnly.lifts.length},safeAlternativeLiftCount:candidate.length,liftExamples:candidate.slice(0,2),safeAlternativeStairCount:stairCandidates.length,stairExamples:stairCandidates.slice(0,2),perimeterCount:perimeterCandidates.length,perimeterExamples:perimeterCandidates.slice(0,2)});
    }
  }
  const missing=[...stations].filter(([,parts])=>!parts.some(p=>p.arms>0||p.lifts>0));
  t.diagnostic(JSON.stringify({stationIdentities:stations.size,missingGroundEntries:missing,fallbackProbes,all:[...stations]}));
  assert.deepEqual(missing,[],'safe omission cannot erase every real ground-to-concourse connection');
});

test('actual fallback bank mesh vertices stay finite and inside road, train, building and static flight envelopes',t=>{
  initTemplates();const lookup=metroFlightClearance(core.metro);let banks=0,vertices=0,maxVertices=0;
  for(const a of assemblies){const f=actualAccess(a);
    for(const lift of f.plan.lifts.filter(l=>l.id.includes(':ground-access:'))){
      banks++;const batch=new Batch();drawStationLift(lift,a,{st:batch});maxVertices=Math.max(maxVertices,batch.pos.length/3);
      for(let i=0;i<batch.pos.length;i+=3){const [x,y,z]=[batch.pos[i],batch.pos[i+1],batch.pos[i+2]];
        assert.ok([x,y,z].every(Number.isFinite));
        assert.ok(lookup.heightAt(x,z)+.01>=y,`${a.key}: fallback mesh exceeds indexed flight clearance`);
        assert.ok(f.clear({x,z,r:.015},y-.001,y+.001),`${a.key}: emitted fallback mesh cuts road/train clearance`);
        assert.equal(f.occupied(x,z,.015,y-.01),false,`${a.key}: emitted fallback mesh cuts a retained building`);vertices++;
      }
    }
  }
  assert.ok(banks>=3&&maxVertices<48000,'exercise the actual restored banks inside the declared static budget');
  t.diagnostic(JSON.stringify({actualFallbackBanks:banks,actualFallbackVertices:vertices,maxBankVertices:maxVertices}));
});

test('the actual Bharat Nagar ground lift cannot share its shaft with an already emitted footbridge tower obstacle',t=>{
  initTemplates();const a=assemblies.find(a=>a.stationId==='st_bharat_nagar')!,f=actualAccess(a),obstacles=[...new Set([...f.tile.obstacles.values()].flat())];
  const shafts=f.tile.structureSupports.filter(s=>s.source===a.key&&s.part==='station_stairs'&&s.bottom===0&&'hw'in s.footprint&&Math.abs(s.footprint.hw-1.35)<1e-6&&Math.abs(s.footprint.hl-1.35)<1e-6);
  // Exact emitted body from the reviewed mapped feature w1480567593, not
  // only its smaller gameplay collision circle. Preserve the real footbridge.
  const tower={x:-7067.9,z:-6418.4,hx:.8944271909999159,hz:-.4472135954999579,hw:1.8,hl:1.6};
  assert.ok(obstacles.some(o=>Math.hypot(o.x-tower.x,o.z-tower.z)<1e-6&&Math.abs(o.r-1.8)<1e-6&&Math.abs(o.top-6.6)<1e-6),'the legitimate mapped footbridge tower must remain present');
  const boxesOverlap=(box:typeof tower)=>{
    const axes=[[tower.hx,tower.hz],[-tower.hz,tower.hx],[box.hx,box.hz],[-box.hz,box.hx]];
    return axes.every(([x,z])=>{
      const radius=(p:typeof tower)=>Math.abs(x*p.hx+z*p.hz)*p.hl+Math.abs(-x*p.hz+z*p.hx)*p.hw;
      return Math.abs((box.x-tower.x)*x+(box.z-tower.z)*z)<radius(box)+radius(tower)-.01;
    });
  };
  const conflicts:any[]=[],meshConflicts:any[]=[],doorConflicts:any[]=[];
  for(const shaft of shafts){
    const point=shaft.footprint;
    const {cx,cz,hx,hz}=a.frame;
    if(boxesOverlap({x:point.x,z:point.z,hx,hz,hw:1.25,hl:1.25}))meshConflicts.push({x:point.x,z:point.z});
    const side=Math.sign(-(point.x-cx)*hz+(point.z-cz)*hx),inwardX=hz*side,inwardZ=-hx*side;
    for(let step=0;step<=2;step+=.25)for(const width of [-.7,0,.7]){
      const x=point.x+inwardX*(1.26+step)+hx*width,z=point.z+inwardZ*(1.26+step)+hz*width,dx=x-tower.x,dz=z-tower.z;
      if(Math.abs(dx*tower.hx+dz*tower.hz)<tower.hl-.01&&Math.abs(-dx*tower.hz+dz*tower.hx)<tower.hw-.01)doorConflicts.push({x,z,step,width});
    }
    for(const obstacle of obstacles){
      if(obstacle.r<.5||obstacle.top<=.2)continue;
      if(Math.hypot(obstacle.x-point.x,obstacle.z-point.z)<1e-6&&Math.abs(obstacle.r-1.35)<1e-6&&Math.abs(obstacle.top-shaft.top)<1e-6)continue;
      const dx=obstacle.x-point.x,dz=obstacle.z-point.z,u=dx*hx+dz*hz,v=-dx*hz+dz*hx;
      const distance=Math.hypot(Math.max(0,Math.abs(u)-1.25),Math.max(0,Math.abs(v)-1.25));
      if(distance<obstacle.r-.02&&(obstacle.bottom??0)<shaft.top)conflicts.push({source:shaft.source,point:{x:point.x,z:point.z},obstacle,distance});
    }
  }
  t.diagnostic(JSON.stringify({station:a.key,physicalGroundEntryConflicts:conflicts,exactTowerMeshConflicts:meshConflicts,groundDoorApproachConflicts:doorConflicts}));
  assert.ok(shafts.length>0,'a real emitted ground lift shaft must exist');
  assert.deepEqual(conflicts,[],'a source footbridge stair tower is physical occupancy even when it is not a building polygon or registered station support');
  assert.deepEqual(meshConflicts,[],'keep the exact solid tower body separate, including corners outside its gameplay circle');
  assert.deepEqual(doorConflicts,[],'the actual ground door and two-metre approach cannot face into the retained tower');
});

test('actual ground lift door approaches clear the final registered physical scene including fixtures emitted after station planning',t=>{
  initTemplates();let doors=0;const conflicts:any[]=[];
  for(const a of assemblies){const f=actualAccess(a),{cx,cz,hx,hz}=a.frame,obstacles=[...new Set([...f.tile.obstacles.values()].flat())];
    const shafts=f.tile.structureSupports.filter(s=>s.source===a.key&&s.part==='station_stairs'&&s.bottom===0&&'hw'in s.footprint&&Math.abs(s.footprint.hw-1.35)<1e-6&&Math.abs(s.footprint.hl-1.35)<1e-6);
    for(const shaft of shafts){const p=shaft.footprint,side=Math.sign(-(p.x-cx)*hz+(p.z-cz)*hx),dx=hz*side,dz=-hx*side,reach=2;
      const center={x:p.x+dx*(1.26+reach/2),z:p.z+dz*(1.26+reach/2)};doors++;
      for(const o of obstacles){
        if(o.r<=.05||o.top<=.12||(o.bottom??0)>=2.42)continue;
        if(Math.hypot(o.x-p.x,o.z-p.z)<1e-6&&Math.abs(o.r-1.35)<1e-6&&Math.abs(o.top-shaft.top)<1e-6)continue;
        const x=o.x-center.x,z=o.z-center.z,u=x*dx+z*dz,v=-x*dz+z*dx;
        const distance=Math.hypot(Math.max(0,Math.abs(u)-reach/2),Math.max(0,Math.abs(v)-.8));
        if(distance<o.r-.02)conflicts.push({station:a.key,shaft:{x:p.x,z:p.z},obstacle:o,distance});
      }
    }
  }
  assert.ok(doors>40);t.diagnostic(JSON.stringify({actualGroundDoors:doors,finalPhysicalApproachConflicts:conflicts}));
  assert.deepEqual(conflicts,[],'pre-station reservations and later fixture placement must agree on a physically open ground doorway');
});
