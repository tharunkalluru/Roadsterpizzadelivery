import { describe, expect, it } from 'vitest';
import { streetscapeBarriers, type StreetscapeData } from '../../src/art/streetscape';
import { metroAlignments } from '../../src/art/metro';
import { MetroTimetable } from '../../src/traffic/metroTimetable';
import { SignalSystem } from '../../src/traffic/signals';
import { TrafficSystem, type Actor } from '../../src/traffic/traffic';
import { Rng } from '../../src/core/rng';
import { WorldPhysics } from '../../src/world/collision';
import { makeFixtureCore } from './fixture';
import { SIM_HZ } from '../../src/config/gameplay';
const farPlayer={x:100,z:-900,y:0,speed:0,heading:0,airborne:false};

describe('metro service timetable',()=>{
  it('builds one two-track deck from a pair of reversed directional rail lines',()=>{
    const core=makeFixtureCore();core.metroLines[0].local=[[[0,0],[0,-1000]],[[4,-1000],[4,0]]];
    const alignments=metroAlignments(core);expect(alignments).toHaveLength(1);
    expect(alignments[0].samples[0].x).toBe(2);
    expect(alignments[0].samples.at(-1)!.x).toBe(2);
  });
  it('accelerates and brakes continuously, dwells 20 seconds, then resumes',()=>{
    const timetable=new MetroTimetable(2000,[800,1400]);
    let firstDwell=-1,lastDwell=-1, previous=-1;
    for(let t=0;t<timetable.duration;t+=.1) {
      const run=timetable.sample(t);
      expect(run.distance).toBeGreaterThanOrEqual(previous-1e-7);
      expect(run.speed).toBeGreaterThanOrEqual(0);
      expect(run.speed).toBeLessThanOrEqual(18.00001);
      previous=run.distance;
      if(run.dwelling && run.distance===800) {if(firstDwell<0)firstDwell=t;lastDwell=t;expect(run.speed).toBe(0);}
    }
    expect(lastDwell-firstDwell).toBeCloseTo(19.9,1);
    expect(timetable.sample(firstDwell+20.5).distance).toBeGreaterThan(800);
    expect(timetable.sample(timetable.duration).distance).toBeCloseTo(2000,8);
    expect(timetable.sample(timetable.duration).speed).toBeCloseTo(0,8);
  });
});

describe('traffic queue and boarding behaviour',()=>{
  it('keeps a vehicle inside a narrow exit when its incoming lane was much wider',()=>{
    const core=makeFixtureCore();
    core.roads.find(r=>r.id==='A2')!.widthM=4.5;
    core.roads.find(r=>r.id==='A2')!.oneway=true;
    core.directed.find(e=>e.id==='A1:f')!.next=['A2:f'];
    const traffic=new TrafficSystem(new WorldPhysics(core),new Rng(4));
    traffic.spawnQueue('A1:f',999.99,1,0,'narrow-exit');
    const actor=traffic.actors[0];
    Object.assign(actor,{kind:'car',width:1.8,length:4.2,height:1.5,state:'drive',speed:10,vmax:10,lateral:-5,laneLateral:-5});
    traffic.step({...farPlayer,z:-1100});
    expect(actor.edge).toBe('A2:f');
    expect(Math.abs(actor.lateral)+actor.width/2).toBeLessThanOrEqual(4.5/2);
  });
  it('retains red-light queues for longer than the deadlock timeout',()=>{
    const core=makeFixtureCore();
    core.junctions=[{id:'signal',nodeId:'n1',incoming:['A1:f'],outgoing:['A2:f','B:f'],movementStatus:'scenario_overlay',signalled:true}];
    const traffic=new TrafficSystem(new WorldPhysics(core),new Rng(42));
    traffic.spawnQueue('A1:f',990,2,0,'test');
    for(const a of traffic.actors){a.state='drive';a.speed=0;}
    (traffic as unknown as {tickCount:number}).tickCount=21*SIM_HZ;
    const ids=traffic.actors.map(a=>a.id);
    for(let i=0;i<12*SIM_HZ;i++)traffic.step(farPlayer);
    expect(traffic.actors.map(a=>a.id)).toEqual(ids);
    expect(traffic.actors.every(a=>a.along<996)).toBe(true);
    expect(traffic.log).toEqual([]);
  });
  it('keeps nearby graph nodes of one physical junction on a shared clock',()=>{
    const core=makeFixtureCore();core.nodes.find(n=>n.id==='n3')!.x=20;
    core.junctions=['n1','n3'].map(nodeId=>({id:nodeId,nodeId,incoming:[],outgoing:[],movementStatus:'scenario_overlay',signalled:true}));
    const signals=new SignalSystem(new WorldPhysics(core));
    expect(signals.nodes).toHaveLength(2);
    expect(signals.nodes[0].offset).toBe(signals.nodes[1].offset);
  });
  it('bus boards at a station-side stop, dwells, then merges ahead of a yielding follower',()=>{
    const core=makeFixtureCore();
    core.stations=[{id:'test-station',name:'Test',sourceName:'Test',nameTe:null,lines:['blue'],lat:0,lon:0,x:0,z:-500,osmIds:[],isDeliveryEntrance:false,inCorridor:true,status:{geometry:'scenario_overlay'}}];
    const traffic=new TrafficSystem(new WorldPhysics(core),new Rng(5));
    traffic.spawnQueue('A1:f',460,1,0,'test');
    const actor=traffic.actors[0];
    Object.assign(actor,{kind:'bus',width:2.6,length:11.5,height:3.2,state:'drive',speed:6,vmax:9});
    let dwellingTicks=0, resumed=false, insertedFollower=false;
    for(let i=0;i<30*SIM_HZ;i++) {
      traffic.step({...farPlayer,z:-500});
      if(actor.stopDwellUntil!==undefined){
        dwellingTicks++;
        if(!insertedFollower){
          const before=traffic.actors.length;
          traffic.spawnQueue('A1:f',actor.along-11,1,0,'yielding-follower');
          if(traffic.actors.length>before){const follower=traffic.actors[traffic.actors.length-1];Object.assign(follower,{kind:'car',length:4.2,width:1.8,height:1.5,state:'drive',speed:0,vmax:9});insertedFollower=true;}
        }
      }
      if(dwellingTicks && actor.along>510)resumed=true;
    }
    expect(dwellingTicks).toBeGreaterThanOrEqual(7.9*SIM_HZ);
    expect(insertedFollower).toBe(true);
    expect(resumed).toBe(true);
  });
});


