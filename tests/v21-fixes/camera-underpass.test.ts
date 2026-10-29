import test from 'node:test';
import assert from 'node:assert/strict';
import { staticSolidAt, clearCameraPosition } from '../../src/game/spatial-safety';
import { supportAt } from '../../src/game/physics';
import type { Surface } from '../../src/world/city';
function city(surfaces:Surface[]=[]):any {
 const c={surfaceGrid:new Map(),buildingGrid:new Map(),obstacles:new Map(),walls:new Map(),movingRail:[]};
 for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++)c.surfaceGrid.set(`${x},${z}`,surfaces);return c;
}
const floor=(kind:Surface['kind']='road',y=-3):Surface=>({e:null,i:0,ax:-30,az:0,bx:30,bz:0,ya:y,yb:y,hw:20,kind});
function roof(y=0):Surface{return {...floor('road',y),hw:1,paintLift:.04,roadQuad:[[-1,y,-10],[1,y,-10],[1,y,10],[-1,y,10]]};}

test('a clear camera in a depressed road does not treat an overhead road within1.6m as its floor',()=>{
 const c=city([floor(),roof()]),p={x:0,y:-1,z:0};
 assert.equal(supportAt(c,p.x,p.z,p.y,true).y,0,'reproduce the former overhead-floor selection');
 assert.equal(staticSolidAt(c,p),false);assert.equal(staticSolidAt(c,{...p,y:-.2}),true,'the finite street lid still blocks the camera volume');
 const wanted={x:0,y:-1,z:-8};assert.deepEqual(clearCameraPosition(c,p,wanted),wanted,'retain the full available underpass view');
});

test('negative sidewalk pads support the camera while finite road edges and soffits retain real clearance',()=>{
 const c=city([floor('pad',-2),roof()]);assert.equal(staticSolidAt(c,{x:3,y:-1,z:0}),false,'depressed pavement is not phantom earth');
 assert.equal(staticSolidAt(c,{x:3,y:-1.8,z:0}),true,'actual pavement still blocks a penetrating camera');
 assert.equal(staticSolidAt(c,{x:1.2,y:-.2,z:0}),true,'camera radius reaches the finite road edge');
 assert.equal(staticSolidAt(c,{x:1.5,y:-.2,z:0}),false,'the road plane does not extend beyond its finite edge');
 assert.equal(staticSolidAt(c,{x:0,y:-.8,z:0}),false,'open volume below the ground-road face stays clear');
});

test('an embedded below-grade camera exits below its street lid and preserves normal above-ground recovery',()=>{
 const c=city([floor(),roof()]),from={x:0,y:-.1,z:0};assert.equal(staticSolidAt(c,from),true);
 const p=clearCameraPosition(c,from,{x:0,y:2,z:8});assert.ok(p.y<0);assert.equal(staticSolidAt(c,p),false);
 const normal=city(),wanted={x:0,y:3,z:8};assert.deepEqual(clearCameraPosition(normal,{x:0,y:2,z:0},wanted),wanted);
 const below=clearCameraPosition(normal,{x:0,y:-40,z:0},{x:0,y:-39,z:8});assert.ok(below.y>.35,'ordinary buried-ground recovery remains unchanged');
});
