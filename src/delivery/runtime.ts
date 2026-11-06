import type { Car } from '../game/traffic';
import { StoryDialogue } from './systems/story-dialogue';
import type { Group } from 'three';
import { prepareCharacterGpu } from './art/gpu-preparation';
import { campaignSession, campaignSpawn } from './campaign';
import type { Game } from '../game/game';
import { DeliveryController } from './systems/delivery-controller';
import { loadLevels } from './content/levels';
import { NavSystem } from './systems/nav-system';
import { DeliveryUI, type DeliveryView, type DeliveryUIActions } from './ui/delivery-ui';
import { createDeliveryModule } from './modules';
import type { DeliveryModule, DeliveryPoint, DeliveryRoadVehicle } from './modules/types';
import type { MovingRailBody } from '../game/moving-rail';
import { roofUnder, supportAt, collideBuildings } from '../game/physics';
import type { LevelConfig, StorageLike } from './core/types';
import { projectRailwayRun, type RailwayRun } from '../game/railway-flow';
import { verifiedRailPassages, type VerifiedRailPassage } from './rail-passages';
import { sampleTruckRoute, truckLane } from './truck-route';
import { truckRearTrafficReservation } from './modules/truck-interior';
import { signedFlightAngle } from '../ui/flight-navigation';
import { resolveDeliveryRoadTarget } from './road-navigation-target';
import { buildRailwayStoryRoute } from '../game/railway-story-route';
import { createGroundScenePlacementJob, groundScenePlacementKey, needsGroundScenePlacement, type GroundScenePlacementJob } from './scene-placement';
import { resolveUppalStadiumDelivery } from './stadium-delivery';
import { prewarmReleasedSceneCharacters, retainSceneCharacters, hasRegisteredSceneCharacters } from './art/scene-character';
import { sceneAssetWindow, characterIdsForLevel } from './art/scene-asset-window';
import { ScenePreparation } from './art/scene-preparation';
import { StoryDirector, stepStoryPose } from './systems/story-director';
import { StoryLandingGate, storyLandingZone, storyLandingMarker } from './systems/story-landing';
import { clearCameraPosition, staticSolidAt } from '../game/spatial-safety';
import type { CityData } from '../world/city';

/** Static support only: a passing train must not move a fixed delivery stage. */
export function deliverySurfaceHeight(city: Game['city'], x: number, z: number) {
  if (![x, z].every(Number.isFinite)) return 0;
  let height = roofUnder({ ...city, movingRail: [] }, [[x, z]]);
  const seen = new Set<unknown>();
  for (let gx = -1; gx <= 1; gx++) for (let gz = -1; gz <= 1; gz++)
    for (const surface of city.surfaceGrid.get(`${Math.floor(x / 30) + gx},${Math.floor(z / 30) + gz}`) || []) {
      if (seen.has(surface)) continue; seen.add(surface);
      const dx = surface.bx - surface.ax, dz = surface.bz - surface.az, length2 = dx * dx + dz * dz;
      if (!(length2 > 0)) continue;
      const t = ((x - surface.ax) * dx + (z - surface.az) * dz) / length2;
      if (t < 0 || t > 1 || Math.hypot(x - surface.ax - t * dx, z - surface.az - t * dz) > surface.hw) continue;
      const top = surface.ya + (surface.yb - surface.ya) * t;
      if (Number.isFinite(top)) height = Math.max(height, top);
    }
  return Number.isFinite(height) ? height : 0;
}

/** Overlapping conservative body cylinders cover the full Roadster,
 * including its front/rear corners. The normal tyre support stays below this
 * body volume; platforms, walls, lifts and current scene solids stay physical.
 * Used only while preparing a bounded authored metro approach, never driving. */
export function deliveryStoryPoseClear(city:CityData&{tiles?:Map<string,unknown>},pose:DeliveryPoint&{yaw:number},solids:readonly MovingRailBody[]=[]):boolean|undefined{
  if(![pose.x,pose.y,pose.z,pose.yaw].every(Number.isFinite))return false;
  const hx=-Math.sin(pose.yaw),hz=-Math.cos(pose.yaw),options={deliverySolids:solids};
  for(const along of [-2.2,-1.7,-1.2,-.7,-.2,.3,.8,1.3,1.8,2.2]){
    const point={x:pose.x+hx*along,y:pose.y+.4,z:pose.z+hz*along};
    if(city.tiles&&!city.tiles.has(`${Math.floor(point.x/1000)}_${Math.floor(point.z/1000)}`))return undefined;
    // The body occupies floor+.10 to floor+1.80. This excludes tyre-floor
    // contact only; no station collider class is removed from the query.
    // .5m spacing and1.2m radius cover the entire4.8×2.3m body
    // rectangle without overestimating its width into the real track guard.
    if(staticSolidAt(city,point,1.2,.85,options))return false;
  }
  return true;
}

type RuntimeUI = Pick<DeliveryUI, 'blocking' | 'collectionOpen' | 'setVisible' | 'update' | 'dispose'> & Partial<Pick<DeliveryUI, 'openCollection'|'setStorySubtitle'>>;
/** Content/adapters are injectable without changing the state machine or gameplay timing. */
export interface DeliveryRuntimeOptions {
  levels?: LevelConfig[];
  storage?: StorageLike;
  uiFactory?: (host: HTMLElement, actions: DeliveryUIActions) => RuntimeUI;
  moduleFactory?: (name: string) => DeliveryModule;
}

/** Adapter only: story systems do not own the city's clock, camera or controls. */
export class DeliveryRuntime {
  readonly controller: DeliveryController;
  readonly nav = new NavSystem();
  readonly ui: RuntimeUI;
  module: DeliveryModule | null = null;
  private off: (() => void)[] = [];
  private selectedTrain = '';
  private storyShuttle = '';
  private storyRun: RailwayRun | null = null;
  private lastUIBlock = false;
  private target: DeliveryPoint | null = null;
  private noticeUntil = 0;
  private notice = '';
  private elapsed = 0;
  private ringingT = 0;
  private wasDiving = false;
  private viewTime = 0;
  private prepareAfter = 0;
  private lastPlan: (DeliveryPoint & { time: number }) | null = null;
  private disposed = false;
  private restarting=false;
  private retainedCompletedScene = false;
  private retainedSceneLevelId:string|null=null;
  private completedScenery:DeliveryModule[]=[];
  private supportBuffer:MovingRailBody[]=[];
  private characterPreparation: ScenePreparation;
  private initialCharacters:Promise<void>=Promise.resolve();
  private characterSelectionCurrent:string|null|undefined;
  private characterSelectionRetained:string|null|undefined;
  private groundPlacement?: { key: string; job: GroundScenePlacementJob };
  private roadTargetCache?: { revision: number; x: number; y: number; z: number; label?:string; offRoad: boolean; roadHeight: number; point: DeliveryPoint | null };
  private moduleFactory: (name: string) => DeliveryModule;
  private trafficBodies: MovingRailBody[] = [];
  private trafficReservations:MovingRailBody[]=[];
  private passageCache: { coach: string; run: RailwayRun; revision: number; offset: number; center: number; candidates: VerifiedRailPassage[]; chosen: VerifiedRailPassage | null } | null = null;
  readonly director = new StoryDirector();
  readonly storyDialogue=new StoryDialogue();
  private showFinale=false;
  private storyPoseReady=false;
  private storyLanding = new StoryLandingGate();
  private storyLandingReady=false;
  private roadCarrierLost=false;
  private roadVehicleSearchAfter=0;
  private roadVehicleWaitSince:number|null=null;
  private roadVehicleView?:{car:Car;view:DeliveryRoadVehicle};
  private roadCarryFrame?:{x:number;y:number;z:number;yaw:number};

