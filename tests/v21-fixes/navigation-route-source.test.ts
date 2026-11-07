import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Game } from '../../src/game/game';
import { flightNavigationReadout } from '../../src/ui/flight-navigation';
import type { RoutePoint } from '../../src/game/route-guidance';
import { MINIMAP_NAVIGATION } from '../../src/ui/minimap-navigation';

function installImmediateSearch(graph: any) {
  if (graph.routeJob) return;
  graph.routeJob = (...args: unknown[]) => ({ state: 'pending', result: null, cancel() { this.state = 'cancelled'; }, step() { this.result = graph.route(...args); this.state = 'complete'; } });
}

function fixture() {
  return Object.assign(Object.create(Game.prototype), {
    player: { pos: new THREE.Vector3(0, .55, 0), yaw: 0, flying: false, descending: false, jumping: false },
    // An unverified graph join must never overrule the actual local ribbon.
    route: { pts: [[0, 0, 0], [0, 0, -13], [-100, 0, -13]], len: 200 },
    routeGuide: [[0, 0, 0], [0, 0, -200]] as RoutePoint[], routeGuidanceBlocked: false,
    story: { localNavigation: undefined },
  }) as any;
}

test('actual Game road cue and rotating minimap share the checked straight ribbon', () => {
  const game = fixture();
  assert.equal(game.navigationRoadPoints(), game.routeGuide);
  const cue = game.roadNavigation({ x: -100, z: -13 });
  assert.equal(cue.hint, 'Continue straight'); assert.equal(cue.bearing, 0);
  const readout = flightNavigationReadout({ x: 0, z: 0, yaw: 0, flying: false,
    target: { x: -100, z: -13, kind: 'customer' }, road: cue });
  assert.equal(readout!.hint, 'Continue straight'); assert.equal(readout!.bearing, 0);
});

test('blocked geometry never creates an instruction beyond the safe road ribbon', () => {
  const game = fixture(); game.routeGuidanceBlocked = true;
  assert.equal(game.roadNavigation({ x: -100, z: -13 }).hint, 'Follow the map marker');
});

test('real turns remain directional, while final scene cues and flight overview keep their own roles', () => {
  const game = fixture(); game.routeGuide = [[0, 0, 0], [0, 0, -100], [100, 0, -100]];
  assert.equal(game.roadNavigation({ x: 100, z: -100 }).hint, 'Turn right');
  const scene = { metres: 7, bearing: -.3, hint: 'Approach ramp' };
  game.story.localNavigation = scene; assert.equal(game.roadNavigation({ x: 100, z: -100 }), scene);
  for (const mode of ['flying', 'descending', 'jumping']) {
    game.player[mode] = true; assert.equal(game.navigationRoadPoints(), game.route.pts);
    game.player[mode] = false;
  }
});

test('production minimap draws the same straight points used by the central cue', () => {
  const game = fixture(), strokes: number[][][] = [];
  let path: number[][] = [];
  const context: any = {
    save() {}, restore() {}, clearRect() {}, translate() {}, rotate() {}, scale() {}, arc() {}, clip() {}, fillRect() {}, fill() {}, closePath() {}, setLineDash() {},
    beginPath() { path = []; }, moveTo(x: number, z: number) { path.push([x, z]); }, lineTo(x: number, z: number) { path.push([x, z]); },
    stroke() { if (this.strokeStyle === MINIMAP_NAVIGATION.route) strokes.push(path); },
  };
  Object.assign(game, { hud: { el: { minimap: { width: 256, getContext: () => context } } },
    graph: { nearestEdges: () => [] }, city: { railway: { profiles: [] } }, zone: { metro: { lines: [] } }, routeColor: '#45E3D3' });
  const originalPath = globalThis.Path2D;
  Object.assign(globalThis, { Path2D: class { moveTo() {} lineTo() {} } });
  try { game.drawMinimap(); } finally { Object.assign(globalThis, { Path2D: originalPath }); }
  assert.deepEqual(strokes, [[[0, 0], [0, -200]]]);
  assert.equal(game.roadNavigation({ x: -100, z: -13 }).hint, 'Continue straight');
});


test('actual route update uses the mapped delivery approach while preserving the elevated scene marker',()=>{
  const target={x:100,y:30,z:20,label:'Hall seat'},approach={x:100,y:0,z:0,label:'Hall seat'};
  const planned:unknown[][]=[];
  const graph={revision:1,byId:new Map(),edgeAt:()=>null,route(...args:unknown[]){planned.push(args);return{pts:[[0,0,0],[100,0,0]],len:100,complete:true};}};
  const game:any=Object.assign(Object.create(Game.prototype),{
    graph,city:{walls:new Map(),buildingGrid:new Map(),obstacles:new Map()},
    player:{pos:new THREE.Vector3(0,.55,0),forward:{x:1,z:0},flying:false,descending:false,jumping:false,speed:0,placementRevision:1},
    story:{roadNavigationTarget:approach},routeTarget:target,route:null,routeT:0,routeGuideT:0,routeGuide:[],routeAlpha:0,routeGraphRevision:-1,routePlacementRevision:-1,
    gps:new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial()),
  });
  installImmediateSearch(game.graph);
  game.updateRoute(1/60);
  assert.equal(planned.length,1);assert.equal(planned[0][2],100);assert.equal(planned[0][3],0);assert.equal(planned[0][5],0);
  assert.equal((planned[0][4] as {y:number}).y,.55,'starting carriageway grade stays strict');
  assert.equal(game.routeTarget,target);assert.equal(target.y,30,'scene and flight marker do not move onto the road');
  assert.equal(game.gps.visible,true);assert.ok(game.gps.geometry.drawRange.count>0);assert.equal(game.gps.frustumCulled,false);
  game.player.flying=true;game.routeT=0;game.updateRoute(1/60);
  assert.equal(planned.length,2);assert.equal(planned[1][5],0,'airborne map overview uses the same real road approach');
  assert.equal(game.routeTarget.y,30);assert.equal(game.gps.visible,false,'road ribbon remains a grounded guide');
});