describe('researched streetscape collision plan',()=>{
  it('keeps the physical median identical to rendered runs and leaves cross streets open',()=>{
    const data:StreetscapeData={version:1,note:'fixture',features:[{id:'median',kind:'planted_median',points:[[9,-900],[9,-1100]],widthM:2,heightM:.55,sourceId:'fixture',imageryDate:'2026-01',geometryStatus:'provisional',presenceStatus:'verified'}]};
    const plan=streetscapeBarriers(data,makeFixtureCore());
    expect(plan).toHaveLength(2);
    expect(plan.every(p=>p.width===2 && p.height===.55)).toBe(true);
    for(const run of plan)for(let i=1;i<run.points.length;i++) {
      const z=(run.points[i-1][1]+run.points[i][1])/2;
      expect(z < -1004 || z > -996).toBe(true);
    }
  });
});


function autoActor(world:WorldPhysics,id:number,edge:string,along:number,lateral:number,state:Actor['state']='merge'):Actor {
  const p=world.nav.pointOnDirected(edge,along),fx=-Math.sin(p.heading),fz=-Math.cos(p.heading),x=p.x-fz*lateral,z=p.z+fx*lateral;
  return {id,kind:'auto',edge,along,lateral,laneLateral:0,state,speed:0,vmax:9,length:2.9,width:1.4,height:1.8,stateTicks:0,waitTicks:0,braking:true,x,z,y:p.y,heading:p.heading,px:x,pz:z,py:p.y,pheading:p.heading};
}
describe('mixed traffic merge recovery',()=>{
  it('clears inherited overlapping merges from the front rather than permanently blocking every auto',()=>{
    const core=makeFixtureCore();core.roads.find(r=>r.id==='A1')!.oneway=true;core.roads.find(r=>r.id==='A1')!.widthM=4.5;
    const world=new WorldPhysics(core),rng=new Rng(42);rng.next=()=>.999;
    const traffic=new TrafficSystem(world,rng);
    traffic.actors=[autoActor(world,45,'A1:f',100.05,-1.435),autoActor(world,129,'A1:f',100.06,-1.435),autoActor(world,186,'A1:f',100.07,-1.435),autoActor(world,263,'A1:f',100.326,-1.435)];
    for(let i=0;i<20*SIM_HZ;i++)traffic.step({...farPlayer,z:-250});
    expect(traffic.actors).toHaveLength(4);
    expect(traffic.actors.every(a=>a.along>125)).toBe(true);
    expect(traffic.log).toEqual([]);
  });
  it('queues a wide-approach auto before an occupied narrow exit and admits it after the queue moves',()=>{
    const core=makeFixtureCore();core.roads.find(r=>r.id==='A2')!.oneway=true;core.roads.find(r=>r.id==='A2')!.widthM=4.5;
    const world=new WorldPhysics(core),rng=new Rng(1);rng.next=()=>.999;
    const traffic=new TrafficSystem(world,rng),approach=autoActor(world,1,'A1:f',985,-4.25,'drive'),lead=autoActor(world,2,'A2:f',1,0,'queue');
    approach.nextEdge='A2:f';approach.speed=8;approach.laneLateral=-3;lead.holdUntil=30*SIM_HZ;
    traffic.actors=[approach,lead];
    for(let i=0;i<5*SIM_HZ;i++)traffic.step({...farPlayer,z:-1000});
    expect(approach.edge).toBe('A1:f');expect(approach.along).toBeLessThan(998);
    lead.holdUntil=0;
    for(let i=0;i<10*SIM_HZ;i++)traffic.step({...farPlayer,z:-1050});
    expect(approach.edge).toBe('A2:f');expect(approach.along).toBeGreaterThan(10);
    expect(lead.along-approach.along).toBeGreaterThan(approach.length);
    expect(approach.lateral).toBeGreaterThanOrEqual(-1.3);
  });
  it('eventually recycles a genuinely impossible merge while allowing normal queue waits',()=>{
    const world=new WorldPhysics(makeFixtureCore()),rng=new Rng(1);rng.next=()=>.999;
    const traffic=new TrafficSystem(world,rng),blocked=autoActor(world,1,'A1:f',100,-4.25),obstacle=autoActor(world,2,'A1:f',100.5,0,'drive');
    obstacle.vmax=0;traffic.actors=[blocked,obstacle];
    for(let i=0;i<11*SIM_HZ;i++)traffic.step({...farPlayer,z:-100});
    expect(traffic.actors.some(a=>a.id===1)).toBe(false);
    expect(traffic.log.some(l=>l.startsWith('deadlock-recycle 1 '))).toBe(true);
  });
});
