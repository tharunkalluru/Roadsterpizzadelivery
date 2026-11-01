import { RoadGraph } from '../game/roadgraph';
import type { RoadEdge } from '../world/types';
import type { Game } from '../game/game';
import type { StorageLike } from './core/types';
import { loadLevels } from './content/levels';
import { ProgressSystem } from './systems/progress-system';
import type { DeliveryRuntimeOptions } from './runtime';
import { movingRailSupport } from '../game/moving-rail';
import { lockReviewLighting } from './qa/review-lighting';
import { attachCampaignQA } from './qa/campaign-observer';
import type { CharacterGpuContext } from './art/gpu-preparation';
import type { LocalPushpaArtReview } from './qa/pushpa-art-review';
import type { LocalSceneArtReview } from './qa/scene-art-review';
import { gameplayPresentationDiagnostics } from './qa/performance-observer';

/** Imported only by main.ts's import.meta.env.DEV branch. No global test hooks. */
export function createDeliveryQA(value: string | null, roads?: RoadEdge[], query?: URLSearchParams) {
  if (!value || !/^[1-9]\d*$/.test(value)) return null;
  const levels = loadLevels(), number = Number(value);
  const campaignQA=query?.get('qaCampaign')==='1',fullCampaign=campaignQA&&query?.get('qaCampaignMode')==='full'&&number===1;
  const artQuery=query?.get('qaArt')??null;
  if(artQuery!==null&&(fullCampaign||!(artQuery==='scene-candidates-v1'||artQuery==='pushpa-reader-v1'&&number===1)))throw new Error('This local art comparison is only available in an allowlisted isolated scene review.');
  let artReview:LocalPushpaArtReview|LocalSceneArtReview|null=null;
  const pose=query?.get('qaStart')?.split(',').map(Number);
  const start=!fullCampaign&&pose?.length===4&&pose.every(Number.isFinite)?{x:pose[0],z:pose[1],yaw:pose[2],y:pose[3]}:null;
  const touch=query?.get('qaTouch')==='1';
  const trafficOrbit=!fullCampaign&&query?.get('qaTrafficOrbit')==='1';
  const nightLights=!fullCampaign&&query?.get('qaNight')==='1';
  // Read-only pickup diagnostics can accompany an ordinary campaign. They do
  // not supply targets, change traffic, extend grabs or bypass a jump.
  const pickupReadout=query?.get('qaPickup')==='1';
  const trainRide=query?.get('qaTrainRide')==='1'&&number===2;
  const artTrainStaging=!fullCampaign&&trainRide&&artQuery==='scene-candidates-v1';
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
  if(['surfaceEmergence','devaraUnderwater'].includes(String(levels[number-1].moduleParams.scene))&&roads){
    const graph=new RoadGraph(roads);let nearest=Infinity;
    for(const edge of graph.nearestEdges(destination.x,destination.z,25)){
      if(edge.e.elev?.some(y=>y>1)||edge.e.w<7)continue;
      for(let at=5;at<edge.len-5;at+=30){const p=graph.pointAt(edge,at,1),d=Math.hypot(p.x-destination.x,p.z-destination.z);if(d>80&&d<nearest){nearest=d;area={name:`QA scenario ${number} · lake approach`,x:p.x,z:p.z};}}
    }
  }
  if(start)area={name:'Road access drive',x:start.x,z:start.z};
  const runtime: DeliveryRuntimeOptions = { levels, storage };
  return {
    number, runtime, storage, touch, start, artTrainStaging,
    area:fullCampaign?undefined:area,
    prepareArtReview:artQuery?async(gpu:CharacterGpuContext)=>{
      if(artQuery==='scene-candidates-v1'){
        const {prepareSceneArtReview}=await import('./qa/scene-art-review');
        artReview=await prepareSceneArtReview(levels[number-1],gpu);
      }else{
        const {preparePushpaArtReview}=await import('./qa/pushpa-art-review');
        artReview=await preparePushpaArtReview(gpu);
      }
      runtime.moduleFactory=artReview.createModule;
    }:undefined,
    attach(game: Game) {
      const evidence=campaignQA||artReview?attachCampaignQA(game,{full:fullCampaign,touch,performance:query?.get('qaPerf')==='1',artPreview:artReview?.evidence}):null;
      if(artReview){
        const warning=document.createElement('aside');warning.setAttribute('aria-label','Unreviewed local character comparison');
        warning.textContent='UNREVIEWED CHARACTER ART · local visual comparison';
        warning.style.cssText='position:fixed;z-index:1000;bottom:3px;left:8px;max-width:70vw;padding:4px 9px;background:#35210a;color:#ffdf81;border:1px solid #ffbf00;border-radius:6px;font:11px system-ui;pointer-events:none;text-align:center';
        document.body.append(warning);const review=artReview;addEventListener('pagehide',()=>{warning.remove();review.dispose();},{once:true});
      }
      const reviewLighting=nightLights?lockReviewLighting(game):null;
      if(reviewLighting)addEventListener('pagehide',()=>reviewLighting.dispose(),{once:true});
      const panel = document.createElement('aside');
      panel.setAttribute('aria-label', 'Development delivery scenario');
      panel.style.cssText = 'position:absolute;z-index:6;left:50%;top:76px;transform:translateX(-50%);max-width:340px;width:calc(100vw - 30px);box-sizing:border-box;padding:8px 10px;border:2px solid #ffbf00;border-radius:12px;background:#20152f;color:#fff1d5;font:12px system-ui;pointer-events:auto';
      const label = document.createElement('strong');
      label.textContent = fullCampaign?'Full campaign · normal pickup and travel':`QA scenario ${number} · temporary progress${trainRide?' · F2 toggles diagnostics':''}`;
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
        evidence?.noteAssistance('qa-order-preparation');
        game.resetInput(); game.sound.unlock(); game.story.controller.pickup(); update();
        game.engine.renderer.domElement.focus({ preventScroll: true });
      });
      let trainLanding=false;
      if(!fullCampaign&&query?.get('qaScene')==='1')button('Stage at scene approach',()=>{
        const module=game.story?.module,destination=game.story?.controller.destination;if(!module&&!destination)return;
        const arrival=module?.arrival,at=arrival?{x:arrival.x-arrival.hx*12,z:arrival.z-arrival.hz*12,y:arrival.y}:module?.target??{...destination!,y:destination!.y??0};
        const walking=game.story?.controller.activeLevel?.module==='walkingHandoff';
        const streetYaw=Number(game.story?.controller.activeLevel?.moduleParams.streetYaw)||0;
        const yaw=arrival?Math.atan2(-arrival.hx,-arrival.hz):walking?streetYaw:0;
        const staged=walking?{...at,x:at.x+Math.cos(streetYaw)*3,z:at.z-Math.sin(streetYaw)*3}:at;
        const ground=arrival?module?.trafficBodies?.[0]?.y??0:at.y;
        evidence?.noteAssistance('qa-scene-staging');
        game.resetInput();game.sound.unlock();game.player.place(staged.x,staged.z,yaw,ground);
        // Player.place deliberately snaps only to roads. Explicitly staged
        // metro tests still need a real roof descent; selecting a marker must
        // never count as the required ride or create an artificial support.
        if(game.story?.controller.activeLevel?.module==='metroRide'){
          const coach=game.metro.storyBoardingBody('',at.x,at.z);
          if(coach){const player=game.player;player.yaw=Math.atan2(-coach.hx,-coach.hz);
            player.pos.set(coach.x,coach.roof+1.75,coach.z);player.descending=true;player.vy=0;
            player.group.position.copy(player.pos);game.clock.getDelta();}
        }
        game.engine.renderer.domElement.focus({preventScroll:true});update();
      });
      const contactedCoaches=new Set<string>();
      const stageTrain=trainRide&&!fullCampaign?button('Land above rear coach',()=>{
        if(stageTrain?.disabled)return;
        const physical=game.rail.bodies.filter(body=>/^rail:(?:story:)?\d+:\d+$/.test(body.id));
        const target=game.story?.destination;
        const selected=target?physical.reduce<typeof physical[number]|null>((best,body)=>!best||Math.hypot(body.x-target.x,body.z-target.z)<Math.hypot(best.x-target.x,best.z-target.z)?body:best,null):null;
        if(!selected)return;
        const prefix=selected.id.slice(0,selected.id.lastIndexOf(':')+1);
        const candidates=physical.filter(body=>body.id.startsWith(prefix)).sort((a,b)=>Number(a.id.split(':').at(-1))-Number(b.id.split(':').at(-1)));
        const rear=candidates.at(-1);if(!rear)return;
        evidence?.noteAssistance('qa-train-landing');
        const player=game.player;game.resetInput();game.sound.unlock();
        player.place(rear.x,rear.z,Math.atan2(-rear.hx,-rear.hz),rear.roof);
        // Normal descent and train carry must handle this real roof touchdown.
        player.pos.set(rear.x,rear.roof+1.75,rear.z);player.descending=true;player.vy=0;
        player.group.position.copy(player.pos);contactedCoaches.clear();trainLanding=true;
        game.clock.getDelta();game.engine.renderer.domElement.focus({preventScroll:true});update();
      }):null;
      const stageCustomerCoach=artTrainStaging?button('Land above customer coach (art only)',()=>{
        if(stageCustomerCoach?.disabled)return;
        const target=game.story?.destination;if(!target)return;
        const coach=game.rail.bodies.filter(body=>/^rail:(?:story:)?\d+:\d+$/.test(body.id))
          .reduce<typeof game.rail.bodies[number]|null>((best,body)=>!best||Math.hypot(body.x-target.x,body.z-target.z)<Math.hypot(best.x-target.x,best.z-target.z)?body:best,null);
        if(!coach)return;
        evidence?.noteAssistance('qa-customer-coach-art-staging');
        game.resetInput();game.sound.unlock();const player=game.player;
        player.place(coach.x,coach.z,Math.atan2(-coach.hx,-coach.hz),coach.roof);
        // Review lighting with a real roof descent. This does not qualify as
        // a rear-to-front drive, pickup, handoff, or full-campaign acceptance.
        player.pos.set(coach.x,coach.roof+1.75,coach.z);player.descending=true;player.vy=0;
        player.group.position.copy(player.pos);contactedCoaches.clear();trainLanding=false;
        game.clock.getDelta();game.engine.renderer.domElement.focus({preventScroll:true});update();
      }):null;
      let orbitVehicles: typeof game.traffic.cars = [];
      if(trafficOrbit)button('Stage nearby traffic',()=>{
        const edge=game.graph.nearestEdges(game.player.pos.x,game.player.pos.z,2)[0];if(!edge)return;
        evidence?.noteAssistance('qa-traffic-staging');
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
        evidence?.noteAssistance('qa-drive-reset');
        game.resetInput();game.sound.unlock();game.player.place(start.x,start.z,start.yaw,start.y);
        game.engine.renderer.domElement.focus({preventScroll:true});
      }):null;
      button('Restart scenario', () => location.reload());
      if(reviewLighting)button('Toggle day / night',()=>reviewLighting.toggle());
      button('Hide QA controls', () => {evidence?.hide();if(pickupReadout)panel.hidden=true;else cleanup();});
      panel.addEventListener('pointerdown', event => event.stopPropagation());
      panel.addEventListener('keydown', event => event.stopPropagation());
      panel.append(label, status, buttons); game.hud.root.append(panel);
      const update = () => {
        const blocked = game.relocating || game.choosing || !game.area || game.paused || game.hud.modalOpen || game.hud.rotationBlocked || !!game.map?.open;
        prepare.disabled = fullCampaign || blocked || !game.story?.canPickup;
        if(resetDrive)resetDrive.disabled=blocked;
        if(stageTrain)stageTrain.disabled=blocked||!game.story?.activeOrder||game.rail.bodies.filter(body=>/^rail:(?:story:)?\d+:\d+$/.test(body.id)).length<4;
        if(stageCustomerCoach)stageCustomerCoach.disabled=blocked||!game.story?.activeOrder||!game.rail.bodies.some(body=>/^rail:(?:story:)?\d+:\d+$/.test(body.id));
        const text = game.relocating ? 'Loading through normal area placement…' : fullCampaign ? 'Use normal jump-grab, travel and handoff. Staging is disabled. F4 restores the evidence panel.' : blocked ? 'Resume in landscape to prepare.' :
          game.story?.activeOrder ? 'Order prepared. Scene actions stay manual.' : 'Prepare skips only the pickup for this test.';
        const p=game.player.pos;
        const support=trainRide?movingRailSupport(game.city.movingRail||[],p.x,p.z,p.y-.55):null;
        if(trainLanding&&support&&Math.abs(p.y-.55-support.y)<.25&&/^rail:(?:story:)?\d+:\d+$/.test(support.body.id))contactedCoaches.add(support.body.id);
        const trains=trainRide?game.rail.trains.map(train=>`${train.id}: ${train.cars.filter(car=>car.visible).length}/${train.cars.length} coaches · ${train.run.ways.length} ways · ${Math.round(train.dir>0?train.run.len-train.s:train.s)}m to route end`).join('\n'):'';
        const trainReadout=trainRide?`\nRail contact: ${support&&Math.abs(p.y-.55-support.y)<.25?support.body.id:'air / off train'} · coaches reached: ${[...contactedCoaches].join(', ')||'none'}\nTrain marker: ${game.story?.destination?Math.round(Math.hypot(p.x-game.story.destination.x,p.z-game.story.destination.z))+' m':'no active order'} · car y ${p.y.toFixed(2)}\n${trains}\nActive drive: ${Math.round(game.t)}s · track offset: ${game.city.railway.closest(p.x,p.z,25)?.d.toFixed(2)??'off track'}m`:'';
        const lightingReadout=nightLights?`\n${(game.engine.mood?.lampLights??0)>2?'Night':'Day'} (fixed review lighting) · ${Math.round(Math.abs(game.player.speed)*3.6)} km/h · brake ${game.player.lamps?.braking?'ON':'off'} · reverse ${game.player.lamps?.reversing?'ON':'off'} · real beams ${game.player.lamps?.headlights.filter(l=>l.intensity>0).length??0}+${game.trafficHeadlights?.lights.filter(l=>l.intensity>0).length??0}`:'';
        const routeReadout=query?.get('qaRoute')==='1'?`\nRoute ${game.route?.pts.length??0} / guide ${game.routeGuide.length} / blocked ${game.routeGuidanceBlocked} / player ${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)} / target ${JSON.stringify(game.story?.roadNavigationTarget)}`:'';
        const sceneReadout=query?.get('qaScene')==='1'?`\n${game.story?.controller.state} · scene ${!!game.story?.module} · car ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)} · yaw ${(game.player.yaw*180/Math.PI).toFixed(1)}° · action ${game.story?.module?.status.actionLabel??'-'} · ready ${game.story?.module?.status.canDrop??false}`:'';
        const pickupDiagnostics=pickupReadout?`\nRead-only pickup · F2 hides/shows\nCar ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)} · yaw ${(game.player.yaw*180/Math.PI).toFixed(1)}° · ${(game.player.speed*3.6).toFixed(1)} km/h\n`+game.carriers.markers.map((marker,index)=>{
          const dx=marker.position.x-p.x,dz=marker.position.z-p.z;
          const ahead=-dx*Math.sin(game.player.yaw)-dz*Math.cos(game.player.yaw);
          const right=dx*Math.cos(game.player.yaw)-dz*Math.sin(game.player.yaw);
          return `Slice ${index+1}: ${Math.hypot(dx,dz).toFixed(1)}m · ${ahead.toFixed(1)}m ahead / ${right.toFixed(1)}m right · height ${(marker.position.y-p.y).toFixed(1)}m`;
        }).join('\n'):'';
        const paint=(trainRide||nightLights||query?.get('qaScene')==='1')?gameplayPresentationDiagnostics(game):null;
        const paintReadout=paint?`\nPaint: ${paint.worldPaintBlocked||paint.loading?'BLOCKED':'clear'} · calls ${paint.renderCalls} · canvas ${paint.canvas.width}×${paint.canvas.height}\nDocument: ${paint.documentHidden?'hidden':'visible'} / ${paint.focused?'focused':'unfocused'} · blockers ${paint.blockers.join(', ')||'none'}\nHTML: ${paint.documentClasses||'(none)'} · HUD: ${paint.hudClasses||'(none)'}`:'';
        const readout=text+paintReadout+routeReadout+(orbitVehicles.length?'\nTraffic: '+orbitVehicles.map(c=>`${c.group} ${c.g.visible?'visible':'hidden'}`).join(' · '):'')+(start?`\nDrive: x ${p.x.toFixed(2)}, z ${p.z.toFixed(2)}, y ${p.y.toFixed(2)} · ${Math.round(Math.abs(game.player.speed)*3.6)} km/h · ${game.player.lastKind}`:'')+lightingReadout;
        const nextReadout=readout+trainReadout+sceneReadout+pickupDiagnostics;
        if (status.textContent !== nextReadout) status.textContent = nextReadout;
      };
      const timer = setInterval(update, 250);
      const toggleDiagnostics=(event:KeyboardEvent)=>{if((trainRide||nightLights||pickupReadout)&&event.code==='F2'){panel.hidden=!panel.hidden;event.preventDefault();}};
      addEventListener('keydown',toggleDiagnostics);
      const cleanup = () => { clearInterval(timer); panel.remove(); removeEventListener('pagehide', cleanup); removeEventListener('keydown',toggleDiagnostics); };
      addEventListener('pagehide', cleanup, { once: true }); update();
    },
  };
}
