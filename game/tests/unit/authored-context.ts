import {readFileSync,existsSync} from 'node:fs';
import type {WorldCore} from '../../src/world/schema';
import {attachTransport,type TransportData} from '../../src/traffic/placements';
import {attachStationEntrances,type StationEntranceData} from '../../src/world/stationEntrances';
import {attachStationGeometry,type StationGeometryData} from '../../src/world/stationGeometry';
import {attachPublicRealm,publicRealmWithTransport,mergePublicRealmData,type PublicRealmData} from '../../src/world/publicRealm';

/** Same source context composition as App, before WorldPhysics builds its physical plan. */
export function applyAuthoredContext(input:WorldCore):WorldCore {
 const read=(path:string)=>JSON.parse(readFileSync(path,'utf8'));
 let core=input;
 if(existsSync('public/research/transport.json'))core=attachTransport(core,read('public/research/transport.json') as TransportData);
 if(existsSync('public/research/station-entrances.json'))core=attachStationEntrances(core,read('public/research/station-entrances.json') as StationEntranceData);
 if(existsSync('public/research/station-geometry.json'))core=attachStationGeometry(core,read('public/research/station-geometry.json') as StationGeometryData);
 const layers=['public-realm','observed-public-realm','scenario-public-realm'].flatMap(name=>{
  const path=`public/research/${name}.json`;return existsSync(path)?[read(path) as PublicRealmData]:[];
 });
 if(layers.length)attachPublicRealm(core,publicRealmWithTransport(core,mergePublicRealmData(...layers)));
 return core;
}
