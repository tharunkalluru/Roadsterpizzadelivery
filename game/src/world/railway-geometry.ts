import source from './railway-source.json';
import type { OsmFeature } from './extras';
import type { RoadEdge, XZ } from './types';
import { roadStructureClearance } from './structure-clearance';
import { prepareRailwayClearance, type RailwayClearanceOptions } from './railway-clearance';

export interface RailProfile { id: string; pts: XZ[]; elev: number[]; bridge: boolean; service: boolean; source: OsmFeature; bounds: number[] }
export interface RailElevationPatch { id: string; elev: number[] }
export const RAIL_MAX_GRADE = .025, RAIL_HEADROOM = 6.4;
const active = (s?: string) => !!s && !['no','false','0'].includes(s.toLowerCase());
const key = (p: XZ) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
export function prepareRailProfiles(features: readonly OsmFeature[]): RailProfile[] {
  const nodes:XZ[] = [], ids=new Map<string,number>();
  const node=(p:XZ)=>{const k=key(p);let id=ids.get(k);if(id===undefined){id=nodes.length;ids.set(k,id);nodes.push(p);}return id;};
  const ways: {f:OsmFeature; indices:number[]}[]=[];
  for(const f of features){
    if(f.k!=='rail'||f.t.railway!=='rail'||!f.l||f.l.length<2||active(f.t.tunnel))continue;
    const indices:number[]=[];
    for(let i=1;i<f.l.length;i++){
      const a=f.l[i-1],b=f.l[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(1,Math.ceil(len/20));
      for(let j=indices.length?1:0;j<=n;j++){const u=j/n,p: XZ=j===0?a:j===n?b:[a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u],id=node(p);if(indices.at(-1)!==id)indices.push(id);}
    }
    if(indices.length<2)continue;
    // A relative bridge/layer tag describes what passes underneath, not an
    // absolute railway altitude. Flat city terrain uses the running datum;
    // evidenced road underpasses descend below it instead of lifting the line.
    ways.push({f,indices});
  }
  return ways.map(({f,indices})=>{const pts=indices.map(i=>nodes[i]);return{id:f.id,pts,elev:indices.map(()=>0),bridge:active(f.t.bridge),service:!!f.t.service,source:f,bounds:[Math.min(...pts.map(p=>p[0])),Math.max(...pts.map(p=>p[0])),Math.min(...pts.map(p=>p[1])),Math.max(...pts.map(p=>p[1]))]};});
}
export function makeRailwayNetwork(features: readonly OsmFeature[], patches: readonly RailElevationPatch[] = []) {
  const byPatch = new Map(patches.map(p => [p.id, p.elev]));
  const profiles=prepareRailProfiles(features).map(r => {
    const elev = byPatch.get(r.id); if (!elev) return r;
    if (elev.length !== r.pts.length || elev.some(y => !Number.isFinite(y) || y < 0)) throw new Error('Invalid canonical railway elevation patch');
    return { ...r, elev };
  }),byId=new Map(profiles.map(r=>[r.id,r]));
  const roads: RoadEdge[]=profiles.map(r=>({id:`rail:${r.id}`,seg:r.id,name:null,cls:'railway',w:3.8,lanes:1,oneway:null,from:null,to:null,pts:r.pts,elev:r.elev,maxspeed:null}));
  const clearance=roadStructureClearance(roads,RAIL_HEADROOM,1.9);
  const grid=new Map<string,{r:RailProfile;i:number}[]>();
  for(const r of profiles)for(let i=1;i<r.pts.length;i++){const a=r.pts[i-1],b=r.pts[i];for(let x=Math.floor(Math.min(a[0],b[0])/100);x<=Math.floor(Math.max(a[0],b[0])/100);x++)for(let z=Math.floor(Math.min(a[1],b[1])/100);z<=Math.floor(Math.max(a[1],b[1])/100);z++){const k=`${x},${z}`;(grid.get(k)||grid.set(k,[]).get(k)!).push({r,i});}}
  const closest=(x:number,z:number,max=150)=>{
    let best:{x:number;z:number;y:number;hx:number;hz:number;d:number;profile:RailProfile}|null=null;
    for(let gx=Math.floor((x-max)/100);gx<=Math.floor((x+max)/100);gx++)for(let gz=Math.floor((z-max)/100);gz<=Math.floor((z+max)/100);gz++)for(const {r,i} of grid.get(`${gx},${gz}`)||[]){const a=r.pts[i-1],b=r.pts[i],dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz);if(l<1e-7)continue;const u=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(l*l))),px=a[0]+u*dx,pz=a[1]+u*dz,d=Math.hypot(x-px,z-pz);if(d<=max&&(!best||d<best.d))best={x:px,z:pz,y:r.elev[i-1]+(r.elev[i]-r.elev[i-1])*u,hx:dx/l,hz:dz/l,d,profile:r};}
    return best;
  };
  const stations:OsmFeature[]=[];
  const center=(f:OsmFeature):XZ=>f.p||((f.r?.[0]||f.l||[]).reduce((a,p,_,l)=>[a[0]+p[0]/l.length,a[1]+p[1]/l.length],[0,0]) as XZ);
  const name=(f:OsmFeature)=>(f.t['name:en']||f.t.name||'').toLowerCase().replace(/railway|station|junction|nampally|[^a-z0-9]/g,'');
  const metro = (f: OsmFeature) => /subway|metro|light_rail/i.test(`${f.t.station||''} ${f.t.subway||''} ${f.t.network||''} ${f.t.name||''}`);
  const stationPriority = (f: OsmFeature) => Number(!!f.p) * 4 + Number(/^[A-Z]{2,5}$/.test(f.t.ref || '')) * 3 + Number(/Indian Railways|^IR$|^SCR$|South Central Railway/i.test(`${f.t.network || ''} ${f.t.operator || ''}`));
  for(const f of [...features].filter(f=>f.k==='station').sort((a,b)=>stationPriority(b)-stationPriority(a)||a.id.localeCompare(b.id))){
    if(!name(f)||metro(f))continue;
    const p=center(f);if(!closest(...p,150))continue;
    if(stations.some(s=>{const q=center(s);return name(s)===name(f)&&Math.hypot(p[0]-q[0],p[1]-q[1])<60;}))continue;
    stations.push(f);
  }
  const platforms = features.filter(f => f.k === 'platform' && !metro(f) && !!closest(...center(f), 35));
  const stationPlatforms = new Map<string, OsmFeature[]>();
  for (const platform of platforms) {
    const p = center(platform); let near: OsmFeature | undefined, distance = 650;
    for (const station of stations) { const q = center(station), d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < distance) { distance = d; near = station; } }
    if (near) { const list = stationPlatforms.get(near.id) || []; list.push(platform); stationPlatforms.set(near.id, list); }
  }
  return {profiles,byId,stations,platforms,stationPlatforms,closest,clear:clearance.clear,conflicts:clearance.conflicts,center};
}
let cached:ReturnType<typeof makeRailwayNetwork>|undefined;
export const railwayNetwork=(patches?: readonly RailElevationPatch[])=>patches?.length ? makeRailwayNetwork(source.features as unknown as OsmFeature[], patches) : cached??=makeRailwayNetwork(source.features as unknown as OsmFeature[]);
export function prepareRailwayTransport(roads: RoadEdge[], options: RailwayClearanceOptions = {}) {
  const baseline = railwayNetwork(), repaired = prepareRailwayClearance(roads, baseline.profiles, options);
  const patches = repaired.profiles.flatMap((r, i) => r === baseline.profiles[i] ? [] : [{ id: r.id, elev: r.elev }]);
  return { roads: repaired.roads, railway: patches.length ? railwayNetwork(patches) : baseline, patches, report: repaired.report };
}
