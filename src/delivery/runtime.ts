import { campaignSession, campaignSpawn } from './campaign';
import type { Game } from '../game/game';
import { DeliveryController } from './systems/delivery-controller';
import { loadLevels } from './content/levels';
import { NavSystem } from './systems/nav-system';
import { DeliveryUI, type DeliveryView, type DeliveryUIActions } from './ui/delivery-ui';
import { createDeliveryModule } from './modules';
import type { DeliveryModule, DeliveryPoint } from './modules/types';
import type { MovingRailBody } from '../game/moving-rail';
import { roofUnder } from '../game/physics';
import type { LevelConfig, StorageLike } from './core/types';
import { projectRailwayRun, type RailwayRun } from '../game/railway-flow';
import { verifiedRailPassages, type VerifiedRailPassage } from './rail-passages';
import { sampleTruckRoute, truckLane } from './truck-route';
import { signedFlightAngle } from '../ui/flight-navigation';

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

type RuntimeUI = Pick<DeliveryUI, 'blocking' | 'collectionOpen' | 'setVisible' | 'update' | 'dispose'>;
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
  private moduleFactory: (name: string) => DeliveryModule;
  private trafficBodies: MovingRailBody[] = [];
  private passageCache: { coach: string; run: RailwayRun; revision: number; offset: number; center: number; candidates: VerifiedRailPassage[]; chosen: VerifiedRailPassage | null } | null = null;

  constructor(private game: Game, options: DeliveryRuntimeOptions = {}) {
    let storage: StorageLike | undefined = options.storage;
    if (!storage) try { storage = window.localStorage; } catch { /* Play remains available without persistent storage. */ }
    const campaign = options.levels ? { levels:options.levels,storage } : campaignSession(loadLevels(),storage);
    this.controller = new DeliveryController(campaign.levels, game.deliveryEvents, campaign.storage);
    this.moduleFactory = options.moduleFactory ?? createDeliveryModule;
    this.ui = (options.uiFactory ?? ((host, actions) => new DeliveryUI(host, actions)))(game.hud.root, {
      call: () => this.act(() => this.controller.call()),
      advanceCall: reply => this.act(() => this.controller.advanceCall(reply)),
      endCall: () => this.act(() => this.controller.endCall()),
      drop: () => { if (this.controller.canDrop && this.module) this.module.onDrop(); this.syncView(); },
      continue: () => { if (this.controller.continueAfterCompletion()) this.clearDelivery(); this.syncView(); },
      bonusCall: () => this.act(() => this.controller.bonusCall()),
      collectionOpen: () => game.resetInput(),
      collectionClose: () => { game.resetInput(); game.clock.getDelta(); game.engine.renderer.domElement.focus({ preventScroll: true }); },
    });
    const events = game.deliveryEvents;
    this.off.push(events.on('orderPicked', () => this.controller.pickup()),
      events.on('locationSet', event => {
        this.setTarget({ ...event.destination, y: event.destination.y ?? 0 }); this.syncView();
      }),
      events.on('callRinging', () => { this.ringingT = 1.4; game.sound.cue('offer'); }),
      events.on('callStarted', () => game.resetInput()),
      events.on('callEnded', () => { game.resetInput(); game.clock.getDelta(); }),
      events.on('setpieceFailed', event => { this.notice = event.reason; this.noticeUntil = this.elapsed + 3; }),
      events.on('levelComplete', () => {
        game.carriers.clear(); game.hud.pickupStatus(false); game.resetInput();
        this.removeModule(); this.setTarget(null); this.syncView();
      }));
    this.syncView();
  }
  startArea() { const target=(this.controller.progress.nextLevel ?? this.controller.levels[this.controller.levels.length-1])?.destination; return target?campaignSpawn(this.game.graph,target):null; }
  get canPickup() { return this.controller.canPickup; }
  get blocking() { return this.ui.blocking; }
  get activeOrder() { return !!this.controller.activeLevel && !this.controller.complete; }
  get supports(): readonly MovingRailBody[] { return this.module?.supports ?? []; }
  get levelLabel() {
    const c = this.controller;
    return `Level ${c.activeLevel?.level ?? c.progress.currentLevel} / ${c.progress.total}`;
  }
  get destination() { return this.target; }
  /** Final metres follow the live scene, which may sit outside the road graph. */
  get localNavigation(): { metres: number; hint: string; bearing: number } | undefined {
    if (this.disposed || !this.activeOrder || !this.target) return;
    const player = this.game.player, arrival = this.module?.arrival;
    const rear = arrival?.side === 'rear' ? arrival : undefined;
    // Arrival anchors the rear-door boundary; the target remains the safe
    // approach point behind its ramp, including before the player calls.
    const target = this.target;
    if (![player.pos.x, player.pos.z, player.yaw, target.x, target.z].every(Number.isFinite)) return;
    const dx = target.x - player.pos.x, dz = target.z - player.pos.z;
    const metres = Math.hypot(dx, dz);
    if (metres > (rear ? 80 : 40)) return;
    let hint = rear ? (this.controller.canDrop ? 'Approach ramp' : 'Approach rear') : 'Approach marker';
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
      this.game.setTarget({ ...target, label, sub: '' }, '#45E3D3');
      this.lastPlan = { ...target, label, time: this.elapsed };
    } else Object.assign(route!, target, { label });
    this.game.beacon?.position.set(target.x, target.y, target.z);
  }
  /** Called before physics: moving supports must have their new pose this frame. */
  beforePlayer(dt: number) {
    if (this.disposed || this.blocking) return;
    dt = Math.max(0, Math.min(.1, Number.isFinite(dt) ? dt : 0));
    this.elapsed += dt;
    const c = this.controller, p = this.game.player;
    if (c.activeLevel && !this.module && !c.complete && c.state !== 'REVEAL' && c.destination &&
      this.elapsed >= this.prepareAfter && Math.hypot(c.destination.x - p.pos.x, c.destination.z - p.pos.z) < 380) {
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
    this.trafficBodies.length = 0;
    for (const body of this.module?.trafficBodies ?? this.module?.supports ?? []) if (body.id === 'delivery-log-truck') this.trafficBodies.push(body);
    this.game.traffic.setKinematicVehicles?.(this.trafficBodies, dt);
    const surfaceApproach=c.activeLevel?.moduleParams.scene==='surfaceEmergence';
    const movement = c.canDrop || surfaceApproach ? this.module?.movement : undefined;
    p.deliveryMotion = movement && movement.mode !== 'normal' && movement.center ? {
      mode: movement.mode, x: movement.center.x, z: movement.center.z, radius: movement.radius ?? 80,
      altitude: movement.mode === 'underwater' ? (movement.center.y - (movement.depth ?? 4)) : (movement.altitude ?? movement.center.y + 3),
    } : undefined;
    if (this.wasDiving && !p.deliveryMotion && p.pos.y < .3) { p.flying = true; p.descending = false; p.altT = 0; }
    this.wasDiving = movement?.mode === 'underwater';
  }
  /** Active time includes reading a call, but excludes map/pause/portrait/background. */
  tick(dt: number, visible: boolean) {
    if (this.disposed) return;
    dt = Math.max(0, Math.min(.1, Number.isFinite(dt) ? dt : 0));
    this.ui.setVisible(visible);
    if (!visible) { this.syncBlocking(); return; }
    if (!this.ui.collectionOpen) {
      const d = this.target ? Math.hypot(this.game.player.pos.x - this.target.x, this.game.player.pos.z - this.target.z) : Infinity;
      const arrival=this.module?.arrival;
      let callDistance=d;
      if(arrival?.side==='rear') { const dx=this.game.player.pos.x-arrival.x,dz=this.game.player.pos.z-arrival.z;
        const behind=dx*arrival.hx+dz*arrival.hz;const side=Math.abs(dx*arrival.hz-dz*arrival.hx);
        callDistance=behind<=2&&side<Math.min(6,arrival.radius)?Math.hypot(dx,dz):Infinity; }
      if(this.controller.activeLevel?.moduleParams.scene==='surfaceEmergence'&&this.game.player.pos.y>8)callDistance=Infinity;
      this.controller.update(dt, callDistance);
      if (this.controller.calls.ringing && (this.ringingT -= dt) <= 0) { this.ringingT = 2.4; this.game.sound.cue('offer'); }
    }
    this.viewTime -= dt;
    if (this.viewTime <= 0 || this.controller.calls.active || this.controller.complete) { this.viewTime = .1; this.syncView(); }
    this.syncBlocking();
  }
  private syncBlocking() {
    const blocked = this.blocking;
    if (blocked !== this.lastUIBlock) {
      this.lastUIBlock = blocked; this.game.resetInput();
      this.game.hud.storyBlocked = blocked;
      if (!blocked && !this.game.paused && !this.game.map?.open && !this.game.hud.rotationBlocked)
        this.game.engine.renderer.domElement.focus({ preventScroll: true });
    }
  }
  private prepareModule() {
    const c = this.controller, level = c.activeLevel!;
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
      const clearStart = route.findIndex((point, index) => {
        if (index >= route.length - 1) return false;
        const next = route[index + 1], n = Math.hypot(next.x - point.x, next.z - point.z) || 1;
        const hx = (next.x - point.x) / n, hz = (next.z - point.z) / n;
        const body: MovingRailBody = { id: 'delivery-log-truck', ...point,
          x: point.x + (interior ? hx * 2 : 0), z: point.z + (interior ? hz * 2 : 0),
          hx, hz,
          bottom: point.y + .2, roof: point.y + roofHeight, halfWidth: interior ? 3 : 1.95, halfLength,
          previous: { ...point, hx: 0, hz: 1 } };
        return this.game.traffic.kinematicPoseClear?.(body) !== false;
      });
      if (clearStart < 0) return;
      if (clearStart) route = route.slice(clearStart);
      Object.assign(destination, route[0]);
    } else if (level.module !== 'underwater' && !train) {
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
    const module = this.moduleFactory(level.module);
    this.module = module; this.selectedTrain = '';
    module.setup({ sceneEvent:(kind)=> { if(this.module===module&&c.activeLevel===level&&c.canDrop&&((kind==='interiorEntered'&&level.moduleParams.scene==='truckInterior')||(kind==='characterEmerged'&&level.moduleParams.scene==='surfaceEmergence')))this.controller.reveals.reveal(c.activeLevel); }, scene: this.game.engine.scene, destination, route,
      canInteract: () => c.canDrop,
      surfaceHeightAt: (x, z) => deliverySurfaceHeight(this.game.city, x, z),
      vehicleSpeedLimit: body => this.game.traffic.kinematicSpeedLimit?.(body, Number(level.moduleParams.speed) || 8) ?? Infinity,
      vehiclePoseClear: body => this.game.traffic.kinematicPoseClear?.(body) !== false,
      player: () => ({ x: this.game.player.pos.x, y: this.game.player.pos.y, z: this.game.player.pos.z,
        yaw: this.game.player.yaw, speed: this.game.player.speed, flying: this.game.player.flying,
        descending: this.game.player.descending, jumping: this.game.player.jumping }),
      existingTrain: () => this.deliveryTrain(destination),
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
        if (this.module === module && !c.complete)
          this.setTarget({ ...point, label: point.label || level.destination.label });
      },
      cue: kind => this.game.sound.cue(kind === 'success' ? 'delivery' : kind === 'retry' ? 'error' : kind === 'throw' ? 'flight' : 'accept'),
      emit: (type, detail) => {
        if (this.module !== module || !c.canDrop) return;
        if (type === 'done') c.setpieceDone(); else c.setpieceFailed(detail?.reason);
      },
    }, level.moduleParams);
  }
  private deliveryTrain(destination: DeliveryPoint): MovingRailBody | null {
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
      level: level?.level ?? c.progress.currentLevel, total: c.progress.total, stage: c.state,
      restaurantStage: c.progress.restaurantIndex, restaurantLabel: c.progress.restaurantStage,
      nav: c.complete ? null : this.nav.update(this.game.player.pos, this.game.player.yaw),
      call: { state: calls.buttonState, label: calls.ringing ? 'Answer' : 'Call' },
      phone: calls.active && line ? { revealed: !!revealed, name: revealed?.name, image: revealed?.image,
        elapsed: calls.elapsed, who: line.who, text: line.text, replies: line.replies, canAdvance: true } : null,
      action: action ? { label: action.actionLabel, enabled: !!this.module,
        hint: action.failure || [action.instruction, action.progress].filter(Boolean).join(' · ') } : null,
      completion: c.complete && level && revealed ? { ...revealed, restaurantLabel: c.progress.restaurantStage,
        final: c.progress.finished, bonusAvailable: !!level.bonusScript?.length } : null,
      collection: c.progress.cards,
      notice: this.noticeUntil > this.elapsed ? this.notice : c.progress.finished && !level ? 'Your restaurant is open. Hyderabad is yours to explore.' : '',
    };
    this.ui.update(view);
    this.game.hud.set('level', this.levelLabel);
  }
  private removeModule() {
    const module = this.module;
    this.module = null; this.selectedTrain = ''; this.wasDiving = false; this.passageCache = null;
    module?.teardown();
    this.trafficBodies.length = 0; this.game.traffic.setKinematicVehicles?.(this.trafficBodies, 0);
    const p = this.game.player;
    if (p.deliveryMotion?.mode === 'underwater' && p.pos.y < .3) { p.flying = true; p.descending = false; p.altT = 0; }
    p.deliveryMotion = undefined;
  }
  private clearDelivery() {
    this.removeModule(); this.setTarget(null); this.notice = ''; this.noticeUntil = 0; this.prepareAfter = 0;
    this.game.carriers.clear(); this.game.pickupDetector.reset(); this.game.hud.pickupStatus(false);
    this.game.resetInput(); this.game.clock.getDelta();
  }
  retry() { this.controller.retry(); this.clearDelivery(); this.syncView(); }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.removeModule(); this.setTarget(null);
    for (const off of this.off) off(); this.off = [];
    this.controller.dispose(); this.ui.dispose(); this.game.hud.storyBlocked = false;
  }
}
