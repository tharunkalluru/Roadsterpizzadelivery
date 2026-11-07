import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RoadGraph } from '../../src/game/roadgraph';
import { Game } from '../../src/game/game';
import { v36Route } from '../fixtures/route-v36-reference';
import type { RoadEdge } from '../../src/world/types';

function edge(id: string, from: string, to: string, x: number, z: number, xx: number, zz: number, extra = {}): RoadEdge {
  return { id, from, to, seg: id, pts: [[x,z],[xx,zz]], elev: null, cls: 'residential', w: 10, lanes: 2, oneway: null, name: id, ...extra } as RoadEdge;
}
function network() {
  const roads: RoadEdge[] = [];
  for(let x=0;x<12;x++) for(let z=0;z<12;z++) {
    const n = `${x},${z}`;
    if (x<11) roads.push(edge(`h${n}`,n,`${x+1},${z}`,x*100,z*100,(x+1)*100,z*100,{oneway:x%3===0?'forward':null}));
    if (z<11) roads.push(edge(`v${n}`,n,`${x},${z+1}`,x*100,z*100,x*100,(z+1)*100,{cls:z%3===0?'primary':'residential'}));
  }
  roads.push(edge('deck','0,0','1,0',0,0,100,0,{elev:[9,9]}));
  roads.push(edge('isolated','island-a','island-b',1500,0,1500,100));
  return new RoadGraph(roads);
}

test('cooperative routes preserve V36 points, distances, grades, one-way and partial outcomes exactly', () => {
  const graph = network();
  const queries: Parameters<RoadGraph['route']>[] = [
    [0,10,1100,1000], [100,50,0,50,{hx:0,hz:-1,y:.55}],
    [0,50,500,550,{hx:0,hz:1,y:.55},0,.55,true],
    [10,0,90,0,{hx:1,hz:0,y:9.55},9,9.55],
    [0,20,1500,80,{hx:0,hz:1,y:.55},0,.55,true],
    [0,20,1500,80,{hx:0,hz:1,y:.55},0,.55,false],
    [20,20,1100,1000,{hx:0,hz:1,y:.55},0,.55,true],
    [9000,9000,0,0],
  ];
  for(const args of queries) {
    const expected=v36Route.call(graph,...args), job=graph.routeJob(...args);
    assert.equal(job.state,'pending');assert.equal(job.operations,0);
    for(let i=0;job.state==='pending'&&i<50000;i++) job.step(.01);
    assert.equal(job.state,'complete');assert.deepEqual(job.result,expected);assert.deepEqual(graph.route(...args),expected);
  }
});

test('obsolete and cancelled graph searches release traversal and never publish a result', () => {
  const graph=network(),job=graph.routeJob(0,0,1100,1100);
  job.step(Number.MIN_VALUE);assert.equal(job.state,'pending');
  graph.addRoads([edge('new','new-a','new-b',0,1300,100,1300)]);
  job.step(1);assert.equal(job.state,'cancelled');assert.equal(job.result,null);
  const cancelled=graph.routeJob(0,0,1100,1100);cancelled.step(0);assert.equal(cancelled.operations,0);
  cancelled.cancel();cancelled.step(1);assert.equal(cancelled.operations,0);
});

function gameFixture() {
  const jobs: any[] = [], graph:any={revision:1,byId:new Map(),edgeAt:()=>null,
    routeJob(...args: any[]) { const job={state:'pending',result:{pts:[[0,0,0],[100,0,0]],len:100,complete:true},calls:0,cancel(){this.state='cancelled';},step(){if(++this.calls>=3)this.state='complete';},args};jobs.push(job);return job; }};
  const game:any=Object.assign(Object.create(Game.prototype), { graph,city:{walls:new Map(),buildingGrid:new Map(),obstacles:new Map()},
    player:{pos:new THREE.Vector3(0,.55,0),forward:{x:1,z:0},flying:false,descending:false,jumping:false,speed:0,placementRevision:1},
    routeTarget:{x:100,y:0,z:0,label:'Delivery'},route:{pts:[[0,0,0],[100,0,0]],len:100,complete:true},routeT:0,
    routeGuideT:0,routeGuide:[[0,0,0],[100,0,0]],routeAlpha:1,routeGraphRevision:1,routePlacementRevision:-1,
    gps:new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial()),beacon:new THREE.Group() });
  return {game,jobs,graph};
}

test('pending foreground route retains the existing ribbon and receives only one slice per update', () => {
  const {game,jobs}=gameFixture();
  game.updateRoute(1/60);assert.equal(jobs.length,1);assert.equal(jobs[0].calls,1);assert.equal(game.gps.visible,true);
  game.updateRoute(1/60);assert.equal(jobs.length,1);assert.equal(jobs[0].calls,2);assert.equal(game.gps.visible,true);
  game.updateRoute(1/60);assert.equal(jobs[0].calls,3);assert.equal(game.routeSearch,undefined);assert.equal(game.gps.visible,true);
});

test('destination, graph, mode and player-placement changes discard an unfinished foreground result', () => {
  for(const change of [
    (g:any)=>{g.routeTarget={x:150,y:0,z:0,label:'New delivery'};},
    (g:any)=>{g.graph.revision++;},
    (g:any)=>{g.player.placementRevision++;},
    (g:any)=>{g.player.flying=true;},
    (g:any)=>{g.player.forward={x:-1,z:0};},
  ]) {
    const {game,jobs}=gameFixture();game.updateRoute(1/60);const old=jobs[0];change(game);game.updateRoute(1/60);
    assert.equal(old.state,'cancelled');assert.equal(old.calls,1);assert.equal(jobs.length,2);
  }
});

test('a moving carrier keeps its pending route while its live marker advances', () => {
  const {game,jobs}=gameFixture();game.updateRoute(1/60);
  game.routeTarget.x+=8;game.updateRoute(1/60);
  game.routeTarget.x+=8;game.updateRoute(1/60);
  assert.equal(jobs.length,1);assert.equal(jobs[0].state,'complete');assert.equal(game.gps.visible,true);
});

test('finishing a search after taking another branch cannot publish the old road ribbon', () => {
  const {game,jobs}=gameFixture();game.updateRoute(1/60);
  const retained = game.route;
  game.player.pos.z=20;
  game.updateRoute(1/60);game.updateRoute(1/60);
  assert.equal(jobs[0].state,'complete');
  // Rejected work leaves the previous route in place rather than publishing an
  // unrelated source path, and the next off-route retry is bounded by .6s.
  assert.equal(game.route,retained);assert.notEqual(game.route,jobs[0].result);
  assert.equal(game.routeT,.6);assert.equal(game.routeGuideT>0,true);
});
