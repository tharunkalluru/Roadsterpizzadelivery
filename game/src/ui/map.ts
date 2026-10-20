import type { PilotZone } from '../pilot/zone';
import type { RoadEdge, Storefront, WorldChunkV2, WorldCore } from '../world/schema';
import type { WorldPhysics } from '../world/collision';
import type { Session } from '../missions/session';
import type { StreetSurvey } from '../world/streetSurvey';
import { project } from '../world/geo';
import { MapChunkCache } from './mapChunks';
import type { ChunkRef } from '../world/schema';
import type { SourcePlaceListing, SourcePlaceListingIndex } from '../world/sourceAccuracy';
import {trafficByEdge} from '../traffic/congestion';
import {landscapeOf,type LandscapePart} from '../world/landscape';

export type MapLayer = 'traffic' | 'streets' | 'research';
export interface RoadTraffic { speedRatio: number; vehicles: number; delayFactor: number }
export const directionalTrafficSnapshot=(session:Session|null)=>trafficByEdge(session?.traffic.actors??[]);

/** Unloaded streets are never labelled clear: this is the actual local simulation snapshot. */
export function trafficSnapshot(world: WorldPhysics, session: Session | null): Map<string, RoadTraffic> {
  const totals = new Map<string, { ratio: number; n: number }>();
  for (const a of session?.traffic.actors ?? []) {
    const id = world.nav.edges.get(a.edge)?.roadId;
    if (!id) continue;
    const row = totals.get(id) ?? { ratio: 0, n: 0 };
    row.ratio += Math.min(1, Math.max(0, a.speed / Math.max(1, a.vmax)));
    row.n++; totals.set(id, row);
  }
  return new Map([...totals].map(([id, a]) => {
    const ratio = a.ratio / a.n;
    return [id, { speedRatio: ratio, vehicles: a.n, delayFactor: Math.min(5, Math.max(1, 1 / Math.max(.2, ratio))) }];
  }));
}

export class MapView {
  private lines: { color: string; name: string; pts: [number, number][][] }[] = [];
  private chunks = new Map<string, WorldChunkV2>();
  private mapChunks: MapChunkCache | null = null;
  private lastCanvas: HTMLCanvasElement | null = null;
  private lastSession: Session | null = null;
  private listingCells = new Map<string,SourcePlaceListing[]>();
  private hasListingIndex=false;
  private roadBounds = new Map<string, [number, number, number, number]>();
  private landscapeParts:{part:LandscapePart;kind:string;className:string;name:string|null;bounds:[number,number,number,number]}[]=[];
  cx = 0; cz = 0; scale = .12;
  layer: MapLayer = 'traffic';
  focusedPlaceIds=new Set<string>();
  private boundsAll: { minX: number; maxX: number; minZ: number; maxZ: number };

