import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {Batch,initTemplates} from '../../src/core/util';
import {buildTile} from '../../src/world/city';
import {metroCorridors,metroPlatformAssemblies,type MetroPlatformAssembly} from '../../src/world/metro-geometry';
import {metroStructureClearance} from '../../src/world/metro-clearance';
import {roadStructureClearance} from '../../src/world/structure-clearance';
import {stationAccessPlan,stationInterchangeTransfers,stationBuildingOccupied,stationGuardSegments,drawStationFlight,drawStationLanding,drawStationLift,drawStationEntryPortal,type StationAccessPoint} from '../../src/world/metro-station-access';
import type {CoreData,RoadEdge} from '../../src/world/types';
import {prepareRoadGrades,currentRoadGradePatches,applyRoadGradePatches} from '../../src/world/road-grades';
import {metroFlightClearance} from '../../src/world/metro-flight-clearance';

const core:CoreData=JSON.parse(gunzipSync(readFileSync('public/city/core.pack.wasm')).toString());
const corridors=metroCorridors(core.metro.lines),assemblies=metroPlatformAssemblies(core.metro.stations,corridors,core.metro.deckHeight);
const distance=(a:StationAccessPoint,b:StationAccessPoint)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
function capture(){const vertices:number[][]=[],boxes:any[]=[];return {vertices,boxes,B:{st:{
  box(x:number,y:number,z:number,w:number,h:number,d:number,color:string,rotation?:unknown){boxes.push({x,y,z,w,h,d,color,rotation});},
  quad(a:number[],b:number[],c:number[],d:number[],color:string){vertices.push(a,b,c,d);},
}}};}

test('all59 source assemblies have continuous stair/rest/landing topology at their actual deck heights',t=>{
  assert.equal(assemblies.length,59);let arms=0,lifts=0,flights=0;
  for(const a of assemblies){const plan=stationAccessPlan(a);assert.equal(plan.arms.length,4);assert.equal(plan.platformFlights.length,4);
    for(const arm of plan.arms){
      assert.ok(distance(arm.flights[0].from,arm.foot)<1e-8);
      assert.ok(distance(arm.flights[0].to,arm.rest.from)<1e-8);
      assert.ok(distance(arm.rest.to,arm.flights[1].from)<1e-8);
      assert.ok(distance(arm.flights[1].to,arm.link.from)<1e-8);
      assert.ok(Math.abs(arm.link.to.y-(a.deckHeight-4.2))<1e-8);
      assert.ok(Math.abs(arm.foot.y-.12)<1e-8);
      for(const f of arm.flights){const run=Math.hypot(f.to.x-f.from.x,f.to.z-f.from.z);assert.ok((f.to.y-f.from.y)/run<.59,'no steep box masquerading as a staircase');assert.ok(f.width>=3.8);}
    }
    for(const f of plan.platformFlights){assert.ok(Math.abs(f.from.y-(a.deckHeight-4.2))<1e-8);assert.ok(Math.abs(f.to.y-(a.deckHeight+1.2))<1e-8);
      const link=plan.platformLinks.find(l=>l.id===f.id+':landing')!;assert.ok(distance(f.to,link.from)<1e-8);assert.ok(distance(link.from,link.to)>3.9);
    }
    for(const l of plan.lifts){assert.deepEqual(l.links.map(x=>x.from.y),[a.deckHeight-4.2,a.deckHeight+1.2]);assert.equal(l.top,a.deckHeight+1.2);}
    arms+=plan.arms.length;lifts+=plan.lifts.length;flights+=plan.platformFlights.length;
  }
  t.diagnostic(JSON.stringify({assemblies:assemblies.length,arms,lifts,platformFlights:flights}));
});

