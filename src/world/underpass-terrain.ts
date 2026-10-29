import * as THREE from 'three';
import type { RoadEdge, XZ } from './types';
import type { Wall, Surface, BuiltBuffers } from './city';

interface Cut { id: string; a: XZ; b: XZ; ya: number; yb: number; hw: number; ring: XZ[]; members?: Set<Cut> }
const EPS = 1e-7;
const cross = (a:XZ,b:XZ,p:XZ) => (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
const area = (p:XZ[]) => p.reduce((v,a,i)=>{const b=p[(i+1)%p.length];return v+a[0]*b[1]-b[0]*a[1];},0)/2;
function half(poly:XZ[],a:XZ,b:XZ,sign:number,inside:boolean):XZ[] {
  const out:XZ[]=[];
  for(let i=0;i<poly.length;i++) {
    const p=poly[i],q=poly[(i+1)%poly.length],u=cross(a,b,p)*sign,v=cross(a,b,q)*sign;
    const pin=inside?u>=-EPS:u<=EPS,qin=inside?v>=-EPS:v<=EPS;
    if(pin)out.push(p);
    if(pin!==qin) {const t=u/(u-v);out.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);}
  }
  return out;
}
// Convex subtraction produces disjoint convex pieces. Repeating it subtracts
// the union of overlapping carriageway/ramp cuts without invalid polygon holes.
function subtract(poly:XZ[],cut:XZ[]):XZ[][] {
  const out:XZ[][]=[],sign=Math.sign(area(cut));let rest=poly;
  for(let i=0;i<cut.length&&rest.length>=3;i++) {
    const a=cut[i],b=cut[(i+1)%cut.length],outside=half(rest,a,b,sign,false);
    if(outside.length>=3&&Math.abs(area(outside))>EPS)out.push(outside);
    rest=half(rest,a,b,sign,true);
  }
  return out;
}
function cutsFor(roads:readonly RoadEdge[]):Cut[] {
  const cuts:Cut[]=[],seen=new Set<string>();
  for(const e of roads) for(let i=1;i<e.pts.length;i++) {
    const a=e.pts[i-1],b=e.pts[i],ya=e.elev?.[i-1]||0,yb=e.elev?.[i]||0;
    if(Math.min(ya,yb)>=-.015)continue;
    const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);if(len<.01)continue;
    const hw=e.w/2+3.6,key=`${e.id}|${a}|${b}`;if(seen.has(key))continue;seen.add(key);
    const previous=cuts.at(-1);
    // Densified grade samples on one straight ramp do not need separate cuts.
    if(previous&&previous.id===e.id&&Math.hypot(previous.b[0]-a[0],previous.b[1]-a[1])<.001) {
      const px=previous.b[0]-previous.a[0],pz=previous.b[1]-previous.a[1],pl=Math.hypot(px,pz);
      if((px*dx+pz*dz)/(pl*len)>.999999&&Math.abs((previous.yb-previous.ya)/pl-(yb-ya)/len)<1e-5) {previous.b=b;previous.yb=yb;continue;}
    }
    cuts.push({id:e.id,a,b,ya,yb,hw,ring:[]});
  }
  for(const c of cuts) {
    const dx=c.b[0]-c.a[0],dz=c.b[1]-c.a[1],len=Math.hypot(dx,dz),nx=-dz/len*c.hw,nz=dx/len*c.hw;
    c.ring=[[c.a[0]+nx,c.a[1]+nz],[c.b[0]+nx,c.b[1]+nz],[c.b[0]-nx,c.b[1]-nz],[c.a[0]-nx,c.a[1]-nz]];
  }
  return cuts;
}
// Height easing needs fine wall samples, but the hole above a straight ramp
// does not. Collapse those samples in plan before polygon subtraction and
// boundary-union searches, retaining the exact source bend vertices.
function planCuts(cuts:Cut[]) {
  const out:Cut[]=[];
  for(const c of cuts) {
    const p=out.at(-1),dx=c.b[0]-c.a[0],dz=c.b[1]-c.a[1],len=Math.hypot(dx,dz);
    if(p&&p.id===c.id&&p.hw===c.hw&&Math.hypot(p.b[0]-c.a[0],p.b[1]-c.a[1])<.001) {
      const px=p.b[0]-p.a[0],pz=p.b[1]-p.a[1],pl=Math.hypot(px,pz);
      if((px*dx+pz*dz)/(pl*len)>.999999){p.b=c.b;p.members!.add(c);continue;}
    }
    out.push({...c,members:new Set([c])});
  }
  for(const c of out){const dx=c.b[0]-c.a[0],dz=c.b[1]-c.a[1],len=Math.hypot(dx,dz),nx=-dz/len*c.hw,nz=dx/len*c.hw;c.ring=[[c.a[0]+nx,c.a[1]+nz],[c.b[0]+nx,c.b[1]+nz],[c.b[0]-nx,c.b[1]-nz],[c.a[0]-nx,c.a[1]-nz]];}
  return out;
}
function geometry(polygons:XZ[][],i:number,j:number) {
  const pos:number[]=[],uv:number[]=[];
  for(const poly of polygons) for(let k=1;k<poly.length-1;k++) {
    const tri=area(poly)<0?[poly[0],poly[k],poly[k+1]]:[poly[0],poly[k+1],poly[k]];
    for(const p of tri){pos.push(p[0],0,p[1]);uv.push((p[0]-i*1000)/1000,1-(p[1]-j*1000)/1000);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();g.computeBoundingSphere();return g;
}
function boundaryIntervals(a:XZ,b:XZ,others:Cut[]) {
  let ranges:[number,number][]=[[0,1]];
  for(const c of others) {
    let lo=0,hi=1;const sign=Math.sign(area(c.ring));
    for(let i=0;i<c.ring.length;i++) {
      const p=c.ring[i],q=c.ring[(i+1)%c.ring.length],u=cross(p,q,a)*sign,v=(cross(p,q,b)-cross(p,q,a))*sign;
      if(Math.abs(v)<EPS){if(u<-.001){lo=1;hi=0;break;}continue;}
      const t=-u/v;if(v>0)lo=Math.max(lo,t);else hi=Math.min(hi,t);
    }
    if(lo>=hi-.0001)continue;
    ranges=ranges.flatMap(([a,b])=>[[a,Math.min(b,lo)],[Math.max(a,hi),b]].filter(([a,b])=>b-a>1e-5) as [number,number][]);
  }
  return ranges;
}
function tileRange(a:XZ,b:XZ,x:number,z:number,pad=0):[number,number]|null {
  let lo=0,hi=1;
  for(const [u,d,min,max] of [[a[0],b[0]-a[0],x-pad,x+1000+pad],[a[1],b[1]-a[1],z-pad,z+1000+pad]]) {
    if(Math.abs(d)<EPS){if(u<min||u>max)return null;continue;}
    const p=(min-u)/d,q=(max-u)/d;lo=Math.max(lo,Math.min(p,q));hi=Math.min(hi,Math.max(p,q));
  }
  return lo<hi?[lo,hi]:null;
}
// Area fills must have the same holes as base earth; otherwise a park polygon
// would become a floating lid over the drivable trough. Input triangles are
// convex, so the same subtraction routine is valid in the tile worker.
export function underpassAreaClipper(roads:readonly RoadEdge[]) {
  const cuts=planCuts(cutsFor(roads));
  return (triangle:XZ[]):XZ[][]=>{
    let pieces=[triangle];const xs=triangle.map(p=>p[0]),zs=triangle.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
    for(const c of cuts){if(c.ring.every(p=>p[0]<minX)||c.ring.every(p=>p[0]>maxX)||c.ring.every(p=>p[1]<minZ)||c.ring.every(p=>p[1]>maxZ))continue;pieces=pieces.flatMap(p=>subtract(p,c.ring));}
    return pieces;
  };
}
export class UnderpassTerrainIndex {
  private cells=new Map<string,Cut[]>();
  constructor(roads:readonly RoadEdge[]) {
    for(const c of cutsFor(roads)) {
      const xs=c.ring.map(p=>p[0]),zs=c.ring.map(p=>p[1]);
      for(let i=Math.floor(Math.min(...xs)/1000);i<=Math.floor(Math.max(...xs)/1000);i++)for(let j=Math.floor(Math.min(...zs)/1000);j<=Math.floor(Math.max(...zs)/1000);j++) {
        const key=`${i}_${j}`,list=this.cells.get(key)||[];list.push(c);this.cells.set(key,list);
      }
    }
  }
  build(i:number,j:number) {
    const cuts=this.cells.get(`${i}_${j}`);if(!cuts?.length)return null;
    const masks=planCuts(cuts);
    const x=i*1000,z=j*1000;let polygons:XZ[][]=[[[x,z],[x,z+1000],[x+1000,z+1000],[x+1000,z]]];
    for(const c of masks)polygons=polygons.flatMap(p=>subtract(p,c.ring));
    const walls:Wall[]=[],surfaces:Surface[]=[],positions:number[]=[],colors:number[]=[],uv:number[]=[];
    for(const c of cuts)for(const side of [-1,1]) {
      const dx=c.b[0]-c.a[0],dz=c.b[1]-c.a[1],len=Math.hypot(dx,dz),off=(c.hw-1.8)*side,nx=-dz/len*off,nz=dx/len*off;
      const a:XZ=[c.a[0]+nx,c.a[1]+nz],b:XZ=[c.b[0]+nx,c.b[1]+nz],range=tileRange(a,b,x,z,1.8);if(!range)continue;
      const [lo,hi]=range;
      surfaces.push({e:null,i:0,ax:a[0]+(b[0]-a[0])*lo,az:a[1]+(b[1]-a[1])*lo,bx:a[0]+(b[0]-a[0])*hi,bz:a[1]+(b[1]-a[1])*hi,ya:c.ya+(c.yb-c.ya)*lo+.12,yb:c.ya+(c.yb-c.ya)*hi+.12,hw:1.8,kind:'pad'});
    }
    for(const c of cuts)for(const side of [1,-1]) {
      const a=c.ring[side===1?0:3],b=c.ring[side===1?1:2];
      const local=tileRange(a,b,x,z);if(!local)continue;
      for(const [u,v] of boundaryIntervals(a,b,masks.filter(other=>!other.members!.has(c)))) {
        const lo=Math.max(u,local[0]),hi=Math.min(v,local[1]);if(lo>=hi)continue;
        const P=(t:number):XZ=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],p=P(lo),q=P(hi),mx=(p[0]+q[0])/2,mz=(p[1]+q[1])/2;
        const ya=c.ya+(c.yb-c.ya)*lo-.06,yb=c.ya+(c.yb-c.ya)*hi-.06;
        const vertices=[[p[0],ya,p[1]],[q[0],yb,q[1]],[q[0],.12,q[1]],[p[0],ya,p[1]],[q[0],.12,q[1]],[p[0],.12,p[1]]];
        for(const v of vertices){positions.push(...v);colors.push(.59,.61,.66);uv.push(v[0]/4,v[1]/4);}
        // Two-sided geometry works on both the approach and interior views.
        for(const v of [...vertices].reverse()){positions.push(...v);colors.push(.59,.61,.66);uv.push(v[0]/4,v[1]/4);}
        walls.push({ax:p[0],az:p[1],bx:q[0],bz:q[1],y0a:ya,y0b:yb,y1a:.12,y1b:.12,kind:'parapet'});
      }
    }
    const wallGeo=new THREE.BufferGeometry();wallGeo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));wallGeo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));wallGeo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));wallGeo.computeVertexNormals();wallGeo.computeBoundingSphere();
    return {ground:geometry(polygons,i,j),wall:wallGeo,walls,surfaces,cuts:cuts.length};
  }
}

// Called by the background tile builder. Only typed arrays and the ordinary
// surface/wall records cross to World; scene installation never cuts terrain.
export function buildUnderpassTile(roads:readonly RoadEdge[],i:number,j:number) {
  const t=new UnderpassTerrainIndex(roads).build(i,j);if(!t)return null;
  const pack=(g:THREE.BufferGeometry,mat:string):BuiltBuffers=>({mat,
    pos:g.getAttribute('position').array as Float32Array,nor:g.getAttribute('normal').array as Float32Array,
    uv:g.getAttribute('uv').array as Float32Array,col:(g.getAttribute('color')?.array as Float32Array)||new Float32Array(g.getAttribute('position').count*3).fill(1)});
  // `wall` is the building facade atlas. Retaining walls use the plain street
  // structure material so their UVs cannot turn a trench into windowed houses.
  const buffers=[pack(t.ground,'ground'),pack(t.wall,'st')];t.ground.dispose();t.wall.dispose();
  return {buffers,walls:t.walls,surfaces:t.surfaces};
}
