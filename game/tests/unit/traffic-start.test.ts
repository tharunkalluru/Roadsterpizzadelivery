import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { Rng } from '../../src/core/rng';
import { TrafficSystem, type Actor } from '../../src/traffic/traffic';
import { WorldPhysics } from '../../src/world/collision';
import { forwardOf } from '../../src/world/roadIndex';
import { Session } from '../../src/missions/session';
import { Autopilot } from '../../src/debug/autopilot';
import { buildLevelCatalog } from '../../src/missions/levels';
import { StreetSurvey } from '../../src/world/streetSurvey';
import { SourceAccuracyLayer } from '../../src/world/sourceAccuracy';
import { streetscapeBarriers } from '../../src/art/streetscape';
import { stationObstacles } from '../../src/art/metro';
import { structureObstacles } from '../../src/art/structures';
import { NO_INPUT } from '../../src/player/player';
import { makeFixtureCore, makeFixtureWorld, fixtureMission } from './fixture';
import {applyAuthoredContext} from './authored-context';
import type {WorldCoreV2} from '../../src/world/schema';

const player={x:-3,z:-400,y:0,heading:0,speed:0,airborne:false};
const nearby=(traffic:TrafficSystem,p=player)=>traffic.actors.filter(a=>Math.hypot(a.x-p.x,a.z-p.z)<=115 && Math.abs(a.y-p.y)<2.5);
function footprint(a:Actor,visit:(x:number,z:number,r:number)=>void) {
  const [fx,fz]=forwardOf(a.heading),n=Math.max(2,Math.ceil(a.length/a.width));
  for(let i=0;i<n;i++) {const off=-a.length/2+a.width/2+i*(a.length-a.width)/(n-1);visit(a.x+fx*off,a.z+fz*off,a.width/2+.15);}
}

