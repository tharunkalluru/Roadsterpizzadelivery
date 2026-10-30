import { RoadGraph } from '../game/roadgraph';
import type { RoadEdge } from '../world/types';
import type { Game } from '../game/game';
import type { StorageLike } from './core/types';
import { loadLevels } from './content/levels';
import { ProgressSystem } from './systems/progress-system';
import type { DeliveryRuntimeOptions } from './runtime';

/** Imported only by main.ts's import.meta.env.DEV branch. No global test hooks. */
export function createDeliveryQA(value: string | null, roads?: RoadEdge[], query?: URLSearchParams) {
  if (!value || !/^[1-9]\d*$/.test(value)) return null;
  const levels = loadLevels(), number = Number(value);
  const pose=query?.get('qaStart')?.split(',').map(Number);
  const start=pose?.length===4&&pose.every(Number.isFinite)?{x:pose[0],z:pose[1],yaw:pose[2],y:pose[3]}:null;
  const touch=query?.get('qaTouch')==='1';
  const trafficOrbit=query?.get('qaTrafficOrbit')==='1';
  if (!Number.isSafeInteger(number) || number > levels.length) return null;
  const values = new Map<string, string>([['roadster-carrier-tutorial-v1', '1']]);
  const storage: StorageLike = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: key => { values.delete(key); },
  };
  // Use ordinary progress validation, rather than replacing the content list
  // or mutating the controller's unlocked level behind its public API.
  const progress = new ProgressSystem(levels, storage);
  for (const previous of levels.slice(0, number - 1)) progress.complete(previous.id);
  const destination = levels[number - 1].destination;
  let area={name:`QA scenario ${number}`,x:destination.x,z:destination.z};
  if(levels[number-1].moduleParams.scene==='surfaceEmergence'&&roads){
    const graph=new RoadGraph(roads);let nearest=Infinity;
    for(const edge of graph.nearestEdges(destination.x,destination.z,25)){
      if(edge.e.elev?.some(y=>y>1)||edge.e.w<7)continue;
      for(let at=5;at<edge.len-5;at+=30){const p=graph.pointAt(edge,at,1),d=Math.hypot(p.x-destination.x,p.z-destination.z);if(d>80&&d<nearest){nearest=d;area={name:`QA scenario ${number} · lake approach`,x:p.x,z:p.z};}}
    }
  }
  if(start)area={name:'Road access drive',x:start.x,z:start.z};
  const runtime: DeliveryRuntimeOptions = { levels, storage };
  return {
    number, runtime, storage, touch, start,
    area,
    attach(game: Game) {
      const panel = document.createElement('aside');
      panel.setAttribute('aria-label', 'Development delivery scenario');
      panel.style.cssText = 'position:absolute;z-index:6;left:50%;top:76px;transform:translateX(-50%);max-width:340px;width:calc(100vw - 30px);box-sizing:border-box;padding:8px 10px;border:2px solid #ffbf00;border-radius:12px;background:#20152f;color:#fff1d5;font:12px system-ui;pointer-events:auto';
      const label = document.createElement('strong');
      label.textContent = `QA scenario ${number} · temporary progress`;
      const status = document.createElement('p'); status.style.margin = '5px 0';status.style.whiteSpace='pre-line';
      status.setAttribute('role', 'status');
      const buttons = document.createElement('div'); buttons.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
      const button = (text: string, act: () => void) => {
        const el = document.createElement('button'); el.type = 'button'; el.textContent = text;
        el.style.cssText = 'min-height:36px;padding:6px 9px;border:1px solid #a18ab5;border-radius:8px;background:#362345;color:#fff1d5;touch-action:manipulation';
        el.addEventListener('click', event => { event.stopPropagation(); act(); }); buttons.append(el); return el;
      };
      const prepare = button('Prepare order', () => {
        if (prepare.disabled || !game.story) return;
        game.resetInput(); game.sound.unlock(); game.story.controller.pickup(); update();
        game.engine.renderer.domElement.focus({ preventScroll: true });
      });
      let orbitVehicles: typeof game.traffic.cars = [];
      if(trafficOrbit)button('Stage nearby traffic',()=>{
        const edge=game.graph.nearestEdges(game.player.pos.x,game.player.pos.z,2)[0];if(!edge)return;
        game.resetInput();game.traffic.clear();game.busyT=3600;game.traffic.max=0;
        const p=game.player.pos,f=game.player.forward;
        const slots=[['auto',-3,0],['bike',3,0],['car',-3,10],['bus',3,16],['truck',-3,-15]] as const;
        orbitVehicles=slots.map(([kind,side,ahead])=>{
          const c=game.traffic.spawnAt(kind,edge,1,edge.len/2,0);
          c.x=p.x+f.z*side+f.x*ahead;c.y=game.player.lastSupport;c.z=p.z-f.x*side+f.z*ahead;
          c.hx=f.x;c.hz=f.z;c.speed=0;c.want=0;c.dwell=3600;
          c.g.position.set(c.x,c.y+.02,c.z);c.g.rotation.y=Math.atan2(-c.hx,-c.hz);return c;
        });
        game.engine.renderer.domElement.focus({preventScroll:true});update();
      });
      const resetDrive=start?button('Reset drive start',()=>{
        if(resetDrive?.disabled)return;
        game.resetInput();game.sound.unlock();game.player.place(start.x,start.z,start.yaw,start.y);
        game.engine.renderer.domElement.focus({preventScroll:true});
      }):null;
      button('Restart scenario', () => location.reload());
      button('Hide QA controls', () => cleanup());
      panel.addEventListener('pointerdown', event => event.stopPropagation());
      panel.addEventListener('keydown', event => event.stopPropagation());
      panel.append(label, status, buttons); game.hud.root.append(panel);
      const update = () => {
        const blocked = game.relocating || game.choosing || !game.area || game.paused || game.hud.modalOpen || game.hud.rotationBlocked || !!game.map?.open;
        prepare.disabled = blocked || !game.story?.canPickup;
        if(resetDrive)resetDrive.disabled=blocked;
        const text = game.relocating ? 'Loading through normal area placement…' : blocked ? 'Resume in landscape to prepare.' :
          game.story?.activeOrder ? 'Order prepared. Calls and delivery stay manual.' : 'Prepare skips only the pickup for this test.';
        const p=game.player.pos;
        const readout=text+(orbitVehicles.length?'\nTraffic: '+orbitVehicles.map(c=>`${c.group} ${c.g.visible?'visible':'hidden'}`).join(' · '):'')+(start?`\nDrive: x ${p.x.toFixed(2)}, z ${p.z.toFixed(2)}, y ${p.y.toFixed(2)} · ${Math.round(Math.abs(game.player.speed)*3.6)} km/h · ${game.player.lastKind}`:'');
        if (status.textContent !== readout) status.textContent = readout;
      };
      const timer = setInterval(update, 250);
      const cleanup = () => { clearInterval(timer); panel.remove(); removeEventListener('pagehide', cleanup); };
      addEventListener('pagehide', cleanup, { once: true }); update();
    },
  };
}