test('clearance-fitted access against the whole mapped road and train network has no unchecked stair/canopy section',t=>{
  const road=roadStructureClearance(core.roads),rail=metroStructureClearance(corridors,core.metro.deckHeight),clear=(p:any,b:number,h:number)=>road.clear(p,b,h)&&rail.clear(p,b,h);
  let kept=0,omitted=0,lifts=0;const zeroArms:string[]=[],zeroPlatformAccess:string[]=[];
  for(const a of assemblies){const plan=stationAccessPlan(a,clear);kept+=plan.arms.length;omitted+=4-plan.arms.length;lifts+=plan.lifts.length;
    if(!plan.arms.length&&!plan.lifts.length)zeroArms.push(a.key);if(!plan.platformFlights.length&&!plan.lifts.length)zeroPlatformAccess.push(a.key);
    const c=capture();for(const f of [...plan.arms.flatMap(a=>a.flights),...plan.platformFlights])drawStationFlight(f,c.B as any,true,a.lineId);
    for(const arm of plan.arms){drawStationLanding(arm.rest,c.B as any);drawStationLanding(arm.link,c.B as any);drawStationEntryPortal(arm,c.B as any,a.lineId);}
    for(const l of plan.lifts)drawStationLift(l,a,c.B as any);
    for(const v of c.vertices){assert.ok(v.every(Number.isFinite));assert.ok(clear({x:v[0],z:v[2],r:.015},v[1]-.001,v[1]+.001),`${a.key}: emitted tread point cuts a road/train envelope`);}
    assert.ok(c.vertices.length*1.5+c.boxes.length*36<48000,'bounded static geometry per station');
  }
  assert.ok(kept>100,'real road clearances must not erase all street access');
  assert.deepEqual(zeroArms,[],'every standalone assembly needs a viable street or lift route');assert.deepEqual(zeroPlatformAccess,[],'every assembly needs a viable platform access route');
  t.diagnostic(JSON.stringify({keptStreetArms:kept,omittedUnsafeArms:omitted,keptLifts:lifts,zeroArms,zeroPlatformAccess}));
});

test('shared Ameerpet/MGBS concourses have a real bounded transfer path instead of duplicate secondary street arms',t=>{
  const road=roadStructureClearance(core.roads),rail=metroStructureClearance(corridors,core.metro.deckHeight),clear=(p:any,b:number,h:number)=>road.clear(p,b,h)&&rail.clear(p,b,h);
  const transfers=stationInterchangeTransfers(assemblies,clear);
  assert.equal(transfers.length,2,'both surveyed interchange identities require connected level access');
  for(const transfer of transfers){assert.equal(transfer.connections.length,2);const pair=assemblies.filter(a=>a.stationId===transfer.stationId);
    const secondary=pair.find(a=>a.secondary)!,plan=stationAccessPlan(secondary,clear,()=>false,true);
    assert.equal(plan.arms.length,0);assert.equal(plan.lifts.length,0);assert.ok(plan.platformFlights.length>0);
    for(const connection of transfer.connections){const a=pair.find(a=>a.key===connection.key)!;
      assert.equal(connection.landing.from.y,a.deckHeight-4.2);assert.equal(connection.landing.to.y,a.deckHeight-4.2);
      assert.ok(Math.hypot(connection.landing.to.x-transfer.lift.point.x,connection.landing.to.z-transfer.lift.point.z)<1e-8);
      assert.ok(Math.hypot(connection.landing.from.x-connection.landing.to.x,connection.landing.from.z-connection.landing.to.z)<120);
    }
  }
  t.diagnostic(transfers.map(t=>({station:t.stationId,bottom:t.lift.bottom,top:t.lift.top,links:t.connections.map(c=>c.key)})));
});

