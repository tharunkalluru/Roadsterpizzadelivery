import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {Batch,initTemplates} from '../../src/core/util';
import {buildTile,type Surface,type TileBuilt} from '../../src/world/city';
import {metroCorridors,metroPlatformAssemblies,sampleMetroPath,METRO_PLATFORM_HALF_LENGTH,METRO_PLATFORM_OUTER_EDGE,type MetroPlatformAssembly} from '../../src/world/metro-geometry';
import {stationAccessPlan,stationPhysicalObstacles,stationLiftGuardOpenings,stationGuardSegments,landingClear,drawStationLift,type StationAccessBuildObservation} from '../../src/world/metro-station-access';
import type {StructureFootprint} from '../../src/world/structure-clearance';
import {prepareRoadGrades,currentRoadGradePatches,applyRoadGradePatches} from '../../src/world/road-grades';
import type {CoreData,RoadEdge} from '../../src/world/types';

const core:CoreData=JSON.parse(gunzipSync(readFileSync('public/city/core.pack.wasm')).toString());
const corridors=metroCorridors(core.metro.lines),assemblies=metroPlatformAssemblies(core.metro.stations,corridors,core.metro.deckHeight);
const patches=currentRoadGradePatches(prepareRoadGrades(core.roads));
const packs=new Map<string,any>(),tiles=new Map<string,{tile:TileBuilt;roads:RoadEdge[];observations:Map<string,StationAccessBuildObservation>}>();
const tileKey=(a:MetroPlatformAssembly)=>`${Math.floor(a.source.p[0]/1000)}_${Math.floor(a.source.p[1]/1000)}`;
function actual(a:MetroPlatformAssembly){
  const key=tileKey(a);let cached=tiles.get(key);
  if(!cached){
    const [i,j]=key.split('_').map(Number),pack=core.packs.find(p=>p.tiles.some(([x,z])=>x===i&&z===j))!;
    let data=packs.get(pack.file);if(!data){data=JSON.parse(gunzipSync(readFileSync(`public/city/${pack.file}`)).toString());packs.set(pack.file,data);}
    const zone=data.tiles[key],roads=applyRoadGradePatches(zone.roads,patches);
    const observations=new Map<string,StationAccessBuildObservation>();
    cached={tile:buildTile({...zone,roads},{lowQ:true,metro:core.metro,observeStationAccess:observation=>observations.set(observation.assembly.key,observation)}),roads,observations};tiles.set(key,cached);
  }
  const observed=cached.observations.get(a.key);assert.ok(observed,`${a.key}: inspect the actual builder plan, not a separate preferred-plan reconstruction`);
  return{...cached,...observed};
}
function horizontalSupport(surfaces:readonly Surface[],x:number,z:number,y:number){return surfaces.some(s=>{
  if(s.kind!=='pad'||Math.abs(s.ya-y)>.02||Math.abs(s.yb-y)>.02)return false;
  const dx=s.bx-s.ax,dz=s.bz-s.az,len=Math.hypot(dx,dz)||1,u=((x-s.ax)*dx+(z-s.az)*dz)/len,v=(-(x-s.ax)*dz+(z-s.az)*dx)/len;
  return u>=-.02&&u<=len+.02&&Math.abs(v)<=s.hw+.02;
});}
function fixture(){
  const metro={lines:[{id:'blue',pts:[[500,100],[500,900]] as [number,number][]}],stations:[{id:'fixture',p:[500,500] as [number,number],lines:['blue']}],deckHeight:12.5};
  return metroPlatformAssemblies(metro.stations,metroCorridors(metro.lines),metro.deckHeight)[0];
}

