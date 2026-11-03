import * as THREE from 'three';
import type { Game } from '../../game/game';
import { railRoofAt, type MovingRailBody } from '../../game/moving-rail';
import { auditCampaignCharacters } from '../art/campaign-release';
import { CampaignQARecorder, type CampaignQAInput, type CampaignQAMetadata, type CampaignQAStoryObservation } from './campaign-recorder';
import { campaignScenario } from './campaign-scenarios';
import { createGameplayPerformanceObserver } from './performance-observer';

export interface CampaignCartonViewProbe { frustum:THREE.Frustum; projection:THREE.Matrix4; bounds:THREE.Box3 }
export const createCampaignCartonViewProbe=():CampaignCartonViewProbe=>({frustum:new THREE.Frustum(),projection:new THREE.Matrix4(),bounds:new THREE.Box3()});
/** Render-enabled static carton bounds intersecting the actual gameplay
 * camera. This is presence/frustum telemetry, never pixel or occlusion proof. */
export function campaignCartonInView(object:THREE.Object3D|undefined,scene:THREE.Scene,camera:THREE.Camera,probe:CampaignCartonViewProbe){
  if(!object||!camera)return false;
  let attached=false;
  for(let at:THREE.Object3D|null=object;at;at=at.parent){
    if(!at.visible)return false;
    if(at===scene){attached=true;break;}
  }
  if(!attached)return false;
  probe.projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
  if(!probe.projection.elements.every(Number.isFinite))return false;
  probe.frustum.setFromProjectionMatrix(probe.projection);
  let intersects=false;
  object.traverseVisible(node=>{
    if(intersects||!(node instanceof THREE.Mesh)||!camera.layers.test(node.layers))return;
    const materials=Array.isArray(node.material)?node.material:[node.material];
    if(!materials.some(material=>material.visible&&material.opacity>0))return;
    if(!node.geometry.boundingBox)node.geometry.computeBoundingBox();
    const box=node.geometry.boundingBox;if(!box)return;
    probe.bounds.copy(box).applyMatrix4(node.matrixWorld);
    if(!probe.bounds.isEmpty()&&[...probe.bounds.min.toArray(),...probe.bounds.max.toArray()].every(Number.isFinite)&&probe.frustum.intersectsBox(probe.bounds))intersects=true;
  });
  return intersects;
}

/** Passive, DEV-only observation. This module is imported only with qaCampaign.
 * It never calls Player.place, controller.pickup, onDrop or setpieceDone. */
