import { describe,expect,it } from 'vitest';
import * as THREE from 'three';
import { GameView } from '../../src/app/view';
import type { ArtApi } from '../../src/art/api';
import { packSignAtlas,layoutSignAtlasPages,signTextArea,signCellPadding,type SignAtlasCell } from '../../src/art/signAtlas';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

describe('traffic actor material lifecycle',()=>{
  it('frees private actor paints and brake materials on despawn and reset, while retaining shared templates',()=>{
    const view=new GameView({} as THREE.WebGLRenderer,{} as ArtApi);
    const template=new THREE.Group(),geometry=new THREE.BoxGeometry(1,1,1),shared=new THREE.MeshStandardMaterial();
    for(const name of ['body','brake']){const mesh=new THREE.Mesh(geometry,shared);mesh.name=name;template.add(mesh);}
    template.userData.paintVariants=[0xff0000];
    const runtime=view as unknown as {templates:unknown;pedTemplate:THREE.Object3D;actorObjs:Map<number,THREE.Object3D>;syncActors(s:unknown,a:number):void};
    runtime.templates={car:{object:template}};runtime.pedTemplate=new THREE.Group();
    let released=0,sharedReleased=0;shared.addEventListener('dispose',()=>sharedReleased++);
    const actor=(id:number)=>({id,kind:'car',x:0,z:0,y:0,px:0,pz:0,py:0,pheading:0,heading:0,braking:false});
    const session={traffic:{actors:[actor(1)],peds:[]}};
    runtime.syncActors(session,1);
    const watch=()=>runtime.actorObjs.values().next().value!.traverse(o=>{if(o instanceof THREE.Mesh)(o.material as THREE.Material).addEventListener('dispose',()=>released++);});
    watch();session.traffic.actors=[];runtime.syncActors(session,1);expect(released).toBe(2);
    session.traffic.actors=[actor(2)];runtime.syncActors(session,1);watch();view.clearActors();
    expect(released).toBe(4);expect(sharedReleased).toBe(0);expect(runtime.actorObjs.size).toBe(0);
    geometry.dispose();shared.dispose();
  });
  it('releases old navigation line materials when the route changes or clears',()=>{
    const view=new GameView({} as THREE.WebGLRenderer,{} as ArtApi);
    view.setRoute([new THREE.Vector3(),new THREE.Vector3(0,0,10)]);
    const first=view.scene.children.find(o=>o instanceof THREE.Line) as THREE.Line;
    let released=0;(first.material as THREE.Material).addEventListener('dispose',()=>released++);
    view.setRoute([new THREE.Vector3(),new THREE.Vector3(0,0,20)]);
    const second=view.scene.children.find(o=>o instanceof THREE.Line) as THREE.Line;
    (second.material as THREE.Material).addEventListener('dispose',()=>released++);
    view.setRoute(null);expect(released).toBe(2);
  });

});

describe('research label atlas priority',()=>{
  it('keeps positive text space inside the photographed 30 cm travel-office boards on every quality',()=>{
    for(const heightM of [.3,.35])for(const density of [64,96,130]){
      const area=signTextArea(.95,heightM);
      expect(area.heightM).toBeGreaterThan(heightM*.7);
      const cell:SignAtlasCell={wm:area.widthM,hm:area.heightM,px:0,py:0,pw:0,ph:0,priority:true,minimumDensity:density};
      layoutSignAtlasPages([cell],density,512);
      expect(cell.pw-2*signCellPadding(cell)).toBeGreaterThan(20);
      expect(cell.hm).toBeLessThan(heightM);
      expect(cell.wm).toBeLessThan(.95);
    }
  });
  it('pages an overflowing research inventory instead of reusing another shop name',()=>{
    const cells:SignAtlasCell[]=Array.from({length:80},(_,i)=>({wm:i%5===0?11:4,hm:i%7===0?2.2:.95,px:0,py:0,pw:0,ph:0,priority:true,minimumDensity:96}));
    // Reserved research density cannot fit even when ordinary labels are reduced.
    expect(packSignAtlas(cells,8,1024)).toBe(-1);
    const layout=layoutSignAtlasPages(cells,100,512,2048);
    expect(layout.size).toBe(2048);expect(layout.pages).toBeGreaterThan(1);
    for(const c of cells){
      expect(c.page).toBeGreaterThanOrEqual(0);expect(c.page).toBeLessThan(layout.pages);
      expect(c.px).toBeGreaterThanOrEqual(5);expect(c.py).toBeGreaterThanOrEqual(5);
      expect(c.px+c.pw).toBeLessThanOrEqual(layout.size-5);expect(c.py+c.ph).toBeLessThanOrEqual(layout.size-5);
      expect(c.pw).toBeGreaterThanOrEqual(c.wm*96);expect(c.ph).toBeGreaterThanOrEqual(c.hm*96);
    }
    for(let i=0;i<cells.length;i++)for(let j=i+1;j<cells.length;j++){
      const a=cells[i],b=cells[j];if(a.page!==b.page)continue;
      expect(a.px+a.pw+5<=b.px||b.px+b.pw+5<=a.px||a.py+a.ph+5<=b.py||b.py+b.ph+5<=a.py).toBe(true);
    }
  });
  it('reserves readable pixels for upper-floor researched labels in a crowded mobile atlas',()=>{
    const cells:SignAtlasCell[]=Array.from({length:89},()=>({wm:4,hm:.9,px:0,py:0,pw:0,ph:0}));
    const researched=Array.from({length:3},()=>({wm:6,hm:.95,px:0,py:0,pw:0,ph:0,priority:true,minimumDensity:64}));
    cells.push(...researched);
    let density=30;while(density>1 && packSignAtlas(cells,density,512)<0)density--;
    expect(packSignAtlas(cells,density,512)).toBeGreaterThan(0);
    for(const sign of researched){expect(sign.ph).toBeGreaterThanOrEqual(60);expect(sign.pw).toBeGreaterThanOrEqual(384);}
    for(let i=0;i<cells.length;i++)for(let j=i+1;j<cells.length;j++){
      const a=cells[i],b=cells[j];expect(a.px+a.pw<=b.px||b.px+b.pw<=a.px||a.py+a.ph<=b.py||b.py+b.ph<=a.py).toBe(true);
    }
  });
});

describe('mutable research cache',()=>{
  it('uses a fresh revision online and the latest successful revision offline',async()=>{
    const handlers=new Map<string,(e:unknown)=>void>();
    const cached=new Map<string,Response>();let online=true,requests=0;
    const url='https://game.example/research/street-survey.json';cached.set(url,new Response('{"revision":1}'));
    const request={url,method:'GET',mode:'cors'};
    runInNewContext(readFileSync('public/sw.js','utf8'),{
      URL,location:{origin:'https://game.example'},
      self:{addEventListener:(name:string,handler:(e:unknown)=>void)=>handlers.set(name,handler)},
      caches:{match:async(r:{url:string})=>cached.get(r.url)?.clone(),open:async()=>({put:async(r:{url:string},response:Response)=>{cached.set(r.url,response);}})},
      fetch:async()=>{requests++;if(!online)throw new Error('offline');return new Response('{"revision":2}');},
    });
    const get=async()=>{let response:Promise<Response>|undefined;handlers.get('fetch')!({request,respondWith:(r:Promise<Response>)=>{response=r;}});return (await response!).json();};
    expect(await get()).toEqual({revision:2});expect(requests).toBe(1);
    online=false;expect(await get()).toEqual({revision:2});expect(requests).toBe(2);
  });
});