test('pre-station physical clearance is height-aware and immutable after later station colliders are emitted',()=>{
  const obstacle={x:49,z:0,r:1.8,top:6.6};
  const source=new Map([['0,0',[obstacle]]]),physical=stationPhysicalObstacles(source);
  assert.equal(physical.clear({x:51.3,z:0,r:.1},0,2.3),false,'enclose the real square tower corners, beyond its smaller gameplay circle and across grid boundaries');
  assert.equal(physical.clear({x:49,z:0,r:1.35},6.71,9),true,'an existing skywalk can remain above a lower fixture');
  assert.equal(physical.clear({x:49,z:0,r:1.35},0,6),false);
  obstacle.x=500;obstacle.top=50;source.get('0,0')!.push({x:80,z:0,r:1.35,top:20});
  assert.equal(physical.clear({x:49,z:0,r:.1},0,2.3),false,'original scenery cannot move through a shared mutable reference');
  assert.equal(physical.clear({x:80,z:0,r:.1},0,2.3),true,'newly emitted station geometry must not feed back into later station planning');
  const elevated=stationPhysicalObstacles(new Map([['0,0',[{x:0,z:0,r:1,top:10,bottom:8}]]]));
  assert.equal(elevated.clear({x:0,z:0,r:1},0,2.3),true);assert.equal(elevated.clear({x:0,z:0,r:1},8.3,9.5),false);
});

test('a physically clear shaft cannot place its actual inward ground door against a lower fixture',()=>{
  const a=fixture(),{cx,cz,hx,hz}=a.frame,P=(u:number,v:number)=>({x:cx+hx*u-hz*v,z:cz+hz*u+hx*v});
  const original=P(-20,-14.7),doorBlock=P(-20,-12),physical=stationPhysicalObstacles(new Map([['fixture',[{...doorBlock,r:.2,top:2.5}]]]));
  assert.equal(physical.clear({...original,hx,hz,hw:1.35,hl:1.35},0,a.deckHeight+3.8),true,'this regression must exercise the door approach, not only a colliding shaft');
  const plan=stationAccessPlan(a,physical.clear,physical.occupied);
  assert.ok(plan.lifts.length>0);
  assert.ok(plan.lifts.every(lift=>Math.hypot(lift.point.x-original.x,lift.point.z-original.z)>.1),'reserve the full two-metre human approach in front of the rendered door');
});

test('bounded shifted lift restores access without relaxing the blocked preferred shafts or neighboring buildings',()=>{
  const a=fixture(),{cx,cz,hx,hz}=a.frame;
  const occupied=(x:number,z:number,pad:number)=>pad>2||Math.abs(Math.abs((x-cx)*hx+(z-cz)*hz)-20)<2;
  const plan=stationAccessPlan(a,()=>true,occupied);
  assert.equal(plan.arms.length,0);assert.ok(plan.platformFlights.length>0);
  assert.equal(plan.lifts.length,1);assert.match(plan.lifts[0].id,/ground-access/);
  assert.ok(Math.abs(plan.lifts[0].u)<18);
  assert.ok(plan.lifts[0].links.every(link=>landingClear(link,()=>true,occupied)));
});

test('a ground-to-concourse-only lift requires retained internal stairs and does not invent a platform stop',()=>{
  initTemplates();const a=fixture(),floor=a.deckHeight-4.2;
  const clear=(p:StructureFootprint,b:number,t:number)=>!('hw'in p&&Math.abs(p.hw-1.35)<1e-8&&Math.abs(p.hl-1.35)<1e-8&&b===0&&t>floor+3);
  const occupied=(_x:number,_z:number,pad:number)=>pad>2;
  const plan=stationAccessPlan(a,clear,occupied);assert.equal(plan.arms.length,0);assert.ok(plan.platformFlights.length>0);assert.equal(plan.lifts.length,1);
  const lift=plan.lifts[0];assert.equal(lift.top,floor);assert.equal(lift.concourse,floor);assert.equal(lift.links.length,1);
  assert.deepEqual(stationLiftGuardOpenings(a,lift,lift.side,'platform'),[],'no fake door through the upper platform guard');
  const batch=new Batch();drawStationLift(lift,a,{st:batch});assert.ok(batch.pos.length>0&&batch.pos.every(Number.isFinite));
  const blocked=stationAccessPlan(a,()=>false,occupied);assert.equal(blocked.lifts.length,0,'a fully obstructed station is reported, never forced through an obstacle');
});

