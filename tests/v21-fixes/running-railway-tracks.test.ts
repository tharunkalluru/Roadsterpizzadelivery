import test from 'node:test';
import assert from 'node:assert/strict';
import { runningRailwayTracks } from '../../src/game/running-railway-tracks';
import { railwayNetwork } from '../../src/world/railway-geometry';
import { buildRailwayRun } from '../../src/game/railway-flow';

test('train inventory retains exact canonical tracks across loaded tile changes',()=>{
  const profiles=railwayNetwork().profiles,tracks=runningRailwayTracks(profiles);
  assert.equal(tracks.size,profiles.filter(track=>!track.service).length);
  for(const track of profiles)assert.equal(tracks.get(track.id),track.service?undefined:track,'mapped points and elevation objects are preserved');
  const loaded=new Map([...tracks].slice(0,3));loaded.clear();
  assert.equal(runningRailwayTracks(profiles),tracks,'tile removal cannot shorten the routing inventory or rebuild it each frame');
  const main=tracks.get('w1316254560')!;assert.ok(main);
  const route=buildRailwayRun(tracks,main);
  assert.ok(route.ways.length>1,'the station corridor is joined against the full railway source');
});

test('a different canonical profile set creates its own inventory and omits service sidings',()=>{
  const a={id:'a',pts:[[0,0],[100,0]] as [number,number][],elev:[0,0],service:false};
  const siding={id:'yard',pts:[[0,0],[100,5]] as [number,number][],service:true};
  const first=[a,siding],second=[{...a,elev:[1,1]}];
  assert.deepEqual([...runningRailwayTracks(first).keys()],['a']);
  assert.notEqual(runningRailwayTracks(first),runningRailwayTracks(second));
  assert.equal(runningRailwayTracks(second).get('a')!.elev,second[0].elev);
});
