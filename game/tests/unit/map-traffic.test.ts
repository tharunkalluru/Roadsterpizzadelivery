import {describe,expect,it} from 'vitest';
import {trafficSnapshot,directionalTrafficSnapshot,MapView} from '../../src/ui/map';
import {project,unproject} from '../../src/world/geo';
import {Session} from '../../src/missions/session';
import {fixtureMission,makeFixtureWorld} from './fixture';
import {NO_INPUT} from '../../src/player/player';

describe('navigation reflects actual simulated traffic',()=>{
  it('shows local queues and moving traffic without inventing traffic readings on unobserved roads',()=>{
    const world=makeFixtureWorld(),s=new Session(world,fixtureMission({pickupId:'d_main'}));
    s.traffic.spawnQueue('A1:f',600,2,0,'map-test');
    for(const a of s.traffic.actors){a.speed=0;a.state='drive';}
    const jam=trafficSnapshot(world,s);
    expect(jam.get('A1')).toMatchObject({vehicles:s.traffic.actors.length,speedRatio:0,delayFactor:5});
    expect(jam.has('E')).toBe(false);
    for(const a of s.traffic.actors)a.speed=a.vmax;
    expect(trafficSnapshot(world,s).get('A1')).toMatchObject({speedRatio:1,delayFactor:1});
    expect(trafficSnapshot(world,null).size).toBe(0);
  });
  it('increases the estimated trip duration when the route contains an observed queue',()=>{
    const world=makeFixtureWorld(),s=new Session(world,fixtureMission({pickupId:'d_main'}));
    s.player.place(-3,-500,0,'A1');s.reroute();
    const map=new MapView(world.core,world),clear=map.etaSeconds(s);
    s.traffic.spawnQueue('A1:f',600,3,0,'map-eta');
    for(const a of s.traffic.actors)a.speed=0;
    expect(map.etaSeconds(s)).toBeGreaterThan(clear*2);
  });
  it('keeps opposite-direction queues separate in both the snapshot and ETA',()=>{
    const world=makeFixtureWorld(),s=new Session(world,fixtureMission({pickupId:'d_main'}));
    s.player.place(-3,-500,0,'A1');s.reroute();const map=new MapView(world.core,world),clear=map.etaSeconds(s);
    s.traffic.spawnQueue('A1:b',400,3,0,'opposite');for(const a of s.traffic.actors)a.speed=0;
    expect(directionalTrafficSnapshot(s).has('A1:f')).toBe(false);expect(directionalTrafficSnapshot(s).get('A1:b')?.delayFactor).toBe(5);
    expect(map.etaSeconds(s)).toBe(clear);
  });
  it('selects a longer connected route around an observed directional queue, without changing physical distances',()=>{
    const world=makeFixtureWorld(),nav=world.nav,clear=nav.route('A1:f',['D:f'],500)!;
    expect(clear.path).toContain('B:f');
    const busy=nav.route('A1:f',['D:f'],500,false,new Map([['B:f',5]]))!;
    expect(busy.path).not.toContain('B:f');expect(busy.lengthM).toBeGreaterThan(clear.lengthM);
    expect(nav.route('A1:f',['D:f'],500,false,new Map([['B:b',5]]))!.path).toEqual(clear.path);
  });
  it('actually refreshes the mission route on its periodic traffic check',()=>{
    const world=makeFixtureWorld(),base=world.core.deliveries[0];
    world.core.deliveries.push({...base,id:'d_link',roadId:'D',approachEdges:['D:f'],entrance:[200,-2006],stopPolygon:[[193,-2003],[207,-2003],[207,-2000],[193,-2000]]});
    const s=new Session(world,fixtureMission({pickupId:'d_link'}),{spawn:{x:-3,z:-750,heading:0,roadId:'A1'}});
    s.start();s.traffic.actors=[];s.reroute();expect(s.route).toContain('B:f');
    s.traffic.spawnQueue('B:f',100,3,1000,'observed-queue');s.tick=599;s.step(NO_INPUT);
    expect(s.route).not.toContain('B:f');expect(s.eventLog.some(e=>e.e==='reroute:traffic')).toBe(true);
  });
});

describe('citywide imagery-reference coordinates',()=>{
  it('round-trips the ends of all three metro corridors without approximate metres-per-degree drift',()=>{
    for(const point of [[17.442182,78.377184],[17.4146,78.5484],[17.35,78.55],[17.496,78.361]]){
      const [lat,lon]=unproject(...project(point[0],point[1]));
      expect(lat).toBeCloseTo(point[0],9);expect(lon).toBeCloseTo(point[1],9);
    }
  });
});