test('ordinary road target retains its strict destination grade without a story approach',()=>{
  let grade:unknown;const target={x:100,y:9,z:0};
  const game:any=Object.assign(Object.create(Game.prototype),{
    graph:{route(_x:number,_z:number,_tx:number,_tz:number,_car:unknown,y:unknown){grade=y;return null;}},
    player:{pos:new THREE.Vector3(0,9.55,0),forward:{x:1,z:0},flying:true,descending:false,jumping:false},
    routeTarget:target,routeT:0,routeGuideT:0,gps:{visible:true},
  });
  installImmediateSearch(game.graph);
  game.updateRoute(1/60);assert.equal(grade,9);assert.equal(game.routeTarget,target);
});

test('occupied truck hides only world ribbon/beacon while map route and top local direction remain available',()=>{
  const target={x:100,y:2,z:0},cue={metres:4,bearing:0,hint:'Hand over pizza'},planned:unknown[][]=[];
  const graph={revision:1,byId:new Map(),edgeAt:()=>null,route(...args:unknown[]){planned.push(args);return{pts:[[0,0,0],[100,0,0]],len:100,complete:true};}};
  const game:any=Object.assign(Object.create(Game.prototype),{
    graph,city:{walls:new Map(),buildingGrid:new Map(),obstacles:new Map()},
    player:{pos:new THREE.Vector3(0,.55,0),forward:{x:1,z:0},flying:false,descending:false,jumping:false,speed:0,placementRevision:1},
    story:{roadNavigationTarget:{...target,y:0},hideWorldGuidance:true,localNavigation:cue},routeTarget:target,route:null,routeT:0,routeGuideT:0,routeGuide:[],routeAlpha:0,routeGraphRevision:-1,routePlacementRevision:-1,
    gps:new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial()),beacon:new THREE.Group(),
  });
  installImmediateSearch(game.graph);
  game.updateRoute(1/60);assert.equal(game.gps.visible,false);assert.equal(game.beacon.visible,false);assert.ok(game.route.pts.length>1);
  assert.ok(game.navigationRoadPoints().length>1,'the minimap retains its normal road route');assert.equal(game.roadNavigation(target),cue);
  game.story.hideWorldGuidance=false;game.updateRoute(1/60);assert.equal(game.gps.visible,true);assert.equal(game.beacon.visible,true,'leaving the interior restores ordinary approach guidance');
  assert.equal(game.roadNavigation(target),cue);assert.equal(game.routeTarget,target);
});


test('minimap retains the mapped route when the local road ribbon is blocked',()=>{
  const game=fixture(),strokes:number[][][]=[];let path:number[][]=[];
  const context:any={save(){},restore(){},clearRect(){},translate(){},rotate(){},scale(){},arc(){},clip(){},fillRect(){},fill(){},closePath(){},setLineDash(){},beginPath(){path=[];},moveTo(x:number,z:number){path.push([x,z]);},lineTo(x:number,z:number){path.push([x,z]);},stroke(){if(this.strokeStyle===MINIMAP_NAVIGATION.route)strokes.push(path);}};
  Object.assign(game,{routeGuide:[],routeGuidanceBlocked:true,hud:{el:{minimap:{width:256,getContext:()=>context}}},graph:{nearestEdges:()=>[]},city:{railway:{profiles:[]}},zone:{metro:{lines:[]}}});
  const original=globalThis.Path2D;Object.assign(globalThis,{Path2D:class{moveTo(){}lineTo(){}}});
  try{game.drawMinimap();}finally{Object.assign(globalThis,{Path2D:original});}
  assert.deepEqual(strokes,[[[0,0],[0,-13],[-100,-13]]]);
  assert.equal(game.roadNavigation({x:-100,z:-13}).hint,'Follow the map marker');
});

test('a disconnected destination keeps only the reachable street prefix, never an invented connector',async()=>{
  const {RoadGraph}=await import('../../src/game/roadgraph');
  const edge=(id:string,from:string,to:string,a:number,b:number)=>({id,seg:id,from,to,pts:[[0,a],[0,b]],elev:null,w:10,lanes:2,oneway:null,cls:'residential',name:id});
  const graph=new RoadGraph([edge('a','a','b',0,-100),edge('target','c','d',-200,-300)] as any);
  const route=graph.route(0,-5,0,-250,{hx:0,hz:-1,y:.55},0,.55,true);
  assert.ok(route);assert.equal(route.complete,false);
  assert.ok(route.pts.length>1);assert.ok(route.pts.every(p=>p[2]>=-100));
  assert.ok(!route.edgeIds?.includes('target'));
});


test('moving delivery refresh retains the checked route until replanning, but a new delivery clears it',()=>{
  const game=fixture(),old=game.route,guide=game.routeGuide;
  Object.assign(game,{routeTarget:{x:10,y:0,z:10,label:'Truck'},beacon:{position:{set(){}},col:{}},gps:{material:{color:{set(){return this;},multiplyScalar(){}}}}});
  game.setTarget({x:30,y:0,z:10,label:'Truck'},'#45E3D3',true);
  assert.equal(game.route,old);assert.equal(game.routeGuide,guide);assert.equal(game.routeT,0);
  assert.equal(game.routeTarget.x,30);
});
