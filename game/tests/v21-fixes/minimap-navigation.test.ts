import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { strokeMinimapRoute, drawMinimapPlayer, MINIMAP_NAVIGATION } from '../../src/ui/minimap-navigation';

function context() {
  const paths: number[][][] = [], strokes: { path: number[][]; color: string; width: number }[] = [];
  let path: number[][] = [];
  const g: any = { lineWidth: 1, strokeStyle: '', fillStyle: '',
    beginPath(){path=[];paths.push(path);},moveTo(x:number,y:number){path.push([x,y]);},lineTo(x:number,y:number){path.push([x,y]);},
    stroke(){strokes.push({path:path.map(p=>[...p]),color:this.strokeStyle,width:this.lineWidth});},
    save(){},restore(){},translate(){},scale(){},closePath(){},fill(){},
  };
  return { g, paths, strokes };
}
test('minimap navigation follows exactly the checked road path, with readable CSS weight at all map sizes and DPRs',()=>{
  const points: [number,number,number][]=[[10,0,20],[11,2,23],[19,3,41]];
  for(const size of [80,112,152,220])for(const backing of [128,256,512]){
    const {g,strokes}=context(),scale=backing/480,pixels=backing/size;
    strokeMinimapRoute(g,points,scale,pixels);
    assert.equal(strokes.length,2);assert.deepEqual(strokes[0].path,[[10,20],[11,23],[19,41]]);assert.deepEqual(strokes[1].path,strokes[0].path);
    assert.ok(Math.abs(strokes[0].width*scale/pixels-6.5)<1e-10);
    assert.ok(Math.abs(strokes[1].width*scale/pixels-3.3)<1e-10);
    assert.equal(strokes[0].color,MINIMAP_NAVIGATION.casing);assert.equal(strokes[1].color,MINIMAP_NAVIGATION.route);
    assert.equal(g.lineCap,'round');assert.equal(g.lineJoin,'round');
  }
  assert.deepEqual(points,[[10,0,20],[11,2,23],[19,3,41]],'drawing cannot alter the checked navigation route');
});
test('empty or invalid minimap route cannot draw an obsolete direction, and player arrow keeps a dark outline',()=>{
  const {g,strokes}=context();strokeMinimapRoute(g,[],.5);strokeMinimapRoute(g,[[0,0,0]],.5);strokeMinimapRoute(g,[[0,0,0],[1,0,1]],0);
  assert.equal(strokes.length,0);drawMinimapPlayer(g,256,2);assert.equal(strokes.length,1);
  assert.equal(strokes[0].color,MINIMAP_NAVIGATION.casing);assert.equal(g.fillStyle,MINIMAP_NAVIGATION.player);
});
test('source attribution is accessible from Pause credits rather than a gameplay footer',()=>{
  const credits=readFileSync('public/credits.html','utf8');
  for(const source of ['OpenStreetMap contributors','Overture Maps','Foursquare','Mapillary','TGSRTC'])assert.ok(credits.includes(source));
  assert.match(credits,/https:\/\/www.openstreetmap.org\/copyright/);
  assert.match(credits,/https:\/\/docs.overturemaps.org\/attribution\//);
  assert.match(readFileSync('src/ui/settings.ts','utf8'),/href="\/credits.html"/);
});