test('a lower-only lift cannot count an isolated floor island as a route to the existing platform stairs',()=>{
  const a=fixture(),floor=a.deckHeight-4.2,{cx,cz,hx,hz}=a.frame;
  const clear=(p:StructureFootprint,b:number,t:number)=>{
    if(!('hw'in p))return true;
    const u=(p.x-cx)*hx+(p.z-cz)*hz;
    if(Math.abs(p.hw-1.35)<1e-8&&Math.abs(p.hl-1.35)<1e-8&&b===0)return Math.abs(u)<.1&&t<floor+3;
    // Preserve the central entry tile and both distant platform stairs, but
    // remove two real concourse floor strips between them.
    if(Math.abs(b-floor+.35)<1e-8&&Math.abs(t-floor)<1e-8&&Math.abs(u)>5&&Math.abs(u)<18)return false;
    return true;
  };
  const plan=stationAccessPlan(a,clear,(_x,_z,pad)=>pad>2);
  assert.ok(plan.platformFlights.length>0);assert.equal(plan.arms.length,0);
  assert.equal(plan.lifts.length,0,'the entry must share a retained floor component with a real internal staircase');
});

test('all actual station identities retain ground entry and every fallback floor terminates on real retained concourse support',t=>{
  initTemplates();const identities=new Map<string,boolean>(),fallbacks:any[]=[];
  for(const a of assemblies){
    const f=actual(a),plan=f.plan,has=plan.arms.length>0||plan.lifts.length>0;
    identities.set(a.stationId,(identities.get(a.stationId)??false)||has);
    for(const lift of plan.lifts.filter(l=>l.id.includes(':ground-access:'))){
      assert.equal(f.occupied(lift.point.x,lift.point.z,1.4),false);
      assert.ok(f.clear({x:lift.point.x,z:lift.point.z,hx:a.frame.hx,hz:a.frame.hz,hw:1.35,hl:1.35},0,lift.top+2.6));
      assert.ok(lift.links.every(link=>landingClear(link,f.clear,f.occupied)));
      const surfaces=[...new Set([...f.tile.surfaceGrid.values()].flat())],lower=lift.links.find(link=>link.id.endsWith(':concourse'))!;
      const dx=lower.to.x-lower.from.x,dz=lower.to.z-lower.from.z,length=Math.hypot(dx,dz)||1;
      for(const v of [-lower.width/2+.02,0,lower.width/2-.02])assert.ok(horizontalSupport(surfaces,lower.to.x-dz/length*v,lower.to.z+dx/length*v,lower.to.y),`${a.key} needs whole-width retained floor at its lift landing`);
      if(lift.top===lift.concourse)assert.ok(plan.platformFlights.length>0);
      fallbacks.push({station:a.key,lift:lift.id,u:lift.u,links:lift.links.length});
    }
  }
  assert.deepEqual([...identities].filter(([,has])=>!has),[]);
  assert.ok(fallbacks.length>=3,'exercise the original four blocked station frontages');
  t.diagnostic(JSON.stringify({stationIdentities:identities.size,fallbacks}));
});

test('the actual city builder emits a real ground access structure for every station identity',t=>{
  initTemplates();const identities=new Map<string,boolean>(),entries:any[]=[];
  for(const a of assemblies){
    const {tile}=actual(a);
    const ground=tile.structureSupports.filter(s=>s.source===a.key&&s.part==='station_stairs'&&s.bottom<.14);
    identities.set(a.stationId,(identities.get(a.stationId)??false)||ground.length>0);
    entries.push({station:a.key,actualGroundParts:ground.length});
  }
  assert.deepEqual([...identities].filter(([,has])=>!has),[],'standalone preferred plans cannot stand in for actually emitted city geometry');
  t.diagnostic(JSON.stringify({stationIdentities:identities.size,actualEntries:entries}));
});