describe('traffic already present in the opening scene',()=>{
  it('populates nearby legal lanes with a moving mix, while leaving the player room to start',()=>{
    const world=makeFixtureWorld(),traffic=new TrafficSystem(world,new Rng(42));
    traffic.prewarmAround(player);
    expect(nearby(traffic).length).toBeGreaterThanOrEqual(8);
    expect(nearby(traffic).filter(a=>a.z<player.z && a.z>player.z-110).length).toBeGreaterThanOrEqual(3);
    expect(new Set(traffic.actors.map(a=>a.kind)).size).toBeGreaterThanOrEqual(3);
    for(const a of traffic.actors) {
      const road=world.roads.roads.get(world.nav.edges.get(a.edge)!.roadId)!;
      expect(a.lateral+a.width/2).toBeLessThanOrEqual(-.15);
      expect(a.lateral-a.width/2).toBeGreaterThanOrEqual(-road.widthM/2+.2);
      expect(a.px).toBe(a.x);expect(a.pz).toBe(a.z);expect(a.py).toBe(a.y);expect(a.pheading).toBe(a.heading);
      expect(Math.hypot(a.x-player.x,a.z-player.z)-a.length/2).toBeGreaterThanOrEqual(30);
    }
    const starts=new Map(traffic.actors.map(a=>[a.id,{x:a.x,z:a.z}]));
    for(let i=0;i<5*60;i++) {
      traffic.step(player);
      for(const off of [-1,1])expect(traffic.contacts(player.x,player.z+off,0.05,1.05,1.05,[])).toHaveLength(0);
    }
    expect(traffic.actors.filter(a=>Math.hypot(a.x-starts.get(a.id)!.x,a.z-starts.get(a.id)!.z)>5).length).toBeGreaterThanOrEqual(6);
    expect(traffic.log).toEqual([]);
  });
  it('scales the opening population for light, normal and busy drives, including traffic off',()=>{
    const populations=[0,.5,.75,1].map(density=>{const t=new TrafficSystem(makeFixtureWorld(),new Rng(42));t.density=density;t.prewarmAround(player);return t.actors.length;});
    expect(populations[0]).toBe(0);
    expect(populations[1]).toBeGreaterThanOrEqual(4);
    expect(populations[2]).toBeGreaterThan(populations[1]);
    expect(populations[3]).toBeGreaterThan(populations[2]);
  });
  it('excludes pickup entrances and whole vehicle footprints from authored structures',()=>{
    const world=makeFixtureWorld();
    world.addStructures([{id:'loading-wall',poly:[[-6,-454],[6,-454],[6,-466],[-6,-466]],bottom:0,top:4}]);
    const traffic=new TrafficSystem(world,new Rng(7));
    traffic.reserved=[{x:-3,z:-480,r:12}];traffic.prewarmAround(player);
    expect(traffic.actors.length).toBeGreaterThan(3);
    for(const a of traffic.actors) {
      expect(Math.hypot(a.x+3,a.z+480)).toBeGreaterThanOrEqual(12+a.length/2+5);
      footprint(a,(x,z,r)=>expect(world.contacts(x,z,a.y+.05,a.height-.1,r)).toEqual([]));
      const distance=a.speed*1.2+a.speed*a.speed/6;
      for(let ahead=1;ahead<=distance;ahead++) {
        const p=world.nav.pointOnDirected(a.edge,a.along+ahead),[fx,fz]=forwardOf(p.heading);
        footprint({...a,x:p.x-fz*a.lateral,z:p.z+fx*a.lateral,y:p.y,heading:p.heading},(x,z,r)=>expect(world.contacts(x,z,p.y+.05,a.height-.1,r)).toEqual([]));
      }
    }
  });
  it('uses fitting vehicles and leaves braking room before narrow exits and junctions',()=>{
    const core=makeFixtureCore();core.roads.find(r=>r.id==='A2')!.widthM=3.4;
    const world=new WorldPhysics(core),traffic=new TrafficSystem(world,new Rng(12)),p={...player,z:-970};
    traffic.prewarmAround(p);
    expect(traffic.actors.length).toBeGreaterThan(2);
    for(const a of traffic.actors) {
      const e=world.nav.edges.get(a.edge)!,road=world.roads.roads.get(e.roadId)!;
      expect(a.along-a.length/2).toBeGreaterThanOrEqual(8);
      expect(e.lengthM-a.along-a.length/2).toBeGreaterThanOrEqual(8+a.speed*1.2+a.speed*a.speed/6);
      expect(road.oneway?road.widthM:road.widthM/2).toBeGreaterThanOrEqual(a.width+.5);
    }
  });
  it('preserves the runtime anti-pop-in exclusion after nearby prewarming',()=>{
    const traffic=new TrafficSystem(makeFixtureWorld(),new Rng(2));traffic.prewarmAround(player);
    const initial=new Set(traffic.actors.map(a=>a.id));
    for(let i=0;i<15;i++)traffic.spawnAround(player.x,player.z,player.heading);
    const added=traffic.actors.filter(a=>!initial.has(a.id));expect(added.length).toBeGreaterThan(0);
    for(const a of added) {
      expect(Math.hypot(a.x-player.x,a.z-player.z)).toBeGreaterThanOrEqual(69);
      expect(a.z<player.z && a.z>player.z-120 && Math.abs(a.x-player.x)<25).toBe(false);
    }
  });
  it('lets prewarmed red-light traffic wait beyond the deadlock timeout and resume on green',()=>{
    const core=makeFixtureCore();
    core.junctions=[{id:'signal',nodeId:'n1',incoming:['A1:f'],outgoing:['A2:f','B:f'],movementStatus:'scenario_overlay',signalled:true}];
    const traffic=new TrafficSystem(new WorldPhysics(core),new Rng(42)),p={...player,z:-940};
    (traffic as unknown as {tickCount:number}).tickCount=21*60;
    traffic.prewarmAround(p);
    const approaching=traffic.actors.filter(a=>a.edge==='A1:f' && a.along>950);
    expect(approaching.length).toBeGreaterThan(0);
    for(let i=0;i<12*60;i++)traffic.step(p);
    for(const a of approaching) {expect(traffic.actors).toContain(a);expect(a.edge).toBe('A1:f');expect(a.along).toBeLessThan(996);}
    expect(traffic.log.some(line=>approaching.some(a=>line.startsWith(`deadlock-recycle ${a.id} `)))).toBe(false);
    for(let i=0;i<14*60;i++)traffic.step(p);
    expect(approaching.some(a=>a.edge!=='A1:f')).toBe(true);
  });
  it('prepares once without advancing the clock and retains restored traffic exactly',()=>{
    const world=makeFixtureWorld(),mission=fixtureMission({traffic:'busy',deadlineSeconds:900}),s=new Session(world,mission,{seed:17});
    s.prepareTraffic();const before=JSON.stringify(s.traffic.snapshot()),rng=JSON.stringify(s.rng.snapshot());
    s.prepareTraffic();s.start();
    expect(JSON.stringify(s.traffic.snapshot())).toBe(before);expect(JSON.stringify(s.rng.snapshot())).toBe(rng);
    expect(s.tick).toBe(0);expect(s.elapsedTicks).toBe(0);
    s.step(NO_INPUT);
    const restored=Session.fromCheckpoint(world,mission,s.checkpoint(),true),snapshot=JSON.stringify(restored.traffic.snapshot());
    restored.prepareTraffic();restored.start();expect(JSON.stringify(restored.traffic.snapshot())).toBe(snapshot);
  });
});

