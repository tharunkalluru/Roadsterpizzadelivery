// Synthetic behavioral evidence only: never imported by the production client.
import * as THREE from 'three';
import { Player, type Input } from '../src/game/player';
import { initTemplates, rng } from '../src/core/util';
import { FixedStepClock } from '../src/core/performance-monitor';
import type { CityData } from '../src/world/city';

export type ReplayScenario = 'jump' | 'drive-brake' | 'fly-once';
export interface ReplayOptions { hz: number; scenario: ReplayScenario; seconds?: number; seed?: number; renderRandomDraws?: number }
const STEP = 1/60;

function flatCity(): CityData {
  const road = { id:'synthetic-flat-road', name:'Synthetic road', cls:'primary', w:20000, pts:[[0,-10000],[0,10000]], elev:null };
  const surface = { kind:'road', ax:0, az:-10000, bx:0, bz:10000, ya:0, yb:0, hw:10000, e:road };
  // The infinite test road has the same immutable support in each queried cell.
  const grid = new Map() as any; grid.get = () => [surface];
  return { surfaceGrid:grid, buildingGrid:new Map(), obstacles:new Map(), walls:new Map(), landmarkSurfaceGrid:new Map(), movingRail:[] } as any;
}

function environment<T>(seed: number, run: (renderRng: ReturnType<typeof rng>) => T): T {
  const originalRandom=Math.random, originalNow=Date.now, originalDocument=(globalThis as any).document;
  const renderRng=rng(seed ^ 0x7253c11), gradient={addColorStop() {}};
  const ctx=new Proxy({measureText:(text:string)=>({width:text.length*12}),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient}, {get:(o:any,k)=>k in o?o[k]:()=>{}});
  try {
    Math.random=renderRng; Date.now=()=>1700000000000;
    (globalThis as any).document={createElement:()=>({width:256,height:128,getContext:()=>ctx})};
    return run(renderRng);
  } finally {
    Math.random=originalRandom; Date.now=originalNow;
    if(originalDocument===undefined) delete (globalThis as any).document; else (globalThis as any).document=originalDocument;
  }
}

export function runReplay(options: ReplayOptions) {
  const {hz,scenario,seconds=8,seed=81441,renderRandomDraws=0}=options;
  if(!Number.isFinite(hz)||hz<=0||!Number.isFinite(seconds)||seconds<=0||seconds>120)throw new Error('Replay requires a finite positive rate and 0–120 second duration');
  return environment(seed, renderRng=>{
    initTemplates({rbox:new THREE.BoxGeometry(1,1,1),ring:new THREE.RingGeometry(1,1.2,12)});
    const player=new Player(flatCity(),{radial:new THREE.Texture()});
    // Particle graphics do not influence physical motion. Full body geometry,
    // kickflip pose, collision/support, wheels and the actual update method stay.
    player.animateThrusters=()=>{};
    player.place(0,0,0); if(scenario==='jump') player.speed=12.5;
    const clock=new FixedStepClock(), simulationRng=rng(seed), samples:any[]=[];
    const scriptedSteer=Array.from({length:Math.ceil(seconds*60)+2},(_,i)=>i>=120&&i<240?(simulationRng()-.5)*.08:0);
    let tick=0,jumpStarts=0,flightToggles=0,landedAt:number|null=null,landingDistance:number|null=null,apex=.55,canJumpReadyAt:number|null=null;
    let travelDistance=0,brakingStartDistance:number|null=null,brakingStopDistance:number|null=null,brakingStartSpeed:number|null=null,stoppedAt:number|null=null;
    const expectedTicks=Math.round(seconds*60);
    for(let frame=0;tick<expectedTicks;frame++) {
      if(frame>hz*seconds+10) throw new Error('Replay clock did not reach expected simulation ticks');
      for(let k=0;k<renderRandomDraws;k++)renderRng();
      const steps=clock.advance(1/hz,true);
      for(let step=0;step<steps&&tick<expectedTicks;step++) {
        tick++;
        const input:Input={throttle:scenario==='drive-brake'&&tick<=180?1:0,brake:scenario==='drive-brake'&&tick>180&&player.speed>0?1:0,steer:scenario==='drive-brake'?scriptedSteer[tick]:0,
          jumpPressed:scenario==='jump'&&tick===1,flyPressed:scenario==='fly-once'&&tick===1,boost:false};
        const jumping=player.jumping,flying=player.flying,oldX=player.pos.x,oldZ=player.pos.z;
        if(scenario==='drive-brake'&&tick===181){brakingStartDistance=travelDistance;brakingStartSpeed=player.speed;}
        player.update(STEP,input,tick*STEP);
        travelDistance+=Math.hypot(player.pos.x-oldX,player.pos.z-oldZ);
        if(scenario==='drive-brake'&&tick>180&&player.speed<=0&&stoppedAt===null){stoppedAt=tick*STEP;brakingStopDistance=travelDistance-brakingStartDistance!;}
        if(!jumping&&player.jumping)jumpStarts++;
        if(flying!==player.flying)flightToggles++;
        if(jumping&&!player.jumping&&landedAt===null){landedAt=tick*STEP;landingDistance=Math.hypot(player.pos.x,player.pos.z);}
        if(landedAt!==null&&canJumpReadyAt===null&&player.canJump)canJumpReadyAt=tick*STEP;
        apex=Math.max(apex,player.pos.y);
        samples.push([tick,player.pos.x,player.pos.y,player.pos.z,player.yaw,player.speed,player.vy,player.jumping,player.jumpCooldown,player.flying,player.descending,player.onRoad]);
      }
    }
    const result={scenario,hz,seed,stepSeconds:STEP,ticks:tick,jumpStarts,flightToggles,landedAt,landingDistance,apex,canJumpReadyAt,travelDistance,brakingStartSpeed,brakingStopDistance,stoppedAt,final:samples.at(-1),samples};
    const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
    for(const group of [player.group,player.glow,player.gas.group])group.traverse((node:any)=>{if(node.geometry)geometries.add(node.geometry);for(const m of Array.isArray(node.material)?node.material:node.material?[node.material]:[]){materials.add(m);for(const key of ['map','alphaMap'])if(m[key])textures.add(m[key]);}});
    for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();for(const texture of textures)texture.dispose();
    return result;
  });
}