export function attachCampaignQA(game: Game, options: { full: boolean; touch: boolean;performance?:boolean;artPreview?:CampaignQAMetadata['artPreview'] }) {
  const levels = game.story!.controller.levels;
  const recorder = new CampaignQARecorder(levels, { mode: options.full ? 'full-campaign' : 'isolated-scene',
    layout: options.touch ? 'touch-layout' : 'desktop', environment: 'Browser development session; hardware unverified',
    timebase:'active-gameplay',initialCompletedIds: game.story!.controller.progress.completedIds,...(options.artPreview?{artPreview:options.artPreview}:{}) }, auditCampaignCharacters(levels),()=>game.t*1000);
  let performanceProbe:ReturnType<typeof createGameplayPerformanceObserver>|null=null;
  const report=()=>{
    const performance=guard('performance report',()=>performanceProbe?.report());
    return {...recorder.report(),...(performance?{performance}: {})};
  };
  const panel = document.createElement('aside'); panel.setAttribute('aria-label', 'Campaign QA evidence');
  panel.style.cssText = 'position:fixed;z-index:30;left:8px;top:8px;width:230px;max-height:45vh;overflow:auto;box-sizing:border-box;padding:8px;background:#20152f;color:#fff1d5;border:1px solid #d8b455;border-radius:10px;font:11px/1.4 system-ui;pointer-events:auto';
  const title = document.createElement('strong'); title.textContent = options.full ? 'Full campaign evidence · no staging' : 'Isolated scene evidence · assisted starts';
  const status = document.createElement('output'); status.style.cssText = 'display:block;white-space:pre-line;margin:4px 0'; status.setAttribute('role', 'status');
  const updateStatus=()=>{
    const summary=recorder.summary(),failure=summary.lastObserverFailure;
    status.textContent=summary.observerHealthy?
      `${summary.completed}/${summary.total} deliveries observed\n${summary.activeLevel?'Active level '+summary.activeLevel+' · '+summary.facts+' scene facts':'Waiting for a real pickup'}\n${summary.trustedTouchObserved?'Touch input observed; hardware unverified':'No true touch input observed'}\nDownload the evidence to review acceptance.`:
      `QA INVALID · ${summary.observerFailureCount} observer failure(s)\n${failure?.context}: ${failure?.message}\nGameplay continues. This run cannot pass QA; export diagnostics and repeat after repair.`;
  };
  function guard<T>(context:string,action:()=>T):T|undefined{
    try{return action();}catch(error){
      recorder.observerFailed(context,error);
      // A broken diagnostic DOM must not throw again into the game event bus.
      // The recorder's persistent failure still appears in every export.
      try{panel.hidden=false;updateStatus();}catch(displayError){recorder.observerFailed('failure display',displayError);}
      return undefined;
    }
  }
  if(options.performance)performanceProbe=guard('performance initialization',()=>createGameplayPerformanceObserver(game))??null;
  const path = document.createElement('input'); path.placeholder = 'Screenshot path or review note'; path.setAttribute('aria-label', 'QA evidence path or note');
  path.style.cssText = 'width:100%;box-sizing:border-box;font:11px system-ui;margin:3px 0';
  const button = (text: string, act: () => void) => { const el = document.createElement('button'); el.type = 'button'; el.textContent = text;
    el.style.cssText = 'min-height:32px;padding:4px 6px;margin:2px;background:#39264b;color:#fff1d5;border:1px solid #9677ad;border-radius:7px;font:11px system-ui';
    el.addEventListener('click', act); return el; };
  const add = button('Add evidence', () => guard('add evidence',()=>{ if (path.value.trim()) { recorder.evidence(path.value); path.value = ''; } }));
  const visual = document.createElement('select'); visual.setAttribute('aria-label', 'Scene visual check'); visual.style.cssText='display:block;width:100%;font:11px system-ui;margin:4px 0';
  const review = button('Record visual check with evidence', () => guard('visual review',()=>{ if (recorder.reviewVisualCheck(visual.value,path.value)) {path.value='';updateStatus();} }));
  const save = button('Download evidence JSON', () => guard('download evidence',()=>{
    const blob = new Blob([JSON.stringify(report(), null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = recorder.runId + '.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }));
  const hide = button('Hide (F4 restores)', () => panel.hidden = true);
  panel.append(title, status, path, add, save, hide, visual, review); document.body.append(panel);
  const off: (() => void)[] = [], railContacts = new Set<string>();
  let currentModule: unknown = null, root: THREE.Object3D | null = null, cachedLevel = levels[0], cachedOrigin = new THREE.Vector3();
  let lastFloor: MovingRailBody | null = null, sawBucketPizza = false, firstMetroStation = '', lastMetroStop = '', metroTrain = '', metroTravel = 0;
  let metroLast: { x: number; z: number } | null = null, openingSince:number|null=null,openingLast:number|null=null,openingNode:Element|null=null;
  const motionTimes = new Map<string, { time: number; clip: string; duration: number }>();
  const crowdVersions=new Map<string,number>();
  const cartonView=createCampaignCartonViewProbe();
  const find = (name: string) => root?.getObjectByName(name);
  const locallyVisible = (object: THREE.Object3D | undefined) => {
    if (!object) return false;
    for (let at: THREE.Object3D | null = object; at; at = at.parent) {
      if(!at.visible)return false;if(at===game.engine.scene)return true;
    }
    return false;
  };
  const hudVisible=(selector:string)=>{
    const element=document.querySelector<HTMLElement>(selector);if(!element||!document.body.contains(element)||element.hidden||element.closest('[hidden]'))return false;
    const style=getComputedStyle(element),rect=element.getBoundingClientRect();
    return style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)!==0&&rect.width>0&&rect.height>0;
  };
  const finaleOverlay=():HTMLElement|null=>{
    const story=game.story!,active=story.controller.activeLevel,attempt=recorder.active;
    // The final Next deliberately presents the opaque completion dialog while
    // keeping the completed physical scene. Underlying HUD DOM is then shown
    // by the runtime, but it is not gameplay visible through this presentation.
    // No other modal, stale node, early ceremony or transparent panel qualifies.
    if(active?.callMode!=='NONE'||active.id!==levels.at(-1)?.id||attempt?.levelId!==active.id||
      attempt.completedAt===null||!attempt.facts.includes('final-next-requested')||!story.cinematic||
      story.director.phase!=='viewing'||story.controller.state!=='LEVEL_COMPLETE'||!story.controller.progress.finished)return null;
    const opening=document.querySelector<HTMLElement>('.du-grand-opening');
    const sheet=opening?.closest<HTMLElement>('.du-completion[data-du="completion"][data-final="true"]');
    const overlay=sheet?.closest<HTMLElement>('.du-overlay[data-du="overlay"][aria-modal="true"]');
    if(!opening||!sheet||!overlay||!hudVisible('.du-grand-opening')||
      !['closed','lights','doors','open'].includes(opening.getAttribute('data-opening')??''))return null;
    for(let element:HTMLElement|null=opening;element;element=element.parentElement){
      const style=getComputedStyle(element);
      if(element.hidden||style.display==='none'||style.visibility!=='visible'||Number(style.opacity)!==1||
        (style.filter&&style.filter!=='none')||(style.mixBlendMode&&style.mixBlendMode!=='normal'))return null;
      if(element===document.body)break;
    }
    const color=getComputedStyle(overlay).backgroundColor;
    // The shipped opaque color resolves to rgb(); require alpha=1 for rgba().
    if(!/^rgb\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*\)$/.test(color)&&
      !/^rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*1(?:\.0+)?\s*\)$/.test(color))return null;
    const bounds=overlay.getBoundingClientRect(),viewport=document.documentElement;
    if(bounds.left>0||bounds.top>0||bounds.right<viewport.clientWidth||bounds.bottom<viewport.clientHeight)return null;
    return overlay;
  };
  const coveredByFinale=(element:HTMLElement,overlay:HTMLElement)=>{
    const rect=element.getBoundingClientRect(),cover=overlay.getBoundingClientRect();
    if(rect.left<cover.left||rect.top<cover.top||rect.right>cover.right||rect.bottom>cover.bottom||
      typeof document.elementFromPoint!=='function')return false;
    const inset=Math.min(2,rect.width/4,rect.height/4);
    // Confirm actual paint stacking at center and corners. Merely having a
    // full-size modal in the document cannot conceal a control above that modal.
    return [[(rect.left+rect.right)/2,(rect.top+rect.bottom)/2],
      [rect.left+inset,rect.top+inset],[rect.right-inset,rect.top+inset],
      [rect.left+inset,rect.bottom-inset],[rect.right-inset,rect.bottom-inset]]
      .every(([x,y])=>{const top=document.elementFromPoint(x,y);return !!top&&overlay.contains(top);});
  };
  const storyObservation=():CampaignQAStoryObservation=>{
    const story=game.story!,level=story.controller.activeLevel,module=story.module;
    const physicalPizza=['delivery-truck-handoff-pizza','delivery-handoff-pizza','delivery-scene-pizza','delivery-devara-placed-pizza'];
    const finale=finaleOverlay();
    return {levelId:level?.id??null,phase:story.director.phase,captured:story.cinematic,controllerState:story.controller.state,
      modulePresent:!!module&&currentModule===module&&!!root?.children.length,charactersReady:module?.charactersReady!==false,
      sceneVisible:!!root&&locallyVisible(root),visiblePizzaTransfer:physicalPizza.some(name=>campaignCartonInView(find(name),game.engine.scene,game.engine.camera,cartonView)),
      paused:game.paused||game.choosing||!!document.hidden,pauseVisible:hudVisible('#b-help'),nextVisible:hudVisible('[data-du="story-next"]'),
      gameplayVisible:['#minimap','#t-left','#t-right','#t-gas','#t-brake','#t-fly','#t-jump','#flight-navigation','[data-du="drop"]','[data-du="call"]']
        .some(selector=>hudVisible(selector)&&(!finale||!coveredByFinale(document.querySelector<HTMLElement>(selector)!,finale))),
      atDiveSurface:level?.module==='underwater'&&module?.status.actionLabel==='DIVE'&&Math.abs(game.player.pos.y-(level.destination.y??0))<2,
      submerged:level?.module==='underwater'&&game.player.pos.y<(level.destination.y??0)-3.5};
  };
  const observeNext=()=>{
    const story=game.story;if(!story)return;
    const shell=document.getElementById('loading'),p=game.player;
    recorder.observeNext({loading:!!shell&&!shell.hidden&&shell.getAttribute('aria-busy')==='true',relocating:game.relocating,
      oldSceneReleased:!story.module&&(!root||!root.parent),nextLevelId:story.controller.activeLevel?null:story.controller.nextLevel?.id??null,
      paused:game.paused,choosing:game.choosing,x:p.pos.x,y:p.pos.y,z:p.pos.z,placementRevision:p.placementRevision,
      onRoad:p.onRoad&&!p.flying&&!p.descending&&!p.jumping&&!p.glide,surface:p.lastKind});
  };
  function observe(physicalCompletion=false) {
    const story = game.story; if (!story) return;
    const module = story.module, active = story.controller.activeLevel, p = game.player;
    if (module && module !== currentModule) {
      currentModule = module; root = game.engine.scene.children.find(child => child.name === 'delivery-setpiece') ?? null;
      if (root) cachedOrigin.copy(root.position); if (active) cachedLevel = active;
    }
    observeNext();
    const actualSupport=game.railContacts?.supportId;
    const body=actualSupport?(game.city.movingRail??[]).find(body=>body.id===actualSupport):null;
    const roof=body?railRoofAt(body,p.pos.x,p.pos.z):null;
    const contacting = !p.flying && !p.descending && !p.jumping && Math.abs(p.vy)<=.1&&body&&roof!==null&&Math.abs(p.pos.y-.55-roof)<=.2?body:null;
    recorder.sample({ x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, speed: p.speed, flying: !!p.flying,
      descending: !!p.descending, jumping: !!p.jumping, placementRevision: p.placementRevision, support: contacting?.id ?? null,
      action: module?.status.actionLabel ?? '', ready: !!module?.status.canDrop, instruction: module?.status.instruction ?? '' });
    if (!recorder.active) return;
    const level = active ?? cachedLevel, facts = recorder.active.facts;
    if(level.callMode==='NONE')recorder.observeStory(storyObservation());
    const grounded=!p.flying&&!p.descending&&!p.jumping&&Math.abs(p.vy)<=.1;
    if(physicalCompletion&&grounded)recorder.fact('grounded-arrival');
    if (contacting?.id === 'delivery-interior-floor') { recorder.fact('truck-interior-contact'); lastFloor = { ...contacting, previous: { ...contacting.previous } }; }
    const floor = module?.supports.find(body => body.id === 'delivery-interior-floor'); if (floor) lastFloor = { ...floor, previous: { ...floor.previous } };
    if (find('delivery-container-closed-roof')) recorder.fact('container-closed');
    if (module?.supports.some(body => body.id === 'delivery-interior-ramp')) recorder.fact('ramp-open');
    const markedRail=level.callMode!=='NONE'||module?.storyArrivalReady===true;
    if (contacting && /^rail:/.test(contacting.id)&&markedRail) { railContacts.add(contacting.id); recorder.fact('rail-roof-contact'); if (railContacts.size >= 2) recorder.fact('rail-multiple-coaches'); }
    if (contacting && /^metro:/.test(contacting.id)&&markedRail) {
      recorder.fact('metro-roof-contact'); const train = contacting.id.slice(0, contacting.id.lastIndexOf(':'));
      if (!metroTrain) metroTrain = train;
      const stop = game.metro?.stationDwells.find(stop => stop.trainId === train);
      if (stop && !firstMetroStation && !metroLast) firstMetroStation = stop.stationId;
      if (stop) lastMetroStop = stop.stationId;
      if (metroLast && train === metroTrain) metroTravel += Math.hypot(contacting.x - metroLast.x, contacting.z - metroLast.z);
      metroLast = { x: contacting.x, z: contacting.z };
    }
    if (module?.status.instruction.includes('Passengers are stepping') && facts.includes('metro-roof-contact') && metroTravel > 60 && lastMetroStop !== firstMetroStation) recorder.fact('metro-next-station');
    const exitGroup = find('vakeel-platform-group');
    if (exitGroup?.visible && exitGroup.children.length === 4 && module?.status.actionLabel === 'HAND OVER') recorder.fact('four-exit-anchors');
    const bucket = find('delivery-rope-bucket'), pizza = find('delivery-scene-pizza');
    if (bucket && bucket.position.y <= 1.2) recorder.fact('bucket-lowered');
    if (bucket && pizza?.visible && Math.abs(pizza.position.y - bucket.position.y - .23) < .35) { recorder.fact('pizza-in-bucket'); sawBucketPizza = true; }
    const bucketRope=find('delivery-bucket-rope');
    // The fitted roof can differ from the original level data. Read the
    // actual winch/rope endpoint used by the visible bucket mechanism.
    if (bucket && bucketRope&&sawBucketPizza&&Math.abs(bucket.position.y-(bucketRope.position.y+bucketRope.scale.y/2-4.4))<.2) recorder.fact('bucket-raised');
    if(level.module==='underwater'){
      if (p.pos.y < (level.destination.y ?? 0) - 3.5) recorder.fact('submerged-player');
      if (locallyVisible(find('delivery-devara-intact-skeleton'))) recorder.fact('skeleton-scene');
      if (locallyVisible(find('delivery-devara-placed-pizza'))) recorder.fact('pizza-placement');
      if (facts.includes('submerged-player') && p.pos.y >= (level.destination.y ?? 0) - .35) recorder.fact('resurfaced');
    }
    if (find('delivery-haunted-architecture')) recorder.fact('haunted-gate');
    if (find('delivery-college-architecture')) recorder.fact('college-gate');
    if (find('delivery-villa-architecture')) recorder.fact('villa-identity');
    if (find('delivery-medical-classroom-doorway') || find('delivery-medical-college-classroom')) recorder.fact('classroom-doorway');
    if (level.module === 'walkingHandoff' && (module?.status.canDrop||physicalCompletion)&&grounded&&Math.abs(p.speed) >= .25) recorder.fact('alongside-movement');
    const crowd=find('delivery-wedding-crowd');let crowdBatches=0,movingCrowdBatches=0;
    // Current authored crowd is a Group of four actual instanced draws. Older
    // single-mesh crowds also traverse themselves; no Group shape is assumed.
    if(crowd&&locallyVisible(crowd))crowd.traverseVisible(node=>{
      if(!(node instanceof THREE.InstancedMesh)||node.count<1)return;
      const materials=Array.isArray(node.material)?node.material:[node.material];
      if(!materials.some(material=>material.visible&&material.opacity>0))return;
      const version=node.instanceMatrix.version,prior=crowdVersions.get(node.uuid);
      crowdBatches++;if(prior!==undefined&&version!==prior)movingCrowdBatches++;
      crowdVersions.set(node.uuid,version);
    });
    if(crowdBatches)recorder.fact('street-procession');
    if(crowdBatches&&movingCrowdBatches===crowdBatches){
      if(!facts.includes('crowd-animation'))recorder.note(`Wedding procession: all ${crowdBatches} visible instanced batch(es) changed actual instance matrices.`);
      recorder.fact('crowd-animation');
    }
    if (level.module === 'angleParking' && (module?.status.canDrop||physicalCompletion)&&grounded) recorder.fact('bay-aligned');
    const doors = root?.children.filter(object => object.name === 'delivery-salaar-sliding-gate') ?? [];
    if (doors.length === 2 && Math.abs(doors[0].position.x - doors[1].position.x) - 10.6 * doors[0].scale.x > 3) recorder.fact('gate-open');
    if (level.moduleParams.theme === 'salaar' && (module?.status.canDrop||physicalCompletion)&&grounded&&p.pos.z<cachedOrigin.z-8.5*Number(level.moduleParams.sceneScale??1)) recorder.fact('courtyard-entry');
    if (level.moduleParams.useExistingStadium && p.lastKind === 'landmark' && !p.flying && !p.descending && !p.jumping) recorder.fact('real-stadium-surface');
    if (level.module === 'beatDrop' && (module?.status.canDrop||physicalCompletion)&&module?.status.timing?.ready) recorder.fact('valid-timing-window');
    const walkers = new Set<string>();
    root?.traverse(object => {
      // Local art remains explicitly unpublished in report metadata. Observe
      // its actual mixer clock without pretending it has release approval.
      const identity = object.userData.releasedCharacter?.identity ?? (options.artPreview ? object.userData.localCharacterArtPreview?.characterId : undefined), motion = object.userData.authoredMotion;
      if (!identity || !motion?.clip || !Number.isFinite(motion.time) || !(motion.rate > 0)) return;
      const key = identity + ':' + motion.motion, prior = motionTimes.get(key);
      const duration = prior && prior.clip === motion.clip && prior.time !== motion.time ? Math.min(4, prior.duration + .25) : prior?.duration ?? 0;
      motionTimes.set(key, { time: motion.time, clip: motion.clip, duration });
      if (duration < 1.2) return;
      if (identity === 'jessie' && motion.motion === 'walk') recorder.fact('authored-walk');
      if (identity === 'bhanumathi' && motion.motion === 'dance') recorder.fact('authored-dance');
      if (motion.motion === 'walk' && /^vakeel-/.test(identity)) walkers.add(identity);
    });
    for (const identity of ['vakeel-saab', 'vakeel-woman-1', 'vakeel-woman-2', 'vakeel-woman-3']) if ((motionTimes.get(identity + ':walk')?.duration ?? 0) >= 1.2) walkers.add(identity);
    if (walkers.size === 4) recorder.fact('authored-metro-exit');
    if (recorder.active.completedAt !== null && !p.flying && !p.descending && !p.jumping && !recorder.active.inputs.some(input => input.at >= recorder.active!.completedAt! && ['fly', 'jump'].includes(input.kind))) {
      if (level.moduleParams.scene === 'truckInterior' && lastFloor) {
        const dx = p.pos.x - lastFloor.x, dz = p.pos.z - lastFloor.z;
        if (dx * lastFloor.hx + dz * lastFloor.hz < -lastFloor.halfLength - 10.9) recorder.fact('truck-exit');
      }
      if (level.moduleParams.theme === 'salaar') {
        const scale = Number(level.moduleParams.sceneScale ?? 1), extent = Math.abs(Math.cos(p.yaw)) * 2.4 + Math.abs(Math.sin(p.yaw)) * 1.15;
        if (p.pos.z - cachedOrigin.z - extent > 4.5 * scale + 1 && Math.abs(p.pos.x - cachedOrigin.x) < 10 * scale) recorder.fact('compound-exit');
      }
    }
    const opening = document.querySelector('.du-grand-opening'),wall=performance.now();
    const viewingOpening=opening&&hudVisible('.du-grand-opening')&&opening.getAttribute('data-opening')==='open'&&
      active?.id===levels.at(-1)?.id&&story.controller.state==='LEVEL_COMPLETE'&&story.controller.progress.finished&&
      recorder.active.completedAt!==null&&(level.callMode!=='NONE'||facts.includes('final-next-requested'))&&!game.paused&&!game.choosing&&!document.hidden;
    if(viewingOpening){
      // Require continuously sampled, actually shown open UI. A hidden stale
      // innerHTML node, background gap or a long suspended RAF is not exposure.
      if(openingNode!==opening||openingLast===null||wall-openingLast>500)openingSince=wall;
      openingNode=opening;openingLast=wall;
      if(openingSince!==null&&wall-openingSince>2200)recorder.fact('final-opening');
    }else{openingSince=null;openingLast=null;openingNode=null;}
  }
  const keyInputs: Record<string, CampaignQAInput> = { KeyW: 'drive', ArrowUp: 'drive', KeyA: 'steer', KeyD: 'steer', ArrowLeft: 'steer', ArrowRight: 'steer',
    Space: 'brake', KeyS: 'reverse', ArrowDown: 'reverse', KeyQ: 'fly', KeyE: 'jump', KeyF: 'handoff', KeyM: 'map', KeyP: 'pause' };
  const controlInputs: Record<string, CampaignQAInput> = { 't-left': 'steer', 't-right': 'steer', 't-gas': 'drive', 't-brake': 'brake', 't-fly': 'fly', 't-jump': 'jump', minimap: 'map', 'b-help': 'pause' };
  const key = (event: KeyboardEvent) => guard('keyboard input',()=>{
    if (event.code === 'F4') { panel.hidden = !panel.hidden; event.preventDefault(); return; }
    if (event.repeat ||event.metaKey||event.ctrlKey||event.altKey|| (event.target as Element | null)?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])')) return;
    const kind = keyInputs[event.code]; if (kind) { observe(); recorder.input(kind, 'keyboard', event.isTrusted); }
  });
  const pointer = (event: PointerEvent) => guard('pointer input',()=>{
    const element = (event.target as Element | null)?.closest<HTMLElement>('button,[role=checkbox]'); if (!element || panel.contains(element)) return;
    const kind = element.dataset.du === 'drop' ? 'handoff' : controlInputs[element.id]; if (kind) { observe(); recorder.input(kind, event.pointerType, event.isTrusted); }
  });
  document.addEventListener('keydown', key, true); document.addEventListener('pointerdown', pointer, true);
  const next=(event:MouseEvent)=>guard('Next input',()=>{
    const element=(event.target as Element|null)?.closest('[data-du="story-next"]'),story=game.story;
    if(!element||!event.isTrusted||!story||panel.contains(element))return;
    observe();recorder.requestNext(story.controller.progress.nextLevel?.id??null,
      {x:game.player.pos.x,y:game.player.pos.y,z:game.player.pos.z,placementRevision:game.player.placementRevision},true);
  });
  document.addEventListener('click',next,true);
  // A cached preparation can complete between the 250ms samples. Observe the
  // real loading element's changes without replacing/wrapping game methods.
  const loading=document.getElementById('loading');
  const loadingObserver=typeof MutationObserver==='undefined'?null:new MutationObserver(()=>guard('loading observation',observeNext));
  if(loading)loadingObserver?.observe(loading,{attributes:true,attributeFilter:['hidden','aria-busy','data-state']});
  off.push(game.deliveryEvents.on('locationSet', event => guard('event:locationSet',()=>{
    recorder.begin(event.levelId); railContacts.clear(); motionTimes.clear(); currentModule = null; root = null; lastFloor = null; sawBucketPizza = false;
    visual.replaceChildren(...(campaignScenario(event.levelId)?.visualChecks??[]).map(check=>{const option=document.createElement('option');option.value=check;option.textContent=check;return option;}));
    crowdVersions.clear(); metroTravel = 0; metroLast = null; metroTrain = ''; firstMetroStation = ''; lastMetroStop = ''; openingSince = null;openingLast=null;openingNode=null;observe();
  })), game.deliveryEvents.on('orderPicked', event => guard('event:orderPicked',()=>recorder.picked(event.carrierId, !!game.player.jumping))),
  game.deliveryEvents.on('setpieceDone', event => guard('event:setpieceDone',()=>{observe(true);recorder.setpieceFinished(event.levelId,storyObservation());})),
  game.deliveryEvents.on('levelComplete', event => guard('event:levelComplete',()=>{ observe(); recorder.complete(event.levelId); })),
  game.deliveryEvents.on('setpieceFailed', event => guard('event:setpieceFailed',()=>recorder.note('Failed attempt: ' + event.reason))));
  let frame = 0, lastTick = 0, disposed = false;
  const tick = (now: number) => {
    if (disposed) return;
    guard('animation observation',()=>{
      performanceProbe?.tick(now);
      if(!document.hidden&&now-lastTick>=250){lastTick=now;observe();updateStatus();}
    });
    frame = requestAnimationFrame(tick);
  };
  guard('initial observation',observe); frame = requestAnimationFrame(tick);
  const dispose = () => { if (disposed) return; disposed = true; cancelAnimationFrame(frame);performanceProbe?.dispose(); off.forEach(remove => remove()); panel.remove();
    document.removeEventListener('keydown', key, true); document.removeEventListener('pointerdown', pointer, true);document.removeEventListener('click',next,true);loadingObserver?.disconnect();removeEventListener('pagehide', dispose); };
  addEventListener('pagehide', dispose, { once: true });
  return { noteAssistance: (kind: string) => recorder.noteAssistance(kind), report, hide: () => panel.hidden = true, dispose };
}
