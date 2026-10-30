import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FullMap } from '../../src/ui/map';

class Canvas extends EventTarget {
  clientWidth=800;clientHeight=400;captures=new Set<number>();
  setPointerCapture(id:number){this.captures.add(id);}
  hasPointerCapture(id:number){return this.captures.has(id);}
  releasePointerCapture(id:number){this.captures.delete(id);}
  getBoundingClientRect(){return {left:20,top:40,width:this.clientWidth,height:this.clientHeight};}
}
const pointer=(type:string,id:number,x:number,y:number)=>Object.assign(new Event(type),{pointerId:id,clientX:x,clientY:y});
function fixture(allowed=true){
  const nodes=new Map<string,any>(),moves:number[][]=[],state={canMove:allowed,player:{x:500,z:-600,yaw:0},route:null,target:null,pickups:[]};
  const root:any={dataset:{},hidden:false,setAttribute(){},querySelector(id:string){if(!nodes.has(id))nodes.set(id,{hidden:true,disabled:false,textContent:'',focus(){}});return nodes.get(id);}};
  const cv=new Canvas(),map:any=Object.assign(Object.create(FullMap.prototype),{root,cv,cx:1000,cz:-2000,scale:.5,open:true,dirty:false,pick:null,selectedPlace:null,selectedLocation:null,
    markers:[],pointers:new Map(),pinch0:0,scale0:0,gesture:null,state:()=>state,areaName:()=> 'Selected district',onMove:(x:number,z:number)=>moves.push([x,z]),
    focus:{show(){},hide(){}},mapStats:{},layers:{},mapData:{},outlineBuildings:[],src:{buildings:()=>[]},build:()=>Promise.resolve(),setPhase(){},onClose(){}});
  map.installMapGestures();
  const send=(type:string,id:number,x:number,y:number)=>cv.dispatchEvent(pointer(type,id,x,y));
  const tap=(x=620,y=140)=>{send('pointerdown',1,x,y);send('pointerup',1,x,y);send('lostpointercapture',1,x,y);};
  return{map,root,cv,nodes,state,moves,send,tap};
}

