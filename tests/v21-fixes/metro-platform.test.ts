import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {supportedMetroHandoffParking,METRO_DELIVERY_WALK_DISTANCE} from '../../src/delivery/metro-platform';
import {metroCorridors,metroPlatformAssemblies,metroPath,projectMetroPath,sampleMetroPath,type MetroPlatformAssembly} from '../../src/world/metro-geometry';
import type {CoreData} from '../../src/world/types';

function platform(points:[number,number][]):MetroPlatformAssembly{
  const corridors=metroCorridors([{id:'blue',pts:points}]),path=corridors[0].center,p=sampleMetroPath(path,path.len/2);
  return metroPlatformAssemblies([{id:'fixture',p:[p.x,p.z],lines:['blue']}],corridors,11)[0];
}
function doorAt(a:MetroPlatformAssembly,u:number,side:number,reverse=false){
  const path=a.corridor.center,s=projectMetroPath(path,[a.frame.cx,a.frame.cz]).s,p=sampleMetroPath(path,s+u),outward={x:-p.hz*side,z:p.hx*side};
  return {door:{x:p.x+outward.x*3.45,y:a.deckHeight+1.2,z:p.z+outward.z*3.45,hx:p.hx*(reverse?-1:1),hz:p.hz*(reverse?-1:1)},outward};
}
function assertActualSupport(a:MetroPlatformAssembly,p:NonNullable<ReturnType<typeof supportedMetroHandoffParking>>,side:number){
  const path=a.corridor.center,s=projectMetroPath(path,[a.frame.cx,a.frame.cz]).s,point=(u:number)=>{const q=sampleMetroPath(path,s+u);return{x:q.x-q.hz*side*5.6,z:q.z+q.hx*side*5.6};};
  const pads=[];for(let u=-65;u<65;u+=10)pads.push({a:point(u),b:point(Math.min(65,u+10))});
  // Independently inspect a dense full footprint, including every corner,
  // against source geometry's finite10m line strips rather than a centre ray.
  for(let i=0;i<=16;i++)for(let j=0;j<=8;j++){
    const along=-2.4+4.8*i/16,across=-1.15+2.3*j/8,x=p.x+p.hx*along-p.hz*across,z=p.z+p.hz*along+p.hx*across;
    assert.ok(pads.some(({a,b})=>{const dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz),t=((x-a.x)*dx+(z-a.z)*dz)/l,cross=((x-a.x)*-dz+(z-a.z)*dx)/l;return t>=-1e-6&&t<=l+1e-6&&Math.abs(cross)<=1.7+1e-6;}),'part of the car lies beyond the real finite platform pad');
  }
  assert.equal(p.y,a.deckHeight+1.2);assert.ok(Math.abs(Math.hypot(p.hx,p.hz)-1)<1e-8);
}
function assertPassengerClearance(p:NonNullable<ReturnType<typeof supportedMetroHandoffParking>>,door:{x:number;z:number;hx:number;hz:number},outward:{x:number;z:number}){
  const corners=[[-2.4,-1.15],[2.4,-1.15],[2.4,1.15],[-2.4,1.15]].map(([u,v])=>({x:p.x+p.hx*u-p.hz*v,z:p.z+p.hz*u+p.hx*v}));
  for(let i=0;i<4;i++){
    const actor={x:door.x+outward.x*METRO_DELIVERY_WALK_DISTANCE+door.hx*(i-1.5)*.65,z:door.z+outward.z*METRO_DELIVERY_WALK_DISTANCE+door.hz*(i-1.5)*.65};
    if(i===0)assert.ok(Math.hypot(p.x-actor.x,p.z-actor.z)<=7+1e-7,'marker is beyond the receiver handoff radius');
    const distances=corners.map((a,j)=>{const b=corners[(j+1)%4],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((actor.x-a.x)*dx+(actor.z-a.z)*dz)/(dx*dx+dz*dz)));return Math.hypot(actor.x-a.x-dx*t,actor.z-a.z-dz*t);});
    const inside=corners.every((a,j)=>{const b=corners[(j+1)%4];return(b.x-a.x)*(actor.z-a.z)-(b.z-a.z)*(actor.x-a.x)>=-1e-8;});
    assert.equal(inside,false,'the Roadster footprint contains a passenger');assert.ok(Math.min(...distances)>=.4-1e-7,'the Roadster clips a passenger beside the real door');
  }
}

