import test from 'node:test';
import assert from 'node:assert/strict';
import { roadQuadHeight } from '../src/world/road-surface';
import { supportAt } from '../src/game/physics';
import { segmentHitsVehicle } from '../src/game/spatial-safety';
import { movingRailSupport } from '../src/game/moving-rail';
import { Presentation } from '../src/game/presentation';
import { Object3D } from 'three';
test('sloping roads have continuous heights and finite ends, not invisible steps',()=>{
 const q:any=[[0,0,-4],[100,10,-4],[100,10,4],[0,0,4]];
 for(let x=0;x<=100;x+=.5) assert.ok(Math.abs(roadQuadHeight(q,x,0)!-x/10)<1e-8);
 assert.equal(roadQuadHeight(q,101,0),null);assert.equal(roadQuadHeight(q,50,5),null);
});
test('ground car stays beneath overhead deck while elevated car stays on its deck',()=>{
 const surface=(y:number)=>({ax:0,az:0,bx:100,bz:0,ya:y,yb:y,hw:5,kind:'road'});
 const city:any={surfaceGrid:new Map([['0,0',[surface(0),surface(12)]]]),buildingGrid:new Map(),movingRail:[],landmarkSurfaceGrid:new Map()};
 assert.equal(supportAt(city,5,0,0,true).y,0);assert.equal(supportAt(city,5,0,12,true).y,12);
});
test('camera obstruction uses full bus length but separates flyover levels',()=>{
 const bus={x:0,y:0,z:0,hx:0,hz:1,size:[3,4,14]};
 assert.equal(segmentHitsVehicle({x:-8,y:2,z:6},{x:8,y:2,z:6},bus),true);
 assert.equal(segmentHitsVehicle({x:-8,y:12,z:6},{x:8,y:12,z:6},bus),false);
});
test('road-neighborhood reuse preserves reference support and invalidates on tile publication',()=>{
 const a:any={ax:-10,az:0,bx:100,bz:0,ya:0,yb:0,hw:5,kind:'road'},b:any={...a,ya:12,yb:12};
 const cells=new Map([['0,0',[a,b]],['-1,0',[a,b]],['1,0',[a,b]]]);
 const base:any={surfaceGrid:cells,buildingGrid:new Map(),movingRail:[],landmarkSurfaceGrid:new Map()};const cached={...base,revision:0};
 for(let x=0;x<25;x+=.4)for(const y of [0,12])assert.deepEqual(supportAt(cached,x,0,y,true),supportAt(base,x,0,y,true));
 cells.set('0,0',[{...a,ya:1,yb:1}]);cells.delete('-1,0');cells.delete('1,0');cached.revision++;
 assert.equal(supportAt(cached,5,0,1,true).y,1);
});
test('rail roofs support above contact without snapping a car from underneath',()=>{
 const b:any={id:'train',x:0,y:10,z:0,hx:0,hz:1,halfWidth:1.5,halfLength:12,bottom:10,roof:14,previous:{x:0,y:10,z:0,hx:0,hz:1}};
 assert.equal(movingRailSupport([b],0,0,14)?.y,14);assert.equal(movingRailSupport([b],0,0,8),null);
});
test('render interpolation restores authoritative transforms and drops retired entities',()=>{
 const p=new Presentation(), car=new Object3D();p.capture([car]);car.position.x=10;p.capture([car]);p.apply(.5);assert.equal(car.position.x,5);p.restore();assert.equal(car.position.x,10);
 p.capture([]);p.apply(0);assert.equal(car.position.x,10);
});
