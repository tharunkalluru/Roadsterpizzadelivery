import * as THREE from 'three';
import type { Game } from '../../game/game';
import { movingRailSupport, type MovingRailBody } from '../../game/moving-rail';
import { auditCampaignCharacters } from '../art/campaign-release';
import { CampaignQARecorder, type CampaignQAInput, type CampaignQAMetadata } from './campaign-recorder';
import { campaignScenario } from './campaign-scenarios';
import { createGameplayPerformanceObserver } from './performance-observer';

/** Passive, DEV-only observation. This module is imported only with qaCampaign.
 * It never calls Player.place, controller.pickup, onDrop or setpieceDone. */
export function attachCampaignQA(game: Game, options: { full: boolean; touch: boolean;performance?:boolean;artPreview?:CampaignQAMetadata['artPreview'] }) {
  const levels = game.story!.controller.levels;
  const recorder = new CampaignQARecorder(levels, { mode: options.full ? 'full-campaign' : 'isolated-scene',
    layout: options.touch ? 'touch-layout' : 'desktop', environment: 'Browser development session; hardware unverified',
    timebase:'active-gameplay',initialCompletedIds: game.story!.controller.progress.completedIds,...(options.artPreview?{artPreview:options.artPreview}:{}) }, auditCampaignCharacters(levels),()=>game.t*1000);
  const performanceProbe=options.performance?createGameplayPerformanceObserver(game):null;
  const report=()=>({...recorder.report(),...(performanceProbe?{performance:performanceProbe.report()}: {})});
  const panel = document.createElement('aside'); panel.setAttribute('aria-label', 'Campaign QA evidence');
  panel.style.cssText = 'position:fixed;z-index:30;left:8px;top:8px;width:230px;max-height:45vh;overflow:auto;box-sizing:border-box;padding:8px;background:#20152f;color:#fff1d5;border:1px solid #d8b455;border-radius:10px;font:11px/1.4 system-ui;pointer-events:auto';
  const title = document.createElement('strong'); title.textContent = options.full ? 'Full campaign evidence · no staging' : 'Isolated scene evidence · assisted starts';
  const status = document.createElement('output'); status.style.cssText = 'display:block;white-space:pre-line;margin:4px 0'; status.setAttribute('role', 'status');
  const path = document.createElement('input'); path.placeholder = 'Screenshot path or review note'; path.setAttribute('aria-label', 'QA evidence path or note');
  path.style.cssText = 'width:100%;box-sizing:border-box;font:11px system-ui;margin:3px 0';
  const button = (text: string, act: () => void) => { const el = document.createElement('button'); el.type = 'button'; el.textContent = text;
    el.style.cssText = 'min-height:32px;padding:4px 6px;margin:2px;background:#39264b;color:#fff1d5;border:1px solid #9677ad;border-radius:7px;font:11px system-ui';
    el.addEventListener('click', act); return el; };
  const add = button('Add evidence', () => { if (path.value.trim()) { recorder.evidence(path.value); path.value = ''; } });
  const visual = document.createElement('select'); visual.setAttribute('aria-label', 'Scene visual check'); visual.style.cssText='display:block;width:100%;font:11px system-ui;margin:4px 0';
  const review = button('Record visual check with evidence', () => { if (recorder.reviewVisualCheck(visual.value,path.value)) {path.value='';status.textContent='Visual check recorded; independent character approval is unchanged.';} });
  const save = button('Download evidence JSON', () => {
    const blob = new Blob([JSON.stringify(report(), null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = recorder.runId + '.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const hide = button('Hide (F4 restores)', () => panel.hidden = true);
  panel.append(title, status, path, add, save, hide, visual, review); document.body.append(panel);
  const off: (() => void)[] = [], railContacts = new Set<string>();
  let currentModule: unknown = null, root: THREE.Object3D | null = null, cachedLevel = levels[0], cachedOrigin = new THREE.Vector3();
  let lastFloor: MovingRailBody | null = null, lastCrowdVersion = -1, sawBucketPizza = false, firstMetroStation = '', lastMetroStop = '', metroTrain = '', metroTravel = 0;
  let metroLast: { x: number; z: number } | null = null, openingSince = 0;
  const motionTimes = new Map<string, { time: number; clip: string; duration: number }>();
  const find = (name: string) => root?.getObjectByName(name);
  const locallyVisible = (object: THREE.Object3D | undefined) => {
    if (!object) return false;
    for (let at: THREE.Object3D | null = object; at && at !== game.engine.scene; at = at.parent) if (!at.visible) return false;
    return true;
  };
  function observe() {
    const story = game.story; if (!story) return;
    const module = story.module, active = story.controller.activeLevel, p = game.player;
    if (module && module !== currentModule) {
      currentModule = module; root = game.engine.scene.children.find(child => child.name === 'delivery-setpiece') ?? null;
      if (root) cachedOrigin.copy(root.position); if (active) cachedLevel = active;
    }
    const body = movingRailSupport(game.city.movingRail ?? [], p.pos.x, p.pos.z, p.pos.y - .55);
    const contacting = !p.flying && !p.descending && !p.jumping && body && Math.abs(p.pos.y - .55 - body.y) < .3 ? body.body : null;
    recorder.sample({ x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, speed: p.speed, flying: !!p.flying,
      descending: !!p.descending, jumping: !!p.jumping, placementRevision: p.placementRevision, support: contacting?.id ?? null,
      action: module?.status.actionLabel ?? '', ready: !!module?.status.canDrop, instruction: module?.status.instruction ?? '' });
    if (!recorder.active) return;
    const level = active ?? cachedLevel, facts = recorder.active.facts;
    if (contacting?.id === 'delivery-interior-floor') { recorder.fact('truck-interior-contact'); lastFloor = { ...contacting, previous: { ...contacting.previous } }; }
    const floor = module?.supports.find(body => body.id === 'delivery-interior-floor'); if (floor) lastFloor = { ...floor, previous: { ...floor.previous } };
    if (find('delivery-container-closed-roof')) recorder.fact('container-closed');
    if (module?.supports.some(body => body.id === 'delivery-interior-ramp')) recorder.fact('ramp-open');
    if (contacting && /^rail:/.test(contacting.id)) { railContacts.add(contacting.id); recorder.fact('rail-roof-contact'); if (railContacts.size >= 2) recorder.fact('rail-multiple-coaches'); }
    if (contacting && /^metro:/.test(contacting.id)) {
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
    if (bucket && sawBucketPizza && bucket.position.y >= Number(level.moduleParams.roofHeight ?? 18) - 1.2) recorder.fact('bucket-raised');
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
    if (level.module === 'walkingHandoff' && module?.status.canDrop && Math.abs(p.speed) >= .25) recorder.fact('alongside-movement');
    const crowd = find('delivery-wedding-crowd') as THREE.InstancedMesh | undefined;
    if (crowd) {
      recorder.fact('street-procession'); if (lastCrowdVersion >= 0 && crowd.instanceMatrix.version !== lastCrowdVersion) recorder.fact('crowd-animation'); lastCrowdVersion = crowd.instanceMatrix.version;
    }
    if (level.module === 'angleParking' && module?.status.canDrop) recorder.fact('bay-aligned');
    const doors = root?.children.filter(object => object.name === 'delivery-salaar-sliding-gate') ?? [];
    if (doors.length === 2 && Math.abs(doors[0].position.x - doors[1].position.x) - 10.6 * doors[0].scale.x > 3) recorder.fact('gate-open');
    if (level.moduleParams.theme === 'salaar' && module?.status.canDrop) recorder.fact('courtyard-entry');
    if (level.moduleParams.useExistingStadium && p.lastKind === 'landmark' && !p.flying && !p.descending && !p.jumping) recorder.fact('real-stadium-surface');
    if (level.module === 'beatDrop' && module?.status.canDrop && module.status.timing?.ready) recorder.fact('valid-timing-window');
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
    const opening = document.querySelector('.du-grand-opening');
    if (opening && level.level === levels.length) {
      if (!openingSince) openingSince = performance.now();
      if (opening.getAttribute('data-opening') === 'open' && performance.now() - openingSince > 2200) recorder.fact('final-opening');
    }
  }
  const keyInputs: Record<string, CampaignQAInput> = { KeyW: 'drive', ArrowUp: 'drive', KeyA: 'steer', KeyD: 'steer', ArrowLeft: 'steer', ArrowRight: 'steer',
    Space: 'brake', KeyS: 'reverse', ArrowDown: 'reverse', KeyQ: 'fly', KeyE: 'jump', KeyF: 'handoff', KeyM: 'map', KeyP: 'pause' };
  const controlInputs: Record<string, CampaignQAInput> = { 't-left': 'steer', 't-right': 'steer', 't-gas': 'drive', 't-brake': 'brake', 't-fly': 'fly', 't-jump': 'jump', minimap: 'map', 'b-help': 'pause' };
  const key = (event: KeyboardEvent) => {
    if (event.code === 'F4') { panel.hidden = !panel.hidden; event.preventDefault(); return; }
    if (event.repeat ||event.metaKey||event.ctrlKey||event.altKey|| (event.target as Element | null)?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])')) return;
    const kind = keyInputs[event.code]; if (kind) { observe(); recorder.input(kind, 'keyboard', event.isTrusted); }
  };
  const pointer = (event: PointerEvent) => {
    const element = (event.target as Element | null)?.closest<HTMLElement>('button,[role=checkbox]'); if (!element || panel.contains(element)) return;
    const kind = element.dataset.du === 'drop' ? 'handoff' : controlInputs[element.id]; if (kind) { observe(); recorder.input(kind, event.pointerType, event.isTrusted); }
  };
  document.addEventListener('keydown', key, true); document.addEventListener('pointerdown', pointer, true);
  off.push(game.deliveryEvents.on('locationSet', event => {
    recorder.begin(event.levelId); railContacts.clear(); motionTimes.clear(); currentModule = null; root = null; lastFloor = null; sawBucketPizza = false;
    visual.replaceChildren(...(campaignScenario(event.levelId)?.visualChecks??[]).map(check=>{const option=document.createElement('option');option.value=check;option.textContent=check;return option;}));
    lastCrowdVersion = -1; metroTravel = 0; metroLast = null; metroTrain = ''; firstMetroStation = ''; lastMetroStop = ''; openingSince = 0; observe();
  }), game.deliveryEvents.on('orderPicked', event => recorder.picked(event.carrierId, !!game.player.jumping)),
  game.deliveryEvents.on('setpieceDone', () => observe()),
  game.deliveryEvents.on('levelComplete', event => { observe(); recorder.complete(event.levelId); }),
  game.deliveryEvents.on('setpieceFailed', event => recorder.note('Failed attempt: ' + event.reason)));
  let frame = 0, lastTick = 0, disposed = false;
  const tick = (now: number) => {
    if (disposed) return;
    performanceProbe?.tick(now);
    if (!document.hidden && now - lastTick >= 250) {
      lastTick = now; observe(); const summary = recorder.summary();
      status.textContent = `${summary.completed}/${summary.total} deliveries observed\n${summary.activeLevel ? 'Active level ' + summary.activeLevel + ' · ' + summary.facts + ' scene facts' : 'Waiting for a real pickup'}\n${summary.trustedTouchObserved ? 'Touch input observed; hardware unverified' : 'No true touch input observed'}\nDownload the evidence to review acceptance.`;
    }
    frame = requestAnimationFrame(tick);
  };
  observe(); frame = requestAnimationFrame(tick);
  const dispose = () => { if (disposed) return; disposed = true; cancelAnimationFrame(frame);performanceProbe?.dispose(); off.forEach(remove => remove()); panel.remove();
    document.removeEventListener('keydown', key, true); document.removeEventListener('pointerdown', pointer, true); removeEventListener('pagehide', dispose); };
  addEventListener('pagehide', dispose, { once: true });
  return { noteAssistance: (kind: string) => recorder.noteAssistance(kind), report, hide: () => panel.hidden = true, dispose };
}
