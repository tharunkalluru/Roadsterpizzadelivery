/** Reviewer-owned finite geometry oracle. Inputs are frozen historical edge
 * coordinates or actual Float32 emitter records, never current old-width rules. */
export type XZ = [number, number];
export type Point = [number, number, number];
export interface TriangleRecord {
  road: string; points: [Point, Point, Point]; arc: [number, number];
  centre: [XZ, XZ]; tile?: string; cap?: boolean;
  sourceReference?:{id:string;arc:[number,number]};
}
export interface ApronFragment {
  roads: [string, string]; polygon: XZ[]; node: string;
  proof: { sourcePath: string[]; evidence: string; sourceCoreSHA256: string };
}
const cross = (a:XZ,b:XZ,p:XZ)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
export function triangleHeight(t:TriangleRecord,x:number,z:number) {
  const [a,b,c]=t.points,bx=b[0]-a[0],bz=b[2]-a[2],cx=c[0]-a[0],cz=c[2]-a[2],det=bx*cz-bz*cx;
  if(Math.abs(det)<1e-10)return null;
  const px=x-a[0],pz=z-a[2],u=(px*cz-pz*cx)/det,v=(bx*pz-bz*px)/det;
  return u>=-1e-6&&v>=-1e-6&&u+v<=1.000001?a[1]+u*(b[1]-a[1])+v*(c[1]-a[1]):null;
}
export function overlap(a:TriangleRecord,b:TriangleRecord):XZ[] {
  let subject=a.points.map(p=>[p[0],p[2]] as XZ);
  const boundary=b.points.map(p=>[p[0],p[2]] as XZ),orientation=Math.sign(cross(boundary[0],boundary[1],boundary[2]));
  if(!orientation)return[];
  for(let edge=0;edge<3&&subject.length;edge++){
    const p=boundary[edge],q=boundary[(edge+1)%3],out:XZ[]=[];
    let previous=subject.at(-1)!,prior=orientation*cross(p,q,previous);
    for(const current of subject){
      const value=orientation*cross(p,q,current);
      if((prior>=0)!==(value>=0)){const u=prior/(prior-value);out.push([previous[0]+(current[0]-previous[0])*u,previous[1]+(current[1]-previous[1])*u]);}
      if(value>=-1e-8)out.push(current);previous=current;prior=value;
    }
    subject=out;
  }
  return subject;
}
export const polygonArea=(p:XZ[])=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-a[1]*b[0];},0))/2;
export function contains(polygon:XZ[],point:XZ) {
  if(polygon.length<3)return false;let sign=0;
  for(let i=0;i<polygon.length;i++){const d=cross(polygon[i],polygon[(i+1)%polygon.length],point);if(Math.abs(d)<1e-5)continue;if(sign&&Math.sign(d)!==sign)return false;sign=Math.sign(d);}
  return true;
}
export function sourceArc(t:TriangleRecord,p:XZ) {
  const[a,b]=t.centre,dx=b[0]-a[0],dz=b[1]-a[1],u=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz||1)));
  return t.arc[0]+(t.arc[1]-t.arc[0])*u;
}
function familySourceArc(t:TriangleRecord,p:XZ){return t.sourceReference?sourceArc({...t,arc:t.sourceReference.arc},p):sourceArc(t,p);}
export class FiniteIndex {
  readonly roads=new Map<string,TriangleRecord[]>();readonly grid=new Map<string,TriangleRecord[]>();
  constructor(readonly records:TriangleRecord[]){
    for(const t of records){
      if(t.points.length!==3||t.points.flat().some(v=>!Number.isFinite(v))||t.arc.some(v=>!Number.isFinite(v))||
        t.sourceReference&&(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(t.sourceReference.id)||t.sourceReference.arc.length!==2||t.sourceReference.arc.some(v=>!Number.isFinite(v))))throw Error('Invalid finite triangle record');
      (this.roads.get(t.road)??this.roads.set(t.road,[]).get(t.road)!).push(t);
      for(const key of this.cells(t))(this.grid.get(key)??this.grid.set(key,[]).get(key)!).push(t);
    }
  }
  *cells(t:TriangleRecord){
    const xs=t.points.map(p=>p[0]),zs=t.points.map(p=>p[2]);
    for(let x=Math.floor(Math.min(...xs)/40);x<=Math.floor(Math.max(...xs)/40);x++)for(let z=Math.floor(Math.min(...zs)/40);z<=Math.floor(Math.max(...zs)/40);z++)yield`${x},${z}`;
  }
  near(t:TriangleRecord){return [...new Set([...this.cells(t)].flatMap(key=>this.grid.get(key)??[]))];}
  at(road:string,p:XZ,branch?:TriangleRecord){
    const arc=branch?familySourceArc(branch,p):null;
    return(this.grid.get(`${Math.floor(p[0]/40)},${Math.floor(p[1]/40)}`)??[]).filter(t=>{
      const same=branch?.sourceReference?t.sourceReference?.id===branch.sourceReference.id:t.road===road;
      return same&&(arc===null||Math.abs(familySourceArc(t,p)-arc)<=5);
    }).flatMap(t=>{const y=triangleHeight(t,...p);return y===null?[]:[{y,triangle:t}];});
  }
}
export interface FiniteAuditOptions { minimumSeparation?:number; historicalMinimum?:number; regressionAllowance?:number; coplanarity?:number }
export function auditFinite(baseline:FiniteIndex,candidate:FiniteIndex,changed:Set<string>,fragments:ApronFragment[]=[],options:FiniteAuditOptions={}) {
  const separation=options.minimumSeparation??5.85,oldMinimum=options.historicalMinimum??.01,allowance=options.regressionAllowance??.001,coplanarity=options.coplanarity??.01;
  const failures:any[]=[],coverageChanges:any[]=[],newCoverage:any[]=[],justifiedAprons:any[]=[];
  let oldPolygons=0,newPolygons=0,oldSamples=0,newSamples=0;
  const pairKey=(a:string,b:string)=>[a,b].sort().join('/');
  const fragmentsByPair=new Map<string,ApronFragment[]>();
  for(const f of fragments){
    if(!f.proof?.sourcePath?.length||!f.proof.evidence||!/^[a-f0-9]{64}$/.test(f.proof.sourceCoreSHA256)||f.polygon.length<3||!f.node)throw Error('An apron fragment requires source-node/path evidence');
    const key=pairKey(...f.roads);(fragmentsByPair.get(key)??fragmentsByPair.set(key,[]).get(key)!).push(f);
  }
  const eligible=(a:string,b:string,p:XZ,gap:number)=>Math.abs(gap)<=coplanarity&&(fragmentsByPair.get(pairKey(a,b))??[]).find(f=>contains(f.polygon,p));
  const visit=(index:FiniteIndex,oldSide:boolean)=>{
    const seen=new Set<string>(),identity=new Map(index.records.map((t,i)=>[t,i]));
    for(const a of index.records){
      if(!changed.has(a.road))continue;
      for(const b of index.near(a)){
        if(a.road===b.road||!changed.has(a.road)&&!changed.has(b.road))continue;
        const ia=identity.get(a)!,ib=identity.get(b)!,key=ia<ib?`${ia}/${ib}`:`${ib}/${ia}`;if(seen.has(key))continue;seen.add(key);
        const polygon=overlap(a,b);if(polygon.length<3||polygonArea(polygon)<.025)continue;
        if(oldSide)oldPolygons++;else newPolygons++;
        const centroid:XZ=[polygon.reduce((s,p)=>s+p[0],0)/polygon.length,polygon.reduce((s,p)=>s+p[1],0)/polygon.length];
        for(const[pIndex,p]of[...polygon,centroid].entries()){
          const ay=triangleHeight(a,...p),by=triangleHeight(b,...p);if(ay===null||by===null)continue;
          if(oldSide){
            if(Math.abs(ay-by)<oldMinimum-1e-5)continue;oldSamples++;
            const upper=ay>=by?a:b,lower=ay>=by?b:a,oldGap=Math.abs(ay-by),A=candidate.at(upper.road,p,upper),B=candidate.at(lower.road,p,lower);
            if(!A.length||!B.length){coverageChanges.push({roads:[upper.road,lower.road],point:p,centroid:pIndex===polygon.length,oldGap,upperAvailable:!!A.length,lowerAvailable:!!B.length});continue;}
            const newGap=Math.min(...A.map(v=>v.y))-Math.max(...B.map(v=>v.y));
            if(newGap>=Math.min(separation,oldGap)-allowance)continue;
            const apron=eligible(upper.road,lower.road,p,newGap);
            if(apron)justifiedAprons.push({roads:[upper.road,lower.road],point:p,oldGap,newGap,node:apron.node,evidence:apron.proof.evidence});
            else failures.push({pass:'old',roads:[upper.road,lower.road],point:p,oldGap,newGap});
          }else{
            newSamples++;
            const A=baseline.at(a.road,p,a),B=baseline.at(b.road,p,b);
            if(!A.length||!B.length){newCoverage.push({roads:[a.road,b.road],point:p,newGap:Math.abs(ay-by),cap:!!a.cap||!!b.cap});continue;}
            // Preserve the old local branch ordering rather than subtracting
            // unrelated high/low segments of a road that loops through here.
            const oldA=A.reduce((best,v)=>Math.abs(v.y-ay)<Math.abs(best.y-ay)?v:best),oldB=B.reduce((best,v)=>Math.abs(v.y-by)<Math.abs(best.y-by)?v:best);
            const oldGap=Math.abs(oldA.y-oldB.y);if(oldGap<oldMinimum-1e-5)continue;
            const newGap=(oldA.y>=oldB.y?1:-1)*(ay-by);if(newGap>=Math.min(separation,oldGap)-allowance)continue;
            const apron=eligible(a.road,b.road,p,newGap);
            if(apron)justifiedAprons.push({roads:[a.road,b.road],point:p,oldGap,newGap,node:apron.node,evidence:apron.proof.evidence});
            else failures.push({pass:'new',roads:[a.road,b.road],point:p,oldGap,newGap,cap:!!a.cap||!!b.cap});
          }
        }
      }
    }
  };
  visit(baseline,true);visit(candidate,false);
  return{thresholds:{minimumSeparation:separation,historicalMinimum:oldMinimum,regressionAllowance:allowance,coplanarity},oldPolygons,newPolygons,oldSamples,newSamples,failures,coverageChanges,newCoverage,justifiedAprons,
    missingCoverageIsNotApproval:true,newCoverageNeedsClassification:true};
}
