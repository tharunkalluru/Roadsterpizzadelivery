import { readFileSync, writeFileSync } from 'node:fs';
import { roadRibbon } from '../../../../src/world/bridge-clearance';
import type { RoadEdge } from '../../../../src/world/types';
const old = JSON.parse(readFileSync('/tmp/reported-flyover-model-old.json', 'utf8')), current = JSON.parse(readFileSync('/tmp/reported-road-final-independent-model.json', 'utf8')), audit = JSON.parse(readFileSync('docs/qa/evidence/main-expansion/reported-road-final-independent-finite.json', 'utf8'));
function sample(model: typeof old, id: string, x: number, z: number) {
  const e = model.roads.find((r: RoadEdge) => r.id === id) as RoadEdge, ribbon = roadRibbon(e, model.roads), values: any[] = [];
  for (const [i, q] of ribbon.quads.entries()) for (const k of [[0, 1, 2], [0, 2, 3]]) {
    const [a,b,c] = k.map(k => q[k]), bx=b[0]-a[0], bz=b[2]-a[2], cx=c[0]-a[0], cz=c[2]-a[2], det=bx*cz-bz*cx; if(Math.abs(det)<1e-9)continue;
    const px=x-a[0], pz=z-a[2], u=(px*cz-pz*cx)/det, v=(bx*pz-bz*px)/det;
    if(u>=-1e-6&&v>=-1e-6&&u+v<=1.000001)values.push({height:a[1]+u*(b[1]-a[1])+v*(c[1]-a[1]),segment:i,controls:[{point:e.pts[i],height:e.elev?.[i]??0},{point:e.pts[i+1],height:e.elev?.[i+1]??0}],width:e.w,joinedPavement:e.joinedPavement});
  }
  return values;
}
const rows = audit.regressionPairs.filter((r:any)=>r.category==='reduced-positive-headroom').map((r:any)=>{
  const candidates = audit.newFiniteFailures.filter((p:any)=>p.pair.join('/')===r.pair.join('/')), p = candidates.sort((a:any,b:any)=>a.newGap-b.newGap)[0]??r.examples[0], [x,z]=p.point;
  return {pair:r.pair,point:p.point,oldGap:p.oldGap,newGap:p.newGap,upper:{old:sample(old,r.pair[0],x,z),current:sample(current,r.pair[0],x,z)},lower:{old:sample(old,r.pair[1],x,z),current:sample(current,r.pair[1],x,z)}};
});
writeFileSync('docs/qa/evidence/main-expansion/reported-road-final-independent-regression-controls.json',JSON.stringify(rows,null,2));console.log(rows.length+' pair diagnostics exported.');
