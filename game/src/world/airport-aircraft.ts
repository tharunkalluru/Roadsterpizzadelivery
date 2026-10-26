import * as THREE from 'three';
import { Batch, TPL } from '../core/util';
import { airfieldProjection, AIRPORT_LAYOUTS, placeAirfields, type AirPoint, type Airfield, type GeoOrigin } from './airfields';
interface Route {pts:AirPoint[];cum:number[];taxi:number;runway:number;length:number}
interface Aircraft {mesh:THREE.Mesh;route:Route;s:number;speed:number;wait:number;airport:Airfield}
function distance(a:AirPoint,b:AirPoint){return Math.hypot(a[0]-b[0],a[1]-b[1]);}
function ringContains(p:AirPoint,ring:AirPoint[]){let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
// Mapped taxiways supply the graph. Ground movement never invents a loop around
// the apron, and one departure per airport avoids overlapping runway traffic.
export function airportDepartureRoute(a:Airfield,terminal:AirPoint):Route|null{
  const nodes:AirPoint[]=[],index=new Map<string,number>(),adj:{to:number;cost:number}[][]=[];
  const node=(p:AirPoint)=>{const key=`${p[0].toFixed(1)},${p[1].toFixed(1)}`;let n=index.get(key);if(n===undefined){n=nodes.length;nodes.push(p);adj.push([]);index.set(key,n);}return n;};
  for(const f of a.features.filter(f=>f.kind==='taxiway'))for(let i=1;i<f.pts.length;i++){const p=node(f.pts[i-1]),q=node(f.pts[i]),cost=distance(nodes[p],nodes[q]);adj[p].push({to:q,cost});adj[q].push({to:p,cost});}
  if(!nodes.length)return null;const runway=a.runways[0],start=runway.ends[0],end=runway.ends[1],L=distance(start,end),hx=(end[0]-start[0])/L,hz=(end[1]-start[1])/L;
  const nearest=(p:AirPoint)=>nodes.reduce((best,q,i)=>distance(p,q)<distance(p,nodes[best])?i:best,0),from=nearest(terminal);
  // Some taxiways join an intermediate runway entry. Use a connected mapped
  // intersection departure; do not bridge disconnected source ways over grass
  // or treat the dependent secondary runway as a freely available taxiway.
  const component=new Set<number>(),todo=[from];while(todo.length){const n=todo.pop()!;if(component.has(n))continue;component.add(n);for(const e of adj[n])if(!component.has(e.to))todo.push(e.to);}
  let to=-1,entry=Infinity;for(const n of component){const p=nodes[n],s=(p[0]-start[0])*hx+(p[1]-start[1])*hz,perp=Math.abs((p[0]-start[0])*hz-(p[1]-start[1])*hx);if(s>40&&s<L-1800&&perp<8&&s<entry){to=n;entry=s;}}
  if(to<0)return null;
  const dist=nodes.map(()=>Infinity),prev=nodes.map(()=>-1),pending=new Set(nodes.map((_,i)=>i));dist[from]=0;
  while(pending.size){let best=-1;for(const n of pending)if(best<0||dist[n]<dist[best])best=n;if(best<0||!Number.isFinite(dist[best]))break;pending.delete(best);if(best===to)break;for(const e of adj[best])if(dist[best]+e.cost<dist[e.to]){dist[e.to]=dist[best]+e.cost;prev[e.to]=best;}}
  if(!Number.isFinite(dist[to]))return null;
  const ids=[to];while(ids[ids.length-1]!==from&&ids.length<nodes.length){const p=prev[ids[ids.length-1]];if(p<0)return null;ids.push(p);}ids.reverse();
  const raw=ids.map(i=>nodes[i]);raw.push([start[0]+hx*entry,start[1]+hz*entry]);
  // Round each source corner within a12m envelope, safely within the mapped
  // taxiway width. This is motion smoothing, not a claimed surveyed fillet.
  const pts:AirPoint[]=[raw[0]];
  for(let i=1;i<raw.length-1;i++){const p=raw[i-1],q=raw[i],r=raw[i+1],d0=distance(p,q),d1=distance(q,r),cut=Math.min(10,d0*.3,d1*.3),a0:AirPoint=[q[0]+(p[0]-q[0])*cut/(d0||1),q[1]+(p[1]-q[1])*cut/(d0||1)],b0:AirPoint=[q[0]+(r[0]-q[0])*cut/(d1||1),q[1]+(r[1]-q[1])*cut/(d1||1)];pts.push(a0);for(let k=1;k<=6;k++){const t=k/6,u=1-t;pts.push([u*u*a0[0]+2*u*t*q[0]+t*t*b0[0],u*u*a0[1]+2*u*t*q[1]+t*t*b0[1]]);}}
  pts.push(raw[raw.length-1]);let taxi=0;for(let i=1;i<pts.length;i++)taxi+=distance(pts[i-1],pts[i]);pts.push(end,[end[0]+hx*2500,end[1]+hz*2500]);
  const cum=[0];for(let i=1;i<pts.length;i++)cum.push(cum[i-1]+distance(pts[i-1],pts[i]));return{pts,cum,taxi,runway:L-entry,length:cum[cum.length-1]};
}
function pointAt(r:Route,s:number){let i=1;while(i<r.pts.length-1&&r.cum[i]<s)i++;const a=r.pts[i-1],b=r.pts[i],u=Math.max(0,Math.min(1,(s-r.cum[i-1])/(r.cum[i]-r.cum[i-1]||1)));return{x:a[0]+(b[0]-a[0])*u,z:a[1]+(b[1]-a[1])*u};}
function planeGeometry(){const b=new Batch(),white='#e2e5e2',blue='#365e78';
  b.add(TPL.capsule,0,3.3,0,3.8,13.5,3.8,white,{rx:Math.PI/2});
  // Broad swept wings and tail planes; generic livery, not a named airline.
  for(const side of [-1,1]){b.quad([side*1.5,3.1,-2],[side*17,2.8,-8],[side*17,2.8,-11],[side*1.5,3.1,-7],white);b.quad([side*1.5,3.05,-7],[side*17,2.75,-11],[side*17,2.75,-8],[side*1.5,3.05,-2],white);b.add(TPL.cyl,side*6,2,-4,1.15,4.5,1.15,blue,{rx:Math.PI/2});b.box(side*5.5,3.4,-12,9,.25,2.8,blue,{ry:side*.2});}
  b.box(0,5.7,-12,.4,5.4,5,blue);b.box(0,3.5,12,2.2,.6,1.2,'#263a46');for(const side of [-1,1])for(let z=-9;z<10;z+=1.5)b.box(side*1.88,3.7,z,.06,.45,.75,'#304a5b');
  for(const [x,z]of[[0,9],[-2,-3],[2,-3]])b.box(x,.6,z,.6,1.2,1.2,'#292a2f');return b.geometry();
}
export class AirportAircraft{
  group=new THREE.Group();private planes:Aircraft[]=[];private geo:THREE.BufferGeometry;private mat:THREE.Material;
  constructor(origin:GeoOrigin,opts:{lowQ?:boolean}={}){this.geo=planeGeometry();this.mat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.72});const project=airfieldProjection(origin);
    for(const a of placeAirfields(origin)){const layout=AIRPORT_LAYOUTS[a.id as keyof typeof AIRPORT_LAYOUTS],terminal=project(layout.terminal.lat,layout.terminal.lon),scale=a.id==='vohy'?.55:1;
      const aprons=a.features.filter(f=>f.kind==='apron').sort((p,q)=>{const centre=(f:typeof p):AirPoint=>[f.pts.reduce((s,p)=>s+p[0],0)/f.pts.length,f.pts.reduce((s,p)=>s+p[1],0)/f.pts.length];return distance(centre(p),terminal)-distance(centre(q),terminal);});
      const parked:AirPoint[]=[];for(const apron of aprons.slice(0,3)){const minX=Math.min(...apron.pts.map(p=>p[0])),maxX=Math.max(...apron.pts.map(p=>p[0])),minZ=Math.min(...apron.pts.map(p=>p[1])),maxZ=Math.max(...apron.pts.map(p=>p[1]));for(let x=minX+25;x<maxX-20;x+=65*scale)for(let z=minZ+25;z<maxZ-20;z+=70*scale){const p:AirPoint=[x,z];if(parked.length>=(opts.lowQ?2:4)||!ringContains(p,apron.pts)||parked.some(q=>distance(p,q)<60*scale))continue;parked.push(p);const m=this.mesh(scale);m.position.set(x,.16,z);m.rotation.y=Math.PI;this.group.add(m);}}
      const route=airportDepartureRoute(a,terminal);if(route){const mesh=this.mesh(scale),p=route.pts[0];mesh.position.set(p[0],.16,p[1]);mesh.visible=false;this.group.add(mesh);this.planes.push({mesh,route,s:0,speed:0,wait:a.id==='vohy'?14:6,airport:a});}
    }
  }
  private mesh(scale:number){const m=new THREE.Mesh(this.geo,this.mat);m.scale.setScalar(scale);m.castShadow=true;return m;}
  update(dt:number,px:number,pz:number){for(const a of this.planes){const r=a.route,start=r.pts[0],near=Math.hypot(px-start[0],pz-start[1])<7000;a.mesh.visible=near;if(!near)continue;
    if(a.s>=r.length){a.mesh.visible=false;if(Math.hypot(px-start[0],pz-start[1])>700){a.s=0;a.speed=0;a.wait=35;}continue;}
    if(a.wait>0)a.wait-=dt;else{const roll=a.s-r.taxi,target=roll<0?6.5:Math.min(76,12+roll*.045);a.speed+=Math.max(-dt*2,Math.min(dt*2,target-a.speed));a.s+=a.speed*dt;}
    const p=pointAt(r,a.s),ahead=pointAt(r,a.s+12),roll=a.s-r.taxi,air=Math.max(0,roll-(a.airport.id==='vohy'?1050:1550));a.mesh.position.set(p.x,.16+air*.105,p.z);a.mesh.rotation.set(-Math.min(.13,air*.0008),Math.atan2(ahead.x-p.x,ahead.z-p.z),0);
  }}
  dispose(){this.geo.dispose();this.mat.dispose();this.group.clear();this.planes=[];}
}
