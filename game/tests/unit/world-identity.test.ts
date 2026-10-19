import {describe,expect,it} from 'vitest';
import {worldCompatibilityKey} from '../../src/world/identity';
import type {WorldManifest} from '../../src/world/schema';
import {Session,setWorldVersionKey,WORLD_VERSION_KEY} from '../../src/missions/session';
import {makeFixtureWorld,fixtureMission} from './fixture';

const manifest={worldId:'fixture',version:'2.0.0',core:{sha256:'core-a'},sourceAccuracy:{sha256:'accuracy-a'}}as WorldManifest;
describe('physical world checkpoint compatibility',()=>{
  it('separates geometry/survey changes while keeping presentation-only listing updates comparable',()=>{
    const key=worldCompatibilityKey(manifest,20,{version:1,features:[]});
    expect(worldCompatibilityKey({...manifest,sourceAccuracy:{...manifest.sourceAccuracy!,sha256:'accuracy-b'}},20,{version:1,features:[]})).not.toBe(key);
    expect(worldCompatibilityKey(manifest,21,{version:1,features:[]})).not.toBe(key);
    expect(worldCompatibilityKey(manifest,20,{version:1,features:['new-barrier']})).not.toBe(key);
    expect(worldCompatibilityKey(manifest,20,{version:1,features:[]},{transport:{features:['signal-a']}})).not.toBe(key);
    expect(worldCompatibilityKey(manifest,20,null,{publicRealm:{features:['speed-breaker']}})).not.toBe(worldCompatibilityKey(manifest,20,null,{publicRealm:{features:[]}}));
    expect(worldCompatibilityKey(manifest,20,null,{transport:1,publicRealm:2})).toBe(worldCompatibilityKey(manifest,20,null,{publicRealm:2,transport:1}));
    expect(worldCompatibilityKey({...manifest,listingIndex:{file:'new-listings.json',sha256:'new-listings',count:1,bytes:100}},20,{version:1,features:[]})).toBe(key);
  });
  it('rejects a checkpoint from the old layout and restores an unchanged current layout',()=>{
    const previous=WORLD_VERSION_KEY;
    try{
      setWorldVersionKey('fixture@v2.0.0');
      const world=makeFixtureWorld(),mission=fixtureMission(),session=new Session(world,mission,{runId:'compat',trafficEnabled:false});session.start();
      const old=session.checkpoint();setWorldVersionKey(worldCompatibilityKey(manifest,20));
      expect(()=>Session.fromCheckpoint(world,mission,old)).toThrow(/Incompatible/);
      const current=new Session(world,mission,{runId:'current',trafficEnabled:false});current.start();
      expect(Session.fromCheckpoint(world,mission,JSON.parse(JSON.stringify(current.checkpoint()))).deliveryStage).toBe('PICKUP');
    }finally{setWorldVersionKey(previous);}
  });
});
