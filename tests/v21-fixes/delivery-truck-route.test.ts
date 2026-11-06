import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { RoadGraph } from '../../src/game/roadgraph';
import { sampleTruckRoute, truckLane } from '../../src/delivery/truck-route';
import { applyConstructionRoads, planConstruction } from '../../src/world/construction';
import type { RoadEdge } from '../../src/world/types';

const road = (id: string, from: string, to: string, ax: number, bx: number, extra: Partial<RoadEdge> = {}): RoadEdge => ({ id, seg: id, name: 'Mapped highway', cls: 'trunk',
  w: 10.8, lanes: 3, oneway: 'backward', from, to, pts: [[ax,0],[bx,0]], elev: null, maxspeed: null, ...extra });
const options = { width: 6, halfLength: 10 };

test('wide one-way roads fit the actual truck envelope but construction and narrow two-way roads do not', () => {
  const g = new RoadGraph([road('a','0','1',0,500), road('b','2','3',0,500,{w:12,oneway:null}), road('c','4','5',0,500,{w:16,oneway:null}),
    road('d','6','7',0,500,{workZone:{site:'mapped-works',width:4.5,laneOffset:2,speed:25,sources:[],checkedAt:'2026-10-26'}})]);
  assert.ok(Math.abs(truckLane(g.byId.get('a')!,1,5,6)!-2.1)<1e-9);
  assert.equal(truckLane(g.byId.get('a')!,-1,0,6), null, 'never reverse a one-way road');
  assert.equal(truckLane(g.byId.get('b')!,1,0,6), null, 'twelve metres total is not six clear metres beside a median');
  assert.ok(truckLane(g.byId.get('c')!,1,4,6)! > 3);
  assert.equal(truckLane(g.byId.get('d')!,1,0,6), null, 'source width cannot override narrowed work-zone width');
});

test('route follows exact connected legal edges beyond one source segment, bounded to four kilometres', () => {
  const g = new RoadGraph([road('a','0','1',0,1000),road('b','1','2',1000,2000),road('c','2','3',2000,5000)]);
  const route = sampleTruckRoute(g,g.byId.get('a')!,1,0,options);
  assert.deepEqual(route.legs.map(leg=>leg.edgeId),['a','b','c']);
  assert.ok(route.length>3900&&route.length<=4000.01);
  assert.ok(route.points.every(p=>p.z===0&&p.y===0));
  for(let i=1;i<route.points.length;i++) assert.ok(route.points[i].x>route.points[i-1].x,'no teleport or reversal');
  for(let i=1;i<route.legs.length;i++) assert.equal(route.legs[i-1].to,route.legs[i].from);
});

test('U-turns, shared IDs with separated coordinates and incompatible grades cannot create phantom continuation', () => {
  for(const bad of [road('bad','1','2',500,0),road('bad','1','2',510,1000),road('bad','1','2',500,1000,{elev:[8,8]})]){
    const g=new RoadGraph([road('a','0','1',0,500),bad]),route=sampleTruckRoute(g,g.byId.get('a')!,1,0,options);
    assert.deepEqual(route.legs.map(leg=>leg.edgeId),['a']);assert.ok(route.length<500);
  }
});

test('a short mapped split does not become a false route endpoint for the twenty metre truck', () => {
  const g=new RoadGraph([road('a','0','1',0,500),road('split','1','2',500,528),road('b','2','3',528,1500)]);
  const route=sampleTruckRoute(g,g.byId.get('a')!,1,0,{...options,centerOffset:2});
  assert.deepEqual(route.legs.map(leg=>leg.edgeId),['a','split','b']);
  assert.ok(route.length>1450);
  assert.equal(route.points.at(-1)!.x,1486,'actual body offset remains clear of the final mapped endpoint');
});

test('a blocked full-body junction stops at the finite mapped edge instead of forcing through', () => {
  const g=new RoadGraph([road('a','0','1',0,500),road('b','1','2',500,1000)]);let checks=0;
  const route=sampleTruckRoute(g,g.byId.get('a')!,1,0,{...options,joinClear(p){checks++;return p.x<490;}});
  assert.ok(checks>0);assert.deepEqual(route.legs.map(leg=>leg.edgeId),['a']);assert.equal(route.points.at(-1)!.x,488);
});

test('reverse source geometry uses its legal travel direction and carries lane continuity across real joins', () => {
  const g=new RoadGraph([road('a','1','0',500,0,{oneway:'forward'}),road('b','2','1',1000,500,{oneway:'forward'})]);
  const route=sampleTruckRoute(g,g.byId.get('a')!,-1,1,options);
  assert.deepEqual(route.legs.map(leg=>leg.dir),[-1,-1]);assert.ok(route.points.at(-1)!.x>900);
  assert.ok(route.points.every(p=>Math.abs(p.z+1)<1e-9));
});

test('actual open Inner Ring Road has a legal kilometre-plus route while the old NH163 work zone is rejected', () => {
  const core=JSON.parse(gunzipSync(readFileSync('public/city/core.pack.wasm')).toString());
  const graph=new RoadGraph(applyConstructionRoads(core.roads,planConstruction(core.roads,core.origin)));
  const old=graph.byId.get('bb1fab18-4dc_0')!;assert.ok(old.e.workZone);assert.equal(truckLane(old,1,0,6),null);
  const start=graph.byId.get('2f777906-0dd_0')!,route=sampleTruckRoute(graph,start,1,0,{...options,centerOffset:2});
  assert.equal(start.e.name,'Inner Ring Road');assert.ok(route.length>1300&&route.length<4000);
  assert.ok(route.legs.length>3);
  for(let i=0;i<route.legs.length;i++){
    const leg=route.legs[i],edge=graph.byId.get(leg.edgeId)!;
    assert.ok(!edge.e.workZone);assert.notEqual(truckLane(edge,leg.dir,leg.lane,6),null);
    if(i)assert.ok(graph.nodes.get(route.legs[i-1].to)!.out.some(next=>next.edge===edge&&next.dir===leg.dir));
  }
});
