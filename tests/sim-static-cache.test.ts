import test from 'node:test';
import assert from 'node:assert/strict';
import { staticSolidAt } from '../src/game/spatial-safety';
import { supportAt } from '../src/game/physics';
import { staticNeighborhood, staticQueryStats } from '../src/game/static-neighborhood';
import { pointInRing } from '../src/world/city';
import { roadQuadHeight } from '../src/world/road-surface';
import { rng } from '../src/core/util';

// Frozen exhaustive baseline algorithms, restricted to this fixture's static
// roads/roofs (no moving rail or landmarks). No optimized bounds/cache calls.
function buildings(city:any,x:number,z:number){const out=new Set<any>();for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)for(const b of city.buildingGrid.get(`${Math.floor(x/50)+i},${Math.floor(z/50)+j}`)||[])out.add(b);return [...out];}
function referenceSupport(city:any,x:number,z:number,fromY:number,roadsOnly=false){
  let best:any={y:0,s:null,onRoad:false,kind:'ground',elevatedRoad:false},found=false,bestScore=Math.abs(fromY);
  for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)for(const s of city.surfaceGrid.get(`${Math.floor(x/30)+i},${Math.floor(z/30)+j}`)||[]){
    if(roadsOnly&&s.kind!=='road')continue;
    const dx=s.bx-s.ax,dz=s.bz-s.az,l2=dx*dx+dz*dz||1,raw=((x-s.ax)*dx+(z-s.az)*dz)/l2,t=Math.max(0,Math.min(1,raw));
    const d=Math.hypot(x-s.ax-dx*t,z-s.az-dz*t),exact=s.kind==='road'&&s.roadQuad?roadQuadHeight(s.roadQuad,x,z):undefined;
    if(exact===null||exact===undefined&&d>s.hw)continue;
    const y=exact??s.ya+(s.yb-s.ya)*t;if(y>fromY+1.6)continue;
    const core=exact!==undefined||s.kind!=='road'||((!s.e||d<=s.e.w/2+.15)&&raw>=-1e-6&&raw<=1.000001),score=Math.abs(y-fromY)+(core?0:3);
    if(!found||score<bestScore-.01||Math.abs(score-bestScore)<=.01&&y>best.y){found=true;bestScore=score;best={y,s,onRoad:s.kind==='road',kind:s.kind,elevatedRoad:s.kind==='road'&&y>1.2};}
  }
  if(!roadsOnly)for(const b of buildings(city,x,z)){if(b.h>fromY+1.6||b.h<best.y-.01)continue;if(pointInRing(x,z,b.ring))best={y:b.h+.02,s:null,onRoad:false,kind:'roof',elevatedRoad:false};}
  return best;
}
function segment(x:number,z:number,ax:number,az:number,bx:number,bz:number){const dx=bx-ax,dz=bz-az,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz||1)));return {d:Math.hypot(x-ax-dx*t,z-az-dz*t),t};}
function referenceSolid(city:any,p:any,r=.35,h=r){
  if(p.y-h<referenceSupport(city,p.x,p.z,p.y,true).y+.02)return true;
  for(const b of buildings(city,p.x,p.z)){if(b.h<p.y-h)continue;if(pointInRing(p.x,p.z,b.ring))return true;for(let i=0,j=b.ring.length-1;i<b.ring.length;j=i++)if(segment(p.x,p.z,...b.ring[j] as [number,number],...b.ring[i] as [number,number]).d<r)return true;}
  for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)for(const o of city.obstacles.get(`${Math.floor(p.x/50)+i},${Math.floor(p.z/50)+j}`)||[])if(p.y+h>=0&&p.y-h<=o.top&&Math.hypot(p.x-o.x,p.z-o.z)<o.r+r)return true;
  const seen=new Set();
  for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++){
    const key=`${Math.floor(p.x/30)+i},${Math.floor(p.z/30)+j}`;
    for(const w of city.walls.get(key)||[]){if(seen.has(w)||w.kind==='kerb')continue;seen.add(w);const {d,t}=segment(p.x,p.z,w.ax,w.az,w.bx,w.bz);if(d<r&&p.y+h>=w.y0a+(w.y0b-w.y0a)*t&&p.y-h<=w.y1a+(w.y1b-w.y1a)*t)return true;}
    for(const s of city.surfaceGrid.get(key)||[]){if(s.kind==='road')continue;const {d,t}=segment(p.x,p.z,s.ax,s.az,s.bx,s.bz),y=s.ya+(s.yb-s.ya)*t;if(d<s.hw+r&&p.y-h<y+.05&&p.y+h>y-.3)return true;}
  }
  return false;
}
function fixture(){
  const c:any={revision:0,surfaceGrid:new Map(),buildingGrid:new Map(),walls:new Map(),obstacles:new Map(),landmarkSurfaceGrid:new Map(),movingRail:[]},r=rng(471);
  const add=(map:Map<string,any[]>,obj:any,x0:number,z0:number,x1:number,z1:number,size:number)=>{for(let x=Math.floor(x0/size);x<=Math.floor(x1/size);x++)for(let z=Math.floor(z0/size);z<=Math.floor(z1/size);z++){const key=`${x},${z}`,a=map.get(key)||[];a.push(obj);map.set(key,a);}};
  for(let i=0;i<60;i++){const x=r.range(-100,100),z=r.range(-100,100),w=r.range(3,18),d=r.range(3,18),b={id:`b${i}`,h:r.range(3,28),cls:'house',ring:[[x,z],[x+w,z],[x+w,z+d/2],[x+w/2,z+d/2],[x+w/2,z+d],[x,z+d]]};add(c.buildingGrid,b,x,z,x+w,z+d,50);}
  const roads=[{kind:'road',ax:-100,az:0,bx:100,bz:0,ya:0,yb:0,hw:8,e:{w:16}},{kind:'road',ax:0,az:-50,bx:80,bz:-50,ya:0,yb:8,hw:4,e:{w:24},roadQuad:[[0,0,-65],[80,8,-65],[80,8,-35],[0,0,-35]]},{kind:'deck',ax:-70,az:-70,bx:50,bz:60,ya:8,yb:14,hw:5}];
  for(const s of roads)add(c.surfaceGrid,s,-120,-120,120,120,30);
  for(let i=0;i<30;i++){const x=r.range(-100,100),z=r.range(-100,100),w={kind:i%4?'wall':'kerb',ax:x,az:z,bx:x+r.range(-20,20),bz:z+r.range(-20,20),y0a:r.range(0,8),y0b:r.range(0,8),y1a:14,y1b:18};add(c.walls,w,Math.min(w.ax,w.bx),Math.min(w.az,w.bz),Math.max(w.ax,w.bx),Math.max(w.az,w.bz),30);}
  for(let i=0;i<20;i++){const o={x:r.range(-100,100),z:r.range(-100,100),r:r.range(.3,2),top:r.range(1,15)};add(c.obstacles,o,o.x-o.r,o.z-o.r,o.x+o.r,o.z+o.r,50);}
  return c;
}
test('cached camera solids and road/roof supports equal exhaustive baseline at randomized points',()=>{
  const c=fixture(),r=rng(8381),before=staticQueryStats.boundsRejects;
  for(let i=0;i<16000;i++){
    const p={x:r.range(-120,120),z:r.range(-120,120),y:r.range(-1,32)},radius=r.range(.05,1.8),halfHeight=r.range(.05,1);
    assert.equal(staticSolidAt(c,p,radius,halfHeight),referenceSolid(c,p,radius,halfHeight),`solid query ${i}`);
    assert.deepEqual(supportAt(c,p.x,p.z,p.y,true),referenceSupport(c,p.x,p.z,p.y,true));
    assert.deepEqual(supportAt(c,p.x,p.z,p.y,false),referenceSupport(c,p.x,p.z,p.y,false));
  }
  assert.ok(staticQueryStats.boundsRejects>before+10000);
});
test('neighborhood lists reuse within revision and invalidate after publication',()=>{
  const c=fixture(),a=staticNeighborhood(c,2,2),builds=staticQueryStats.neighborhoodBuilds;
  assert.equal(staticNeighborhood(c,2.1,2.1),a);assert.equal(staticQueryStats.neighborhoodBuilds,builds);
  c.buildingGrid.clear();c.walls.clear();c.obstacles.clear();c.surfaceGrid.clear();c.revision++;
  const b=staticNeighborhood(c,2,2);assert.notEqual(a,b);assert.equal(b.buildings.length,0);assert.equal(staticSolidAt(c,{x:2,y:2,z:2}),false);
});
test('exact road quad beyond nominal halfwidth and building roof corners are not rejected',()=>{
  const c=fixture();
  for(const x of [-.00001,0,1,40,79,80,80.00001])for(const z of [-65.00001,-65,-64,-50,-36,-35,-34.99999])for(const y of [0,4,8,16])assert.deepEqual(supportAt(c,x,z,y,true),referenceSupport(c,x,z,y,true));
  for(const list of c.buildingGrid.values())for(const b of list)for(const [x,z] of b.ring)for(const off of [-.35,0,.35])assert.equal(staticSolidAt(c,{x:x+off,y:b.h-.1,z:z+off},.35,.2),referenceSolid(c,{x:x+off,y:b.h-.1,z:z+off},.35,.2));
});