  constructor(private game: Game, options: DeliveryRuntimeOptions = {}) {
    let storage: StorageLike | undefined = options.storage;
    if (!storage) try { storage = window.localStorage; } catch { /* Play remains available without persistent storage. */ }
    const campaign = options.levels ? { levels:options.levels,storage } : campaignSession(loadLevels(),storage);
    this.controller = new DeliveryController(campaign.levels, game.deliveryEvents, campaign.storage);
    this.characterPreparation=new ScenePreparation({
      warm:ids=>prewarmReleasedSceneCharacters(ids,this.game.engine.renderer?.compile?this.game.engine:undefined),
      retain:retainSceneCharacters,now:()=>this.elapsed,
      failed:(error,priority)=>{
        if(priority==='current'){this.notice='Preparing delivery characters. Loading will retry shortly.';this.noticeUntil=this.elapsed+5;}
        console.warn(priority==='current'?'Delivery character preparation failed.':'Upcoming delivery character preparation will retry.',error);
      },
    });
    this.moduleFactory = options.moduleFactory ?? createDeliveryModule;
    this.ui = (options.uiFactory ?? ((host, actions) => new DeliveryUI(host, actions)))(game.hud.root, {
      call: () => this.act(() => this.controller.call()),
      advanceCall: reply => this.act(() => this.controller.advanceCall(reply)),
      endCall: () => this.act(() => this.controller.endCall()),
      drop: () => { if (this.controller.canDrop && this.controller.activeLevel?.callMode !== 'NONE' && this.module) this.module.onDrop(); this.syncView(); },
      continue: () => { void this.continueStory(); },
      bonusCall: () => this.act(() => this.controller.bonusCall()),
      collectionOpen: () => game.resetInput(),
      collectionClose: () => { game.resetInput(); game.clock.getDelta(); game.engine.renderer.domElement.focus({ preventScroll: true }); },
    });
    const events = game.deliveryEvents;
    this.off.push(events.on('orderPicked', () => { if(this.canPickup)this.controller.pickup(); }),
      events.on('locationSet', event => {
        game.player.setCarryingPizza?.(true);
        const level = this.controller.activeLevel;
        let destination = { ...event.destination, y: event.destination.y ?? 0 };
        if(level?.module==='rajaAutoDelivery'){const p=this.game.player.pos;destination={...destination,x:p.x,y:p.y-.55,z:p.z};}
        if (level?.moduleParams.nearestMetro) {
          const p=this.game.player.pos;
          const station=[...this.game.zone.metro.stations].sort((a,b)=>Math.hypot(a.p[0]-p.x,a.p[1]-p.z)-Math.hypot(b.p[0]-p.x,b.p[1]-p.z))[0];
          if(station)destination={...destination,x:station.p[0],z:station.p[1],y:this.game.zone.metro.deckHeight+4,label:'Metro · Ride to next station'};
        }
        if (level?.moduleParams.shuttle) {
          this.storyRun=buildRailwayStoryRoute();
          if(this.storyRun){const p=projectRailwayRun(this.storyRun,this.game.player.pos.x,this.game.player.pos.z);destination={...destination,x:p.x,z:p.z,y:p.y+4.2};}
        }
        if(level)level.destination={...destination};
        this.setTarget(destination); this.syncView();
      }),
      events.on('callRinging', () => { this.ringingT = 1.4; game.sound.cue('offer'); }),
      events.on('callStarted', () => game.resetInput()),
      events.on('callEnded', () => { game.resetInput(); game.clock.getDelta(); }),
      events.on('setpieceFailed', event => { this.notice = event.reason; this.noticeUntil = this.elapsed + 3; }),
      events.on('levelComplete', () => {
        game.carriers.clear(); game.player.setCarryingPizza?.(this.controller.activeLevel?.moduleParams.keepPizzaOnCompletion===true); game.hud.pickupStatus(false); game.resetInput();
        this.director.complete();
        this.retainedCompletedScene=this.cinematic||!!this.module?.exitPending;
        this.retainedSceneLevelId=this.retainedCompletedScene?this.controller.activeLevel?.id??null:null;
        if(!this.retainedCompletedScene)this.removeModule(true);
        if(!this.cinematic)this.releaseStoryTrain(); this.setTarget(null); this.syncView();
      }));
    this.syncView();
    this.prepareCharacterWindow(true);
  }
  initialCharacterPreparation(){return this.initialCharacters;}
  prepareCurrentCharacters(){this.prepareCharacterWindow();return this.characterPreparation.retryCurrent();}
  /** Async preparation never advances the simulation or changes the camera. */
  private prepareCharacterWindow(initial=false){
    const current=this.controller.activeLevel??this.controller.nextLevel;
    const currentId=current?.id??null;
    if(currentId===this.characterSelectionCurrent&&this.retainedSceneLevelId===this.characterSelectionRetained&&this.elapsed<this.characterPreparation.nextRetryAt)return;
    this.characterSelectionCurrent=currentId;this.characterSelectionRetained=this.retainedSceneLevelId;
    this.characterPreparation.select(characterIdsForLevel(current),sceneAssetWindow(this.controller.levels,currentId,this.retainedSceneLevelId));
    if(initial)this.initialCharacters=this.characterPreparation.currentPreparation;
  }
  startArea() { const target=(this.controller.nextLevel ?? this.controller.levels[this.controller.levels.length-1])?.destination; return target?campaignSpawn(this.game.graph,target):null; }
  get canPickup() { return this.controller.canPickup&&!this.retainedCompletedScene&&!this.cinematic; }
  get cinematic(){return this.director.captured;}
  get blocking() { return this.ui.blocking; }
  get activeOrder() { return !!this.controller.activeLevel && !this.controller.complete; }
  get supports(): readonly MovingRailBody[] {
    this.supportBuffer.length=0;
    for(const scene of this.completedScenery)this.supportBuffer.push(...scene.supports);
    if(this.module)this.supportBuffer.push(...this.module.supports);
    return this.supportBuffer;
  }
  get levelLabel() {
    const c = this.controller;
    return `Level ${c.activeLevel?.level ?? c.nextLevel?.level ?? c.progress.currentLevel} / ${c.progress.total}`;
  }
  get pauseProgress() {
    const c = this.controller;
    return { current: c.activeLevel?.level ?? c.nextLevel?.level ?? c.progress.currentLevel, total: c.progress.total, completed: c.progress.completedIds.length };
  }
  /** Pause owns the entry point; the collection itself owns blocking/focus. */
  openRestaurant() {
    if (this.disposed || !this.ui.openCollection || this.controller.calls.active || this.controller.complete) return false;
    this.ui.setVisible(true); this.ui.openCollection(); this.syncBlocking();
    return this.ui.collectionOpen;
  }
  get destination() { return this.target; }
  get hideWorldGuidance(){return this.cinematic||this.activeOrder&&!!this.module?.hideWorldGuidance;}
  get cameraFocus(){
    const active=this.module?.cameraFocus;if(active||this.activeOrder)return active;
    // Let a parked player see a receiver settle after Next. The module's own
    // stop/flight/orbit gates still release this view; a new job owns its camera.
    for(let i=this.completedScenery.length-1;i>=0;i--){const focus=this.completedScenery[i].cameraFocus;if(focus)return focus;}
    return undefined;
  }
  get intentionalStop(){
    const p=this.game.player;
    if(p.flying||p.descending||p.jumping||Math.abs(p.speed)>.8)return false;
    return !!(this.module?.intentionalStop||this.module?.status.canDrop||this.completedScenery.some(scene=>scene.intentionalStop));
  }
  get headlightGain(){
    let gain=this.module?.headlightGain??1;
    for(const module of this.completedScenery)gain=Math.min(gain,module.headlightGain??1);
    return Number.isFinite(gain)?Math.max(0,Math.min(1,gain)):1;
  }
  get sceneLamp(){
    const p=this.game.player.pos;let selected=this.module?.sceneLamp;
    let nearest=selected?(selected.position.x-p.x)**2+(selected.position.y-p.y)**2+(selected.position.z-p.z)**2:Infinity;
    for(const module of this.completedScenery){const lamp=module.sceneLamp;if(!lamp)continue;const d=(lamp.position.x-p.x)**2+(lamp.position.y-p.y)**2+(lamp.position.z-p.z)**2;if(d<nearest){selected=lamp;nearest=d;}}
    return selected;
  }
  /** The GPS ends on a real street; the flight marker keeps its actual height. */
  get roadNavigationTarget(): DeliveryPoint | null {
    const target = this.target, level = this.controller.activeLevel;
    if (!this.activeOrder || !target || !level || ![target.x, target.y, target.z].every(Number.isFinite)) return null;
    const movingTrafficStory=['rajaAutoDelivery','induBusDelivery'].includes(level.module);
    const movingRoadVehicle = movingTrafficStory || level.module === 'matchAndLand' && level.moduleParams.vehicle !== 'train' && Number(level.moduleParams.speed) > 0;
    const vehicle = movingRoadVehicle ? (this.module?.trafficBodies ?? this.module?.supports ?? []).find(body => body.id === 'delivery-log-truck') : undefined;
    const offRoad = !movingRoadVehicle, roadHeight = movingTrafficStory ? target.y : offRoad ? 0 : vehicle?.y ?? level.destination.y ?? 0;
    const cache = this.roadTargetCache, revision = this.game.graph.revision;
    if (cache && cache.revision === revision && cache.label === target.label && cache.offRoad === offRoad && Math.abs(cache.roadHeight - roadHeight) < .25 &&
      (offRoad || Math.abs(cache.y - target.y) < .25) && Math.hypot(cache.x - target.x, cache.z - target.z) < 8) return cache.point;
    const point = resolveDeliveryRoadTarget(this.game.graph, target, { offRoad, roadHeight });
    this.roadTargetCache = { revision, x: target.x, y: target.y, z: target.z, label:target.label, offRoad, roadHeight, point };
    return point;
  }
  /** Final metres follow the live scene, which may sit outside the road graph. */
  get localNavigation(): { metres: number; hint: string; bearing: number } | undefined {
    if (this.disposed || !this.activeOrder || !this.target) return;
    const player = this.game.player, arrival = this.module?.arrival;
    const level=this.controller.activeLevel;
    const groundScene=!!level&&(needsGroundScenePlacement(level.module)||level.moduleParams.useExistingStadium===true);
    const rear = arrival?.side === 'rear' ? arrival : undefined;
    // Arrival anchors the rear-door boundary; the target remains the safe
    // approach point behind its ramp, including before the player calls.
    const target = this.target;
    if (![player.pos.x, player.pos.z, player.yaw, target.x, target.z].every(Number.isFinite)) return;
    const dx = target.x - player.pos.x, dz = target.z - player.pos.z;
    const metres = Math.hypot(dx, dz);
    let flyToMarker = false;
    if (!rear && !player.flying && !player.descending && !player.jumping) {
      flyToMarker = metres <= 40 && target.y - player.pos.y > 3;
      if (!flyToMarker && !groundScene && metres > 15) {
        const access = this.roadNavigationTarget;
        flyToMarker = !!access && Math.abs(player.pos.y - .55 - access.y) <= 1.6 &&
          Math.hypot(player.pos.x - access.x, player.pos.z - access.z) <= 12;
      }
    }
    if (metres > (rear ? 80 : 40) && !flyToMarker) return;
    let hint = rear ? (this.controller.canDrop ? 'Approach ramp' : 'Approach rear') : flyToMarker ? 'Fly to marker' : 'Approach marker';
    if(!rear&&this.controller.activeLevel?.moduleParams.scene==='truckInterior')hint=this.module?.status.canDrop?'Hand over pizza':'Ease into position';
    let heading = metres < .01 ? player.yaw : Math.atan2(-dx, -dz);
    const ramp = this.controller.canDrop && rear ? this.module?.supports.find(body => body.id === 'delivery-interior-ramp') : undefined;
    if (ramp && rear && [ramp.x, ramp.z, ramp.hx, ramp.hz, ramp.halfLength, rear.hx, rear.hz].every(Number.isFinite)) {
      const tipX = ramp.x - ramp.hx * ramp.halfLength, tipZ = ramp.z - ramp.hz * ramp.halfLength;
      const tipDX = player.pos.x - tipX, tipDZ = player.pos.z - tipZ;
      const sideOffset = Math.abs(tipDX * rear.hz - tipDZ * rear.hx);
      // Only an aligned rear approach should point along the moving aisle;
      // beside the truck, the arrow must still lead back to its actual ramp.
      if (sideOffset < 1.6 && Math.hypot(tipDX, tipDZ) < 8) {
        hint = 'Drive into truck';
        heading = Math.atan2(-rear.hx, -rear.hz);
      }
    }
    return { metres, hint, bearing: signedFlightAngle(player.yaw - heading) };
  }
  private act(fn: () => unknown) { fn(); this.syncView(); }
  private setTarget(target: DeliveryPoint | null) {
    if (target && ![target.x, target.y, target.z].every(Number.isFinite)) return;
    this.target = target ? { ...target } : null;
    this.nav.set(target ? { ...target, label: target.label || this.controller.destination?.label || 'Delivery location' } : null);
    const route = this.game.routeTarget;
    if (!target) { this.lastPlan = null; if (route) this.game.setTarget(null); return; }
    const label = target.label || this.controller.destination?.label || 'Delivery location';
    const planned = this.lastPlan;
    const moved = planned ? Math.hypot(target.x - planned.x, target.z - planned.z) : Infinity;
    // Beacon/chip/map follow every frame. Rebuilding the road route is bounded;
    // a moving truck must not discard the route mesh every few metres.
    const replan = !route || !planned || planned.label !== label || moved > 250 ||
      Math.abs(target.y - planned.y) > 10 || (this.elapsed - planned.time >= 4 && moved > 12);
    if (replan) {
      this.game.setTarget({ ...target, label, sub: '' }, '#45E3D3', !!route && planned?.label === label);
      this.lastPlan = { ...target, label, time: this.elapsed };
    } else Object.assign(route!, target, { label });
    this.game.beacon?.position.set(target.x, target.y, target.z);
  }
  /** Called before physics: moving supports must have their new pose this frame. */
  beforePlayer(dt: number) {
    if (this.disposed || this.blocking) { this.storyLanding.reset(); this.storyLandingReady=false; return; }
    dt = Math.max(0, Math.min(.1, Number.isFinite(dt) ? dt : 0));
    this.elapsed += dt;
    this.prepareCharacterWindow();
    for(let index=this.completedScenery.length-1;index>=0;index--){
      const scene=this.completedScenery[index];scene.update(dt);
      if(!scene.sceneryPending){scene.teardown();this.completedScenery.splice(index,1);}
    }
    const c = this.controller, p = this.game.player;
    const groundLevel = c.activeLevel;
    if (!this.module && groundLevel && !c.complete && needsGroundScenePlacement(groundLevel.module) && Math.hypot(groundLevel.destination.x - p.pos.x, groundLevel.destination.z - p.pos.z) < 700) {
      const tiles = this.game.city.tiles, revision = tiles ? [...tiles.keys()].sort().join(',') : '';
      const key = groundScenePlacementKey(this.game.city, this.game.graph, groundLevel, revision);
      if (this.groundPlacement?.key !== key) {
        this.groundPlacement?.job.cancel();
        this.groundPlacement = { key, job: createGroundScenePlacementJob(this.game.city, this.game.graph, groundLevel, {
          revision, isLoaded: (x, z) => !tiles || tiles.has(`${Math.floor(x / 1000)}_${Math.floor(z / 1000)}`),
        }) };
      }
      this.groundPlacement.job.step(1.5, 64);
      if (this.groundPlacement.job.done && this.groundPlacement.job.result) this.prepareAfter = 0;
    } else if (this.groundPlacement) { this.groundPlacement.job.cancel(); this.groundPlacement = undefined; }
    if(c.activeLevel?.moduleParams.shuttle&&this.storyRun){
      this.storyShuttle=this.game.rail.ensureStoryShuttle?.(this.storyRun,p.pos)??'';
      const coach=this.storyShuttle?this.game.rail.storyCoach?.(this.storyShuttle,2):null;
      if(coach&&!this.module){c.activeLevel.destination={...c.activeLevel.destination,x:coach.x,y:coach.roof,z:coach.z};this.setTarget(c.activeLevel.destination as DeliveryPoint);}
    }
    if (c.activeLevel && !this.module && !c.complete && c.state !== 'REVEAL' && c.destination &&
      this.elapsed >= this.prepareAfter && (['metroRide','rajaAutoDelivery','induBusDelivery'].includes(c.activeLevel.module)||Math.hypot(c.destination.x - p.pos.x, c.destination.z - p.pos.z) < 380)) {
      this.prepareAfter = this.elapsed + 1;
      try { this.prepareModule(); }
      catch (error) {
        this.removeModule(); this.prepareAfter = this.elapsed + 5;
        this.notice = 'Delivery scene is not ready. Restart this delivery from Pause to retry.';
        this.noticeUntil = this.elapsed + 5;
        console.warn('Delivery scene preparation failed.', error);
      }
    }
    this.module?.update(dt);
    if(this.roadCarrierLost){
      this.roadCarrierLost=false;this.removeModule();this.director.reset();this.storyDialogue.reset();this.ui.setStorySubtitle?.(null);this.storyLanding.reset();
      this.storyPoseReady=false;this.storyLandingReady=false;this.prepareAfter=this.elapsed+.5;
      const p=this.game.player.pos;if(c.activeLevel){c.activeLevel.destination={...c.activeLevel.destination,x:p.x,z:p.z,y:p.y-.55};this.setTarget({...c.activeLevel.destination,y:p.y-.55});}
      this.game.resetInput();this.notice='Finding another nearby delivery vehicle…';this.noticeUntil=this.elapsed+3;this.syncView();return;
    }
    const frame=this.module?.story;
    // Boarding stays manual. Metro establishes its authored frame on the next
    // update, only after a real, settled marked-rake roof contact qualifies.
    const boarding=!frame&&this.module?.storyArrivalReady ? {
      entry:true,point:{x:p.pos.x,y:p.pos.y,z:p.pos.z},
    } : frame;
    const landing=storyLandingZone(boarding);
    // Navigation, the blue ring and capture all use the same safe approach.
    // The module's own target remains the separate physical handoff point.
    if(!this.cinematic&&!c.complete&&c.activeLevel?.callMode==='NONE'&&this.module){
      const navigation=landing?storyLandingMarker(landing):this.module.target;
      this.setTarget({...navigation,label:this.module.target.label||c.activeLevel.destination.label});
    }
    if(!this.cinematic&&c.canDrop&&boarding){
      const physical=supportAt(this.game.city,p.pos.x,p.pos.z,p.pos.y-.55,false);
      this.storyLandingReady=this.storyLanding.update(dt,{...p.pos,yaw:p.yaw,speed:p.speed,
        flying:p.flying,descending:p.descending,jumping:p.jumping,verticalSpeed:p.vy},boarding,
        physical.y,true,p.placementRevision,!!p.glide);
    }else{this.storyLanding.reset();this.storyLandingReady=false;}
    if(this.director.tryStart(frame,c.canDrop&&this.storyLandingReady)){
      this.storyPoseReady=false;
      this.storyDialogue.start(c.activeLevel?.storyScript, c.activeLevel?.storyAudio, this.game.sound);
      this.game.resetInput();this.game.orbitYaw=0;this.game.orbitDist=0;this.game.orbitPitch=.38;
      // Capture happens after the frame's regular UI tick. Hide controls in
      // this same frame, before any cinematic can be rendered or observed.
      this.syncBlocking();
      this.syncView();
    }
    this.module?.setStoryPresentation?.(this.cinematic,landing);
    this.storyDialogue.update(dt,this.cinematic&&!this.director.viewing&&this.module?.storyDialogueReady!==false);
    this.ui.setStorySubtitle?.(this.cinematic&&!this.director.viewing?this.storyDialogue.line:null);
    if(this.director.actionReady(dt,this.storyDialogue.done&&this.storyPoseReady&&!!this.module?.status.canDrop&&c.canDrop))this.module?.onDrop();
    if(this.retainedCompletedScene&&!this.cinematic&&!this.module?.exitPending){this.removeModule(true);this.retainedCompletedScene=false;}
    this.trafficBodies.length = 0;
    for (const body of this.module?.trafficBodies ?? this.module?.supports ?? []) if (body.id === 'delivery-log-truck') this.trafficBodies.push(body);
    for(const scene of this.completedScenery)for(const body of scene.trafficBodies??[])if(body.id==='delivery-log-truck')this.trafficBodies.push(body);
    this.trafficReservations.length=0;
    this.trafficReservations.push(...this.module?.trafficReservations??[]);
    for(const scene of this.completedScenery)this.trafficReservations.push(...scene.trafficReservations??[]);
    this.game.traffic.setKinematicVehicles?.(this.trafficBodies, dt,this.trafficReservations);
    // Automatic stories may assist motion only after the settled arrival.
    // In particular proximity cannot pull a flying car into a truck or lake.
    const movement = this.cinematic || c.canDrop&&c.activeLevel?.callMode!=='NONE' ? this.module?.movement : undefined;
    p.deliveryMotion = movement && movement.mode !== 'normal' && movement.center ? {
      mode: movement.mode, x: movement.center.x, z: movement.center.z, radius: movement.radius ?? 80,
      altitude: movement.mode === 'underwater' ? (movement.center.y - (movement.depth ?? 4)) : (movement.altitude ?? movement.center.y + 3),
    } : undefined;
    if (this.wasDiving && movement?.mode !== 'underwater' && p.pos.y < .3) { p.flying = true; p.descending = false; p.altT = 0; }
    this.wasDiving = movement?.mode === 'underwater';
  }
  /** Apply only authored, local cinematic waypoints after ordinary supports
   * have moved. Ordinary driving/flight/jump and manual boarding stay intact. */
  afterPlayer(dt:number){
    this.roadCarryFrame=undefined;
    if(!this.cinematic||this.director.phase==='transition')return;
    const frame=this.module?.story;if(!frame)return;
    const p=this.game.player,next=stepStoryPose({...p.pos,yaw:p.yaw},frame,dt);if(!next)return;
    const dx=next.x-p.pos.x,dz=next.z-p.pos.z,travel=Math.hypot(dx,dz),turn=Math.atan2(Math.sin(next.yaw-p.yaw),Math.cos(next.yaw-p.yaw));
    const direction=dx*(-Math.sin(next.yaw))+dz*(-Math.cos(next.yaw))>=0?1:-1;
    const pitch=p.group.rotation.x;
    p.pos.set(next.x,next.y,next.z);p.yaw=next.yaw;p.speed=next.speed;p.vy=0;
    p.flying=false;p.descending=false;p.bump=0;p.steerVis=dt>0?Math.max(-1,Math.min(1,turn/(dt*3))):0;p.lastSupport=next.y-.55;p.onRoad=true;
    p.wheelRollers?.forEach(w=>{w.rotation.x-=direction*travel/.35;});
    p.wheels?.forEach((w,i)=>{w.rotation.y=i<2?-p.steerVis*.38:0;});
    p.group.position.copy(p.pos);p.group.rotation.set(frame.water?-.06:pitch,p.yaw,0,'YXZ');
    if(frame.allowMovingEntry)this.roadCarryFrame={...frame.point,yaw:frame.yaw??p.yaw};
    this.storyPoseReady=Math.hypot(next.x-frame.point.x,next.z-frame.point.z)<.25&&Math.abs(next.y-frame.point.y)<.25&&
      (frame.yaw===undefined||Math.abs(Math.atan2(Math.sin(next.yaw-frame.yaw),Math.cos(next.yaw-frame.yaw)))<.14);
  }
  /** New road cinematics inherit this frame's actual traffic transform after
   * its normal tick. Existing driving, railway stories and NPC timing stay in
   * their original order; no second simulation/animation update is performed. */
  afterTraffic(dt:number){
    const before=this.roadCarryFrame;this.roadCarryFrame=undefined;
    if(!before||!this.cinematic||this.director.phase==='transition'||!Number.isFinite(dt)||dt<=0)return;
    const frame=this.module?.story;if(!frame?.allowMovingEntry)return;
    const yaw=frame.yaw??before.yaw;
    if(![frame.point.x,frame.point.y,frame.point.z,yaw].every(Number.isFinite))return;
    const turn=Math.atan2(Math.sin(yaw-before.yaw),Math.cos(yaw-before.yaw)),c=Math.cos(turn),s=Math.sin(turn),p=this.game.player;
    const dx=p.pos.x-before.x,dz=p.pos.z-before.z,oldX=p.pos.x,oldZ=p.pos.z;
    p.pos.set(frame.point.x+dx*c+dz*s,frame.point.y+p.pos.y-before.y,frame.point.z-dx*s+dz*c);
    p.yaw+=turn;p.speed=frame.speed??p.speed;p.lastSupport=p.pos.y-.55;
    const travel=Math.hypot(p.pos.x-oldX,p.pos.z-oldZ),direction=(p.pos.x-oldX)*-Math.sin(p.yaw)+(p.pos.z-oldZ)*-Math.cos(p.yaw)>=0?1:-1;
    p.wheelRollers?.forEach(w=>{w.rotation.x-=direction*travel/.35;});
    if(Math.abs(turn)>1e-6){p.steerVis=Math.max(-1,Math.min(1,turn/(dt*3)));p.wheels?.forEach((w,i)=>{w.rotation.y=i<2?-p.steerVis*.38:0;});}
    p.group.position.copy(p.pos);p.group.rotation.y=p.yaw;
  }
  private async continueStory(){
    const c=this.controller;
    if(this.director.viewing&&c.progress.finished&&!this.showFinale){this.showFinale=true;this.syncView();return;}
    if(this.director.viewing&&!c.progress.finished){
      const spawn=this.startArea();
      if(!spawn){this.game.hud.toast('Preparing a safe road for the next delivery. Try Next again.','teal');return;}
      if(!this.director.next()||!c.continueAfterCompletion())return;
      this.clearDelivery();this.syncView();
      await this.game.relocate(spawn);return;
    }
    const authored=this.cinematic;
    if(c.continueAfterCompletion()){this.clearDelivery(!authored);this.syncView();}
  }
  /** Active time includes reading a call, but excludes map/pause/portrait/background. */
  tick(dt: number, visible: boolean) {
    if (this.disposed) return;
    dt = Math.max(0, Math.min(.1, Number.isFinite(dt) ? dt : 0));
    this.ui.setVisible(visible);
    if (!visible) { this.storyLanding.reset();this.storyLandingReady=false;this.syncBlocking(); return; }
    if (!this.ui.collectionOpen) {
      const d = this.target ? Math.hypot(this.game.player.pos.x - this.target.x, this.game.player.pos.z - this.target.z) : Infinity;
      const arrival=this.module?.arrival;
      let callDistance=d;
      if(arrival?.side==='rear') { const dx=this.game.player.pos.x-arrival.x,dz=this.game.player.pos.z-arrival.z;
        const behind=dx*arrival.hx+dz*arrival.hz;const side=Math.abs(dx*arrival.hz-dz*arrival.hx);
        callDistance=behind<=2&&side<Math.min(6,arrival.radius)?Math.hypot(dx,dz):Infinity; }
      if(this.controller.activeLevel?.moduleParams.scene==='surfaceEmergence'&&this.game.player.pos.y>8)callDistance=Infinity;
      if(this.controller.activeLevel?.callMode==='NONE'&&this.module?.storyArrivalReady)callDistance=0;
      this.controller.update(dt, callDistance);
      if (this.controller.calls.ringing && (this.ringingT -= dt) <= 0) { this.ringingT = 2.4; this.game.sound.cue('offer'); }
    }
    this.viewTime -= dt;
    if (this.viewTime <= 0 || this.controller.calls.active || this.controller.complete) { this.viewTime = .1; this.syncView(); }
    this.syncBlocking();
  }
  private syncBlocking() {
    const blocked = this.blocking||this.cinematic;
    this.game.hud.root?.classList.toggle('story-cinematic',this.cinematic&&!this.showFinale);
    if (blocked !== this.lastUIBlock) {
      this.lastUIBlock = blocked; this.game.resetInput();
      this.game.hud.storyBlocked = blocked;
      if (!blocked && !this.game.paused && !this.game.map?.open && !this.game.hud.rotationBlocked)
        this.game.engine.renderer.domElement.focus({ preventScroll: true });
    }
  }
  private prepareModule() {
    const c = this.controller, level = c.activeLevel!;
    if(hasRegisteredSceneCharacters(characterIdsForLevel(level))&&!this.characterPreparation.ready(characterIdsForLevel(level)))return;
    const destination = { ...level.destination, y: level.destination.y ?? 0 };
    let route: DeliveryPoint[] = [];
    const train = level.module === 'matchAndLand' && level.moduleParams.vehicle === 'train';
    if (level.module === 'matchAndLand' && !train && Number(level.moduleParams.speed) > 0) {
      // Use an actual directed carriageway, keeping the truck out of buildings/medians.
      const interior = level.moduleParams.scene === 'truckInterior', width = interior ? 6 : 3.8, halfLength = interior ? 10 : 5.25;
      let best: any = null, score = Infinity;
      for (const edge of this.game.graph.nearestEdges(destination.x, destination.z, 7)) {
        const direction = edge.e.oneway === 'forward' ? -1 : 1;
        if (edge.len < 70 || truckLane(edge, direction, 0, width) == null) continue;
        for (let s = 10; s < edge.len - 10; s += 20) {
          const at = this.game.graph.pointAt(edge, s, 1), d = Math.hypot(at.x - destination.x, at.z - destination.z);
          if (d < score) { best = { edge, s }; score = d; }
        }
      }
      if (!best || score > 400) return;
      const { edge } = best, dir = edge.e.oneway === 'forward' ? -1 : 1;
      const lane = this.game.traffic.pickLane(edge, width, 'truck', dir);
      // Follow legal, same-grade shared road nodes for up to four kilometres.
      // Finite endpoints still brake; the route never invents a road/U-turn.
      const routeOptions = { width, halfLength, centerOffset: interior ? 2 : 0 };
      const laneRoute = sampleTruckRoute(this.game.graph, edge, dir, lane, routeOptions);
      const centralRoute = edge.e.oneway && Math.abs(lane) > .01
        ? sampleTruckRoute(this.game.graph, edge, dir, 0, routeOptions) : laneRoute;
      // The authored walk-in truck is six metres wide. On a one-way road,
      // keep it away from the outer median wall instead of using the narrow
      // kerb-side preference intended for ordinary NPC trucks.
      const preferCenter = interior && edge.e.oneway && centralRoute.length >= laneRoute.length - 10;
      route = (preferCenter || centralRoute.length > laneRoute.length + 10 ? centralRoute : laneRoute).points;
      if (route.length < 2) return;
      // Do not introduce a new truck through an NPC already occupying the lane.
      const roofHeight = interior ? 5.8 : Number(level.moduleParams.roofHeight) || 2.8;
      // Do not trim a blocked walk-in route down to a few final metres. A
      // real mapped run must remain for the rear gap and ordinary braking;
      // otherwise keep the order and retry placement, never extend/teleport it.
      const remainingRun=new Array<number>(route.length).fill(0);
      for(let i=route.length-2;i>=0;i--)remainingRun[i]=remainingRun[i+1]+
        Math.hypot(route[i+1].x-route[i].x,route[i+1].z-route[i].z);
      const clearStart = route.findIndex((point, index) => {
        if (index >= route.length - 1 || interior&&remainingRun[index]<30) return false;
        const next = route[index + 1], n = Math.hypot(next.x - point.x, next.z - point.z) || 1;
        const hx = (next.x - point.x) / n, hz = (next.z - point.z) / n;
        const body: MovingRailBody = { id: 'delivery-log-truck', ...point,
          x: point.x + (interior ? hx * 2 : 0), z: point.z + (interior ? hz * 2 : 0),
          hx, hz,
          bottom: point.y + .2, roof: point.y + roofHeight, halfWidth: interior ? 3 : 1.95, halfLength,
          previous: { ...point, hx: 0, hz: 1 } };
        return this.game.traffic.kinematicPoseClear?.(body) !== false&&
          (!interior||this.game.traffic.kinematicPoseClear?.(truckRearTrafficReservation(body))!==false);
      });
      if (clearStart < 0) return;
      if (clearStart) route = route.slice(clearStart);
      Object.assign(destination, route[0]);
    } else if (level.module !== 'underwater' && !train) {
      if (level.module === 'beatDrop' && level.moduleParams.theme === 'jersey' && level.callMode === 'NONE') {
        const stadium = resolveUppalStadiumDelivery(this.game.city.landmarkSurfaceGrid, destination);
        if (!stadium) { this.notice = 'Preparing the stadium delivery point…'; this.noticeUntil = this.elapsed + 1.5; return; }
        Object.assign(destination, stadium.destination); level.moduleParams = { ...level.moduleParams, ...stadium.moduleParams };
      } else if (needsGroundScenePlacement(level.module)) {
        const tiles = this.game.city.tiles, revision = tiles ? [...tiles.keys()].sort().join(',') : '';
        const key = groundScenePlacementKey(this.game.city, this.game.graph, level, revision);
        const placement = this.groundPlacement?.key === key && this.groundPlacement.job.done ? this.groundPlacement.job.result : null;
        if (!placement) {
          // beforePlayer already rate-limits this preparation retry to 1 Hz.
          // Unknown/unloaded ground is not an invitation to float a scene over it.
          this.notice = 'Preparing a clear ground approach nearby…'; this.noticeUntil = this.elapsed + 1.5;
          return;
        }
        Object.assign(destination, placement.destination);
        level.moduleParams = { ...level.moduleParams, ...placement.moduleParams };
      } else if(level.module==='cinematicVenue'){
        // Real venue car aprons remain at their researched floor. A portico
        // roof above the entrance cannot lift the whole story onto the roof.
        const city=this.game.city,tiles=city.tiles;
        for(const dx of [-1.4,0,1.4])for(const dz of [-2.6,0,2.6]){
          const x=destination.x+dx,z=destination.z+dz;
          if(tiles&&!tiles.has(`${Math.floor(x/1000)}_${Math.floor(z/1000)}`)||Math.abs(supportAt(city,x,z,destination.y+.12).y-destination.y)>.3||collideBuildings(city,{x,z},.25,destination.y+.15,destination.y+2.7)>0){
            this.notice='Preparing the venue entrance…';this.noticeUntil=this.elapsed+1.5;return;
          }
        }
      } else if(['rajaAutoDelivery','induBusDelivery'].includes(level.module)){
        // Actual traffic supplies its own road height, never a rooftop set.
      } else {
      // Build the fictional delivery set above existing physical roof geometry,
      // never inside a streaming building. Named destinations remain unchanged.
      const hallDepth = Math.max(10, Math.min(30, Number(level.moduleParams.entryDepth) || 14));
      const extent = level.module === 'threadGap' ? { x: 19, z0: -hallDepth - 5, z1: hallDepth + 16 } :
        level.module === 'matchAndLand' ? { x: 14, z0: -12, z1: 12 } :
        level.module === 'beatDrop' && level.moduleParams.theme !== 'eega' ? { x: 48, z0: -49, z1: 49 } :
        { x: 9, z0: -9, z1: 9 };
      let roof = deliverySurfaceHeight(this.game.city, destination.x, destination.z);
      // A one-time footprint scan also protects the flight entrance, where
      // checking only the central marker missed neighbouring building roofs.
      for (let x = -extent.x; x <= extent.x; x += 4) for (let z = extent.z0; z <= extent.z1; z += 4)
        roof = Math.max(roof, deliverySurfaceHeight(this.game.city, destination.x + x, destination.z + z));
      // Police-station facade hangs seven metres below its roof platform.
      const underside = level.module === 'matchAndLand' ? 7.1 : .8;
      destination.y = Math.max(destination.y, roof + underside);
      }
    }
    const module = this.moduleFactory(level.module);
    this.module = module; this.selectedTrain = '';
    const characterIds=characterIdsForLevel(level),renderer=this.game.engine.renderer;
    const prepareCharacterGraphics=hasRegisteredSceneCharacters(characterIds)&&typeof renderer?.compile==='function'&&typeof renderer?.getContext==='function'
      ?async(instance?:Group,valid?:()=>boolean)=>{await prewarmReleasedSceneCharacters(characterIds,this.game.engine);if(instance)await prepareCharacterGpu(instance,this.game.engine,valid);}:undefined;
    module.setup({ sceneEvent:(kind)=> { if(this.module!==module||c.activeLevel!==level)return;
      if(kind==='catchStarted')this.game.player.setCarryingPizza?.(false);
      if(c.canDrop&&((kind==='interiorEntered'&&level.moduleParams.scene==='truckInterior')||(kind==='characterEmerged'&&level.moduleParams.scene==='surfaceEmergence')))this.controller.reveals.reveal(c.activeLevel);
    }, scene: this.game.engine.scene, destination, route,
      canInteract: () => c.canDrop&&(level.callMode!=='NONE'||this.cinematic||this.storyLandingReady), automaticStories:level.callMode==='NONE', storyActive:()=>this.cinematic,
      storyDialogueComplete:()=>this.storyDialogue.done,storySpeechEnvelope:()=>this.storyDialogue.speechEnvelope,
      storySpeaker:()=>this.storyDialogue.line?.who,
      ...(prepareCharacterGraphics?{prepareCharacterGraphics}:{}),
      surfaceHeightAt: (x, z) => deliverySurfaceHeight(this.game.city, x, z),
      cameraPathClear: (from, to) => {
        if(this.module!==module)return false;
        const tiles=this.game.city.tiles;
        // A source platform plan alone cannot certify an unbuilt city tile.
        if(tiles&&[from,to].some(p=>!tiles.has(`${Math.floor(p.x/1000)}_${Math.floor(p.z/1000)}`)))return undefined;
        // Use this frame's module supports, not the camera's previous-frame
        // options. This is a one-time static shot query at a real station.
        const clear=clearCameraPosition(this.game.city,from,to,{deliverySolids:this.supports});
        return Math.hypot(clear.x-to.x,clear.y-to.y,clear.z-to.z)<.01;
      },
      storyPoseClear: pose => this.module===module?deliveryStoryPoseClear(this.game.city,pose,this.supports):false,
      vehicleSpeedLimit: body => this.game.traffic.kinematicSpeedLimit?.(body, Number(level.moduleParams.speed) || 8) ?? Infinity,
      vehiclePoseClear: body => this.game.traffic.kinematicPoseClear?.(body) !== false,
      playerObject:()=>this.game.player.group,
      player: () => ({ x: this.game.player.pos.x, y: this.game.player.pos.y, z: this.game.player.pos.z,
        yaw: this.game.player.yaw, speed: this.game.player.speed, flying: this.game.player.flying,
        descending: this.game.player.descending, jumping: this.game.player.jumping,
        railSupportId: this.game.railContacts?.supportId, verticalSpeed: this.game.player.vy }),
      storyCarrierLost:()=>{if(this.module===module)this.roadCarrierLost=true;},
      releaseRoadVehicle:(id)=>{if(this.game.traffic.storyVehicleLeaseStatus?.(id)!=='none')this.game.traffic.leaseStoryVehicle?.(null);},
      waitingRoadTarget:()=>this.game.traffic.getStoryVehicleCorridor?.()??null,
      existingRoadVehicle:(kind,currentId)=>{
        if(!currentId&&this.elapsed<this.roadVehicleSearchAfter)return null;
        const cars=this.game.traffic.cars;
        let car=currentId?cars.find(c=>c.g.uuid===currentId):undefined;
        if(!currentId){this.roadVehicleSearchAfter=this.elapsed+.5;const player=this.game.player.pos,p=kind==='bus'?destination:player;
          // Indu's service belongs to the Charminar corridor throughout the level.
          if(kind==='bus'&&Math.hypot(player.x-p.x,player.z-p.z)>600)return null;
          // Check only the nearest two viable mapped carriers per search.
          // Full scene-footprint validation must not scan all city traffic in
          // one frame or capture a vehicle whose earlier runway has expired.
          const nearest=cars.filter(c=>c.group===kind&&c.g.parent&&Math.hypot(c.x-p.x,c.z-p.z)<260&&this.game.traffic.canHostStoryVehicle?.(c)!==false)
            .sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z));
          car=nearest.slice(0,2).find(c=>this.game.traffic.canEnterStoryVehicle?.(c)!==false);
          if(!car){this.roadVehicleWaitSince??=this.elapsed;if(this.elapsed-this.roadVehicleWaitSince>=8)car=this.game.traffic.ensureStoryVehicle?.(kind,p.x,p.z)??undefined;}
        }
        if(car)this.roadVehicleWaitSince=null;
        if(!car||car.group!==kind||!car.g.parent)return null;
        this.game.traffic.leaseStoryVehicle?.(car.g.uuid);
        if(this.roadVehicleView?.car!==car){
          const selected=car,traffic=this.game.traffic;
          this.roadVehicleView={car,view:{id:car.g.uuid,group:car.g,size:car.size,
            get x(){return selected.x;},get y(){return selected.y;},get z(){return selected.z;},
            get hx(){return selected.hx;},get hz(){return selected.hz;},get speed(){return selected.speed;},
            get approachValid(){return !selected.arcadeFlight&&(traffic.canEnterStoryVehicle?.(selected)??traffic.storyApproachLaneClear?.(selected)??true);}}};
        }
        return this.roadVehicleView.view;
      },
      existingTrain: exactBodyId => exactBodyId ? this.game.rail?.bodies?.find(body=>body.id===exactBodyId)??null : this.deliveryTrain(destination),
      trainBodies:()=>this.game.rail?.bodies??[],
      metroService: () => ({ bodies: this.game.metro?.bodies ?? [], dwells: this.game.metro?.stationDwells ?? [] }),
      trainPassage: () => this.trainPassage(),
      clearanceAt: point => {
        let lowest = Infinity;
        for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++)
          for (const s of this.game.city.surfaceGrid.get(`${Math.floor(point.x / 30) + x},${Math.floor(point.z / 30) + z}`) || []) {
            const dx = s.bx - s.ax, dz = s.bz - s.az, t = Math.max(0, Math.min(1, ((point.x - s.ax) * dx + (point.z - s.az) * dz) / (dx * dx + dz * dz || 1)));
            const y = s.ya + (s.yb - s.ya) * t;
            if (Math.hypot(point.x - s.ax - dx * t, point.z - s.az - dz * t) < s.hw && y > point.y + 1) lowest = Math.min(lowest, y - .9);
          }
        return Number.isFinite(lowest) ? lowest : null;
      },
      onTarget: point => {
        // Teardown may synchronously follow done(). Ignore a late callback from
        // an old module so it cannot revive a completed delivery's map target.
        if (this.module === module && c.activeLevel===level && !c.complete && (level.callMode!=='NONE'||this.cinematic))
          this.setTarget({ ...point, label: point.label || level.destination.label });
      },
      cue: kind => {if(kind==='throw'){this.notice='';this.noticeUntil=0;}this.game.sound.cue(kind === 'success' ? 'delivery' : kind === 'retry' ? 'error' : kind === 'throw' ? 'flight' : 'accept');},
      emit: (type, detail) => {
        if (this.module !== module || !c.canDrop) return;
        if (type === 'done') {
          if (level.storyAudio && (!this.cinematic || !this.storyDialogue.done)) return;
          c.setpieceDone();
        } else c.setpieceFailed(detail?.reason);
      },
    }, level.moduleParams);
  }
  private deliveryTrain(destination: DeliveryPoint): MovingRailBody | null {
    if(this.controller.activeLevel?.moduleParams.shuttle){
      // A busy corridor can postpone the story shuttle. An unrelated nearby
      // train must never become the delivery target while that booking retries.
      const coach=this.storyShuttle?this.game.rail.storyCoach?.(this.storyShuttle,2)??null:null;
      this.selectedTrain=coach?.id??'';
      return coach;
    }
    const metro=this.controller.activeLevel?.module==='metroRide';
    if(metro){
      const p=this.game.player.pos,coach=this.game.metro?.storyBoardingBody?.(this.selectedTrain,p.x,p.z)??null;
      this.selectedTrain=coach?.id??'';return coach;
    }
    const bodies = this.game.rail.bodies;
    let best = bodies.find(body => body.id === this.selectedTrain);
    if (!best) {
      let distance = 650;
      for (const body of bodies) {
        const d = Math.hypot(body.x - destination.x, body.z - destination.z);
        if (d < distance) { best = body; distance = d; }
      }
      if (this.selectedTrain && !best) this.setTarget(destination);
      this.selectedTrain = best?.id || '';
    }
    return best ?? null;
  }
  private trainPassage() {
    const coach = this.game.rail.bodies.find(body => body.id === this.selectedTrain);
    const train = this.game.rail.trains?.find(item => coach?.id.startsWith(`${item.id}:`));
    if (!coach || !train || !this.controller.canDrop) return null;
    let cache = this.passageCache;
    if (!cache || cache.coach !== coach.id || cache.run !== train.run || cache.revision !== this.game.graph.revision ||
      Math.abs(train.s - cache.offset - cache.center) > 500) {
      // A connected railway run can span the whole city. Discover only a
      // bounded window ahead of this coach, never scan the whole run per frame.
      const center = projectRailwayRun(train.run, coach.x, coach.z).s;
      const range = { min: Math.max(0, center - (train.dir < 0 ? 2000 : 100)),
        max: Math.min(train.run.len, center + (train.dir > 0 ? 2000 : 100)) };
      const roads = new Map<string, import('../world/types').RoadEdge>();
      train.run.pts.forEach((point, index) => {
        if (train.run.cum[index] < range.min - 30 || train.run.cum[index] > range.max + 30) return;
        for (const edge of this.game.graph.nearestEdges(point[0], point[2], 1)) if (edge.e.elev) roads.set(edge.e.id, edge.e);
      });
      cache = this.passageCache = { coach: coach.id, run: train.run, revision: this.game.graph.revision,
        offset: train.s - center, center,
        candidates: verifiedRailPassages(train.run, [...roads.values()], coach.roof - coach.y, range), chosen: null };
    }
    const s = train.s - cache.offset;
    if (cache.chosen && (cache.chosen.s - s) * train.dir < -cache.chosen.radius - 20) cache.chosen = null;
    if (!cache.chosen) cache.chosen = cache.candidates
      .map(passage => ({ passage, ahead: (passage.s - s) * train.dir }))
      .filter(item => item.ahead > item.passage.radius + 40 && item.ahead < 1400)
      .sort((a, b) => a.ahead - b.ahead)[0]?.passage ?? null;
    const passage = cache.chosen;
    return passage ? { ...passage, trainId: coach.id, distanceAhead: (passage.s - s) * train.dir } : null;
  }
  private syncView() {
    const c = this.controller, calls = c.calls, level = c.activeLevel, revealed = c.reveals.current;
    const line = calls.currentLine;
    const action = c.canDrop ? this.module?.status ?? {
      actionLabel: 'PREPARING', instruction: 'Preparing the mapped delivery scene', canDrop: false,
    } : null;
    const view: DeliveryView = {
      level: level?.level ?? c.nextLevel?.level ?? c.progress.currentLevel, total: c.progress.total, stage: c.state,
      restaurantStage: c.progress.restaurantIndex, restaurantLabel: c.progress.restaurantStage,
      nav: c.complete ? null : this.nav.update(this.game.player.pos, this.game.player.yaw),
      call: { state: calls.buttonState, label: calls.ringing ? 'Answer' : 'Call' },
      phone: calls.active && line ? { revealed: !!revealed, name: revealed?.name, image: revealed?.image,
        elapsed: calls.elapsed, who: line.who, text: line.text, replies: line.replies, canAdvance: true } : null,
      // Arrival owns the interaction now. No manual drop, dive, or handover
      // button competes with driving or the authored sequence.
      action: level?.callMode==='NONE'||this.cinematic?null:action?{label:action.actionLabel,enabled:!!this.module&&this.module.charactersReady!==false,
        hint:action.failure||[action.instruction,action.progress].filter(Boolean).join(' · ')}:null,
      story: this.cinematic&&!this.showFinale?{viewing:this.director.viewing}:null,
      completion: c.complete && (!this.cinematic||this.showFinale) && level && revealed ? { ...revealed, restaurantLabel: c.progress.restaurantStage,
        final: c.progress.finished, bonusAvailable: !!level.bonusScript?.length } : null,
      collection: c.progress.cards,
      noticeContext:this.retainedCompletedScene&&!c.complete?'scene-exit':undefined,
      notice: this.retainedCompletedScene&&!c.complete?(this.module?.status.actionLabel==='EXIT TRUCK'?'Reverse down the ramp':this.module?.status.instruction||'Leave the delivery scene'):this.noticeUntil > this.elapsed ? this.notice : !c.nextLevel && !level ? 'Your restaurant is open. Hyderabad is yours to explore.' : '',
    };
    this.ui.update(view);
    this.game.hud.set('level', this.levelLabel);
    this.game.hud.pickupHintVisible?.(!!(level || c.nextLevel));
  }
  private removeModule(preserveScenery=false) {
    this.groundPlacement?.job.cancel(); this.groundPlacement = undefined;
    const module = this.module;
    this.game.traffic.leaseStoryVehicle?.(null);this.roadVehicleWaitSince=null;this.roadVehicleSearchAfter=0;this.roadVehicleView=undefined;this.roadCarryFrame=undefined;
    this.module = null; this.retainedCompletedScene=false; this.retainedSceneLevelId=null; this.selectedTrain = ''; this.wasDiving = false; this.passageCache = null;
    if(preserveScenery&&module?.sceneryPending){
      this.completedScenery.push(module);
      // Authored deliveries are kilometres apart. Keep a small, bounded return
      // view without retaining an entire campaign's geometry and textures.
      if(this.completedScenery.length>2)this.completedScenery.shift()!.teardown();
    }else module?.teardown();
    this.trafficBodies.length = 0;this.trafficReservations.length=0; this.game.traffic.setKinematicVehicles?.(this.trafficBodies, 0,this.trafficReservations);
    const p = this.game.player;
    if (p.deliveryMotion?.mode === 'underwater' && p.pos.y < .3) { p.flying = true; p.descending = false; p.altT = 0; }
    p.deliveryMotion = undefined;
  }
  private releaseStoryTrain(){this.game.rail?.clearStoryShuttle?.();this.storyShuttle='';this.storyRun=null;}
  private clearDelivery(preserveExit=false) {
    this.director.reset();this.storyDialogue.reset();this.ui.setStorySubtitle?.(null);this.storyLanding.reset();this.storyLandingReady=false;this.showFinale=false;this.storyPoseReady=false;
    if(!preserveExit||!this.retainedCompletedScene||!this.module?.exitPending)this.removeModule(preserveExit);
    if(!preserveExit){for(const scene of this.completedScenery)scene.teardown();this.completedScenery=[];}
    this.releaseStoryTrain(); this.setTarget(null); this.notice = ''; this.noticeUntil = 0; this.prepareAfter = 0;
    this.game.carriers.clear(); this.game.player.setCarryingPizza?.(false); this.game.pickupDetector.reset(); this.game.hud.pickupStatus(false);
    this.game.resetInput(); this.game.clock.getDelta();
    this.prepareCharacterWindow();
  }
  retry() { this.controller.retry(); this.clearDelivery(); this.syncView(); }
  async restartCurrentLevel(selectedId?: string){
    if(this.restarting||this.disposed)return;
    const level = selectedId === undefined
      ? this.controller.activeLevel ?? this.controller.nextLevel ?? this.controller.levels.at(-1)
      : this.controller.levels.find(candidate => candidate.id === selectedId);
    if (!level) return;
    const spawn=campaignSpawn(this.game.graph, selectedId === undefined ? this.module?.target ?? level.destination : level.destination);
    if(!spawn){this.game.hud.toast('Preparing a safe road for this delivery. Try again.','teal');return;}
    this.restarting=true;
    try{
      this.controller.selectLevel(level.id);this.clearDelivery();this.syncView();
      // relocate() performs ordinary retry cleanup too; the explicit queued
      // replay survives it and supplies the correct assets under the loader.
      await this.game.relocate(spawn);
    }finally{this.restarting=false;}
  }
  /** Explicit campaign restart clears unlocks/cards and every active interaction. */
  startFromLevelOne() { this.controller.reset(); this.clearDelivery(); this.syncView(); }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.storyDialogue.reset(); this.characterPreparation.dispose();this.removeModule();for(const scene of this.completedScenery)scene.teardown();this.completedScenery=[]; this.releaseStoryTrain(); this.setTarget(null);retainSceneCharacters([]);
    this.game.player.setCarryingPizza?.(false);
    for (const off of this.off) off(); this.off = [];
    this.controller.dispose(); this.ui.dispose(); this.game.hud.storyBlocked = false;
    this.game.hud.root?.classList.remove('story-cinematic');
  }
}