  constructor(public core: WorldCore, public world: WorldPhysics, public survey: StreetSurvey | null = null, private pilotZone: PilotZone | null = null) {
    let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
    for (const l of core.metroLines) {
      const pts=l.geo.map(pl=>pl.map(([la,lo])=>project(la,lo)));
      for(const pl of pts)for(const [x,z]of pl){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);}
      this.lines.push({color:l.color,name:l.name,pts});
    }
    for(const r of core.roads)this.roadBounds.set(r.id,[Math.min(...r.points.map(p=>p[0])),Math.min(...r.points.map(p=>p[1])),Math.max(...r.points.map(p=>p[0])),Math.max(...r.points.map(p=>p[1]))]);
    this.boundsAll={minX,maxX,minZ,maxZ};
    for(const f of landscapeOf(core)?.features??[])for(const part of f.parts)this.landscapeParts.push({part,kind:f.kind,className:f.class??'',name:f.name,bounds:[Math.min(...part.footprint.map(p=>p[0])),Math.min(...part.footprint.map(p=>p[1])),Math.max(...part.footprint.map(p=>p[0])),Math.max(...part.footprint.map(p=>p[1]))]});
  }
  addChunk(chunk:WorldChunkV2){this.chunks.set(chunk.id,chunk);}
  removeChunk(id:string){this.chunks.delete(id);}
  setChunkSource(refs:ChunkRef[],size:number,load:(id:string,signal:AbortSignal)=>Promise<WorldChunkV2>){
    this.mapChunks=new MapChunkCache(refs,size,load,()=>{if(this.lastCanvas?.isConnected)this.draw(this.lastCanvas,this.lastSession);});
  }
  setListings(index:SourcePlaceListingIndex){
    this.listingCells.clear();this.hasListingIndex=true;
    for(const p of index.places){if(this.survey&&!this.survey.allowsSourceListing(p.id,p.frontageId))continue;const key=`${Math.floor(p.x/500)},${Math.floor(p.z/500)}`,cell=this.listingCells.get(key)??[];cell.push(p);this.listingCells.set(key,cell);}
  }
  private visibleListings(halfWidth:number,halfHeight:number){
    const places:SourcePlaceListing[]=[];
    for(let ix=Math.floor((this.cx-halfWidth)/500);ix<=Math.floor((this.cx+halfWidth)/500);ix++)for(let iz=Math.floor((this.cz-halfHeight)/500);iz<=Math.floor((this.cz+halfHeight)/500);iz++)places.push(...this.listingCells.get(`${ix},${iz}`)??[]);
    return places.filter(p=>Math.abs(p.x-this.cx)<halfWidth&&Math.abs(p.z-this.cz)<halfHeight).sort((a,b)=>Math.hypot(a.x-this.cx,a.z-this.cz)-Math.hypot(b.x-this.cx,b.z-this.cz));
  }
  private get mapData(){return new Map([...(this.mapChunks?.chunks??[]),...this.chunks]);}
  get storefronts():Storefront[]{return [...this.mapData.values()].flatMap(c=>c.storefronts??[]);}
  fitCorridor(w:number,h:number){
    const boxes=[...this.roadBounds.values()];
    const minX=Math.min(...boxes.map(b=>b[0])),minZ=Math.min(...boxes.map(b=>b[1])),maxX=Math.max(...boxes.map(b=>b[2])),maxZ=Math.max(...boxes.map(b=>b[3]));
    this.cx=(minX+maxX)/2;this.cz=(minZ+maxZ)/2;this.scale=Math.min(w/(maxX-minX+200),h/(maxZ-minZ+200));
  }
  fitNetwork(w:number,h:number){const b=this.boundsAll;if(!isFinite(b.minX))return this.fitCorridor(w,h);this.cx=(b.minX+b.maxX)/2;this.cz=(b.minZ+b.maxZ)/2;this.scale=Math.min(w/(b.maxX-b.minX+2000),h/(b.maxZ-b.minZ+2000));}
  focusRoad(r:RoadEdge){const b=this.roadBounds.get(r.id)!;this.cx=(b[0]+b[2])/2;this.cz=(b[1]+b[3])/2;this.scale=Math.min(1.2,Math.max(.45,700/Math.max(160,r.lengthM)));}
  nearestRoad(x:number,z:number,maxDistance=60):RoadEdge|null{
    let nearest:RoadEdge|null=null,dist=maxDistance;
    for(const r of this.core.roads)for(let i=1;i<r.points.length;i++){const a=r.points[i-1],b=r.points[i],dx=b[0]-a[0],dz=b[1]-a[1],l2=dx*dx+dz*dz;const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(l2||1)));const d=Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);if(d<dist){dist=d;nearest=r;}}
    return nearest;
  }
  etaSeconds(s:Session):number{
    const traffic=directionalTrafficSnapshot(s),path=s.route.slice(s.routeIdx);let seconds=0;
    for(let i=0;i<path.length;i++){
      const e=this.world.nav.edges.get(path[i]);if(!e)continue;
      let length=e.lengthM-(i===0?s.routeAlong:0);
      if(i===path.length-1&&s.currentStop)length-=e.lengthM-s.stopAlong(s.currentStop,e.id);
      const road=this.world.roads.roads.get(e.roadId)!,limit=(road as RoadEdge&{sourceProperties?:{maxSpeedKph?:number}}).sourceProperties?.maxSpeedKph;
      const pace=limit&&limit>0?Math.min(8,limit/3.6):8;
      seconds+=Math.max(0,length)/Math.max(1,pace)*(traffic.get(e.id)?.delayFactor??1);
    }
    return seconds;
  }
  draw(c:HTMLCanvasElement,s:Session|null){
    const g=c.getContext('2d')!,W=c.width,H=c.height,dpr=W/c.clientWidth||1,sc=this.scale*dpr;
    this.lastCanvas=c;this.lastSession=s;
    this.mapChunks?.request(this.scale>.32?[this.cx-W/(2*sc)-30,this.cz-H/(2*sc)-30,this.cx+W/(2*sc)+30,this.cz+H/(2*sc)+30]:null);
    const X=(x:number)=>W/2+(x-this.cx)*sc,Y=(z:number)=>H/2+(z-this.cz)*sc;
    const on=(x:number,z:number,pad=60)=>X(x)>-pad&&X(x)<W+pad&&Y(z)>-pad&&Y(z)<H+pad;
    const path=(pts:[number,number][])=>{g.beginPath();pts.forEach(([x,z],i)=>i?g.lineTo(X(x),Y(z)):g.moveTo(X(x),Y(z)));};
    g.setTransform(1,0,0,1,0,0);g.fillStyle='#eaece4';g.fillRect(0,0,W,H);g.lineCap='round';g.lineJoin='round';
    if(this.core.boundary.polygon.length>2){path(this.core.boundary.polygon);g.closePath();g.fillStyle='#f7f5ef';g.fill();}
    const landscape=this.landscapeParts.filter(f=>X(f.bounds[2])>0&&X(f.bounds[0])<W&&Y(f.bounds[3])>0&&Y(f.bounds[1])<H);
    for(const f of landscape){
      path(f.part.footprint);g.closePath();for(const hole of f.part.holes){hole.forEach(([x,z],i)=>i?g.lineTo(X(x),Y(z)):g.moveTo(X(x),Y(z)));g.closePath();}
      g.fillStyle=f.kind==='water'?'#b5d8e8':/park|grass|garden|pitch|playground|recreation|forest|meadow/.test(f.className)?'#d1e3c1':/school|college|university|hospital/.test(f.className)?'#e9e3d1':/industrial|railway|construction/.test(f.className)?'#e4dfd6':'#efede5';g.fill('evenodd');
    }
    if(this.scale>.32)for(const chunk of this.mapData.values())for(const b of chunk.buildings){if(!on(...b.centroid,100))continue;path(b.footprint);g.closePath();for(const hole of b.holes??[]){hole.forEach(([x,z],i)=>i?g.lineTo(X(x),Y(z)):g.moveTo(X(x),Y(z)));g.closePath();}g.fillStyle=b.surveyStyle?'#c7c2b4':'#e3dfd5';g.fill('evenodd');g.strokeStyle='#d4d0c6';g.lineWidth=.7*dpr;g.stroke();}
    const traffic=this.layer==='traffic'?directionalTrafficSnapshot(s):new Map<string,RoadTraffic>();
    const visible=this.core.roads.filter(r=>{const b=this.roadBounds.get(r.id)!;return X(b[2])>-50&&X(b[0])<W+50&&Y(b[3])>-50&&Y(b[1])<H+50;});
    const roadWidth=(r:RoadEdge)=>Math.max(1.1*dpr,Math.min(r.widthM*sc,18*dpr));
    for(const r of visible){path(r.points);g.strokeStyle=r.bridge?'#c5bba8':'#d1cec5';g.lineWidth=roadWidth(r)+2*dpr;g.stroke();}
    for(const r of visible){
      const major=/^(trunk|primary|secondary|motorway)/.test(r.highway),review=this.survey?.segment(r.id);let color=major?'#fffdf7':'#ffffff';
      if(this.layer==='research')color=review?.left.status==='verified'&&review?.right.status==='verified'?'#178578':review?.left.status==='partial'||review?.right.status==='partial'?'#dca03a':'#b7bdc0';
      path(r.points);g.strokeStyle=color;g.lineWidth=roadWidth(r);g.stroke();
    }
    // Separate carriageway readings: a stopped northbound queue never paints southbound clear traffic red.
    if(this.layer==='traffic')for(const r of visible)for(const forward of [true,false]){
      const t=traffic.get(`${r.id}:${forward?'f':'b'}`);if(!t)continue;
      g.strokeStyle=t.speedRatio<.28?'#df5345':t.speedRatio<.65?'#f0ab32':'#4ca879';
      g.lineWidth=r.oneway?roadWidth(r):Math.max(dpr,roadWidth(r)*.42);
      const offset=r.oneway?0:(forward?-1:1)*roadWidth(r)*.23;
      for(let i=1;i<r.points.length;i++){
        const a=r.points[i-1],b=r.points[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz)||1,ox=-dz/length*offset,oz=dx/length*offset;
        g.beginPath();g.moveTo(X(a[0])+ox,Y(a[1])+oz);g.lineTo(X(b[0])+ox,Y(b[1])+oz);g.stroke();
      }
    }
    // A red metro alignment must not masquerade as a citywide queue reading.
    for(const l of this.lines){g.strokeStyle=this.layer==='traffic'?'#858b91':l.color;g.lineWidth=(this.layer==='traffic'?1.2:2.4)*dpr;g.globalAlpha=.65;g.setLineDash(this.layer==='traffic'?[4*dpr,4*dpr]:[]);for(const pts of l.pts){path(pts);g.stroke();}g.globalAlpha=1;}g.setLineDash([]);
    const labels=new Set<string>(),occupied:{x0:number;y0:number;x1:number;y1:number}[]=[];
    const label=(text:string,x:number,y:number,size=11,color='#4c5657',force=false)=>{g.font=`600 ${size*dpr}px system-ui,sans-serif`;const box={x0:x-4*dpr,y0:y-(size/2+3)*dpr,x1:x+g.measureText(text).width+4*dpr,y1:y+(size/2+3)*dpr};if(!force&&occupied.some(b=>box.x0<b.x1&&box.x1>b.x0&&box.y0<b.y1&&box.y1>b.y0))return;occupied.push(box);g.textBaseline='middle';g.lineWidth=3*dpr;g.strokeStyle='#f7f5ef';g.strokeText(text,x,y);g.fillStyle=color;g.fillText(text,x,y);};
    if(this.scale>.1)for(const f of landscape)if(f.name&&f.part.areaM2*sc*sc>4500&&on(...f.part.centroid))label(f.name,X(f.part.centroid[0]),Y(f.part.centroid[1]),11,f.kind==='water'?'#4c8297':'#648050');
    if(this.scale>.3)for(const r of visible.slice().sort((a,b)=>b.lengthM-a.lengthM)){if(!r.name||labels.has(r.name))continue;const p=r.points[Math.floor(r.points.length/2)];if(!on(...p,-20))continue;label(r.name,X(p[0])+6*dpr,Y(p[1])-10*dpr);labels.add(r.name);}
    for(const st of this.core.stations)if(on(st.x,st.z,40)){const x=X(st.x),y=Y(st.z);g.fillStyle='#386c9d';g.strokeStyle='#fff';g.lineWidth=2*dpr;g.beginPath();g.roundRect(x-6*dpr,y-6*dpr,12*dpr,12*dpr,3*dpr);g.fill();g.stroke();if(this.scale>.04)label(st.name,x+10*dpr,y-8*dpr,12,'#3a6283');}
    if(this.scale>.6)for(const j of this.core.junctions.filter(j=>j.signalled)){const n=this.core.nodes.find(n=>n.id===j.nodeId);if(!n||!on(n.x,n.z))continue;g.fillStyle='#323f46';g.fillRect(X(n.x)-3*dpr,Y(n.z)-5*dpr,6*dpr,10*dpr);g.fillStyle='#e76c52';g.beginPath();g.arc(X(n.x),Y(n.z)-2*dpr,1.5*dpr,0,Math.PI*2);g.fill();}
    if(s&&s.route.length){g.strokeStyle='#2467cf';g.lineWidth=5*dpr;g.beginPath();let first=true;for(const id of s.route.slice(s.routeIdx)){const e=this.world.nav.edges.get(id);if(!e)continue;const r=this.world.roads.roads.get(e.roadId)!;for(const [x,z]of e.forward?r.points:[...r.points].reverse()){if(first){g.moveTo(X(x),Y(z));first=false;}else g.lineTo(X(x),Y(z));}}g.stroke();}
    if(this.scale>.65){let count=0;for(const sf of this.storefronts.filter(sf=>!this.hasListingIndex||sf.placeId.startsWith('survey:')).sort((a,b)=>Number(b.placeId.startsWith('survey:'))-Number(a.placeId.startsWith('survey:')))){if(count>100)break;const listed=sf.placement?.display==='listing_only',p=!listed&&sf.facade?[(sf.facade[0][0]+sf.facade[1][0])/2,(sf.facade[0][1]+sf.facade[1][1])/2]:[sf.x,sf.z];if(!on(p[0],p[1],-20))continue;g.fillStyle=sf.status==='verified'?'#178578':listed?'#7c8992':'#b36b46';g.beginPath();g.arc(X(p[0]),Y(p[1]),3*dpr,0,Math.PI*2);g.fill();label(sf.name,X(p[0])+6*dpr,Y(p[1])+8*dpr,10,listed?'#687780':'#4c5657');count++;}
      for(const [i,p] of this.visibleListings(W/(2*sc),H/(2*sc)).sort((a,b)=>Number(this.focusedPlaceIds.has(b.id))-Number(this.focusedPlaceIds.has(a.id))).slice(0,700).entries()){const selected=this.focusedPlaceIds.has(p.id);if(selected){g.fillStyle='#2467cf22';g.beginPath();g.arc(X(p.x),Y(p.z),10*dpr,0,Math.PI*2);g.fill();}g.fillStyle=selected?'#2467cf':'#7c8992';g.beginPath();g.arc(X(p.x),Y(p.z),(selected?4:2)*dpr,0,Math.PI*2);g.fill();if(i<90||selected)label(p.name,X(p.x)+6*dpr,Y(p.z)+8*dpr,selected?12:10,selected?'#245b9b':'#687780',selected);}
    }
    const admitted = this.pilotZone ? new Set(this.pilotZone.definition.entrances.map(e => e.deliveryId)) : null;
    for(const d of this.core.deliveries){if(admitted && !admitted.has(d.id))continue;const active=s?.currentStop?.id===d.id;if(!active&&this.scale<.55)continue;if(!on(...d.entrance))continue;g.fillStyle=active?'#e27a32':'#a78b6a';g.beginPath();g.arc(X(d.entrance[0]),Y(d.entrance[1]),(active?7:2)*dpr,0,Math.PI*2);g.fill();if(active)label(d.label,X(d.entrance[0])+10*dpr,Y(d.entrance[1]),12,'#9f4c16',true);}
    if(this.pilotZone){path(this.pilotZone.definition.polygon);g.closePath();g.strokeStyle='#275f35';g.lineWidth=3*dpr;g.setLineDash([8*dpr,4*dpr]);g.stroke();g.setLineDash([]);label('Verified play boundary',22*dpr,22*dpr,12,'#275f35',true);}
    if(s){const p=s.player;g.save();g.translate(X(p.x),Y(p.z));g.rotate(-p.heading);g.fillStyle='#1769d8';g.strokeStyle='#fff';g.lineWidth=2*dpr;g.beginPath();g.moveTo(0,-10*dpr);g.lineTo(7*dpr,8*dpr);g.lineTo(0,4*dpr);g.lineTo(-7*dpr,8*dpr);g.closePath();g.fill();g.stroke();g.restore();}
    const px=100*sc;if(px>25*dpr&&px<250*dpr){g.strokeStyle='#5a6261';g.lineWidth=2*dpr;g.beginPath();g.moveTo(22*dpr,H-28*dpr);g.lineTo(22*dpr+px,H-28*dpr);g.stroke();label('100 m',22*dpr,H-42*dpr,10);}
    if(this.mapChunks?.loading||this.mapChunks?.failed)label(this.mapChunks.loading?'Loading buildings and places…':'Some places could not load. Move the map to retry.',22*dpr,H-12*dpr,10);
  }
}
