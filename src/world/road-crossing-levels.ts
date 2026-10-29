import type { RoadEdge, XZ } from './types';
import { roadRibbon } from './bridge-clearance';
import { roadQuadHeight, type RoadQuad } from './road-surface';
import mapped from './bridge-level-data.json';

// Relative levels are source facts. Metres per level, headroom and the grade
// below are explicit gameplay estimates; they are not surveyed elevations.
const CLEARANCE = 5.85, GRADE = .065;
type Links = [number, number][][];
interface Span { r: number; i: number; quad: RoadQuad; length: number; dx: number; dz: number }
interface Crossing { priority: number; upper: [number, number]; lower: [number, number]; roads: [string, string]; x: number; z: number; sourceGap: number }
export interface CrossingLevelReport {
  mappedRoads: number; mappedPoints: number; finiteOverlaps: number; joinedPavements: number;
  separatedCrossings: number; ambiguousJoins: number; relaxationRounds: number; minimumModelSeparation: number;
  raisedRoads: number; ambiguityReasons: Record<string,number>; ambiguities: { roads: [string,string]; x:number; z:number; sourceGap:number; reason:string }[]; estimated: string; crossings: { roads: [string, string]; x: number; z: number; sourceGap: number }[];
}
const cross = (a: XZ, b: XZ, p: XZ) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
function overlap(a: XZ[], b: XZ[]) {
  const sign = Math.sign(cross(b[0], b[1], b[2])); if (!sign) return [];
  for (let i = 0; i < 3 && a.length; i++) {
    const out: XZ[] = [], p = b[i], q = b[(i + 1) % 3];
    for (let j = 0; j < a.length; j++) {
      const u = a[j], v = a[(j + 1) % a.length], du = sign * cross(p, q, u), dv = sign * cross(p, q, v);
      if (du >= -1e-8) out.push(u);
      if ((du >= 0) !== (dv >= 0)) { const t = du / (du - dv); out.push([u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t]); }
    }
    a = out;
  }
  return a;
}
class Heap {
  a: [number, number][] = [];
  push(v: [number, number]) { const a = this.a; let i = a.length; a.push(v); while (i) { const p = (i - 1) >> 1; if (a[p][0] <= v[0]) break; a[i] = a[p]; i = p; } a[i] = v; }
  pop() { const a = this.a, out = a[0], v = a.pop()!; if (a.length) { let i = 0; while (i * 2 + 1 < a.length) { let c = i * 2 + 1; if (c + 1 < a.length && a[c + 1][0] < a[c][0]) c++; if (a[c][0] >= v[0]) break; a[i] = a[c]; i = c; } a[i] = v; } return out; }
}
function closeInGraph(links: Links, a: number[], b: number[], limit = CLEARANCE / GRADE + 3) {
  const goals = new Set(b), best = new Map<number, number>(), heap = new Heap();
  for (const k of a) { best.set(k, 0); heap.push([0, k]); }
  while (heap.a.length) {
    const [d, k] = heap.pop(); if (d !== best.get(k)) continue; if (goals.has(k)) return true;
    for (const [n, length] of links[k]) { const next = d + length; if (next <= limit && next < (best.get(n) ?? Infinity)) { best.set(n, next); heap.push([next, n]); } }
  }
  return false;
}