test('tap then Deliver from here commits the tapped world point, not the map centre or player location',()=>{
  const{map,root,moves,tap}=fixture();tap();
  assert.deepEqual(map.selectedLocation,{x:1400,z:-2200,label:'Selected district'});
  assert.equal(root.querySelector('#map-selection').hidden,false);assert.equal(root.querySelector('#map-move').hidden,true);
  assert.equal(root.dataset.selection,'1');assert.deepEqual(moves,[],'a tap is only a preview');
  map.commitSelection();assert.deepEqual(moves,[[1400,-2200]]);assert.equal(map.selectedLocation,null);
  map.commitSelection();assert.equal(moves.length,1,'the same selection cannot submit twice');
});
test('panning never chooses or commits a point, and the next fresh tap uses the panned map',()=>{
  const{map,moves,send,tap}=fixture();tap();
  send('pointerdown',2,300,200);send('pointermove',2,400,200);send('pointerup',2,400,200);
  assert.equal(map.cx,800);assert.equal(map.selectedLocation,null);assert.equal(map.pick,null);assert.deepEqual(moves,[]);
  tap();assert.deepEqual(map.selectedLocation,{x:1200,z:-2200,label:'Selected district'});map.commitSelection();assert.deepEqual(moves,[[1200,-2200]]);
});
test('small touch jitter is a tap; crossing the drag threshold includes the original movement',()=>{
  const{map,send}=fixture();send('pointerdown',1,620,140);send('pointermove',1,625,142);send('pointerup',1,625,142);
  assert.equal(map.cx,1000);assert.equal(map.cz,-2000);assert.equal(map.selectedLocation.x,1410);
  map.clearSelection();send('pointerdown',2,300,200);send('pointermove',2,307,200);send('pointermove',2,320,200);send('pointerup',2,320,200);
  assert.equal(map.cx,960,'threshold crossing retains the first seven pixels of the swipe');assert.equal(map.selectedLocation,null);
});
test('pinching, cancellation and lost capture cannot leave a stale tap or commit a selection',()=>{
  const{map,moves,send,tap}=fixture();tap();
  send('pointerdown',1,300,200);send('pointerdown',2,500,200);assert.equal(map.selectedLocation,null);
  send('pointermove',1,250,200);send('pointerup',1,250,200);send('pointerup',2,500,200);
  assert.equal(map.selectedLocation,null);assert.ok(map.scale>.5);assert.deepEqual(moves,[]);
  tap();send('pointerdown',3,400,200);send('pointercancel',3,400,200);assert.equal(map.selectedLocation,null);
  send('pointerdown',4,400,200);send('lostpointercapture',4,400,200);send('pointerup',4,400,200);assert.equal(map.selectedLocation,null);
});
test('default Deliver from here opens the fixed pin flow; drag and tap reposition before explicit confirmation',()=>{
  const{map,root,moves,send,tap}=fixture();map.moveFromHere();
  assert.ok(map.pick);assert.equal(root.dataset.pick,'1');assert.equal(root.querySelector('#map-pickbar').hidden,false);
  assert.equal(root.querySelector('#map-move').hidden,true);assert.deepEqual(moves,[]);
  send('pointerdown',1,300,200);send('pointermove',1,400,200);send('pointerup',1,400,200);
  assert.equal(map.cx,800);tap(620,140);assert.equal(map.cx,1200);assert.equal(map.cz,-2200);
  assert.equal(map.selectedLocation,null,'picker taps move the fixed pin instead of opening a second card');assert.deepEqual(moves,[]);
  map.confirmPick();assert.deepEqual(moves,[[1200,-2200]]);assert.equal(map.pick,null);assert.equal(root.dataset.pick,undefined);
});
test('both relocation submissions recheck current permission and cannot bypass an active order',()=>{
  const{map,state,moves,tap,root}=fixture();tap();state.canMove=false;map.syncMoveControls();map.commitSelection();
  assert.deepEqual(moves,[]);assert.equal(root.querySelector('#map-selection').hidden,true);assert.equal(root.querySelector('#map-selection-go').disabled,true);
  state.canMove=true;map.moveFromHere();state.canMove=false;map.syncMoveControls();map.confirmPick();assert.deepEqual(moves,[]);
  assert.equal(root.querySelector('#map-pick-ok').disabled,true);assert.ok(map.pick,'a blocked submission keeps its selected pin');
  state.canMove=true;map.confirmPick();assert.deepEqual(moves,[[1000,-2000]]);
  const blocked=fixture(false);blocked.map.moveFromHere();blocked.tap();assert.equal(blocked.map.pick,null);assert.equal(blocked.map.selectedLocation,null);
});
test('place icon taps select the actual place coordinates; geographic icons remain without Explore places UI',()=>{
  const{map,moves,tap}=fixture();const place={id:'landmark',name:'Station',x:1555,z:-2222};map.markers=[{x:600,y:100,place,members:[place]}];map.markerView=map.viewKey()+'|';
  tap();assert.deepEqual(map.selectedLocation,{x:1555,z:-2222,label:'Station'});assert.equal(map.selectedPlace,place);map.commitSelection();assert.deepEqual(moves,[[1555,-2222]]);
  const source=readFileSync('src/ui/map.ts','utf8');assert.doesNotMatch(source,/Explore \$\{|map-places|place-results|place-tools|renderPlaceResults|PLACE_CATEGORIES/);
  assert.match(source,/placeCatalogue\(zone.origin\)/);assert.match(source,/layoutPlaceMarkers/);assert.match(source,/id="map-move" hidden>Deliver from here<\/button>/);
});
test('cancel, zoom, close and reopen clear a pending selection without moving the car',()=>{
  const{map,moves,tap,root}=fixture();tap();map.zoomAt(1.5);assert.equal(map.selectedLocation,null);assert.deepEqual(moves,[]);
  map.moveFromHere();map.cancelPick();assert.equal(map.pick,null);assert.equal(root.querySelector('#map-move').hidden,false);
  tap();map.hide();assert.equal(map.open,false);assert.equal(map.selectedLocation,null);assert.equal(map.pointers.size,0);
  map.show();assert.equal(map.open,true);assert.equal(map.selectedLocation,null);assert.equal(map.cx,500);assert.equal(map.cz,-600);assert.deepEqual(moves,[]);
});
test('external initial/retry picker keeps its callback even before a first playable area exists',()=>{
  const{map,state}=fixture(false);let picked:number[]|null=null;
  map.beginPick({onPick:(x:number,z:number)=>picked=[x,z],onCancel(){}});map.confirmPick();assert.deepEqual(picked,[1000,-2000]);assert.equal(state.canMove,false);
});

test('a rapid tap after panning cannot snap to a landmark marker cached for the old view',()=>{
  const{map,tap,send}=fixture();const place={id:'old-view',name:'Wrong old place',x:9999,z:9999};
  map.markers=[{x:600,y:100,place,members:[place]}];map.markerView=map.viewKey()+'|';
  send('pointerdown',2,300,200);send('pointermove',2,400,200);send('pointerup',2,400,200);tap();
  assert.deepEqual(map.selectedLocation,{x:1200,z:-2200,label:'Selected district'});assert.equal(map.selectedPlace,null);
});
