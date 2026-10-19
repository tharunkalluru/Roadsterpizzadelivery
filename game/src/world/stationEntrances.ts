/** Mapped entrance points do not establish a stair footprint, flight or rise. */
import type { WorldCore } from './schema';
export interface StationEntrance {
  id:string;lat:number;lon:number;x:number;z:number;stationId:string|null;
  associationStatus:'provisional'|'unmatched';distanceM:number|null;sourceUrl:string;sourceElementId:string;
  sourceUpdatedAt?:string;tags:Record<string,string>;notes:string;
}
export interface StationEntranceData {version:1;worldId:string;worldVersion:string;sourceSnapshot:string;license:string;sourceUrl:string;entrances:StationEntrance[]}
export function validateStationEntrances(data:StationEntranceData,core?:WorldCore):void {
  if(data.version!==1||!Array.isArray(data.entrances))throw new Error('Invalid station entrance layer');
  const ids=new Set<string>();
  for(const e of data.entrances){
    if(!e.id||ids.has(e.id)||![e.lat,e.lon,e.x,e.z].every(Number.isFinite)||e.tags.railway!=='subway_entrance'||!/^https:\/\/www\.openstreetmap\.org\/node\/\d+$/.test(e.sourceUrl)||!e.sourceElementId||!['provisional','unmatched'].includes(e.associationStatus)||e.stationId!==null&&(e.associationStatus!=='provisional'||e.distanceM===null||e.distanceM>150||core&&!core.stations.some(s=>s.id===e.stationId)))throw new Error(`Invalid sourced station entrance ${e.id}`);
    ids.add(e.id);
  }
}
export async function loadStationEntrances(url='./research/station-entrances.json',signal?:AbortSignal):Promise<StationEntranceData|null>{
  const response=await fetch(url,{signal});if(response.status===404)return null;
  if(!response.ok)throw new Error(`Station entrances unavailable (${response.status})`);
  const data=await response.json()as StationEntranceData;validateStationEntrances(data);return data;
}
export function attachStationEntrances<T extends WorldCore>(core:T,data:StationEntranceData):T {
  if(data.worldId!=='hyd-metro'||data.worldVersion!==core.manifestVersion)throw new Error('Station entrances belong to another world version');
  validateStationEntrances(data,core);
  return{...core,stations:core.stations.map(s=>({...s,entrances:data.entrances.filter(e=>e.stationId===s.id)}))};
}
