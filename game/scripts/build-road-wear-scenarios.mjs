/** Explicit game scenarios, never a claim of a surveyed Hyderabad road defect. */
import {readFileSync,writeFileSync}from'node:fs';
const core=JSON.parse(readFileSync('public/world/hyd-metro/v2/core.json','utf8'));
const survey=JSON.parse(readFileSync('public/research/street-survey.json','utf8'));
const reviewed=new Set(survey.roads.filter(r=>r.left?.status!=='unreviewed'||r.right?.status!=='unreviewed').map(r=>r.roadId));
const hash=s=>{let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;};
const sourceId='authored-road-wear-scenario-v1';
const candidates=core.roads.filter(r=>!reviewed.has(r.id)&&['residential','living_street'].includes(r.highway)&&r.routable!==false&&!r.bridge&&!r.tunnel&&Math.max(...r.pointElevM,0)<.2&&r.widthM>=4.5&&r.widthM<=9&&r.lengthM>=85).sort((a,b)=>hash(a.id)-hash(b.id));
const features=[];let potholes=0;
for(const r of candidates){
  const at=r.lengthM*(.35+(hash(r.id+'at')%30)/100);let remaining=at,p=null,rx=0,rz=0;
  for(let i=1;i<r.points.length;i++){const a=r.points[i-1],b=r.points[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);if(remaining<=len){p=[a[0]+dx*remaining/len,a[1]+dz*remaining/len];rx=-dz/len;rz=dx/len;break;}remaining-=len;}
  if(!p)continue;const side=hash(r.id+'side')%2?-1:1,lateral=side*r.widthM*.18;p=[p[0]+rx*lateral,p[1]+rz*lateral];
  if(core.nodes.some(n=>n.isJunction&&Math.hypot(n.x-p[0],n.z-p[1])<22))continue;
  if(core.deliveries?.some(d=>d.stopPolygon.some(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<25)))continue;
  if(features.some(f=>Math.hypot(f.x-p[0],f.z-p[1])<220))continue;
  features.push({id:`scenario-shallow-pothole-${r.id}`,kind:'pothole',x:+p[0].toFixed(3),z:+p[1].toFixed(3),roadId:r.id,sourceId,status:'scenario_overlay',geometryStatus:'provisional',placement:'source_position',widthM:1.15,lengthM:1.35,heightM:.045+(hash(r.id+'depth')%20)/1000,tags:{basis:'Explicit deterministic driving scenario; not a mapped or photographed road defect',excluded:'reviewed frontages, main arteries, junctions, bridges, tunnels and delivery stops'}});
  const gutter=r.widthM/2+.42-Math.abs(lateral);
  features.push({id:`scenario-kerb-drain-${r.id}`,kind:'drain',x:+(p[0]+rx*side*gutter).toFixed(3),z:+(p[1]+rz*side*gutter).toFixed(3),roadId:r.id,sourceId,status:'scenario_overlay',geometryStatus:'provisional',placement:'source_position',widthM:.85,lengthM:.55,heightM:.025,tags:{basis:'Explicit representative kerb drain cover; not surveyed or mapped drainage'}});
  if(++potholes===36)break;
}
const data={version:1,note:'36 restrained shallow potholes and36 representative kerb drain covers on unreviewed residential/living streets. These are gameplay scenarios, not real surveyed defects or drainage. Regenerate after road/survey changes.',sources:[{id:sourceId,url:'https://github.com/tharunkalluru/Roadsterpizzadelivery',license:'Original authored game scenario; no real-world accuracy claim'}],features};
writeFileSync('public/research/scenario-public-realm.json',JSON.stringify(data));
console.log(JSON.stringify({eligibleRoads:candidates.length,scenarioPotholes:potholes,scenarioDrainCovers:features.length-potholes}));