test('straight and rotated platform parking keeps the whole car inside the pad and clear of the passenger row and guard',()=>{
  for(const points of [[[0,-200],[0,200]],[[140,-140],[-140,140]]] as [number,number][][])for(const side of [-1,1])for(const reverse of [false,true]){
    const a=platform(points),{door,outward}=doorAt(a,0,side,reverse),p=supportedMetroHandoffParking(a,door,outward);assert.ok(p);assertActualSupport(a,p,side);
    const receiver={x:door.x+outward.x*METRO_DELIVERY_WALK_DISTANCE-door.hx*.975,z:door.z+outward.z*METRO_DELIVERY_WALK_DISTANCE-door.hz*.975};assert.ok(Math.hypot(p.x-receiver.x,p.z-receiver.z)<7);
    const along=(p.x-door.x)*door.hx+(p.z-door.z)*door.hz;assert.ok(Math.abs(along)>=4.8-1e-6);
    for(let i=0;i<4;i++){
      const x=door.x+outward.x*METRO_DELIVERY_WALK_DISTANCE+door.hx*(i-1.5)*.65,z=door.z+outward.z*METRO_DELIVERY_WALK_DISTANCE+door.hz*(i-1.5)*.65;
      assert.ok(Math.abs((x-p.x)*p.hx+(z-p.z)*p.hz)>2.4+.4,'car overlaps the four-person row');
    }
    const centre=sampleMetroPath(a.corridor.center,projectMetroPath(a.corridor.center,[p.x,p.z]).s),outer=Math.abs((p.x-centre.x)*-centre.hz+(p.z-centre.z)*centre.hx)+1.15;
    assert.ok(outer<7.4-.125,'car touches the real outer guard');
  }
});

test('bench and platform endpoints choose a supported alternative without moving or extending station geometry',()=>{
  const a=platform([[0,-200],[0,200]]);
  for(const side of [-1,1])for(const u of [-60,-36.8,-32,-27.2,27.2,32,36.8,60]){
    const {door,outward}=doorAt(a,u,side),p=supportedMetroHandoffParking(a,door,outward);assert.ok(p,`door${u}`);assertActualSupport(a,p,side);
    const selectedU=projectMetroPath(a.corridor.center,[p.x,p.z]).s-a.frame.s!;assert.ok([-32,32].every(bench=>Math.abs(selectedU-bench)>=4.5));
  }
  const far=doorAt(a,100,1);assert.equal(supportedMetroHandoffParking(a,far.door,far.outward),null);
  const invalid=doorAt(a,0,1);assert.equal(supportedMetroHandoffParking(a,{...invalid.door,x:NaN},invalid.outward),null);
  assert.equal(supportedMetroHandoffParking(a,invalid.door,{x:0,z:0}),null);
  const short={...a,corridor:{...a.corridor,center:metroPath([[0,-2],[0,2]])}};
  assert.equal(supportedMetroHandoffParking(short,invalid.door,invalid.outward),null,'a four-metre source pad cannot support a4.8m car; never extend it');
});

test('curved station chords support the full car rather than using an unsupported straight tangent offset',()=>{
  const points=Array.from({length:61},(_,i):[number,number]=>{const angle=-1.3+i*2.6/60;return[80*Math.cos(angle),80*Math.sin(angle)];}),a=platform(points);
  for(const side of [-1,1])for(const u of [-45,-22.1,0,22.1,45]){
    const {door,outward}=doorAt(a,u,side),p=supportedMetroHandoffParking(a,door,outward);assert.ok(p,`curve side${side}u${u}`);assertActualSupport(a,p,side);assertPassengerClearance(p,door,outward);
  }
});

test('all real Hyderabad station assemblies offer an actual supported nearby handoff for either train direction',()=>{
  const core=JSON.parse(gunzipSync(readFileSync('public/city/core.pack.wasm')).toString()) as CoreData;
  const assemblies=metroPlatformAssemblies(core.metro.stations,metroCorridors(core.metro.lines),core.metro.deckHeight);
  assert.ok(assemblies.length>50);let checked=0,begumpet=false;
  for(const a of assemblies)for(const track of a.corridor.tracks){
    let available=0;
    const stationS=projectMetroPath(track.path,[a.frame.cx,a.frame.cz]).s,side=-track.dir;
    // Use the actual offset rail path and8m-smoothed door heading used by
    // MetroTrains, not merely a centre-line tangent with a guessed offset.
    // Three real coach centres and their three actual door offsets. A tight
    // individual door may safely returnnull; the host can choose its next real
    // door. Every station/direction must still offer a supported alternative.
    for(const coach of [-22.1,0,22.1])for(const offset of [-6.5,0,6.5]){
      const q=sampleMetroPath(track.path,stationS+track.dir*(coach+offset),8),outward={x:-q.hz*side,z:q.hx*side};
      const door={x:q.x+outward.x*1.5,y:a.deckHeight+1.2,z:q.z+outward.z*1.5,hx:q.hx,hz:q.hz};
      const p=supportedMetroHandoffParking(a,door,outward);if(!p)continue;
      assertActualSupport(a,p,side);assertPassengerClearance(p,door,outward);checked++;available++;
    }
    assert.ok(available>0,`${a.stationId}/${a.lineId}direction${track.dir} has no supported real door`);
    if(/begumpet/i.test(a.source.name||a.stationId))begumpet=true;
  }
  assert.ok(checked>600);assert.ok(begumpet,'include the actual reported Begumpet-side player region');
});