test('a raised road through the old lower concourse cannot acquire an opaque window across its carriageway',()=>{
  initTemplates();const road:RoadEdge={id:'flyover',seg:'flyover',cls:'primary',name:null,w:14,lanes:4,oneway:null,from:'a',to:'b',maxspeed:null,pts:[[430,500],[570,500]],elev:[7,7]};
  const metro={lines:[{id:'blue',pts:[[500,100],[500,900]] as [number,number][]}],stations:[{id:'fixture',name:'Fixture',p:[500,500] as [number,number],lines:['blue']}],pillars:[],deckHeight:11};
  const tile=buildTile({i:0,j:0,roads:[road],nodes:{a:road.pts[0],b:road.pts[1]},buildings:[],boards:[],furniture:[],areas:[],osm:[]},{lowQ:true,metro});
  const window=tile.buffers.filter(b=>b.mat==='stationWindow');let inspected=0;
  for(const b of window)for(let i=0;i<b.pos.length;i+=3){const [x,y,z]=[b.pos[i],b.pos[i+1],b.pos[i+2]];
    if(x>=430&&x<=570&&Math.abs(z-500)<7.46){inspected++;assert.ok(y<=7.08||y>=11.8,'window pane fills the flyover driving envelope');}}
  assert.ok(tile.structureSupports.filter(s=>s.part==='station_stairs').every(s=>roadStructureClearance([road]).clear(s.footprint,s.bottom,s.top)));
  assert.ok(![...tile.buildingGrid.values()].flat().some(b=>b.id.startsWith('ms_')),'old invisible solid stair housing remains');
});

test('the actual station tile retains continuous platform pads and creates physical support for both street flights and landings',()=>{
  initTemplates();const metro={lines:[{id:'blue',pts:[[500,100],[500,900]] as [number,number][]}],stations:[{id:'fixture',name:'Fixture',p:[500,500] as [number,number],lines:['blue']}],pillars:[],deckHeight:11};
  const tile=buildTile({i:0,j:0,roads:[],nodes:{},buildings:[],boards:[],furniture:[],areas:[],osm:[]},{lowQ:true,metro});
  const surfaces=[...new Set([...tile.surfaceGrid.values()].flat())],a=metroPlatformAssemblies(metro.stations,metroCorridors(metro.lines),11)[0],plan=stationAccessPlan(a);
  for(const f of plan.arms.flatMap(a=>a.flights))assert.ok(surfaces.some(s=>Math.hypot(s.ax-f.from.x,s.az-f.from.z)<1e-8&&Math.hypot(s.bx-f.to.x,s.bz-f.to.z)<1e-8&&s.ya===f.from.y&&s.yb===f.to.y));
  for(const side of [-1,1])for(let u=-64;u<=64;u+=2){const x=500-side*5.6,z=500+u;assert.ok(surfaces.some(s=>s.ya===12.2&&s.yb===12.2&&Math.abs(s.ax-x)<1e-7&&z>=s.az-1e-7&&z<=s.bz+1e-7));}
  const horizontalSupport=(x:number,z:number)=>surfaces.some(s=>{if(s.ya!==12.2||s.yb!==12.2)return false;const dx=s.bx-s.ax,dz=s.bz-s.az,l=Math.hypot(dx,dz),u=((x-s.ax)*dx+(z-s.az)*dz)/(l||1),v=((x-s.ax)*-dz+(z-s.az)*dx)/(l||1);return u>=-1e-7&&u<=l+1e-7&&Math.abs(v)<=s.hw+1e-7;});
  for(const side of [-1,1])for(const u of [-60,-20,0,20,60])for(let v=3.92;v<9.9;v+=.12)assert.equal(horizontalSupport(500-side*v,500+u),true,'typical6m platform is fully supported outside its access openings');
  assert.equal(horizontalSupport(491.4,531),false,'outer stairwell must be an actual floor opening');
  assert.equal(horizontalSupport(491.4,539.5),true,'upper landing bridges the stairwell at platform height');
  assert.equal(tile.signs.filter(s=>s.id.startsWith('mst_exterior')).length,2);assert.equal(tile.signs.filter(s=>s.id.startsWith('mst_interior')).length,2);
});

