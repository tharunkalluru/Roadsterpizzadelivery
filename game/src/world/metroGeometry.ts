/** Pure shared physical metro geometry. No rendering dependency: visual decks, train paths and collision use these same centreline samples. */
import type { WorldCore } from './schema';
export interface MetroSample { x:number; z:number; y:number; tx:number; tz:number; s:number; m:number }
export interface MetroAlignment { samples:MetroSample[]; lineId:string; color:string }
const polyLength=(samples:MetroSample[])=>samples.at(-1)?.s??0;

function makeMetroSamples(points: ArrayLike<ArrayLike<number>>, elev?: ArrayLike<number> | number): MetroSample[] {
  const pts: { x: number; z: number; y: number }[] = [];
  for (let i = 0; i < points.length; i++) {
    const x = points[i][0], z = points[i][1];
    const y = typeof elev === 'number' ? elev : elev ? elev[i] ?? 0 : 0;
    const last = pts[pts.length - 1];
    if (last && Math.hypot(last.x - x, last.z - z) < 1e-3) {
      last.y = Math.max(last.y, y);
      continue;
    }
    pts.push({ x, z, y });
  }
  const n = pts.length;
  const out: MetroSample[] = [];
  if (n < 2) return out;
  const segT: [number, number][] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x, dz = pts[i + 1].z - pts[i].z;
    const l = Math.hypot(dx, dz) || 1;
    segT.push([dx / l, dz / l]);
  }
  let s = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    let tx: number, tz: number, m = 1;
    if (i === 0) { [tx, tz] = segT[0]; }
    else if (i === n - 1) { [tx, tz] = segT[n - 2]; }
    else {
      const a = segT[i - 1], b = segT[i];
      tx = a[0] + b[0]; tz = a[1] + b[1];
      const l = Math.hypot(tx, tz);
      if (l < 1e-4) { tx = b[0]; tz = b[1]; }
      else { tx /= l; tz /= l; }
      const d = tx * a[0] + tz * a[1];
      m = 1 / Math.max(0.45, d);
    }
    out.push({ x: pts[i].x, z: pts[i].z, y: pts[i].y, tx, tz, s, m });
  }
  return out;
}


export function metroAlignments(core: WorldCore, H=core.metro.deckHeightM): MetroAlignment[] {
  const aligns: MetroAlignment[] = [];
  for (const line of core.metroLines) {
    // OSM carries the two directional rails as parallel reversed polylines. Each is
    // NOT a separate two-track viaduct: derive one physical deck centre between them.
    const merged: [number,number][][]=[];
    for(const poly of line.local) {
      if(poly.length<2)continue;
      const length=polyLength(makeMetroSamples(poly,H));
      const pair=merged.findIndex(other=>{
        const endpoints=Math.min(Math.hypot(poly[0][0]-other[0][0],poly[0][1]-other[0][1])+Math.hypot(poly.at(-1)![0]-other.at(-1)![0],poly.at(-1)![1]-other.at(-1)![1]),Math.hypot(poly[0][0]-other.at(-1)![0],poly[0][1]-other.at(-1)![1])+Math.hypot(poly.at(-1)![0]-other[0][0],poly.at(-1)![1]-other[0][1]));
        return endpoints<100 && Math.abs(length-polyLength(makeMetroSamples(other,H)))<Math.max(100,length*.025);
      });
      if(pair<0){merged.push(poly.map(p=>[p[0],p[1]]));continue;}
      merged[pair]=merged[pair].map(p=>{
        let best=Infinity,qx=p[0],qz=p[1];
        for(let i=1;i<poly.length;i++){
          const a=poly[i-1],b=poly[i],dx=b[0]-a[0],dz=b[1]-a[1],l2=dx*dx+dz*dz||1;
          const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/l2));
          const x=a[0]+dx*t,z=a[1]+dz*t,d=Math.hypot(x-p[0],z-p[1]);
          if(d<best){best=d;qx=x;qz=z;}
        }
        return best<16?[(p[0]+qx)/2,(p[1]+qz)/2]:p;
      });
    }
    for(const poly of merged) {
      const samples=makeMetroSamples(poly,H);
      if(samples.length>=2)aligns.push({samples,lineId:line.id,color:line.color});
    }
  }
  return aligns;
}