export function mappedRoadLevels(roads: RoadEdge[]) {
  const byId = new Map(mapped.roads.map(r => [r.id, r])); let points = 0;
  const changed = new Set<string>();
  const result = roads.map(e => {
    const match = byId.get(e.id); if (!match) return e;
    const elev = e.pts.map((_, i) => e.elev?.[i] || 0);
    for (const [i, x, z, floor] of match.points) {
      const p = e.pts[i]; if (!p || Math.hypot(p[0] - x, p[1] - z) > .15) continue;
      elev[i] = Math.max(elev[i], floor); points++;
    }
    if (elev.every((h, i) => Math.abs(h - (e.elev?.[i] || 0)) < .0001)) return e;
    changed.add(e.id); return { ...e, elev };
  });
  return { roads: result, changed, points };
}
export function repairRoadCrossingLevels(roads: RoadEdge[], offsets: number[], links: Links, heights: number[], fixed: readonly boolean[] = []) {
  const baseline = heights.slice(), report: CrossingLevelReport = {
    mappedRoads: 0, mappedPoints: 0, finiteOverlaps: 0, joinedPavements: 0, separatedCrossings: 0, ambiguousJoins: 0, relaxationRounds: 0,
    minimumModelSeparation: Infinity, raisedRoads: 0, ambiguityReasons: {}, ambiguities: [], estimated: 'Finite rendered road envelopes; same-level/near-connected and parallel-corridor pavement joins are preserved. Independent upper/lower crossings use estimated5.85m surface separation and6.5% control grades. Infeasible constraints remain explicit ambiguity, never an unlimited lifting loop. XY, source records and graph IDs are retained.', crossings: [] };
  const ambiguity = (roads: [string,string], x:number,z:number,sourceGap:number,reason:string) => {
    report.ambiguousJoins++; report.ambiguityReasons[reason]=(report.ambiguityReasons[reason]||0)+1;
    if(report.ambiguities.length<256) report.ambiguities.push({roads,x,z,sourceGap,reason});
  };
  const sourceLevel = new Map(mapped.roads.map(r=>[r.id,new Map(r.points.map(p=>[p[0],p[3]]))]));
  const levelAt=(r:number,i:number)=>{const m=sourceLevel.get(roads[r].id),a=m?.get(i),b=m?.get(i+1);return a!==undefined&&b!==undefined&&a===b?a:undefined;};
  const source = heights.slice(), grid = new Map<string, Span[]>(), spans: Span[] = [];
  for (let r = 0; r < roads.length; r++) {
    const e = roads[r]; if (/^(footway|path|steps|pedestrian|cycleway|bridleway)$/.test(e.cls)) continue;
    const quads = roadRibbon({ ...e, elev: e.pts.map((_, i) => source[offsets[r] + i]) }, roads).quads;
    for (let i = 0; i < quads.length; i++) {
      const a = e.pts[i], b = e.pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz); if (length < .01) continue;
      const s = { r, i, quad: quads[i], dx: dx / length, dz: dz / length, length }; spans.push(s);
      for (let x = Math.floor(Math.min(...s.quad.map(p => p[0])) / 60); x <= Math.floor(Math.max(...s.quad.map(p => p[0])) / 60); x++)
        for (let z = Math.floor(Math.min(...s.quad.map(p => p[2])) / 60); z <= Math.floor(Math.max(...s.quad.map(p => p[2])) / 60); z++) {
          const key = `${x},${z}`; (grid.get(key) || grid.set(key, []).get(key)!).push(s);
        }
    }
  }
  const crossings: Crossing[] = [], tested = new Set<string>();
  for (const a of spans) {
    if (Math.max(...a.quad.map(p => p[1])) < 1.2) continue;
    const near = new Set<Span>();
    for (let x = Math.floor(Math.min(...a.quad.map(p => p[0])) / 60); x <= Math.floor(Math.max(...a.quad.map(p => p[0])) / 60); x++)
      for (let z = Math.floor(Math.min(...a.quad.map(p => p[2])) / 60); z <= Math.floor(Math.max(...a.quad.map(p => p[2])) / 60); z++) for (const b of grid.get(`${x},${z}`) || []) near.add(b);
    for (const b of near) {
      if (a.r === b.r && Math.abs(a.i - b.i) <= 1) continue;
      const ka = `${a.r}:${a.i}`, kb = `${b.r}:${b.i}`, key = ka < kb ? `${ka}/${kb}` : `${kb}/${ka}`; if (tested.has(key)) continue; tested.add(key);
      const points: XZ[] = [];
      for (const ai of [[0, 1, 2], [0, 2, 3]]) for (const bi of [[0, 1, 2], [0, 2, 3]]) {
        const p = overlap(ai.map(i => [a.quad[i][0], a.quad[i][2]]), bi.map(i => [b.quad[i][0], b.quad[i][2]]));
        const area = Math.abs(p.reduce((v, q, i) => { const next = p[(i + 1) % p.length]; return v + q[0] * next[1] - q[1] * next[0]; }, 0)) / 2;
        if (area > .025) points.push(...p);
      }
      if (!points.length) continue;
      const x = points.reduce((v, p) => v + p[0], 0) / points.length, z = points.reduce((v, p) => v + p[1], 0) / points.length;
      const ya = roadQuadHeight(a.quad, x, z), yb = roadQuadHeight(b.quad, x, z); if (ya === null || yb === null) continue;
      const gap = ya - yb, abs = Math.abs(gap),la=levelAt(a.r,a.i),lb=levelAt(b.r,b.i); if (abs > CLEARANCE + 1) continue;
      const A: [number, number] = [offsets[a.r] + a.i, offsets[a.r] + a.i + 1], B: [number, number] = [offsets[b.r] + b.i, offsets[b.r] + b.i + 1];
      report.finiteOverlaps++;
      const ra=roads[a.r],rb=roads[b.r], sourcePair:[string,string]=[ra.id,rb.id];
      const shared=[ra.from,ra.to].find(n=>n&&(n===rb.from||n===rb.to));
      const endA=shared===ra.from?0:ra.pts.length-1,endB=shared===rb.from?0:rb.pts.length-1;
      const p=ra.pts[endA],q=rb.pts[endB];
      const localJoin=shared&&Math.abs(source[offsets[a.r]+endA]-source[offsets[b.r]+endB])<.35&&Math.hypot(p[0]-x,p[1]-z)<Math.max(ra.w,rb.w)*1.5+7&&Math.hypot(q[0]-x,q[1]-z)<Math.max(ra.w,rb.w)*1.5+7;
      if(localJoin && abs<4.5){report.joinedPavements++;continue;}
      if(la!==undefined&&lb!==undefined&&la===lb){ambiguity(sourcePair,x,z,abs,'mapped-same-level-crossing-topology-unverified');continue;}
      if(abs<1.6&&!(la!==undefined&&lb!==undefined&&la!==lb)){ambiguity(sourcePair,x,z,abs,'independent-coplanar-or-near-level');continue;}
      const sameCorridor=ra.name&&ra.name===rb.name&&Math.abs(a.dx*b.dx+a.dz*b.dz)>.94;
      if(sameCorridor&&abs<4.5&&!(la!==undefined&&lb!==undefined&&la!==lb)){ambiguity(sourcePair,x,z,abs,'parallel-corridor-order-unverified');continue;}
      if(closeInGraph(links,A,B)){ambiguity(sourcePair,x,z,abs,'connected-profile-clearance-infeasible');continue;}
      const above = la!==undefined&&lb!==undefined&&la!==lb?la>lb:gap>0;
      const upper = above ? A : B, lower = above ? B : A;
      crossings.push({ priority: la!==undefined&&lb!==undefined&&la!==lb?2:0, upper, lower, roads: above ? [roads[a.r].id, roads[b.r].id] : [roads[b.r].id, roads[a.r].id], x, z, sourceGap: abs });
    }
  }
  // Verified relative source layers are solved together first. A mapped layer
  // number is NOT an absolute altitude: a tier2 bridge may itself need to rise
  // above a lower exit ramp. Treating the initial6.8m-per-tier seed as a ceiling
  // would keep exactly the photographed middle deck trapped between two roads.
  const strong=crossings.filter(c=>c.priority===2), strongHeap=new Heap();
  const strongLift=(k:number,y:number)=>{if(fixed[k])return false;if(y>heights[k]+1e-8){heights[k]=y;strongHeap.push([-y,k]);return true;}return false;};
  const strongSpread=()=>{while(strongHeap.a.length){const[negative,k]=strongHeap.pop(),y=-negative;if(y<heights[k]-1e-7)continue;for(const[n,length]of links[k])strongLift(n,y-GRADE*length);}};
  let strongRounds=0;
  for(;strongRounds<24;strongRounds++){let changed=false;for(const c of strong){const target=Math.max(...c.lower.map(k=>heights[k]))+CLEARANCE;for(const k of c.upper)changed=strongLift(k,target)||changed;}if(!changed)break;strongSpread();}
  const protectedControls=fixed.slice();
  for(const c of strong)for(const k of [...c.upper,...c.lower])protectedControls[k]=true;
  for(let k=0;k<heights.length;k++)baseline[k]=heights[k];
  // Freeze the existing lower-road controls. Their Lipschitz ceilings expose
  // contradictory geometry before any lift, rather than recursively raising a
  // whole interchange (or the city) to satisfy a cycle of mistaken crossings.
  const ceilings = (list: Crossing[]) => {
    const max = heights.map(() => Infinity), q = new Heap();
    for(let k=0;k<fixed.length;k++)if(protectedControls[k]){max[k]=baseline[k];q.push([max[k],k]);}
    for (const c of list) for (const k of c.lower) if (baseline[k] < max[k]) { max[k] = baseline[k]; q.push([max[k], k]); }
    while (q.a.length) { const [y, k] = q.pop(); if (y > max[k] + 1e-8) continue; for (const [n, length] of links[k]) { const next = y + GRADE * length; if (next < max[n] - 1e-8) { max[n] = next; q.push([next, n]); } } }
    return max;
  };
  const independent:Crossing[]=strong.slice(), pending=crossings.filter(c=>c.priority!==2).sort((a,b)=>b.priority-a.priority||b.sourceGap-a.sourceGap);
  const required=heights.slice(), acceptedCeil=ceilings([]);
  for(const c of pending){
    const target=Math.max(...c.lower.map(k=>baseline[k]))+CLEARANCE, upper=new Set(c.upper);
    const scratch=new Map<number,number>(),q=new Heap();let compatible=c.upper.every(k=>acceptedCeil[k]>=target-1e-7);
    for(const k of c.lower)if(baseline[k]<acceptedCeil[k]){scratch.set(k,baseline[k]);q.push([baseline[k],k]);}
    while(compatible&&q.a.length){const[y,k]=q.pop();if(y>(scratch.get(k)??Infinity)+1e-8)continue;
      if(y<required[k]-1e-7||upper.has(k)&&y<target-1e-7){compatible=false;break;}
      for(const[n,length]of links[k]){const next=y+GRADE*length;if(next<Math.min(acceptedCeil[n],scratch.get(n)??Infinity)-1e-8){scratch.set(n,next);q.push([next,n]);}}
    }
    if(compatible){for(const[k,y]of scratch)acceptedCeil[k]=y;for(const k of c.upper)required[k]=Math.max(required[k],target);independent.push(c);}
    else ambiguity(c.roads,c.x,c.z,c.sourceGap,c.upper.some(k=>fixed[k])?'protected-height-ceiling':'contradictory-lower-road-ceilings');
  }
  const ceiling = acceptedCeil, heap = new Heap();
  for(let k=0;k<heights.length;k++)heights[k]=Math.min(heights[k],ceiling[k]);
  const lift = (k: number, y: number) => { y = Math.min(y, ceiling[k]); if (y > heights[k] + 1e-8) { heights[k] = y; heap.push([-y, k]); } };
  for(let k=0;k<heights.length;k++)if(heights[k]>0)heap.push([-heights[k],k]);
  for (const c of independent) { const target = Math.max(...c.lower.map(k => baseline[k])) + CLEARANCE; for (const k of c.upper) lift(k, target); }
  while (heap.a.length) { const [negative, k] = heap.pop(), y = -negative; if (y < heights[k] - 1e-7) continue; for (const [n, length] of links[k]) lift(n, y - GRADE * length); }
  report.relaxationRounds = strongRounds+(independent.length ? 1 : 0);
  for (const c of independent) report.minimumModelSeparation = Math.min(report.minimumModelSeparation, Math.min(...c.upper.map(k => heights[k])) - Math.max(...c.lower.map(k => heights[k])));
  report.separatedCrossings = independent.length; report.crossings = independent.map(({ roads, x, z, sourceGap }) => ({ roads, x, z, sourceGap }));
  report.raisedRoads = roads.filter((e, r) => e.pts.some((_, i) => heights[offsets[r] + i] > baseline[offsets[r] + i] + .0001)).length;
  return report;
}