const base='public/world/hyd-metro/v2/',have=existsSync(base+'manifest.json');
describe.skipIf(!have)('authored Hyderabad opening traffic',()=>{
  const read=(path:string)=>JSON.parse(readFileSync(path,'utf8'));
  const manifest=have?read(base+'manifest.json'):null,raw=have?read(base+manifest.core.file):null;
  const accuracy=manifest?.sourceAccuracy?new SourceAccuracyLayer(read(base+manifest.sourceAccuracy.file)):null;
  const sourceCore=accuracy?accuracy.applyCore(raw):raw;
  const survey=have?new StreetSurvey(read('public/research/street-survey.json'),sourceCore):null;
  const core=survey?applyAuthoredContext(survey.applyCoreCorrections(sourceCore)):null,streetscape=have?read('public/research/streetscape.json'):null;
  if(core)Object.assign(core,{streetscape});
  const world=have?new WorldPhysics(core!,manifest.chunkSizeM):null;
  if(world){world.setKnownChunks(manifest.chunks.map((c:any)=>c.id));world.addRoadBarriers(streetscapeBarriers(streetscape,core!));world.addStructures(stationObstacles(core!));world.addStructures(structureObstacles(core as WorldCoreV2));for(const c of manifest.chunks){const chunk=read(base+c.file);world.addChunk(survey!.applyChunk(accuracy?accuracy.applyChunk(chunk):chunk));}}
  const missions=have?buildLevelCatalog(core!,world!):[];
  it('has visible nearby traffic at the first four pizza pickup starts, without initial static or player overlaps',()=>{
    for(const q of missions.filter(q=>q.level===1).slice(0,4)) {
      const s=new Session(world!,{...q,traffic:'light'},{seed:q.seed});s.prepareTraffic();
      const visible=nearby(s.traffic,{...player,x:s.player.x,y:s.player.y,z:s.player.z,heading:s.player.heading});
      expect(visible.length,q.id).toBeGreaterThanOrEqual(3);
      for(const a of visible)footprint(a,(x,z,r)=>expect(world!.contacts(x,z,a.y+.05,a.height-.1,r),`${q.id} actor${a.id}`).toEqual([]));
      for(const off of [-1,1]) {const [fx,fz]=forwardOf(s.player.heading);expect(s.traffic.contacts(s.player.x+fx*off,s.player.z+fz*off,s.player.y+.05,1.05,1.05,[])).toEqual([]);}
    }
  });
  for(const id of ['l1_1_domino_s_pizza','l1_4_domino_s_pizza_uppal_cross_road_hyderabad'])it(`${id} still collects and delivers with prewarmed traffic`,()=>{
    const q=missions.find(q=>q.id===id)!,s=new Session(world!,q,{seed:q.seed}),ap=new Autopilot(s);s.start();
    const recoveryContext:unknown[]=[];
    while(s.phase!=='ENDED' && s.tick<q.deadlineSeconds*60){if(s.phase==='RECOVERING'){recoveryContext.push({tick:s.tick,x:s.player.x,z:s.player.z,road:s.player.roadId,why:ap.why,actors:s.traffic.actors.filter(a=>Math.hypot(a.x-s.player.x,a.z-s.player.z)<15).map(a=>({id:a.id,kind:a.kind,edge:a.edge,speed:a.speed,along:a.along,state:a.state,stalled:a.stalledTicks,turn:a.turn}))});s.completeRecovery();continue;}s.step(ap.input());}
    const result=s.results();
    expect(result.outcome.success,JSON.stringify({outcome:result.outcome,cargo:result.cargo,recoveries:s.recoveries,recoveryContext,events:s.eventLog.slice(-15),traffic:s.traffic.log.slice(-5)})).toBe(true);expect(s.recoveries,JSON.stringify(recoveryContext)).toBeLessThanOrEqual(2);
  },60000);
});