test('every actually emitted ground lift shaft and inward human approach clears immutable pre-station scenery',t=>{
  initTemplates();let shafts=0,approaches=0;
  for(const a of assemblies){const f=actual(a),{hx,hz}=a.frame;
    for(const lift of f.plan.lifts){
      const emitted=f.tile.structureSupports.some(s=>s.source===a.key&&s.part==='station_stairs'&&'hw'in s.footprint&&Math.abs(s.footprint.hw-1.35)<1e-8&&Math.abs(s.footprint.hl-1.35)<1e-8&&Math.hypot(s.footprint.x-lift.point.x,s.footprint.z-lift.point.z)<.001&&Math.abs(s.top-lift.top-2.6)<.001);
      assert.ok(emitted,`${a.key}: observed shaft must be present in actual generated support geometry`);shafts++;
      assert.ok(f.physical.clear({x:lift.point.x,z:lift.point.z,hx,hz,hw:1.35,hl:1.35},0,lift.top+2.6));
      const dx=hz*lift.side,dz=-hx*lift.side,door={x:lift.point.x+dx*1.26,z:lift.point.z+dz*1.26};
      assert.ok(f.physical.clear({x:door.x+dx,z:door.z+dz,hx:dx,hz:dz,hl:1.05,hw:.9},.1,2.42),`${a.key}: actual two-metre ground door approach is blocked`);approaches++;
    }
  }
  assert.ok(shafts>40&&approaches===shafts);t.diagnostic(JSON.stringify({actualGroundShafts:shafts,actualDoorApproaches:approaches}));
});

test('lift parapet openings cover the actual full-width crossing including curved station platform guards',t=>{
  initTemplates();let crossings=0;
  for(const a of assemblies){const f=actual(a),{cx,cz,hx,hz}=a.frame;
    const stationS=a.frame.s??0;
    for(const lift of f.plan.lifts)for(const link of lift.links){
      const level=link.id.endsWith(':platform')?'platform':'concourse',side=lift.side,openings=stationLiftGuardOpenings(a,lift,side,level);
      const segments:{a:{x:number;z:number};b:{x:number;z:number};u0:number;u1:number}[]=[];
      if(level==='platform')for(let u0=-METRO_PLATFORM_HALF_LENGTH;u0<METRO_PLATFORM_HALF_LENGTH;u0+=10){
        const u1=Math.min(METRO_PLATFORM_HALF_LENGTH,u0+10),P=(u:number)=>{const p=sampleMetroPath(a.corridor.center,stationS+u);return{x:p.x-p.hz*side*(METRO_PLATFORM_OUTER_EDGE+.12),z:p.z+p.hx*side*(METRO_PLATFORM_OUTER_EDGE+.12)};};segments.push({a:P(u0),b:P(u1),u0,u1});
      }else segments.push({a:{x:cx-hx*40.3-hz*side*10.02,z:cz-hz*40.3+hx*side*10.02},b:{x:cx+hx*40.3-hz*side*10.02,z:cz+hz*40.3+hx*side*10.02},u0:-40.3,u1:40.3});
      const dx=link.to.x-link.from.x,dz=link.to.z-link.from.z,len=Math.hypot(dx,dz)||1;
      for(const offset of [-link.width/2,0,link.width/2]){
        const x0=link.from.x-dz/len*offset,z0=link.from.z+dx/len*offset;
        for(const guard of segments){const gx=guard.b.x-guard.a.x,gz=guard.b.z-guard.a.z,den=dx*gz-dz*gx;if(Math.abs(den)<1e-8)continue;
          const ax=guard.a.x-x0,az=guard.a.z-z0,t=(ax*gz-az*gx)/den,s=(ax*dz-az*dx)/den;if(t<0||t>1||s<0||s>1)continue;
          const u=guard.u0+(guard.u1-guard.u0)*s;crossings++;
          assert.ok(!stationGuardSegments(guard.u0,guard.u1,openings).some(([lo,hi])=>u>lo+.001&&u<hi-.001),`${a.key} ${level}: full-width floor must not meet a solid parapet`);
        }
      }
    }
  }
  assert.ok(crossings>100);t.diagnostic(JSON.stringify({actualLiftGuardCrossingSamples:crossings}));
});
