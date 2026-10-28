import source from './railway-source.json';
import type { OsmFeature } from './extras';
import type { RoadEdge, XZ } from './types';
import { roadStructureClearance } from './structure-clearance';

export interface RailProfile { id: string; pts: XZ[]; elev: number[]; bridge: boolean; service: boolean; source: OsmFeature; bounds: number[] }
export const RAIL_MAX_GRADE = .025, RAIL_HEADROOM = 6.4;
const active = (s?: string) => !!s && !['no','false','0'].includes(s.toLowerCase());
const key = (p: XZ) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
export function prepareRailProfiles(features: readonly OsmFeature[]): RailProfile[] {
  const nodes: {p:XZ; y:number; next:{id:number;len:number}[]}[] = [], ids=new Map<string,number>();
  const node=(p:XZ)=>{const k=key(p);let id=ids.get(k);if(id===undefined){id=nodes.length;ids.set(k,id);nodes.push({p,y:0,next:[]});}return id;};
  const ways: {f:OsmFeature; indices:number[]}[]=[];
  for(const f of features){
    if(f.k!=='rail'||f.t.railway!=='rail'||!f.l||f.l.length<2||active(f.t.tunnel))continue;
    const indices:number[]=[];
    for(let i=1;i<f.l.length;i++){
      const a=f.l[i-1],b=f.l[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(1,Math.ceil(len/20));
      for(let j=indices.length?1:0;j<=n;j++){const u=j/n,p: XZ=j===0?a:j===n?b:[a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u],id=node(p);if(indices.at(-1)!==id)indices.push(id);}
    }
    if(indices.length<2)continue;
    const bridge=active(f.t.bridge),layer=Number(f.t.layer)||1,height=bridge?6.2*Math.max(1,Math.min(4,layer)):0;
    for(let i=0;i<indices.length;i++){const a=nodes[indices[i]];a.y=Math.max(a.y,height);if(i){const prev=indices[i-1],len=Math.hypot(a.p[0]-nodes[prev].p[0],a.p[1]-nodes[prev].p[1]);a.next.push({id:prev,len});nodes[prev].next.push({id:indices[i],len});}}
    ways.push({f,indices});
  }
  // Multi-source max-distance envelope: bridge heights extend gradually into
  // connected approaches. Shared OSM vertices have exactly one height, across tiles.
  const heap:{id:number;y:number}[]=[];
  const push=(v:{id:number;y:number})=>{let i=heap.length;heap.push(v);while(i){const p=(i-1)>>1;if(heap[p].y>=v.y)break;heap[i]=heap[p];i=p;}heap[i]=v;};
  const pop=()=>{const v=heap[0],last=heap.pop()!;if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1].y>heap[c].y)c++;if(heap[c].y<=last.y)break;heap[i]=heap[c];i=c;}heap[i]=last;}return v;};
  nodes.forEach((n,id)=>{if(n.y>0)push({id,y:n.y});});
  while(heap.length){const h=pop();if(h.y<nodes[h.id].y-1e-8)continue;for(const edge of nodes[h.id].next){const y=h.y-edge.len*RAIL_MAX_GRADE;if(y>nodes[edge.id].y+1e-8){nodes[edge.id].y=y;push({id:edge.id,y});}}}
  return ways.map(({f,indices})=>{const pts=indices.map(i=>nodes[i].p);return{id:f.id,pts,elev:indices.map(i=>nodes[i].y),bridge:active(f.t.bridge),service:!!f.t.service,source:f,bounds:[Math.min(...pts.map(p=>p[0])),Math.max(...pts.map(p=>p[0])),Math.min(...pts.map(p=>p[1])),Math.max(...pts.map(p=>p[1]))]};});
}
export function makeRailwayNetwork(features: readonly OsmFeature[]) {
  const profiles=prepareRailProfiles(features),byId=new Map(profiles.map(r=>[r.id,r]));
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
  for(const f of [...features].filter(f=>f.k==='station').sort((a,b)=>Number(!a.p)-Number(!b.p)||a.id.localeCompare(b.id))){
    if(!name(f)||/subway|metro|light_rail/i.test(`${f.t.station||''} ${f.t.subway||''} ${f.t.network||''} ${f.t.name||''}`))continue;
    const p=center(f);if(!closest(...p,150))continue;
    if(stations.some(s=>{const q=center(s);return name(s)===name(f)&&Math.hypot(p[0]-q[0],p[1]-q[1])<500;}))continue;
    stations.push(f);
  }
  return {profiles,byId,stations,closest,clear:clearance.clear,conflicts:clearance.conflicts,center};
}
let cached:ReturnType<typeof makeRailwayNetwork>|undefined;
export const railwayNetwork=()=>cached??=makeRailwayNetwork(source.features as unknown as OsmFeature[]);
