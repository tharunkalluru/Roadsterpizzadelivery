import type { Game } from '../../game/game';
import { GameplayCadence } from './gameplay-cadence';
declare const __ROADSTER_BUILD__:string;

/** Attached only by the optional development evidence panel. Never changes
 * rendering, quality, timing, camera or controls. Export is user initiated. */
export function createGameplayPerformanceObserver(game:Game){
  const cadence=new GameplayCadence();
  const startedAt=new Date().toISOString();
  const resources:{activeSeconds:number;gameSeconds:number;fpsCounter:number;frameRenderCalls:number;frameRenderTriangles:number;geometries:number;textures:number;traffic:number;tiles:number;pendingTiles:number;heapBytes:number|null;flying:boolean;speed:number;level:string|null}[]=[];
  let nextResourceAt=0,disposed=false;
  const reset=()=>cadence.break();
  document.addEventListener('visibilitychange',reset);window.addEventListener('blur',reset);window.addEventListener('focus',reset);
  return {
    tick(now:number){
      if(disposed)return;
      const active=!document.hidden&&document.hasFocus()&&!!game.area&&!game.relocating&&!game.choosing&&!game.paused&&
        !game.hud.modalOpen&&!game.hud.tipOpen&&!game.hud.rotationBlocked&&!game.map?.open&&!game.story?.blocking;
      const sampled=cadence.sample(now,game.t,active);
      if(sampled&&now>=nextResourceAt){
        nextResourceAt=now+1000;const info=game.engine.renderer.info;
        const heap=(performance as Performance&{memory?:{usedJSHeapSize:number}}).memory?.usedJSHeapSize;
        resources.push({activeSeconds:cadence.summary().activeWallMs/1000,gameSeconds:game.t,fpsCounter:game.fps,
          frameRenderCalls:info.render.calls,frameRenderTriangles:info.render.triangles,geometries:info.memory.geometries,textures:info.memory.textures,
          traffic:game.traffic.cars.length,tiles:game.city.tiles.size,pendingTiles:game.city.pending.size,
          heapBytes:Number.isFinite(heap)?heap!:null,flying:game.player.airborne,speed:game.player.speed,
          level:game.story?.controller.activeLevel?.id??null});
        if(resources.length>3600)resources.splice(0,60);
      }
    },
    summary:()=>cadence.summary(),
    report:()=>({schemaVersion:1,startedAt,build:typeof __ROADSTER_BUILD__==='string'?__ROADSTER_BUILD__:'development',source:location.href,userAgent:navigator.userAgent,
      environment:{quality:game.opts.lowQ?'low':'high',viewport:{width:innerWidth,height:innerHeight},devicePixelRatio,
        rendererPixelRatio:game.engine.renderer.getPixelRatio(),drawingBuffer:{width:game.engine.renderer.domElement.width,height:game.engine.renderer.domElement.height},
        hardwareConcurrency:navigator.hardwareConcurrency??null,refreshCapability:'Not measured by this callback observer'},
      measurement:'Focused, unblocked gameplay observer-callback cadence after the real simulation advances',
      limitations:['Not GPU-completed presentation timing or input latency.','Device, refresh capability, thermal state and battery life require separate hardware evidence.',
        'Hidden, unfocused, loading, map, pause and blocking-dialog intervals are excluded.','The existing Engine resets renderer counters once per frame and aggregates its scene, shadow and composer passes; these are submitted render counts, not GPU completion timing.',
        'Optional JS heap and WebGL resource counts do not measure full device or GPU memory.','Resource timeline retains up to the latest3600 one-second samples; cadence totals cover the session.'],
      intervalHistogram:{binWidthMs:.25,lastBinAtLeastMs:1000},...cadence.summary(),resources:resources.map(sample=>({...sample}))}),
    dispose(){disposed=true;document.removeEventListener('visibilitychange',reset);window.removeEventListener('blur',reset);window.removeEventListener('focus',reset);}
  };
}