test('stair and lift portal gaps are finite and only cut their requested wall intervals',()=>{
  const pieces=stationGuardSegments(-65,65,[[-41.2,-37.8],[18.6,21.4],[37.8,41.2]]);
  assert.equal(pieces[0][0],-65);assert.equal(pieces.at(-1)![1],65);
  for(const [a,b]of pieces){assert.ok(b>a);for(const [lo,hi]of [[-41.2,-37.8],[18.6,21.4],[37.8,41.2]])assert.ok(b<=lo||a>=hi);}
  assert.ok(Math.abs(pieces.reduce((sum,[a,b])=>sum+b-a,0)-(130-3.4-2.8-3.4))<1e-8);
});

test('every actual access/lift roof vertex stays below the shared static flight envelope, including high Green/interchange reaches',t=>{
  initTemplates();const lookup=metroFlightClearance(core.metro);let points=0;
  for(const a of assemblies){const plan=stationAccessPlan(a),batch=new Batch(),B={st:batch};
    for(const f of [...plan.arms.flatMap(a=>a.flights),...plan.platformFlights])drawStationFlight(f,B,true,a.lineId);
    for(const arm of plan.arms){drawStationLanding(arm.rest,B);drawStationLanding(arm.link,B);drawStationEntryPortal(arm,B,a.lineId);}
    for(const l of plan.lifts)drawStationLift(l,a,B);
    for(let i=0;i<batch.pos.length;i+=3){const [x,y,z]=[batch.pos[i],batch.pos[i+1],batch.pos[i+2]];assert.ok(lookup.heightAt(x,z)+.01>=y,`${a.key}: access roof outside flight index at ${x},${y},${z}`);points++;}
  }
  t.diagnostic(JSON.stringify({accessVertices:points}));
});

test('station skywalk occupancy uses corrected polygon pieces and actual height instead of a ground AABB',()=>{
  const b:any={id:'short-building',h:4,ring:[[0,0],[8,0],[0,8]]},grid=new Map([['0,0',[b]]]);
  assert.equal(stationBuildingOccupied(grid,1,1,.2,3.5),true);
  assert.equal(stationBuildingOccupied(grid,1,1,.2,5),false,'safe skywalk over a low roof');
  assert.equal(stationBuildingOccupied(grid,7,7,.2,0),false,'outside the triangle even though inside its AABB');
  assert.equal(stationBuildingOccupied(grid,4.1,4.1,.2,0),true,'full width cannot cut a polygon edge');
});

test('actual packed Ameerpet/MGBS buildings and runtime road grades retain the shared transfer bank without a duplicate solid stair building',t=>{
  initTemplates();const gradePatches=currentRoadGradePatches(prepareRoadGrades(core.roads));
  for(const stationId of ['st_ameerpet','st_mahatma_gandhi_bus_station']){
    const a=assemblies.find(a=>a.stationId===stationId&&!a.secondary)!,i=Math.floor(a.source.p[0]/1000),j=Math.floor(a.source.p[1]/1000);
    const pack=core.packs.find(p=>p.tiles.some(([x,z])=>x===i&&z===j))!,zone=JSON.parse(gunzipSync(readFileSync(`public/city/${pack.file}`)).toString()).tiles[`${i}_${j}`];
    const roads=applyRoadGradePatches(zone.roads,gradePatches),tile=buildTile({...zone,roads},{lowQ:true,metro:core.metro});
    const bank=tile.structureSupports.find(s=>s.source===a.key&&s.part==='station_stairs'&&'r'in s.footprint&&s.footprint.r===1.7);
    assert.ok(bank,`${stationId}: actual buildings erased the shared interchange connection`);
    const clear=roadStructureClearance(roads);assert.ok(clear.clear(bank.footprint,bank.bottom,bank.top));
    assert.ok(![...tile.buildingGrid.values()].flat().some(b=>b.id.startsWith('ms_')));
    t.diagnostic(JSON.stringify({station:stationId,ownerTile:`${i}_${j}`,bank:bank.footprint,bottom:bank.bottom,top:bank.top}));
  }
});
