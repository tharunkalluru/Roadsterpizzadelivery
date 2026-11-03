import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {metroPlatformAssemblies,metroCorridors} from '../../src/world/metro-geometry';
import {metroFlightClearance} from '../../src/world/metro-flight-clearance';
import {stationVaultHeight} from '../../src/world/station-presentation';
import {roadRibbon} from '../../src/world/bridge-clearance';
import {clipRoadQuadToTile,roadSpansMultipleTiles} from '../../src/world/road-surface';
import {isORR} from '../../src/world/expressway';
import {testDriver} from '../fixtures/packed-drive-world';
import {buildTile} from '../../src/world/city';
import {initTemplates} from '../../src/core/util';
import {makeRailwayNetwork} from '../../src/world/railway-geometry';
import type {CoreData,RoadEdge} from '../../src/world/types';

const unpack=(file:string)=>JSON.parse(gunzipSync(readFileSync(`public/city/${file}`)).toString());
const core:CoreData=unpack('core.pack.wasm');

test('independent flight review clears each high Green-line station from eight approach headings',t=>{
  const city:any={surfaceGrid:new Map(),buildingGrid:new Map(),walls:new Map(),obstacles:new Map(),movingRail:[],railwayWalls:[],landmarkSurfaceGrid:new Map(),waterGrid:new Map(),metroFlightClearance:metroFlightClearance(core.metro)};
  let trials=0,samples=0;
  for(const station of metroPlatformAssemblies(core.metro.stations,metroCorridors(core.metro.lines),core.metro.deckHeight).filter(a=>a.lineId==='green'&&a.deckHeight>20))
    for(let heading=0;heading<8;heading++)for(const rate of [30,60,120,0]){
      const angle=heading*Math.PI/4,hx=Math.cos(angle),hz=Math.sin(angle),p=testDriver(city);
      const start={x:station.frame.cx-hx*230,z:station.frame.cz-hz*230};
      p.pos.set(start.x,24,start.z);p.yaw=Math.atan2(-hx,-hz);p.speed=160/3.6;p.flying=true;
      let travel=0,frames=0;
      while(travel<460&&frames<3000){
        const dt=rate?1/rate:frames%17===0?.05:1/60;
        p.update(dt,{throttle:1,brake:0,steer:0,flyPressed:false,boost:false},frames++/60);
        travel=Math.hypot(p.pos.x-start.x,p.pos.z-start.z);
        const u=(p.pos.x-station.frame.cx)*station.frame.hx+(p.pos.z-station.frame.cz)*station.frame.hz;
        const v=-(p.pos.x-station.frame.cx)*station.frame.hz+(p.pos.z-station.frame.cz)*station.frame.hx;
        if(Math.abs(u)<65&&Math.abs(v)<13){
          samples++;assert.ok(p.pos.y-.55>stationVaultHeight(v,station.deckHeight)+1,`${station.key}, heading ${heading}, cadence ${rate}: canopy contact`);
        }
      }
      assert.ok(travel>=460);trials++;
    }
  assert.ok(trials>=32&&samples>1000);t.diagnostic(JSON.stringify({trials,canopySamples:samples}));
});

test('all shipped long ordinary tile-only roads have local copies wherever their finite pavement enters a playable tile',t=>{
  // The primary road inventory covers prepared core edges. This independently
  // covers residential/unclassified streets absent from that core list.
  const coreIds=new Set(core.roads.map(e=>e.id));
  const playable=new Set(core.packs.flatMap(p=>p.tiles.map(([i,j])=>`${i}_${j}`)));
  const candidates=new Map<string,{edge:RoadEdge;roads:RoadEdge[];copies:Set<string>}>();
  for(const pack of core.packs){
    const data=unpack(pack.file);
    for(const [tile,zone] of Object.entries(data.tiles) as [string,{roads:RoadEdge[]}][])for(const edge of zone.roads){
      if(coreIds.has(edge.id)||isORR(edge)||edge.expressway?.ramp||edge.elev?.some(y=>Math.abs(y)>.001)||!roadSpansMultipleTiles(edge.pts))continue;
      let entry=candidates.get(edge.id);
      if(!entry){entry={edge,roads:[],copies:new Set()};candidates.set(edge.id,entry);}
      entry.copies.add(tile);if(!edge.ctx)entry.roads=zone.roads;
    }
  }
  let checkedTiles=0;
  for(const [id,{edge,roads,copies}] of candidates){
    assert.ok(roads.length,`${id}: source owner must exist`);
    const required=new Set<string>();
    for(const quad of roadRibbon(edge,roads).quads){
      const xs=quad.map(p=>p[0]),zs=quad.map(p=>p[2]);
      for(let i=Math.floor(Math.min(...xs)/1000);i<=Math.floor(Math.max(...xs)/1000);i++)
        for(let j=Math.floor(Math.min(...zs)/1000);j<=Math.floor(Math.max(...zs)/1000);j++){
          const key=`${i}_${j}`;if(playable.has(key)&&clipRoadQuadToTile(quad,i,j).length)required.add(key);
        }
    }
    for(const tile of required){checkedTiles++;assert.ok(copies.has(tile),`${id}: missing local pavement source in ${tile}`);}
  }
  assert.ok(candidates.size>50&&checkedTiles>150);t.diagnostic(JSON.stringify({tileOnlyLongRoads:candidates.size,checkedTiles}));
});

test('actual far-end trunk boundary paint is clipped locally rather than retained by a distant segment midpoint',()=>{
  const i=-22,j=8,pack=core.packs.find(p=>p.tiles.some(([x,z])=>x===i&&z===j))!;
  const zone=unpack(pack.file).tiles[`${i}_${j}`],edge:RoadEdge=zone.roads.find((e:RoadEdge)=>e.id==='2acaa4cb-b1e_0');
  assert.ok(edge?.ctx,'exercise the actual far-end context source, without its source owner');initTemplates();
  const tile=buildTile({i,j,roads:[edge],nodes:{},buildings:[],boards:[],furniture:[],areas:[],osm:[]},{lowQ:true,railway:makeRailwayNetwork([])});
  const paint=tile.buffers.filter(b=>b.mat==='marks');assert.ok(paint.length,'locally streamed asphalt still needs its painted boundaries');
  let vertices=0;
  for(const buffer of paint)for(let k=0;k<buffer.pos.length;k+=3){
    const x=buffer.pos[k],z=buffer.pos[k+2];vertices++;
    assert.ok(x>=i*1000-.002&&x<=(i+1)*1000+.002&&z>=j*1000-.002&&z<=(j+1)*1000+.002,
      `paint extends beyond its loaded tile: ${x},${z}; clip the actual strip triangles, not its centre`);
  }
  assert.ok(vertices>20);
});
