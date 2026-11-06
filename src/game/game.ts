import { applySceneLamp } from './scene-lamp-pool';
import { roadNavigationCue } from '../ui/flight-navigation';
import { showLoading, hideLoading, loadingRetry } from '../ui/loading';
import { frameTakeoff } from './kickflip-camera';
import { installCameraLook } from './camera-look';
import { speedCameraDistance, speedCameraFov, DRIVING_CAMERA, drivingCameraLookAhead, drivingCameraHeight, drivingCameraAimWeight } from './camera';
import { CameraTranslationFollow } from './camera-translation';
import * as THREE from 'three';
import type { Engine } from '../core/engine';
import type { CoreData, CityPoi, XZ } from '../world/types';
import type { World, LoadedTile } from '../world/world';
import { hasCentreMedian } from '../world/city';
import { moodAt } from '../core/sky';
import { rng } from '../core/util';
import { Player, Input } from './player';
import { RoadGraph, GEdge, RoadRoute } from './roadgraph';
import { launchPreparedGame } from './startup-readiness';
import { advanceRoadRoute, clearRoadGuidance, guidanceRibbon, navigationReadout, softenRoadCorners } from './route-guidance';
import { metroCorridors, metroRuntimeStations } from '../world/metro-geometry';
import { Traffic } from './traffic';
import { trafficPopulationLimit } from './traffic-density';
import { TrafficHeadlights } from './traffic-headlights';
import { vehicleDarkness, stepSceneHeadlightGain } from './player-lights';
import { Hud, orderOfferHtml } from '../ui/hud';
import { eligiblePickup } from './pickups';
import { FullMap } from '../ui/map';
import { railwayMapLayer, drawRailways } from '../ui/railway-map';
import { strokeMinimapRoute, drawMinimapPlayer, MINIMAP_NAVIGATION } from '../ui/minimap-navigation';
import { AreaPicker, AreaChoice } from '../ui/areapicker';
import { TitleScreen, goFullscreen, exitFullscreen, isFullscreen, fullscreenFallbackHtml } from '../ui/title';
import { loadSettings, saveSettings, settingsHtml, bindSettings, Settings, levelPickerHtml, pauseMenuHtml } from '../ui/settings';
import { paintDiagnostics, graphicsDiagnostics } from '../ui/paint-safety';
import { Walkers } from './walkers';
import { MetroTrains } from './metro';
import { MetroStationLife } from './station-life';
import { CampusProximity } from '../world/destination-proximity';
import { BugReporter, GAME_BUILD, gameCoordinates, gameScreenshot, reportObservations, type BugContext } from './bug-report';
import { DESTINATION_IDENTITIES } from '../world/destination-data';
import { RailTrains } from './rail';
import { MovingRailInteraction } from './moving-rail';
import { RailRiderClearance,type RiderEnvelope,type RiderPoint } from './rail-rider-clearance';
import { prepareNativeSoffitTileSteps,LoadedNativeSoffits,type NativeSoffitTile } from './rail-rider-native-soffits';
import { measureRailRiderEnvelope, railRiderEnvelopeAtPose } from './rail-rider-car-envelope';
import { RailwayCrossings, buildRailwayCrossingSites, type RailwayCrossingSite, type RailwayRoadUser } from './railway-crossings';
import { RailwayCrossingGates } from '../world/railway-crossing-gates';
import { railwayNetwork } from '../world/railway-geometry';
import { runningRailwayTracks } from './running-railway-tracks';
import { RailTrackFallback } from '../world/rail-track-fallback';
import { fetchPack } from '../world/packs';
import type { BusFeed } from './bus-services';
import { AirportAircraft } from '../world/airport-aircraft';
import { Sound } from './audio';
import { supportAt } from './physics';
import { findClearStreetSpot, findClearRecoverySpot, staticSolidAt, clearCameraPosition, type CameraCollisionOptions } from './spatial-safety';
import { EventBus, type DeliveryEvents } from '../delivery/core/events';
import { CarrierMarker } from '../delivery/systems/carrier-marker';
import { PickupDetector, type JumpPickupPose } from '../delivery/systems/pickup-detector';
import { pickupPathClear } from '../delivery/systems/pickup-clearance';
import { DeliveryRuntime, type DeliveryRuntimeOptions } from '../delivery/runtime';
import type { StorageLike } from '../delivery/core/types';

// the city opens up as you level: early orders stay in the neighbourhood, later ones cross Hyderabad
const LEVELS = [
  { n: 3, dmin: 150, dmax: 500 }, { n: 4, dmin: 300, dmax: 750 }, { n: 5, dmin: 450, dmax: 1000 },
  { n: 6, dmin: 600, dmax: 1400 }, { n: 8, dmin: 800, dmax: 2000 }, { n: 8, dmin: 1500, dmax: 3500 }, { n: 10, dmin: 2500, dmax: 6000 },
];
const DAY_SECONDS = 600;                    // one in-game day = 10 real minutes
const SAVE_KEY = 'p2ph-save-v1';
const TUT_KEY = 'p2ph-tutorial-v1';
const AREA_KEY = 'p2ph-area-v1';
const PICKUP_TUT_KEY = 'roadster-carrier-tutorial-v1';

interface Stop { x: number; z: number; y: number; label: string; sub: string }
interface Order { id?: string; pickup: Stop; drop: Stop; pickupName: string; dist: number; limit: number; t: number; state: 'offer' | 'toPickup' | 'toDrop'; heat: number; slices: number }
function fmtTime(min: number) { const h = Math.floor(min / 60) % 24, m = Math.floor(min % 60); const ap = h >= 12 ? 'PM' : 'AM'; return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${ap}`; }

export class Game {
  // Isolated mystery-delivery branch. Legacy saves/dispatch remain dormant.
  readonly carrierPickupMode = true;
  story?: DeliveryRuntime;
  readonly deliveryEvents = new EventBus<DeliveryEvents>();
  carriers!: CarrierMarker;
  pickupDetector!: PickupDetector;
  private carrierSpawnT = 0;
  private carrierView = { cameraX:0,cameraY:0,cameraZ:0, forwardX: 0, forwardZ: -1, jumping: false, airborne: false };
  private cameraCollisionOptions: CameraCollisionOptions = {};
  private pickupBefore: JumpPickupPose = { x: 0, y: 0, z: 0, bottom: 0, top: 0, jumping: false };
  private pickupAfter: JumpPickupPose = { x: 0, y: 0, z: 0, bottom: 0, top: 0, jumping: false };
  railContacts = new MovingRailInteraction();
  private railRiderClearance=new RailRiderClearance();
  private railRiderEnvelope:RiderEnvelope;
  private railSoffitTiles=new Map<string,NativeSoffitTile>();
  private railSoffitJobs=new Map<string,{tile:LoadedTile;steps:Generator<void,NativeSoffitTile,void>}>();
  private railSoffitPumpQueued=false;
  private railSoffitRevision:string;
  private railSoffitRequiresFittedIdentity=false;
  private railSoffitGeometry:LoadedNativeSoffits|null=null;
  private railSoffitEmptySize=-1;
  private railRiderWarned=false;
  railTrackFallback?: RailTrackFallback;
  trafficHeadlights?: TrafficHeadlights;
  railwayCrossings?: RailwayCrossings;
  railwayGates?: RailwayCrossingGates;
  private crossingSites = new Map<string,RailwayCrossingSite>();
  private crossingRoadIds = new Set<string>();
  private crossingRoadUsers: RailwayRoadUser[] = [];
  aircraft!: AirportAircraft;
  stationLife!: MetroStationLife;
  bugReports: BugReporter | null = null;
  metro!: MetroTrains; rail!: RailTrains; player!: Player; graph!: RoadGraph; traffic!: Traffic; hud!: Hud; walkers!: Walkers; map: FullMap | null = null; sound = new Sound();
  orbitYaw = 0; orbitPitch = 0.38; orbitDist = 0; dragging = false; halted = false;
  airOrbitPitch = .62; airOrbitDist = 0;
  private releaseCameraLook?: () => void;
  keys = new Set<string>(); flyQueued = false; jumpQueued = false; actHeld = false; actTap = 0;
  coins = 500; level = 0; doneInLevel = 0; streak = 1; totalDelivered = 0;
  acceptingOrders = true;
  day = 1; minutes = 8 * 60; paused = false;
  order: Order | null = null; actProgress = 0;
  private offerSequence = 0;
  private tipWasOpen = false;
  nextOfferAt: number | null = null;
  rotationWasBlocked = false;
  private mapKeyboardOpener = false;
  route: RoadRoute | null = null; routeT = 0; routeTarget: Stop | null = null;
  routeGuidanceBlocked = false;
  routeGraphRevision = -1; routeGuideT = 0; routeAlpha = 0; routeWasAirborne = false; routePlacementRevision = -1;
  routeGuide: [number, number, number][] = [];
  gps = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: new THREE.Color('#45E3D3').multiplyScalar(1.4), transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false }));
  beacon!: THREE.Group;
  camPos = new THREE.Vector3(); camLook = new THREE.Vector3(); clock = new THREE.Clock(); t = 0; moodT = 0;
  cameraPlacementRevision = -1;
  private cameraTranslation?: CameraTranslationFollow;
  private focusTranslation?: CameraTranslationFollow;
  private lastCameraSpeaker?:'customer'|'player';
  private focusTranslationOwner?: object;
  r = rng(Date.now() & 0xffff); food: (CityPoi & { s: Stop })[] = []; residences: Stop[] = [];
  constructor(public engine: Engine, public zone: CoreData, public city: World, public opts: {
    lowQ: boolean; still?: boolean; delivery?: DeliveryRuntimeOptions;
    sessionStorage?: StorageLike; initialArea?: AreaChoice; touchControls?: boolean;
  }) {
    this.graph = new RoadGraph(zone.roads, []);
    this.player = new Player(city, engine.mats);
    this.railRiderEnvelope=measureRailRiderEnvelope(this.player);
    const fittedIdentity=(city as World&{candidateRoadIdentity?:unknown}).candidateRoadIdentity;
    this.railSoffitRequiresFittedIdentity=fittedIdentity!==undefined;
    this.railSoffitRevision=JSON.stringify(fittedIdentity??{sourceRoadGeometryGeneration:zone.sourceRoadGeometryGeneration??'legacy-live-source',sourceInputVariantPreparationGeneration:(zone as CoreData&{sourceInputVariantPreparationGeneration?:string}).sourceInputVariantPreparationGeneration??null});
    this.player.addTo(engine.scene);
    this.traffic = new Traffic(this.graph, engine.scene, engine.mats, trafficPopulationLimit(opts.lowQ,0,.75), city.busStops, city);
    this.trafficHeadlights = new TrafficHeadlights(engine.scene, opts.lowQ);
    this.carriers = new CarrierMarker(engine.scene);
    this.pickupDetector = new PickupDetector(this.deliveryEvents);
    this.deliveryEvents.on('orderPicked', event => {
      if(this.carriers.collect(event.carrierId, this.player.group))this.player.setCarryingPizza(true);
      this.sound.cue('flight'); this.sound.cue('pickup');
      this.hud?.pickupStatus(true);
    });
    void fetchPack<BusFeed>('transit/tgsrtc.pack.wasm').then(feed => {
      if (Math.abs(feed.origin.lat - zone.origin.lat) < 1e-7 && Math.abs(feed.origin.lon - zone.origin.lon) < 1e-7) this.traffic.setBusFeed(feed);
      else console.warn('Bus route coordinates do not match this city.');
    }).catch(error => console.warn('Published bus routes could not load; city buses remain unavailable.', error));
    this.metro = new MetroTrains(zone.metro as any, { body: engine.mats.vBody, lights: engine.mats.vLight }); engine.scene.add(this.metro.group);
    this.stationLife = new MetroStationLife(zone.metro, engine.mats.vBody, { lowQ: opts.lowQ, isStationLoaded: station => city.tiles.has(`${Math.floor(station.p[0] / 1000)}_${Math.floor(station.p[1] / 1000)}`) }); engine.scene.add(this.stationLife.group);
    this.rail = new RailTrains(engine.mats.vBody); engine.scene.add(this.rail.group);
    this.railTrackFallback = new RailTrackFallback(city.railway || railwayNetwork(), { st: engine.mats.st, foot: engine.mats.foot }, { lowQ: opts.lowQ });
    engine.scene.add(this.railTrackFallback.group);
    this.railwayCrossings = new RailwayCrossings([]);
    this.rail.setCrossings(this.railwayCrossings); this.traffic.setRailwayCrossings(this.railwayCrossings);
    this.addRailwayCrossings(zone.roads);
    this.railwayGates = new RailwayCrossingGates(this.railwayCrossings); engine.scene.add(this.railwayGates.group);
    this.railwayCrossings.onHorn = event => {
      const c=this.engine.camera,dx=event.x-c.position.x,dz=event.z-c.position.z,distance=Math.hypot(dx,dz);
      const right=new THREE.Vector3().setFromMatrixColumn(c.matrixWorld,0);
      this.sound.trainHorn(distance,(dx*right.x+dz*right.z)/Math.max(8,distance));
    };
    this.aircraft = new AirportAircraft(zone.origin, { lowQ: opts.lowQ }); engine.scene.add(this.aircraft.group);
    this.traffic.onHorn = (kind, x, z) => {
      const c = this.engine.camera, dx = x - c.position.x, dz = z - c.position.z;
      const right = new THREE.Vector3().setFromMatrixColumn(c.matrixWorld, 0);
      this.sound.horn(kind, Math.hypot(dx, dz), (dx * right.x + dz * right.z) / Math.max(8, Math.hypot(dx, dz)), Math.random() < 0.4);
    };
    this.walkers = new Walkers(city, engine.mats.vBody, opts.lowQ ? 24 : 60, (x, z, hx, hz) => {
      // at a signal, people cross while the traffic on this road has red
      const n = this.graph.nearestNode(x, z);
      if (!n || !n.signal || Math.hypot(n.x - x, n.z - z) > 30) return true;
      return !this.traffic.green(n, hx, hz);
    });
    engine.scene.add(this.walkers.group);
    this.gps.renderOrder = 3; this.gps.frustumCulled = false; engine.scene.add(this.gps);
    this.beacon = this.makeBeacon(); engine.scene.add(this.beacon);
    this.prepareStops();
    // Streamed tiles add their streets, footpaths and bus stops as they arrive.
    for (const t of city.tiles.values()) this.tileAdded(t, false);
    city.onTileAdded = (t) => this.tileAdded(t, true);
    city.onTileRemoved = (t) => this.tileRemoved(t);
  }
  tileAdded(t: LoadedTile, paths: boolean) {
    // Cold once per actual native tile, never from a gameplay frame scan.
    const tileIdentity=(t.built as typeof t.built&{candidateRoadIdentity?:unknown}).candidateRoadIdentity;
    if(this.railSoffitRequiresFittedIdentity&&JSON.stringify(tileIdentity)!==this.railSoffitRevision){
      this.railSoffitTiles.delete(t.key);console.error('Train roof clearance awaits matching city geometry.',t.key);
    }else{this.railSoffitJobs.set(t.key,{tile:t,steps:prepareNativeSoffitTileSteps(t.built,this.railSoffitRevision)});this.queueSoffitPreparation();}
    this.railSoffitGeometry=null;
    this.graph.addRoads(t.built.roads, t.built.signals);
    this.addRailwayCrossings(t.built.roads);
    this.traffic.setBusStops(this.city.busStops);
    if (paths) this.walkers.addPaths(t.built.walkPaths);
  }
  tileRemoved(t: LoadedTile) {
    this.railSoffitJobs.delete(t.key);
    this.railSoffitTiles.delete(t.key);this.railSoffitGeometry=null;
    const gone = this.graph.removeRoads(t.built.roads.map((e) => e.id));
    for(const edge of gone)this.crossingRoadIds?.delete(edge.e.id);
    if(this.railwayCrossings){let changed=false;for(const [id,site] of this.crossingSites)if(!this.graph.byId.has(site.roadId)){this.crossingSites.delete(id);changed=true;}if(changed)this.railwayCrossings.setSites([...this.crossingSites.values()]);}
    this.traffic.dropEdges(gone);
    this.graph.forgetSignals(t.built.signals);
    this.traffic.setBusStops(this.city.busStops);
    this.walkers.removePaths(t.built.walkPaths);
  }
  private queueSoffitPreparation(){
    if(this.railSoffitPumpQueued||!this.railSoffitJobs.size)return;
    this.railSoffitPumpQueued=true;
    // Chunk cold preparation between frames. Never publish partial geometry,
    // and never do a whole 100ms dense-tile scan in a tile-added callback.
    setTimeout(()=>{
      this.railSoffitPumpQueued=false;const started=performance.now();
      while(this.railSoffitJobs.size&&performance.now()-started<2){
        const[key,job]=this.railSoffitJobs.entries().next().value;
        if(this.city.tiles.get(key)!==job.tile){this.railSoffitJobs.delete(key);continue;}
        try{
          const next=job.steps.next();
          if(next.done){this.railSoffitJobs.delete(key);this.railSoffitTiles.set(key,next.value);this.railSoffitGeometry=null;}
        }catch(error){
          this.railSoffitJobs.delete(key);this.railSoffitTiles.delete(key);this.railSoffitGeometry=null;
          console.error('Could not prepare safe train roof clearance.',key,error);
        }
      }
      this.queueSoffitPreparation();
    },8);
  }
  private riderGeometry(){
    if(!this.railSoffitGeometry||this.railSoffitEmptySize!==this.city.empty.size){
      this.railSoffitEmptySize=this.city.empty.size;
      this.railSoffitGeometry=new LoadedNativeSoffits(this.railSoffitRevision,this.railSoffitTiles.values(),this.city.empty);
    }
    return this.railSoffitGeometry;
  }
  private guardRoofRiderPose(start:RiderPoint){
    if(!this.railRiderClearance.active)return;
    const p=this.player,end={x:p.pos.x,y:p.pos.y,z:p.pos.z};
    const envelope=this.riderEnvelope();
    const limit=this.railRiderClearance.guardRelativeMotion(this.riderGeometry(),start,end,envelope,p.airborne||p.takeoffAnimating);
    if(limit.fraction>=1)return;
    const x=start.x+(end.x-start.x)*limit.fraction,z=start.z+(end.z-start.z)*limit.fraction;
    // Horizontal GO may be stopped at the launch boundary while a deliberate
    // takeoff still climbs in the clear space behind it. Validate that entire
    // vertical sweep separately; freezing Y together with GO would deadlock
    // the very manual escape this safety stop is intended to provide.
    const vertical=this.railRiderClearance.guardRelativeMotion(this.riderGeometry(),{x,y:start.y,z},{x,y:end.y,z},envelope,p.airborne||p.takeoffAnimating);
    p.pos.set(x,start.y+(end.y-start.y)*vertical.fraction,z);
    const dx=p.pos.x-end.x,dy=p.pos.y-end.y,dz=p.pos.z-end.z;
    for(const visual of[p.group,p.glow,p.light]){visual.position.x+=dx;visual.position.y+=dy;visual.position.z+=dz;}
    p.speed=0;p.vy=0;
  }
  private riderEnvelope(){return railRiderEnvelopeAtPose(this.railRiderEnvelope,this.player,!!this.railContacts.supportId?.startsWith('rail:'));}
  private addRailwayCrossings(roads: import('../world/types').RoadEdge[]) {
    if(!this.railwayCrossings)return;
    const fresh=roads.filter(r=>this.graph.byId.has(r.id)&&!this.crossingRoadIds.has(r.id));
    if(!fresh.length)return;
    for(const road of fresh)this.crossingRoadIds.add(road.id);
    let changed=false;
    for(const site of buildRailwayCrossingSites(fresh,this.city.railway?.profiles||railwayNetwork().profiles))if(!this.crossingSites.has(site.id)){this.crossingSites.set(site.id,site);changed=true;}
    if(changed)this.railwayCrossings.setSites([...this.crossingSites.values()]);
  }
  private updateRailwayCrossings(dt:number) {
    if(!this.railwayCrossings)return;
    const cars=this.traffic.cars,player=this.player,grounded=!player.airborne;
    const count=cars.length+(grounded?1:0);
    while(this.crossingRoadUsers.length<count)this.crossingRoadUsers.push({x:0,y:0,z:0});
    this.crossingRoadUsers.length=count;
    cars.forEach((c,i)=>{const u=this.crossingRoadUsers[i];u.x=c.x;u.y=c.y;u.z=c.z;u.hx=c.hx;u.hz=c.hz;u.halfLength=c.size[2]/2;u.halfWidth=c.size[0]/2;});
    if(grounded){const u=this.crossingRoadUsers[count-1],f=player.forward;u.x=player.pos.x;u.y=player.pos.y-.55;u.z=player.pos.z;u.hx=f.x;u.hz=f.z;u.halfLength=2.4;u.halfWidth=1.1;}
    this.railwayCrossings.update(dt,this.rail.approaches,this.crossingRoadUsers);
    this.city.railwayWalls=this.railwayCrossings.barriers;
    this.railwayGates?.update(player.pos.x,player.pos.z);
  }

  // ---------- world points ----------
  roadPointNear(x: number, z: number, toward?: XZ): Stop | null {
    let best: { x: number; z: number; y: number; e: GEdge; d: number } | null = null;
    for (const g of this.graph.nearestEdges(x, z, 1)) {
      if (['service', 'living_street'].includes(g.e.cls) && g.e.w < 5) continue;
      const P = g.e.pts;
      for (let i = 0; i < P.length - 1; i++) {
        const dx = P[i + 1][0] - P[i][0], dz = P[i + 1][1] - P[i][1], L2 = dx * dx + dz * dz || 1;
        const u = Math.max(0, Math.min(1, ((x - P[i][0]) * dx + (z - P[i][1]) * dz) / L2));
        const px = P[i][0] + dx * u, pz = P[i][1] + dz * u, d = Math.hypot(px - x, pz - z);
        const y = g.e.elev ? g.e.elev[i] + (g.e.elev[i + 1] - g.e.elev[i]) * u : 0;
        if (y > 1) continue;
        if (!best || d < best.d) best = { x: px, z: pz, y, e: g, d };
      }
    }
    if (!best || best.d > 60) return null;
    let { x: px, z: pz } = best;
    if (toward) { const vx = toward[0] - px, vz = toward[1] - pz, L = Math.hypot(vx, vz) || 1; const off = Math.min(best.e.e.w / 2 - 1.2, L); if (off > 0) { px += (vx / L) * off; pz += (vz / L) * off; } }
    return { x: px, z: pz, y: best.y, label: best.e.e.name || '', sub: '' };
  }
  areaName(x: number, z: number) {
    // nearest named neighbourhood (Overture divisions); metro stations as a fallback
    let best = '', bd = 1e9;
    for (const p of this.zone.places || []) {
      if (/^Ward \d+/.test(p.name) || p.name === 'Hyderabad' || p.name === 'Greater Hyderabad') continue;
      const d = Math.hypot(p.p[0] - x, p.p[1] - z) * (p.kind === 'locality' ? 1.25 : 1);
      if (d < bd) { bd = d; best = p.name; }
    }
    if (best) return best;
    for (const s of metroRuntimeStations(this.zone.metro.stations)) { const d = Math.hypot(s.p[0] - x, s.p[1] - z); if (d < bd) { bd = d; best = s.name; } }
    return best;
  }
  prepareStops() {
    const toStop = (st: [number, number, number, string], label: string, sub: string): Stop => ({ x: st[0], z: st[1], y: st[2], label, sub });
    // a "shop" whose board is only a place name ("RTC X Roads") is a mis-tagged listing, not a kitchen
    const placeNames = new Set(this.zone.places.map((p) => p.name.toLowerCase()).concat(['rtc x roads', 'rtc cross roads', 'hyderabad', 'secunderabad']));
    for (const f of this.zone.food) if (eligiblePickup(f, placeNames)) this.food.push({ ...f, s: toStop(f.stop, f.board, f.stop[3] ? `on ${f.stop[3]}` : '') });
    for (const d of this.zone.drops) this.residences.push(toStop(d, '', d[3]));
  }
  makeBeacon() {
    const g = new THREE.Group();
    const col = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 60, 24, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color('#FFB627').multiplyScalar(1.6), transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    col.position.y = 30; g.add(col);
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.2, 4.2, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color('#FFB627').multiplyScalar(1.8), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.2; g.add(ring);
    g.visible = false; (g as any).col = col; (g as any).ring = ring;
    return g;
  }

  // ---------- persistence ----------
  save() {
    // The new progression will get its own versioned save in Step 4. Never
    // overwrite the player's existing game progress with pickup-preview state.
    if (this.carrierPickupMode) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ coins: this.coins, level: this.level, doneInLevel: this.doneInLevel, day: this.day, minutes: this.minutes, total: this.totalDelivered, acceptingOrders: this.orderOffersEnabled })); } catch { /* storage unavailable */ }
  }
  load() {
    if (this.carrierPickupMode) return;
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (!s || typeof s !== 'object' || Array.isArray(s)) return;
      const num = (v: unknown, fallback: number, min: number, max: number, integer = true) =>
        typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max && (!integer || Number.isInteger(v)) ? v : fallback;
      this.coins = num(s.coins, 500, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
      this.level = num(s.level, 0, 0, LEVELS.length - 1);
      this.doneInLevel = num(s.doneInLevel, 0, 0, this.level === LEVELS.length - 1 ? Number.MAX_SAFE_INTEGER : LEVELS[this.level].n - 1);
      this.day = num(s.day, 1, 1, Number.MAX_SAFE_INTEGER);
      this.minutes = num(s.minutes, 480, 0, 1439.999999, false);
      this.totalDelivered = num(s.total, 0, 0, Number.MAX_SAFE_INTEGER);
      this.acceptingOrders = this.totalDelivered < 1 || s.acceptingOrders !== false;
      // Older saves may contain cinema leases. Delivery progress and the saved
      // balance remain valid; obsolete lease data is deliberately ignored.
    } catch { /* corrupt or blocked storage: start fresh */ }
  }

  // ---------- orders ----------
  get ordersUnlocked() { return this.totalDelivered >= 1; }
  private get orderOffersEnabled() { return !this.carrierPickupMode && (!this.ordersUnlocked || this.acceptingOrders); }
  private updateOrderAvailability() {
    if (this.carrierPickupMode) { this.hud?.carrierPickupMode(); return; }
    this.hud?.orderAvailability({ unlocked: this.ordersUnlocked, accepting: this.orderOffersEnabled, activeOrder: !!this.order && this.order.state !== 'offer' });
  }
  setAcceptingOrders(accepting: boolean) {
    if (this.carrierPickupMode) return;
    if (!this.ordersUnlocked || typeof accepting !== 'boolean' || accepting === this.acceptingOrders) return;
    this.acceptingOrders = accepting;
    if (!accepting) {
      this.nextOfferAt = null;
      if (this.order?.state === 'offer') {
        this.order = null; this.hud.offer(null); this.resetInput();
        this.engine.renderer.domElement.focus({ preventScroll: true });
      }
    } else if (!this.order) this.queueOffer(0);
    this.save(); this.updateHud();
  }
  makeOffer(): Order | null {
    const L = LEVELS[Math.min(this.level, LEVELS.length - 1)];
    const px = this.player.pos.x, pz = this.player.pos.z;
    let near: typeof this.food = [];
    for (const R of [380, 800, 1600, 3200, 8000]) { near = this.food.filter((f) => { const d = Math.hypot(f.s.x - px, f.s.z - pz); return d > 40 && d < R; }); if (near.length >= 3) break; }
    const pool = near.length ? near : this.food;
    const pizzaFirst = pool.filter((f) => f.pizza);
    const choices = pizzaFirst.length && this.r() < 0.45 ? pizzaFirst : pool;
    const pick = choices[Math.floor(this.r() * choices.length)];
    if (!pick) return null;
    const p = pick.s;
    const drops = this.residences.filter((d) => { const dd = Math.hypot(d.x - p.x, d.z - p.z); return dd > L.dmin && dd < L.dmax; });
    if (!drops.length) return null;
    const d = drops[Math.floor(this.r() * drops.length)];
    const rt = this.graph.route(p.x, p.z, d.x, d.z, undefined, d.y, p.y);
    const dist = rt ? rt.len : Math.hypot(d.x - p.x, d.z - p.z) * 1.3;
    const drop: Stop = { ...d, label: `Home in ${this.areaName(d.x, d.z)}`, sub: d.label ? `off ${d.label}` : '' };
    const pickup: Stop = { ...p, label: pick.board, sub: p.sub };
    const id = `PZ-${String(this.totalDelivered + ++this.offerSequence).padStart(4, '0')}`;
    return { id, pickup, drop, pickupName: pick.name, dist, limit: dist / 7 + 45, t: 0, state: 'offer', heat: 100, slices: 8 };
  }
  queueOffer(delayMs: number, now = performance.now()) {
    if (!this.orderOffersEnabled) { this.nextOfferAt = null; return; }
    this.nextOfferAt = now + delayMs;
  }
  tickOfferQueue(now = performance.now()) {
    if (!this.orderOffersEnabled) { this.nextOfferAt = null; return; }
    if (this.nextOfferAt == null) return;
    if (this.order) { this.nextOfferAt = null; return; }
    // Keep a due offer pending while any overlay owns input. Resume/map close
    // will service it on the next frame rather than discard a one-shot timer.
    if (now < this.nextOfferAt || document.hidden || this.paused || this.hud.modalOpen || this.hud.tipOpen || this.hud.rotationBlocked || this.map?.open || this.choosing || this.relocating) return;
    this.showOffer();
    if (!this.order) this.nextOfferAt = now + 1000; // bounded retry if no valid route could be generated
  }
  showOffer() {
    if (this.carrierPickupMode) { this.order = null; this.nextOfferAt = null; return; }
    // A delayed offer callback must not replace an accepted delivery or appear over area selection.
    if (!this.orderOffersEnabled || document.hidden || this.paused || this.hud.modalOpen || this.hud.tipOpen || this.hud.rotationBlocked || this.map?.open || this.choosing || this.relocating || (this.order && this.order.state !== 'offer')) return;
    // Reopening a cancelled area picker restores the same offer, including its route and pay.
    let o: Order | null = this.order;
    const restored = !!o;
    for (let k = 0; k < 6 && !o; k++) o = this.makeOffer();
    if (!o) return;
    this.resetInput();
    this.order = o; this.nextOfferAt = null;
    if (!restored) this.sound.cue('offer');
    const pay = Math.round(35 + o.dist * 0.07);
    const P = this.player.pos, f = this.player.forward;
    const approach = this.graph.route(P.x, P.z, o.pickup.x, o.pickup.z, this.player.flying || this.player.jumping ? undefined : { hx: f.x, hz: f.z, y: P.y }, o.pickup.y);
    this.hud.offer(orderOfferHtml({ level: this.level + 1, pickupName: o.pickup.label, pickupRoad: o.pickup.sub || '',
      customerName: o.drop.label, approachMetres: approach?.len ?? null, approachEstimated: approach?.complete === false,
      deliveryMetres: o.dist, deliverySeconds: o.limit, basePay: pay, orderId: o.id }),
      [{ label: document.documentElement.classList.contains('is-touch') ? 'Accept order' : 'Accept order (E)', cls: 'go', fn: () => this.acceptOffer() }, { label: 'Decline', cls: 'alt', fn: () => { this.order = null; this.hud.offer(null); this.showOffer(); } }]);
  }
  acceptOffer() {
    if (this.carrierPickupMode) return;
    if (!this.orderOffersEnabled || !this.order || this.order.state !== 'offer') return;
    this.resetInput();
    this.order.state = 'toPickup'; this.hud.offer(null); this.setTarget(this.order.pickup, '#FFB627');
    this.engine.renderer.domElement.focus({ preventScroll: true });
    this.sound.cue('accept');
    this.hud.toast('Order accepted', 'teal');
    this.updateHud();
  }
  routeColor = '#FFB627';
  setTarget(s: Stop | null, color = '#FFB627', preserveRoad = false) {
    if (s && preserveRoad && this.routeTarget && this.route) {
      this.routeTarget = s; this.routeT = 0; this.routePlacementRevision = -1;
      this.beacon.position.set(s.x,s.y,s.z); return;
    }
    this.routeTarget = s; this.routeT = 0; this.route = null;
    this.routeGuide = []; this.routeGuidanceBlocked = false; this.routeGuideT = 0; this.routeAlpha = 0;
    this.beacon.visible = !!s; this.routeColor = color;
    (this.gps.material as THREE.MeshBasicMaterial).color.set(color).multiplyScalar(1.4);       // the road line matches the marker
    if (s) {
      this.beacon.position.set(s.x, s.y, s.z);
      const c = new THREE.Color(color).multiplyScalar(1.7);
      ((this.beacon as any).col.material as THREE.MeshBasicMaterial).color.copy(c);
      ((this.beacon as any).ring.material as THREE.MeshBasicMaterial).color.copy(c);
    }
  }
  completeDelivery() {
    if (this.carrierPickupMode) return;
    const o = this.order; if (!o || o.state !== 'toDrop') return;
    const tier = o.heat >= 70 ? 1.5 : o.heat >= 40 ? 1.0 : o.heat > 0 ? 0.5 : 0;
    const fare = Math.round(35 + o.dist * 0.07);
    const tip = Math.round(fare * tier * (o.slices / 8) * this.streak);
    const total = o.slices > 0 ? fare + tip : Math.round(fare * 0.3);
    this.coins += total; this.totalDelivered++;
    this.sound.cue('delivery');
    this.streak = tier >= 1.5 && o.slices >= 6 ? Math.min(2, +(this.streak + 0.2).toFixed(1)) : 1;
    const line = tier >= 1.5 ? 'Ekdum garam! Mast hai bhai.' : tier >= 1 ? 'Hau, theek hai. Thanks!' : 'Kya re, pizza thanda hai!';
    this.hud.toast(`+${total} coins · "${line}"`, tier >= 1 ? '' : 'pink');
    this.doneInLevel++;
    const L = LEVELS[Math.min(this.level, LEVELS.length - 1)];
    if (this.doneInLevel >= L.n && this.level < LEVELS.length - 1) { this.level++; this.doneInLevel = 0; setTimeout(() => this.hud.toast(`Level ${this.level + 1} unlocked!`, 'teal'), 2000); }
    this.player.chargeCap = 20 + this.level * 2.5;
    this.order = null; this.setTarget(null); this.save();
    this.updateOrderAvailability();
    this.queueOffer(2500);
  }

  // ---------- player interaction ----------
  canInteractAt(stop: Stop, radius: number) {
    const p = this.player;
    return !p.flying && !p.descending && !p.jumping && !p.glide && Math.abs(p.speed) < 2.5 &&
      Math.abs(p.pos.y - stop.y) < 3 && Math.hypot(stop.x - p.pos.x, stop.z - p.pos.z) < radius;
  }
  resetInput() {
    this.releaseCameraLook?.();
    this.keys.clear(); this.flyQueued = false; this.jumpQueued = false; this.actHeld = false; this.actTap = 0; this.actProgress = 0; this.dragging = false;
    this.hud?.resetControls();
    this.sound.vehicle({ speed: 0, throttle: 0, flying: false, active: false });
  }
  private motionAvailable() {
    return !document.hidden && !this.paused && !this.story?.blocking && !this.hud.modalOpen && !this.hud.tipOpen && !this.hud.rotationBlocked &&
      !this.map?.open && !this.choosing && !this.relocating && !!this.area && this.order?.state !== 'offer';
  }
  jumpAvailable() {
    return this.motionAvailable() && this.player.canJump === true && !this.flyQueued &&
      !this.actHeld && !this.hud.touchAct && this.actProgress <= 0;
  }
  queueJump() {
    if (!this.jumpAvailable()) return;
    this.jumpQueued = true;
  }
  private updateJumpState() {
    this.hud.jumpState?.({ jumping: !!this.player.jumping, cooldown: this.player.jumpCooldown || 0, available: this.jumpAvailable() });
  }
  queueFlight() {
    // A short jump completes itself; FLY/LAND remains a separate flight control.
    if (!this.motionAvailable() || this.player.descending || this.player.jumping || this.jumpQueued) return;
    this.flyQueued = true;
  }
  resume() {
    this.resetInput(); this.paused = false; this.hud.modal(null); this.clock.getDelta();
    this.engine.renderer.domElement.focus({ preventScroll: true });
  }
  // ---------- loop ----------
  start() {
    this.load();
    const touch = this.opts.touchControls ?? (('ontouchstart' in window) || navigator.maxTouchPoints > 0);
    this.hud = new Hud(touch);
    if (this.carrierPickupMode) this.story = new DeliveryRuntime(this, this.opts.delivery);
    this.bugReports = new BugReporter();
    this.hud.onInputReset = () => this.resetInput();
    this.updateOrderAvailability();
    this.settings = loadSettings();
    this.sound.setMuted(!this.settings.sound);
    if (touch && this.settings.steer === 'tilt') void this.applySteering(false, false);
    this.hud.el['b-full'].hidden = false;
    try { this.tutStep = (this.opts.sessionStorage ?? localStorage).getItem(this.carrierPickupMode ? PICKUP_TUT_KEY : TUT_KEY) ? -1 : 0; } catch { this.tutStep = -1; }
    this.hud.onButton = (id) => {
      if (id === 'tip-close') {
        if (this.carrierPickupMode) {
          this.tutStep = -1;
          try { (this.opts.sessionStorage ?? localStorage).setItem(PICKUP_TUT_KEY, '1'); } catch { /* optional coaching */ }
        }
        this.tipDismissed = this.tutStep;
        if (this.tutStep >= 0) this.acknowledgedTips.add(this.tutStep);
        this.resetInput(); this.clock.getDelta();
        this.engine.renderer.domElement.focus({ preventScroll: true });
        return;
      }
      if (id === 'fullscreen') { this.requestFullscreen(); return; }
      if (this.hud.rotationBlocked) return;
      if (id === 'pause') this.openPause();
      else if (id === 'report') this.openBugReport();
      else if (id === 'rescue') this.rescue();
      else if (id === 'fly') this.queueFlight();
      else if (id === 'jump') this.queueJump();
      else if (id === 'orders') {
        this.setAcceptingOrders(!this.acceptingOrders);
        this.engine.renderer.domElement.focus({ preventScroll: true });
      }
    };
    addEventListener('keydown', (e) => this.handleKeyDown(e));
    // full map from the minimap
    this.map = new FullMap(this.hud.root, this.zone, () => ({
      player: this.area ? { x: this.player.pos.x, z: this.player.pos.z, yaw: this.player.yaw } : null,
      canMove: this.canMoveFromMap(),
      route: this.route ? (this.routeGuidanceBlocked ? this.routeGuide : this.route.pts) : null,
      target: this.routeTarget ? { x: this.routeTarget.x, z: this.routeTarget.z, label: this.routeTarget.label } : null,
      pickups: this.carrierPickupMode ? [] : this.food.map((f) => ({ x: f.s.x, z: f.s.z, pizza: !!f.pizza })),
    }), () => {
      this.resetInput();
      if (!this.choosing) {
        this.paused = false; this.clock.getDelta();
        // Pointer/map-shortcut players return to driving; explicit keyboard openers keep their navigation focus.
        if (!this.mapKeyboardOpener) this.engine.renderer.domElement.focus({ preventScroll: true });
      }
    }, { mapUrl: new URL('city/map.pack.wasm', location.href).href, buildings: () => this.city.loadedBuildings(), hidePickupLegend: this.carrierPickupMode });
    this.map.areaName = (x, z) => this.areaName(x, z);
    this.map.onMove = (x, z) => this.relocate({ name: this.areaName(x, z) || 'Hyderabad', x, z }, 'map');
    // where to deliver: chosen at the start, changeable after any delivery
    this.picker = new AreaPicker(this.hud.root, this.zone);
    this.picker.onPick = (c) => this.relocate(c);
    this.picker.onMap = () => {
      this.choosing = true;
      this.map!.showPick({ onPick: (x, z) => this.relocate({ name: this.areaName(x, z) || 'Hyderabad', x, z }), onCancel: () => { this.map!.hide(); this.chooseArea(!this.area); } },
        this.area ? { x: this.area.x, z: this.area.z, scale: 0.12 } : { x: 0, z: 0, scale: 0.035 });
    };
    this.hud.el.minimap.addEventListener('click', () => this.openMap());
    this.hud.el.minimap.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.code === 'Space') { e.preventDefault(); e.stopPropagation(); this.openMap(true); }
    });
    // look around: drag on the scene while the car is stopped; scroll to move the camera in or out
    const cv = this.engine.renderer.domElement;
    cv.tabIndex = -1;
    this.releaseCameraLook = installCameraLook(cv, this, {
      blocked: () => this.paused || this.choosing || !!this.map?.open || this.hud.modalOpen || this.hud.tipOpen || this.hud.rotationBlocked || !!this.story?.cinematic,
      flight: () => this.player.flying || this.player.descending,
      speed: () => this.player.speed,
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); this.hud.controlFeedback?.(e.code, false); if (e.code === 'KeyF') this.actHeld = false; });
    addEventListener('blur', () => this.background());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.background(); });
    addEventListener('pagehide', () => { this.resetInput(); this.save(); });
    this.player.chargeCap = 20 + this.level * 2.5;
    this.engine.camera.far = 900; this.engine.camera.updateProjectionMatrix();
    this.applyClockMood(true);
    // ?area=Uppal starts straight there (shareable links, tests); otherwise ask
    const want = new URLSearchParams(location.search).get('area');
    const hit = want ? [...this.picker.popular, ...this.picker.list].find((c) => c.name.toLowerCase() === want.toLowerCase()) : null;
    this.title = new TitleScreen(this.hud.root, touch, this.carrierPickupMode);
    this.title.onPlay = () => { this.sound.unlock(); this.sound.cue('start'); if (touch && this.settings.steer === 'tilt') void this.applySteering(); this.carrierPickupMode ? this.startCampaign() : this.chooseArea(true); };
    this.title.onSettings = () => this.openSettings(() => { this.hud.modal(null); this.title!.show(); });
    return launchPreparedGame(this.story?.initialCharacterPreparation(),()=>{
      if (this.opts.initialArea) this.relocate(this.opts.initialArea);
      else if (hit && !this.carrierPickupMode) this.relocate(hit); else { this.choosing = true; this.paused = true; this.title!.show(); }
      const loop = () => { if (!this.halted) this.frame(); requestAnimationFrame(loop); };   // tests set halted and step frames themselves
      requestAnimationFrame(loop);
    });
  }
  handleKeyDown(e: KeyboardEvent) {
    if(e.ctrlKey||e.metaKey||e.altKey||(e.target as Element|null)?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])'))return;
    if (this.story?.blocking) return;
    if(this.story?.cinematic&&!['KeyP','Escape'].includes(e.code))return;
    if (this.hud.tipOpen) return;
    if (this.hud.rotationBlocked) return;
    if (e.repeat && ['KeyQ', 'KeyE', 'KeyF', 'KeyM', 'KeyN', 'KeyP', 'Escape', 'Backquote', 'Backslash'].includes(e.code)) return;
    if (this.map?.open) { this.map.handleKey(e); return; }
    if (this.choosing) return;
    if (this.hud.modalOpen && !['Escape', 'KeyP'].includes(e.code)) return;
    // Closing a keyboard-opened map deliberately returns focus to its opener.
    // Once driving resumes, Space belongs to the brake rather than that button.
    if (['KeyW', 'KeyA', 'KeyD', 'KeyS', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyE'].includes(e.code)) {
      this.engine.renderer.domElement.focus({ preventScroll: true });
    }
    this.keys.add(e.code);
    this.hud.controlFeedback?.(e.code, true);
    if (e.code === 'KeyQ') { this.queueFlight(); e.preventDefault(); }
    if (e.code === 'KeyE') { this.queueJump(); e.preventDefault(); }
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (e.code === 'KeyF') { this.actHeld = true; if (this.order?.state === 'offer') this.acceptOffer(); }
    if (e.code === 'KeyM') { this.openMap(); return; }
    if (e.code === 'KeyH' && !e.repeat) this.sound.horn('car', 4, 0, true);
    if (e.code === 'KeyR' && !e.repeat) this.rescue();
    if (e.code === 'Backquote' || e.key === '`') { this.devOn = !this.devOn; this.hud.el.dev.hidden = !this.devOn; }
    if (e.code === 'Backslash' || e.key === '\\') { this.autopilot = !this.autopilot; this.hud.toast(this.autopilot ? 'Test autopilot ON' : 'Test autopilot off', 'teal'); }
    if (e.code === 'KeyN') {
      this.sound.setMuted(!this.sound.muted); this.settings.sound = !this.sound.muted;
      try { localStorage.setItem('p2ph-settings-v1', JSON.stringify(this.settings)); } catch { /* unavailable */ }
      this.hud.toast(this.sound.muted ? 'Sound off' : 'Sound on', 'teal');
    }
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (this.hud.modalOpen) this.resume(); else this.openPause();
    }
  }
  background() {
    this.resetInput();
    if (this.area && !this.choosing && !this.paused && !this.hud.modalOpen && !this.map?.open) this.openPause();
  }
  openMap(keyboardOpener = false) {
    if (!this.map || this.hud.modalOpen || this.hud.rotationBlocked || this.choosing || this.story?.cinematic) return;
    this.mapKeyboardOpener = keyboardOpener;
    this.hud.tip(null);
    this.resetInput();
    this.paused = true; this.map.show();
  }

  // ---------- where to deliver ----------
  picker!: AreaPicker; area: AreaChoice | null = null; choosing = false; relocating = false;
  private relocationId = 0;
  private relocationAbort?: AbortController;
  private validArea(c: AreaChoice | null): c is AreaChoice {
    const b = this.zone.bounds;
    return !!c && typeof c.name === 'string' && !!c.name.trim() && Number.isFinite(c.x) && Number.isFinite(c.z) &&
      typeof c.x === 'number' && typeof c.z === 'number' && c.x >= b.minX && c.x <= b.maxX && c.z >= b.minZ && c.z <= b.maxZ;
  }
  savedArea(): AreaChoice | null {
    try {
      const c = JSON.parse((this.opts.sessionStorage ?? localStorage).getItem(AREA_KEY) || 'null');
      return this.validArea(c) ? c : null;
    } catch { return null; }
  }
  startCampaign() {
    const next=this.story?.startArea();
    if(next) void this.relocate(next);
    else this.hud.toast('No safe main-road start is available. Reload to retry.', 'pink');
  }
  chooseArea(first: boolean) {
    if(this.carrierPickupMode) { if(this.area)this.resume();else this.startCampaign();return; }
    this.hud.tip(null);
    this.resetInput();
    if (!first && this.order && this.order.state !== 'offer') { this.resume(); this.hud.toast('Finish this delivery first!', 'pink'); return; }
    this.choosing = true; this.paused = true; this.hud.modal(null); this.hud.offer(null);
    this.picker.onClose = first ? null : () => { this.choosing = false; this.resume(); if (!this.order || this.order.state === 'offer') this.showOffer(); };
    this.picker.show({ first, last: first ? this.savedArea() : null, current: this.area?.name });
  }
  canMoveFromMap() {
    return !!this.area && !this.relocating && !this.story?.activeOrder && (!this.order || this.order.state === 'offer');
  }
  async relocate(c: AreaChoice, source: 'campaign' | 'map' = 'campaign') {
    // A delayed choice must never overwrite a newer destination or an accepted job.
    if (this.story?.activeOrder || this.order && this.order.state !== 'offer') { this.hud.toast('Finish this delivery first!', 'pink'); return; }
    if (!this.validArea(c)) { this.hud.toast('Choose a spot inside the playable Hyderabad map.', 'pink'); return; }
    c = { name: c.name.trim(), x: c.x, z: c.z };
    const request = (this.relocationId || 0) + 1; this.relocationId = request;
    this.relocationAbort?.abort();
    const controller = new AbortController(); this.relocationAbort = controller;
    this.hud.tip(null);
    this.resetInput();
    this.relocating = true; this.choosing = true; this.paused = true;
    if (this.map?.open) this.map.hide();
    this.picker.hide(); this.hud.offer(null); this.hud.modal(null);
    setLoading(`Loading ${c.name}…`);
    try { await this.city.ensure(c.x, c.z, Math.max(650, this.city.radius || 0), controller.signal); }
    catch (e) {
      if (request !== this.relocationId) return;
      console.error('relocate', e);
      this.relocationFailed(c, 'The streets could not load. Check your connection and retry this same destination.', source);
      return;
    }
    if (request !== this.relocationId) return;
    if (!this.placeNear(c.x, c.z, source !== 'map' && this.carrierPickupMode && !this.opts.initialArea)) {
      this.relocationFailed(c, 'There is no safe, clear road close to this pin. Move the pin to a nearby street.', source);
      return;
    }
    this.relocationAbort = undefined;
    this.order = null; this.nextOfferAt = null; this.setTarget(null);
    if (this.carrierPickupMode) {
      this.carriers.clear(); this.pickupDetector.reset(); this.carrierSpawnT = 0;
      this.hud.pickupStatus(false);
      this.story?.retry();
    }
    try { await this.story?.prepareCurrentCharacters(); }
    catch(error){
      if(request!==this.relocationId)return;
      console.error('Delivery character preparation',error);
      this.relocationFailed(c,'The delivery characters could not load. Retry to prepare this same delivery.',source);return;
    }
    if(request!==this.relocationId)return;
    // the old neighbourhood's traffic and people stay behind
    this.traffic.clear();
    for (const w of this.walkers.list) this.walkers.group.remove(w.g); this.walkers.list.length = 0;
    this.camPos.set(0, 0, 0); this.camLook.set(0, 0, 0); this.orbitYaw = 0; this.orbitDist = 0; this.busyT = 0;
    if (this.engine.prepareFrame) {
      showLoading('Getting the view ready…', 'view');
      this.setStreetLife(this.player.pos.x, this.player.pos.z);
      this.updateCamera(0);
      this.city.signs.update(this.player.pos.x, this.player.pos.z, true);
      try { await this.engine.prepareFrame(); }
      catch (error) {
        if (request !== this.relocationId) return;
        console.error('Starting view', error);
        await loadingRetry('Could not draw the starting view. Please reload the game.', 'Reload game');
        location.reload(); return;
      }
    }
    if (request !== this.relocationId) return;
    this.area = c;
    try { (this.opts.sessionStorage ?? localStorage).setItem(AREA_KEY, JSON.stringify(c)); } catch { /* storage unavailable */ }
    this.updateHud();
    setLoading('');
    this.relocating = false; this.choosing = false; this.paused = false; this.clock.getDelta();
    this.hud.toast(`Welcome to ${c.name}!`, 'teal');
    (window as any).__game = this;                 // tests start once the first area is ready
    setTimeout(() => this.map?.build().catch(() => {}), 4000);   // the city map is ready before anyone opens it
    this.queueOffer(2200);
  }
  private relocationFailed(c: AreaChoice, message: string, source: 'campaign' | 'map' = 'campaign') {
    if(this.carrierPickupMode && source !== 'map') {
      setLoading('');this.relocating=false;this.relocationAbort=undefined;
      const diagnostic=import.meta.env.DEV?`<p class="sm">Development loading evidence: ${esc(c.name)} ${c.x.toFixed(1)}, ${c.z.toFixed(1)} · ${this.city.tiles.size} tiles · ${this.city.pending.size} pending · ${this.city.failures.size} failed.</p>`:'';
      this.hud.modal(`<h2>Could not prepare the road</h2><p>${esc(message)}</p>${diagnostic}<button class="btn go" id="campaign-retry">Retry</button>`,sheet=>sheet.querySelector('#campaign-retry')!.addEventListener('click',()=>this.relocate(c, source)));
      return;
    }

    setLoading(''); this.relocating = false; this.relocationAbort = undefined;
    this.city.focus = this.area ? [this.player.pos.x, this.player.pos.z] : null;
    this.sound.cue('error');
    const close = async () => {
      if(this.map?.open)this.map.hide();
      this.hud.modal(null);
      if (this.area) {
        if(source==='map') {
          // The failed pin may be far enough away that ensure() retired the
          // previous tiles. Keep the opaque loading screen up while restoring
          // those streets, rather than resuming over an empty world.
          const request=(this.relocationId||0)+1;this.relocationId=request;
          this.relocationAbort?.abort();
          const controller=new AbortController();this.relocationAbort=controller;
          this.relocating=true;setLoading(`Returning to ${this.area.name}…`);
          try {
            await this.city.ensure(this.player.pos.x,this.player.pos.z,Math.max(650,this.city.radius||0),controller.signal);
            if(request!==this.relocationId)return;
            if(this.engine.prepareFrame){this.updateCamera(0);await this.engine.prepareFrame();}
          } catch(error) {
            if(request!==this.relocationId)return;
            console.error('return to area',error);
            this.relocationFailed(c,'The previous area could not reload. Check your connection and choose Stay here to retry.',source);
            return;
          }
          if(request!==this.relocationId)return;
          this.relocationAbort=undefined;this.relocating=false;setLoading('');
        }
        this.choosing = false; this.resume(); if (!this.order || this.order.state === 'offer') this.showOffer();
      } else this.chooseArea(true);
    };
    // Keep the exact destination and existing progress until placement succeeds.
    this.hud.modal(`<h2>Could not move to ${esc(c.name)}</h2><p>${message}</p><div class="sm">Your current area and progress are unchanged.</div><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn go" id="area-retry">Retry this destination</button><button type="button" class="btn alt" id="area-nearby">Choose nearby street</button><button type="button" class="btn alt" id="area-stay">${this.area ? 'Stay here' : 'Back to areas'}</button></div>`, sheet => {
      sheet.querySelector('#area-retry')!.addEventListener('click', () => this.relocate(c, source));
      sheet.querySelector('#area-stay')!.addEventListener('click', close);
      sheet.querySelector('#area-nearby')!.addEventListener('click', () => {
        this.hud.modal(null);
        this.map.showPick({ onPick: (x, z) => this.relocate({ name: this.areaName(x, z) || c.name, x, z }, source),
          onCancel: () => { this.map.hide(); this.relocationFailed(c, message, source); } }, { x: c.x, z: c.z, scale: .5 });
      });
    });
  }
  // Recover on the current expressway carriageway, or on a loaded ground street.
  streetSpotNear(x: number, z: number): { x: number; z: number; y: number; yaw: number } | null {
    return findClearRecoverySpot(this.graph, this.city, x, z, this.player.pos.y - .55, { heading: this.player.forward, vehicles: this.traffic.cars });
  }
  recoveryRetryUntil = 0;
  rescue() {
    if (this.player.glide || this.t < this.recoveryRetryUntil) return;
    const P = this.player.pos, s = this.streetSpotNear(P.x, P.z);
    if (!s) {
      this.recoveryRetryUntil = this.t + 3; this.stuckT = 0; this.slowT = 0;
      this.hud.toast('No clear road space yet. Wait for traffic or this area to load, then try again.', 'pink'); return;
    }
    this.recoveryRetryUntil = 0; this.stuckT = 0; this.slowT = 0;
    this.player.glideTo(s.x, s.y, s.z, s.yaw); this.hud.rescue(false);
    this.hud.toast('Back to the street!', 'teal');
  }
  // stuck watch: pressing on without getting anywhere, or parked on a roof
  stuckT = 0; stuckRef: [number, number] = [0, 0];
  slowRef: [number, number] = [0, 0]; slowT = 0;
  watchStuck(dt: number, inp: Input) {
    const pl = this.player, P = pl.pos;
    if (pl.glide || pl.flying || pl.descending || pl.jumping || this.paused) { this.stuckT = 0; this.hud.rescue(false); return; }
    const leaving=inp.throttle>0||(inp.brake>0&&inp.allowReverse!==false);
    if(!leaving&&this.story?.intentionalStop){
      this.stuckT=0;this.slowT=0;this.stuckRef[0]=this.slowRef[0]=P.x;this.stuckRef[1]=this.slowRef[1]=P.z;
      this.hud.rescue(false);return;
    }
    const onRoof = pl.lastKind === 'roof';
    const trying = inp.throttle > 0 || inp.brake > 0 || Math.abs(inp.steer) > 0.3;
    if (Math.hypot(P.x - this.stuckRef[0], P.z - this.stuckRef[1]) > 4) { this.stuckRef = [P.x, P.z]; if (!onRoof) this.stuckT = 0; }
    else if (trying || onRoof) this.stuckT += dt;
    // shuffling back and forth in a tight spot never gets anywhere either: no 12 m of headway in 14 s of trying
    if (Math.hypot(P.x - this.slowRef[0], P.z - this.slowRef[1]) > 12) { this.slowRef = [P.x, P.z]; this.slowT = 0; }
    else if (inp.throttle > 0 && Math.abs(pl.speed) < 4) this.slowT += dt;
    const show = onRoof ? this.stuckT > 1.2 : this.stuckT > 3.5 || this.slowT > 14;
    this.hud.rescue(show, onRoof ? 'On a roof? Glide down to the street' : 'Stuck? Get back on the road');
    if (!onRoof && (this.stuckT > 9 || this.slowT > 26)) { this.slowT = 0; this.rescue(); }   // still wedged after a while: help without being asked
  }
  placeNear(x: number, z: number, campaign = this.carrierPickupMode && !this.opts.initialArea) {
    const p = findClearStreetSpot(this.graph, this.city, x, z, { preferMajor: true, majorOnly:campaign,forwardClearance:campaign?40:8 }) ??
      (!campaign ? findClearStreetSpot(this.graph, this.city, x, z, { preferMajor: true, allowElevated: true }) : null);
    if (!p) return false;
    this.player.place(p.x, p.z, p.yaw, p.y);
    return true;
  }
  openPause() {
    if (this.map?.open || this.choosing) return;
    this.resetInput();
    this.paused = true;
    const sessionLabel = Number.isFinite(this.day) && Number.isFinite(this.minutes) ? `Day ${this.day} · ${fmtTime(this.minutes)}` : undefined;
    this.hud.modal(pauseMenuHtml(this.carrierPickupMode, this.story?.pauseProgress, sessionLabel), (sh) => {
      sh.querySelector('#resume')!.addEventListener('click', () => this.resume());
      sh.querySelector('#settings')!.addEventListener('click', () => this.openSettings(() => this.openPause()));
      if (!this.carrierPickupMode) sh.querySelector('#area')!.addEventListener('click', () => this.chooseArea(false));
      sh.querySelector('#restaurant')?.addEventListener('click', () => {
        if (!this.story) return;
        this.hud.modal(null); this.paused = false; this.resetInput(); this.clock.getDelta();
        if (!this.story.openRestaurant()) this.openPause();
      });
      sh.querySelector('#choose-level')?.addEventListener('click', () => {
        const story = this.story;
        if (!story) return;
        this.hud.modal(levelPickerHtml(story.controller.levels), sheet => {
          sheet.querySelector('#levels-back')!.addEventListener('click', () => this.openPause());
          sheet.querySelectorAll<HTMLButtonElement>('[data-play-level]').forEach(button => {
            button.addEventListener('click', () => {
              this.resume();
              void story.restartCurrentLevel(button.dataset.playLevel);
            });
          });
        });
      });
      const unstick=sh.querySelector<HTMLButtonElement>('#unstick')!;
      if(this.story?.cinematic){unstick.disabled=true;unstick.title='Resume the story, or restart this level.';}
      unstick.addEventListener('click', () => { if(this.story?.cinematic)return;this.paused = false; this.hud.modal(null); this.clock.getDelta(); this.rescue(); });
      sh.querySelector('#start-level-one')?.addEventListener('click', () => {
        this.story?.startFromLevelOne();
        this.startCampaign();
      });
      sh.querySelector('#reset')!.addEventListener('click', () => {
        if (this.carrierPickupMode) {
          if (this.story) {this.resume();void this.story.restartCurrentLevel();return;}
          else { this.carriers.clear(); this.pickupDetector.reset(); this.hud.pickupStatus(false); }
          this.resume();
        } else {
          try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } location.reload();
        }
      });
    });
  }
  requestFullscreen() {
    if (isFullscreen()) { exitFullscreen(); return; }
    const wasPaused=this.paused;
    void goFullscreen().then(entered=>{
      if(entered||this.hud.rotationBlocked||this.hud.modalOpen||this.map?.open||this.choosing)return;
      this.resetInput();this.paused=true;
      this.hud.modal(fullscreenFallbackHtml(),sh=>sh.querySelector('#fullscreen-done')!.addEventListener('click',()=>{
        this.hud.modal(null);if(wasPaused)this.openPause();else this.resume();
      }));
    });
  }
  openBugReport() {
    if (!this.area || !this.bugReports || this.choosing || this.relocating) return;
    const reporter = this.bugReports, wasPaused = this.paused, P = this.player.pos, recent = reporter.freshRecent();
    // Capture the actual clicked spot before resetting controls or resuming.
    let road: BugContext['road'] = null, score = Infinity;
    for (const edge of this.graph.nearestEdges(P.x, P.z, 2)) {
      for (let i = 1; i < edge.e.pts.length; i++) {
        const a = edge.e.pts[i - 1], b = edge.e.pts[i], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
        const u = l2 ? Math.max(0, Math.min(1, ((P.x - a[0]) * dx + (P.z - a[1]) * dz) / l2)) : 0;
        const point = this.graph.pointAt(edge, edge.cum[i - 1] + Math.sqrt(l2) * u, 1), distance = Math.hypot(point.x - P.x, point.z - P.z), candidate = distance + Math.abs(P.y - .55 - point.y) * 3;
        if (candidate < score) { score = candidate; road = { id: edge.e.id, name: edge.e.name || '', distance, elevation: point.y, sourceClass: edge.e.cls }; }
      }
    }
    const context: BugContext = {
      build: GAME_BUILD, capturedAt: new Date().toISOString(), area: this.areaName(P.x, P.z) || this.area.name,
      location: { x: P.x, y: P.y, z: P.z, ...gameCoordinates(this.zone.origin, P.x, P.z), tile: `${Math.floor(P.x / 1000)}_${Math.floor(P.z / 1000)}`, yaw: this.player.yaw }, road,
      player: { speedKmh: this.player.speed * 3.6, flying: this.player.flying, descending: this.player.descending, surface: this.player.lastKind, stuckSeconds: this.stuckT, slowSeconds: this.slowT },
      order: this.order ? { id: this.order.id, state: this.order.state, pickup: this.order.pickup, drop: this.order.drop } : null,
      route: this.routeTarget ? { target: this.routeTarget, edgeIds: this.route?.edgeIds?.slice(0, 80), blocked: this.routeGuidanceBlocked, graphRevision: this.graph.revision } : null,
      world: { loadedTiles: [...this.city.tiles.keys()], pendingTiles: [...this.city.pending.keys()], day: this.day, minutes: this.minutes },
      device: { viewport: { width: innerWidth, height: innerHeight, pixelRatio: devicePixelRatio }, touch: navigator.maxTouchPoints > 0, quality: this.opts.lowQ ? 'low' : 'high', renderer: this.engine.renderer.info.render, ui: paintDiagnostics(), graphics: graphicsDiagnostics(this.engine.renderer.getContext?.() || null) },
      observations: reportObservations(recent, this.player.lastKind, this.stuckT, this.slowT), recent, errors: [],
    };
    this.resetInput(); this.paused = true;
    // An immediate render makes readback valid without preserveDrawingBuffer.
    let screenshot: string | null = null; try { this.engine.render(true); screenshot = gameScreenshot(this.engine.renderer.domElement); } catch { /* Context-loss reports still work. */ }
    const report = reporter.envelope(context, screenshot, recent);
    const restore = () => { if (wasPaused) this.openPause(); else this.resume(); };
    this.hud.modal(`<h2>Report this spot?</h2><p class="sm">Send this location, a screenshot, recent driving and device details. No typing needed.</p><div style="display:flex;gap:10px"><button type="button" class="btn go" id="bug-send">Report</button><button type="button" class="btn alt" id="bug-cancel">Cancel</button></div><p class="sm" id="bug-status" role="status"></p>`, sheet => {
      sheet.querySelector('#bug-cancel')!.addEventListener('click', restore);
      sheet.querySelector<HTMLButtonElement>('#bug-send')!.addEventListener('click', async event => {
        const button = event.currentTarget as HTMLButtonElement; button.disabled = true;
        const cancel = sheet.querySelector<HTMLButtonElement>('#bug-cancel')!; cancel.disabled = true;
        const status = sheet.querySelector<HTMLElement>('#bug-status')!; status.textContent = 'Sending…';
        const result = await reporter.submit(report);
        // Escape, a browser transition or another dialog can close this sheet
        // while the request is in flight. A receipt must not reopen gameplay.
        if (!this.hud.modalOpen || sheet.querySelector('#bug-status') !== status) return;
        if (result === 'failed') { status.textContent = 'Could not save the report. Please retry.'; button.disabled = false; cancel.disabled = false; return; }
        restore(); this.hud.toast(result === 'sent' ? `Report sent · ${report.id.slice(0, 8)}` : 'Report saved on this device · will retry online', result === 'sent' ? 'teal' : '');
      });
    });
  }
  settings!: Settings; title: TitleScreen | null = null;
  private steeringChange = 0;
  async applySteering(requestPermission = true, reportFailure = true) {
    const change = ++this.steeringChange, wanted = this.settings.steer;
    const ok = await this.hud.enableTilt(wanted === 'tilt', requestPermission);
    if (change !== this.steeringChange) return;
    if (wanted === 'tilt' && !ok && reportFailure) {
      this.settings.steer = 'stick'; saveSettings(this.settings);
      this.hud.el.sheet.querySelectorAll<HTMLButtonElement>('[data-k="steer"]').forEach((button) =>
        button.setAttribute('aria-pressed', String(button.dataset.v === 'stick')));
      this.hud.toast('Tilt steering needs motion access. Arrow buttons are ready.', 'pink');
    }
  }
  openSettings(back: () => void) {
    this.resetInput();
    const touch = document.documentElement.classList.contains('is-touch');
    this.hud.modal(settingsHtml(this.settings, touch), (sh) => {
      bindSettings(sh, this.settings, (st, k) => {
        if (k === 'quality') { setTimeout(() => location.reload(), 150); }
        else if (k === 'sound') this.sound.setMuted(!st.sound);
        else if (k === 'steer') void this.applySteering();
        else if (k === 'tips' && !st.tips) this.hud.tip(null);
      });
      sh.querySelector('#set-done')!.addEventListener('click', back);
    });
  }
  // first-delivery coaching: one tip at a time, following the order through its steps; done once per browser
  tutStep = -1; tipDismissed = -2; flewOnce = false;
  private acknowledgedTips = new Set<number>();
  tutorialTick() {
    if (this.hud.tipOpen) return;
    if (this.tutStep < 0 || !this.settings.tips || this.choosing) { if (this.tutStep >= 0 || !this.settings.tips) this.hud.tip(null); return; }
    if (document.hidden || this.paused || this.hud.modalOpen || this.hud.rotationBlocked || this.map?.open || this.relocating || this.order?.state === 'offer') return;
    if (this.carrierPickupMode) {
      const touch = document.documentElement.classList.contains('is-touch');
      this.hud.tip(touch
        ? 'Find an auto with a glowing slice. Tap JUMP to grab it, or hit that auto with a closing speed above 60 km/h.'
        : 'Find an auto with a glowing slice. Press E to jump through it, or hit that auto with a closing speed above 60 km/h.');
      return;
    }
    const touch = document.documentElement.classList.contains('is-touch'), o = this.order, P = this.player.pos;
    const act = touch ? 'the button in the middle of the screen' : 'F', fly = touch ? 'FLY' : 'Q';
    let step = this.tutStep, text: string | null = null;
    if (step <= 1 && o?.state === 'offer') { step = 1; text = touch ? 'A new order! Review the request, then slide to accept.' : 'A new order! Press E or slide to accept.'; }
    else if (o && o.state === 'toPickup') {
      const d = Math.hypot(o.pickup.x - P.x, o.pickup.z - P.z);
      if (d > 45) { step = 2; text = touch ? `Hold GO and ${this.hud.tiltOn ? 'tilt your phone' : 'hold the left or right arrow'} to steer. Follow the orange line on the road and the minimap to the kitchen.` : 'Drive with W and steer with A / D. Follow the orange line on the road and the minimap to the kitchen.'; }
      else { step = 3; text = `Stop inside the glowing ring and hold ${act} to collect the pizza.`; }
    } else if (o && o.state === 'toDrop') {
      const d = Math.hypot(o.drop.x - P.x, o.drop.z - P.z);
      if (this.player.flying) this.flewOnce = true;
      if (d < 45) { step = 6; text = `Pull up in the teal ring and hold ${act} to hand the pizza over.`; }
      else if (!this.flewOnce) { step = 5; text = `Press ${fly} to lift off and fly over the traffic. Flight is unlimited; press it again to land.`; }
      else { step = 4; text = 'Now take it to the customer (teal). It cools down as time passes, and every bump costs a slice.'; }
    } else if (step >= 4 && !o) {
      step = -1; text = null;
      try { localStorage.setItem(TUT_KEY, '1'); } catch { /* ignore */ }
      this.hud.tip('Delivered! Open the map (tap the minimap or press M) to explore Hyderabad or choose another delivery area.');
    }
    this.tutStep = step;
    if (step >= 0) this.hud.tip(this.acknowledgedTips.has(step) ? null : text);
  }
  applyClockMood(force = false) {
    const m = moodAt((this.minutes / 60) % 24);
    this.engine.applyMood(m, { signs: (v) => this.city.signs.setEmissive(v) });
    void force;
  }
  // ---------- developer tools ----------
  devOn = false; autopilot = false; fpsN = 0; fpsT = 0; fps = 0; apStuck = 0; apLast: [number, number] = [0, 0]; apRev = 0;
  autoInput(): Input | null {
    const tgt = this.routeTarget, P = this.player.pos, f = this.player.forward, v = this.player.speed;
    if (!this.order || this.order.state === 'offer') { if (this.order?.state === 'offer') this.acceptOffer(); return { throttle: 0, brake: Math.abs(v) > 0.5 ? 1 : 0, steer: 0, flyPressed: false, boost: false }; }
    if (!tgt) return null;
    const dT = Math.hypot(tgt.x - P.x, tgt.z - P.z);
    if (dT < 7 || (dT < 24 && this.route && this.route.len > dT * 4 + 60)) { this.actTap = 1.2; return { throttle: 0, brake: Math.abs(v) > 0.4 ? 1 : 0, steer: 0, flyPressed: false, boost: false }; }
    let aim: [number, number] = [tgt.x, tgt.z];
    const pts = this.route?.pts;
    if (pts && pts.length > 1 && dT > 20) {
      let bi = 0, bd = 1e9; pts.forEach((p, i) => { const d = Math.hypot(p[0] - P.x, p[2] - P.z); if (d < bd) { bd = d; bi = i; } });
      let acc = 0, k = bi; const look = 8 + Math.abs(v) * 0.9;
      while (k < pts.length - 1 && acc < look) { acc += Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][2] - pts[k][2]); k++; }
      aim = [pts[k][0], pts[k][2]];
    }
    const vx = aim[0] - P.x, vz = aim[1] - P.z, L = Math.hypot(vx, vz) || 1;
    const cross = (f.x * vz - f.z * vx) / L, dot = (f.x * vx + f.z * vz) / L;
    let steer = Math.max(-1, Math.min(1, cross * 2.2)); if (dot < 0) steer = cross >= 0 ? 1 : -1;
    // stuck: back up with opposite lock for a moment
    this.apStuck += 1 / 60; if (Math.hypot(P.x - this.apLast[0], P.z - this.apLast[1]) > 2) { this.apLast = [P.x, P.z]; this.apStuck = 0; }
    if (this.apStuck > 3) { this.apRev = 1.2; this.apStuck = 0; }
    if (this.apRev > 0) { this.apRev -= 1 / 60; return { throttle: 0, brake: 1, steer: -steer, flyPressed: false, boost: false }; }
    const want = dot < 0.5 ? 6 : dT < 30 ? 6 : 12;
    return { throttle: v < want ? 1 : 0, brake: v > want + 3 ? 1 : 0, steer, flyPressed: false, boost: false };
  }
  input(): Input {
    const k = this.keys, h = this.hud;
    const brake = k.has('Space') || k.has('KeyS') || k.has('ArrowDown') || h.touchBrake;
    if (this.hud.tipOpen || this.order?.state === 'offer' || this.story?.cinematic) {
      this.flyQueued = false; this.jumpQueued = false;
      return { throttle: 0, brake: 0, steer: 0, flyPressed: false, jumpPressed: false, boost: false };
    }
    if (this.autopilot) { const a = this.autoInput(); if (a) { this.flyQueued = false; this.jumpQueued = false; return { ...a, jumpPressed: false }; } }
    const manualGo = k.has('KeyW') || k.has('ArrowUp') || h.touchGas;
    const inp: Input = {
      throttle: brake ? 0 : manualGo ? 1 : 0, brake: brake ? 1 : 0, allowReverse: !k.has('Space'),
      steer: Math.max(-1, Math.min(1, (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) + h.steer)),
      flyPressed: this.flyQueued && !this.player.descending && !this.player.jumping,
      jumpPressed: this.jumpQueued && this.jumpAvailable(), boost: k.has('ShiftLeft') || k.has('ShiftRight'),
    };
    this.flyQueued = false; this.jumpQueued = false;
    return inp;
  }
  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.bugReports?.retryPending();
    this.tutorialTick();
    if (this.hud.tipOpen && !this.tipWasOpen) this.resetInput();
    this.tipWasOpen = !!this.hud.tipOpen;
    if (this.hud.rotationBlocked && !this.rotationWasBlocked) this.resetInput();
    this.rotationWasBlocked = this.hud.rotationBlocked;
    this.hud.flightState?.(this.player.flying, this.player.descending);
    this.updateJumpState();
    const storyVisible = !document.hidden && !this.paused && !this.hud.modalOpen && !this.hud.tipOpen && !this.hud.rotationBlocked && !this.map?.open && !this.choosing && !!this.area;
    this.sound.setStoryActive?.(!!this.story?.cinematic);
    this.sound.setGameplayActive?.(storyVisible && !this.relocating);
    this.story?.tick(dt, storyVisible);
    const active = storyVisible && !this.story?.blocking;
    this.sound.vehicle({ speed: this.player.speed, throttle: this.order?.state !== 'offer' && !this.keys.has('Space') && !this.keys.has('KeyS') && !this.keys.has('ArrowDown') && !this.hud.touchBrake &&
      (this.keys.has('KeyW') || this.keys.has('ArrowUp') || this.hud.touchGas) ? 1 : 0,
      flying: this.player.flying || this.player.jumping, descending: this.player.descending, active: active && this.order?.state !== 'offer' });
    this.tickOfferQueue();
    if (this.map?.open) { this.hud.flightNavigation(null, dt); this.map.tick(dt); return; }
    if (!active) { this.hud.flightNavigation(null, dt); this.engine.render(); return; }
    this.t += dt;
    // clock
    const before = this.minutes;
    this.minutes += dt * (1440 / DAY_SECONDS);
    if (Math.floor(before / 1440) !== Math.floor(this.minutes / 1440)) { this.minutes %= 1440; this.day++; this.save(); }
    if ((this.moodT -= dt) <= 0) { this.moodT = 0.5; this.applyClockMood(); }
    // player + traffic
    const inp = this.input();
    if (this.carrierPickupMode) { this.capturePickupPose(this.pickupBefore); this.carriers.beforeFrame(); }
    const wasAirborne = this.player.flying || this.player.jumping;
    this.metro.update(dt, this.player.pos.x, this.player.pos.z);
    this.stationLife?.update(dt, this.minutes, this.metro.stationDwells, this.player.pos.x, this.player.pos.z);
    this.updateRailwayCrossings(dt);
    const riderFrameStart={x:this.player.pos.x,y:this.player.pos.y,z:this.player.pos.z};
    if(this.railRiderClearance.active||this.railContacts.supportId?.startsWith('rail:')){
      const stop=this.railRiderClearance.prepare({pos:this.player.pos,placementRevision:this.player.placementRevision,supportId:this.railContacts.supportId,
        flying:this.player.flying,descending:this.player.descending,jumping:this.player.jumping},this.rail.roofRiderTrains,this.riderGeometry(),this.riderEnvelope(),this.player.speed);
      this.rail.setRiderStop(stop);
      if(stop&&!this.railRiderWarned)this.hud.toast(stop.reason==='unknown'?'Preparing safe train clearance…':'Low bridge ahead · Use FLY to continue','teal');
      this.railRiderWarned=!!stop;
    }else{this.rail.setRiderStop(null);this.railRiderWarned=false;}
    this.rail.update(dt, this.player.pos.x, this.player.pos.z, runningRailwayTracks(this.city.railway?.profiles || railwayNetwork().profiles));
    this.story?.beforePlayer(dt);
    this.sound.setStoryActive?.(!!this.story?.cinematic);
    // A capture can begin in beforePlayer, after this frame's input sample.
    // Consume that old sample too: a queued Jump/Fly cannot leak into story.
    if(this.story?.cinematic)Object.assign(inp,{throttle:0,brake:0,steer:0,flyPressed:false,jumpPressed:false,boost:false});
    this.city.movingRail = [...this.metro.bodies, ...this.rail.bodies, ...(this.story?.supports ?? [])];
    if(this.railRiderClearance.active&&(inp.flyPressed||inp.jumpPressed)){
      const launch=this.railRiderClearance.guardRelativeMotion(this.riderGeometry(),this.player.pos,this.player.pos,this.riderEnvelope(),true);
      if(launch.reason!=='clear'){
        inp.flyPressed=false;inp.jumpPressed=false;
        this.hud.toast('Move back from the bridge for room to take off','teal');
      }
    }
    this.railContacts.beforePlayer(this.player, this.city.movingRail, !!(inp.flyPressed || inp.jumpPressed), dt);
    this.player.update(dt, inp, this.t);
    this.guardRoofRiderPose(riderFrameStart);
    if (!wasAirborne && this.player.flying) { this.airOrbitPitch = .62; this.airOrbitDist = 0; }
    this.hud.flightState?.(this.player.flying, this.player.descending);
    this.updateJumpState();
    const railContact = this.railContacts.afterPlayer(this.player, dt);
    // A fresh landing can establish occupancy in this pass. Cover its entire
    // same-frame sweep as well, rather than waiting one train step to latch.
    if(railContact.carried&&!this.railRiderClearance.active&&this.railContacts.supportId?.startsWith('rail:')){
      this.railRiderClearance.prepare({pos:this.player.pos,placementRevision:this.player.placementRevision,supportId:this.railContacts.supportId,
        flying:this.player.flying,descending:this.player.descending,jumping:this.player.jumping},this.rail.roofRiderTrains,this.riderGeometry(),this.riderEnvelope(),this.player.speed);
    }
    this.guardRoofRiderPose(riderFrameStart);
    this.story?.afterPlayer(dt);
    // External train impacts may impart momentum after the driving update.
    // Bound that velocity without altering coach carry or collision separation.
    this.player.enforceSpeedLimit();
    this.updateJumpState();
    if (railContact.hit && !this.story?.cinematic && this.player.hitCooldown <= 0) {
      this.player.hitCooldown = 1; this.player.bump = Math.max(this.player.bump, 0.45);
      this.sound.cue('bump');
      this.hud.toast(railContact.body?.id.startsWith('delivery-') ? 'Watch your clearance!' : 'Mind the train!', 'pink');
      if (this.order?.state === 'toDrop') { this.order.slices = Math.max(0, this.order.slices - 1); this.streak = 1; }
    }
    if (!wasAirborne && (this.player.flying || this.player.jumping)) this.sound.cue('flight');
    if(!this.story?.cinematic)this.watchStuck(dt, inp);
    const P = this.player.pos;
    this.bugReports?.record({ time: this.t, x: P.x, y: P.y, z: P.z, speed: this.player.speed, throttle: inp.throttle, brake: inp.brake, steer: inp.steer, flying: this.player.flying, surface: this.player.lastKind });
    this.aircraft.update(dt, P.x, P.z);
    this.city.update(P.x, P.z, dt);
    this.railTrackFallback?.update(P.x, P.z, this.city.tiles, dt, this.rail.bodies);
    if ((this.busyT -= dt) <= 0) { this.busyT = 1; this.setStreetLife(P.x, P.z); }
    const fw = this.player.forward;
    const collision = this.player.flying || this.story?.cinematic ? undefined :
      this.traffic.resolvePlayerContact(P,this.player.speed,fw.x,fw.z,this.player.jumping ? this.player.jumpTrafficBounds : undefined);
    if (collision?.impact) {
      this.player.speed = collision.speed;
      this.player.group.position.x = P.x;
      this.player.group.position.z = P.z;
    }
    const impact = collision?.impact, hit = impact?.car, kickedVehicle = impact?.kicked;
    if (kickedVehicle) {
      this.sound.cue('flight'); this.hud.toast('Arcade kick!', 'teal');
    }
    if (kickedVehicle && hit?.group === 'auto' && this.carrierPickupMode && this.story?.canPickup !== false) {
      const marker = this.carriers.markers.find(m => m.carrierId === hit.g.uuid);
      if (marker) this.pickupDetector.collectMarkedAuto(marker.carrierId, marker.position);
    }
    if (impact && impact.closing > 2.5 && this.player.hitCooldown <= 0) {
      this.sound.cue('bump');
      this.player.hitCooldown = 1.5; this.player.bump = 0.6;
      if (this.order && this.order.state === 'toDrop') { this.order.slices = Math.max(0, this.order.slices - 1); this.streak = 1; this.hud.toast(this.order.slices ? 'Baigan! −1 slice' : 'Pizza ruined!', 'pink'); }
      else if (!kickedVehicle) this.hud.toast('Arre! Watch the ' + (impact.kind.startsWith('bike') ? 'bike' : impact.kind === 'auto' ? 'auto' : 'traffic') + '!', 'pink');
    }
    this.traffic.update(dt, P.x, P.z, { x: P.x, z: P.z, y: P.y, speed: this.player.speed, hx: this.player.forward.x, hz: this.player.forward.z }, this.walkers.list);
    this.story?.afterTraffic?.(dt);
    if (this.carrierPickupMode) this.updateCarrierPickup(dt);
    this.city.updateSignals(this.traffic.t);
    this.walkers.update(dt, P.x, P.z, { x: P.x, z: P.z, y: P.y, speed: this.player.speed, fx: fw.x, fz: fw.z });
    // order flow
    const o = this.order;
    let promptText: string | null = null;
    let promptAction: 'collect' | 'handover' | null = null;
    if (o && o.state !== 'offer') {
      o.t += dt;
      if (o.state === 'toDrop') o.heat = Math.max(0, 100 - (o.t / (o.limit * 1.25)) * 100);
      const tgt = o.state === 'toPickup' ? o.pickup : o.drop;
      const d = Math.hypot(tgt.x - P.x, tgt.z - P.z);
      // right at the ring, or stopped just across a divided road from it (the rider walks over instead of a long U-turn)
      const across = d < 24 && !!this.route && this.route.len > d * 4 + 60;
      if (this.canInteractAt(tgt, across ? 24 : 8)) {
        promptAction = o.state === 'toPickup' ? 'collect' : 'handover';
        const holding = this.actHeld || (this.hud.touchAct && this.hud.activeAction === promptAction) || this.actTap > 0;
        this.actProgress = holding ? Math.min(1, this.actProgress + dt / 0.9) : Math.max(0, this.actProgress - dt);
        promptText = o.state === 'toPickup' ? (holding ? 'Collecting the pizza…' : `Hold E to collect the pizza${across ? ' (walk across the road)' : ''}`) : (holding ? 'Handing over…' : `Hold E to hand over${across ? ' (walk across the road)' : ''}`);
        if (this.actProgress >= 1) {
          this.actProgress = 0;
          if (o.state === 'toPickup') { o.state = 'toDrop'; o.t = 0; o.heat = 100; this.setTarget(o.drop, '#45E3D3'); this.hud.toast('Pizza collected! Garam garam.', ''); this.sound.cue('pickup'); }
          else this.completeDelivery();
          promptText = null; promptAction = null;
        }
      }
    }
    this.actTap = Math.max(0, this.actTap - dt);
    if (!promptText) this.actProgress = 0;
    this.hud.prompt(promptText, this.actProgress, promptAction);
    // gps
    this.updateRoute(dt);
    const flightOrder = this.order;
    const flightStop = this.story?.destination ?? (flightOrder?.state === 'toPickup' ? flightOrder.pickup : flightOrder?.state === 'toDrop' ? flightOrder.drop : null);
    this.hud.flightNavigation(flightStop ? { x: P.x, z: P.z, yaw: this.player.yaw,
      flying: this.player.flying || this.player.jumping, descending: this.player.descending,
      road: this.story && !this.player.airborne ? this.roadNavigation(flightStop) : undefined,
      target: { x: flightStop.x, z: flightStop.z, kind: flightOrder?.state === 'toPickup' ? 'pickup' : 'customer' } } : null, dt);
    this.updateCamera(dt);
    // Apply after all driving, collision and camera-visibility transforms.
    const darkness = vehicleDarkness(this.engine.mood?.lampLights ?? 0);
    this.deliveryHeadlightGain=stepSceneHeadlightGain(this.deliveryHeadlightGain,this.story?.headlightGain,dt);
    this.player.lamps?.update(darkness, inp.brake, this.player.speed, (this.opts.lowQ ? 1 : .22)*this.deliveryHeadlightGain);
    this.trafficHeadlights?.update(P, this.traffic.cars, darkness);
    if (this.beacon.visible) {
      const s = 1 + Math.sin(this.t * 3) * 0.08;
      (this.beacon as any).ring.scale.setScalar(s);
      // Keep the distant landmark, then clear the actor and entrance on approach.
      (this.beacon as any).col.visible = !this.story || !flightStop || Math.hypot(flightStop.x - P.x, flightStop.z - P.z) > 45;
    }
    this.engine.render();
    if (Math.floor(this.t * 8) !== Math.floor((this.t - dt) * 8)) { this.updateHud(); this.tutorialTick(); }
    // stats overlay (real frame rate, not game time)
    this.fpsN++; const now = performance.now();
    if (now - this.fpsT > 1000) {
      this.fps = Math.round((this.fpsN * 1000) / (now - this.fpsT)); this.fpsN = 0; this.fpsT = now;
      if (this.devOn) {
        const r = this.engine.renderer.info, w = this.city; let verts = 0; for (const t of w.tiles.values()) verts += t.built.counts.verts;
        const mem = (performance as any).memory ? Math.round((performance as any).memory.usedJSHeapSize / 1e6) + ' MB' : 'n/a';
        const pickupReadout = this.carrierPickupMode ? this.carriers.markers.map(marker => {
          const dx = marker.position.x - P.x, dz = marker.position.z - P.z, f = this.player.forward;
          const angle = Math.atan2(f.x * dz - f.z * dx, f.x * dx + f.z * dz) * 180 / Math.PI;
          return `${Math.round(Math.hypot(dx, dz))}m ${angle < 0 ? 'L' : 'R'}${Math.round(Math.abs(angle))}°`;
        }).join(' / ') : '';
        this.hud.el.dev.textContent = `${this.fps} fps · ${r.render.calls} draws · ${Math.round(r.render.triangles / 1000)}k tris\ntiles ${w.tiles.size} (+${w.pending.size}) · ${Math.round(verts / 1000)}k verts · heap ${mem}\ncars ${this.traffic.cars.length}/${this.traffic.max} · people ${this.walkers.list.length}/${this.walkers.max} · busy ${this.busy.toFixed(2)}\n${this.area?.name || ''} · ${this.areaName(this.player.pos.x, this.player.pos.z)}${this.autopilot ? ' · AUTOPILOT' : ''}${this.carrierPickupMode ? `\ncarriers ${this.carriers.activeCount} · ${this.pickupDetector.caught ? 'carrying' : 'searching'}\n${pickupReadout}` : ''}`;
      }
    }
  }
  private updateCamera(dt: number) {
    // Chase cam that the player can swing around while stopped; it never ends up inside a building or vehicle
    const P = this.player.pos;
    if (this.cameraPlacementRevision !== this.player.placementRevision) {
      this.cameraPlacementRevision = this.player.placementRevision;
      this.camPos.set(0, 0, 0); this.camLook.set(0, 0, 0);
      this.orbitYaw = 0; this.orbitPitch = 0.38; this.orbitDist = 0;
      this.airOrbitPitch = .62; this.airOrbitDist = 0;
      this.cameraTranslation?.reset();
      this.focusTranslation?.reset();this.focusTranslationOwner=undefined;
    }
    const f = this.player.forward;
    const flight = this.player.flying || this.player.descending;
    const underwater = this.player.deliveryMotion?.mode === 'underwater' && P.y < -.8;
    const motion = this.player.deliveryMotion;
    this.cameraCollisionOptions ??= {};
    this.cameraCollisionOptions.underwater = underwater && motion ? motion : undefined;
    const solids=this.story?.supports??[];
    this.cameraCollisionOptions.deliverySolids=solids;
    const bed=solids.find(b=>b.id==='delivery-interior-floor'),roof=solids.find(b=>b.id==='delivery-interior-roof');
    const interior=!!bed&&!!roof&&P.y>bed.roof+.15&&P.y<roof.bottom&&
      Math.abs((P.x-bed.x)*bed.hz-(P.z-bed.z)*bed.hx)<bed.halfWidth-.15&&
      Math.abs((P.x-bed.x)*bed.hx+(P.z-bed.z)*bed.hz)<bed.halfLength+.5;
    const requestedFocus=this.story?.cameraFocus;
    const speaker=this.story?.conversationSpeaker;
    const cutToSpeaker=!!speaker&&speaker!==this.lastCameraSpeaker;
    this.lastCameraSpeaker=speaker;
    const parkedHandoff=requestedFocus?.context==='stationary-handoff'&&!flight&&!this.player.jumping&&!this.player.descending&&Math.abs(this.player.speed)<=.75&&Math.abs(this.orbitPitch-.38)<.04&&Math.abs(this.orbitDist)<.1;
    // Once controls are captured, a previous manual orbit cannot lock the
    // customer out of view. Ordinary driving/interior orbit keeps its gates.
    const interactionFocus=this.story?.cinematic?requestedFocus:
      (interior||underwater||parkedHandoff)&&!this.dragging&&Math.abs(this.orbitYaw)<.12?requestedFocus:undefined;
    const air = flight || this.player.pos.y - (this.player.lastSupport + 0.55) > 2;
    // Airborne does not mean moving: a hovering player keeps their chosen view.
    const moving = Math.abs(this.player.speed) > 2;
    if (moving && !this.dragging) {
      const k2 = 1 - Math.exp(-dt * 1.8);
      // Free orbit can cross many turns. Rejoin the chase view by the short arc.
      this.orbitYaw = Math.atan2(Math.sin(this.orbitYaw), Math.cos(this.orbitYaw)) * (1 - k2);
      this.orbitPitch += (0.38 - this.orbitPitch) * k2; this.orbitDist *= 1 - k2;
      if (flight) { this.airOrbitPitch += (.62 - this.airOrbitPitch) * k2; this.airOrbitDist *= 1 - k2; }
    }
    const driving = !air && !flight && !this.player.jumping && !interior && !underwater && !interactionFocus;
    const back = interior ? 3.5 : underwater ? 7 : (driving ? DRIVING_CAMERA.distance : 7.6) + speedCameraDistance(this.player.speed) + (air ? 4 : 0) + (flight ? this.airOrbitDist : this.orbitDist);
    const cy = Math.cos(this.orbitYaw), sy = Math.sin(this.orbitYaw);
    const bx = f.x * cy - f.z * sy, bz = f.x * sy + f.z * cy;          // camera looks along the rotated forward
    const pitch = interior || underwater ? .12 : flight ? this.airOrbitPitch : air ? .62 : this.orbitPitch;
    const hd = back * Math.cos(pitch) / Math.cos(0.38), up = driving ? drivingCameraHeight(this.player.speed, pitch, back) : 0.4 + back * Math.sin(pitch) * 0.95;
    const pivot = new THREE.Vector3(P.x, P.y + 1.4, P.z);
    let desired = new THREE.Vector3(P.x - bx * hd, P.y + up, P.z - bz * hd);
    if(interactionFocus)desired.set(interactionFocus.position.x,interactionFocus.position.y,interactionFocus.position.z);
    // Authored story shots may frame a rooftop customer while the car remains
    // on the street. Test that real subject-to-camera line, not a ray from the
    // car through the restaurant wall. Ordinary chase/orbit behavior is intact.
    const clearFocus=interactionFocus?.clearanceTarget??interactionFocus?.target;
    const cameraPivot=this.story?.cinematic&&clearFocus?new THREE.Vector3(clearFocus.x,clearFocus.y,clearFocus.z):pivot;
    desired = this.clearCamera(cameraPivot, desired);
    this.cameraTranslation ??= new CameraTranslationFollow();
    if (this.cameraTranslation.advance(this.camPos, this.camLook, P, dt, !interactionFocus)) {
      this.camPos.set(0, 0, 0); this.camLook.set(0, 0, 0);
    }
    const anchor=interactionFocus?.translationAnchor;
    if(anchor){
      this.focusTranslation??=new CameraTranslationFollow();
      if(this.focusTranslationOwner!==interactionFocus)this.focusTranslation.reset();
      this.focusTranslationOwner=interactionFocus;
      if(this.focusTranslation.advance(this.camPos,this.camLook,anchor,dt,true)){
        this.camPos.set(0,0,0);this.camLook.set(0,0,0);
      }
    }else{this.focusTranslation?.reset();this.focusTranslationOwner=undefined;}
    const k = 1 - Math.exp(-dt * (this.dragging ? 14 : 5));
    if (cutToSpeaker||!this.camPos.lengthSq()) this.camPos.copy(desired); else this.camPos.lerp(desired, k);
    // This captured truck shot has a checked pivot beyond the car's nose.
    // Its smoothed transition must not pass through the parked Roadster on
    // the way there. Apply the existing solid-escape cut only to this opt-in
    // story shot; ordinary chase/orbit/flight retain their original branch.
    let insideHero=false;
    if(this.story?.cinematic&&interactionFocus?.clearanceTarget){
      const dx=this.camPos.x-P.x,dz=this.camPos.z-P.z;
      insideHero=Math.abs(dx*f.x+dz*f.z)<2.75&&Math.abs(dx*f.z-dz*f.x)<1.5&&this.camPos.y+.35>P.y-.55&&this.camPos.y-.35<P.y+.8;
    }
    // if the smoothed camera would sit inside something, snap to the clear point
    if (insideHero||this.insideSolid(this.camPos)) this.camPos.copy(desired);
    // and if a building corner comes between the lagging camera and the car (turning in a narrow lane), pull it in
    else { const vis = this.clearCamera(cameraPivot, this.camPos); if (vis.distanceToSquared(this.camPos) > 0.01) this.camPos.copy(vis); }
    const aimWeight = driving ? drivingCameraAimWeight(this.orbitYaw, this.orbitPitch, this.dragging) : 0;
    const ahead = drivingCameraLookAhead(this.player.speed) * aimWeight;
    const look = interactionFocus ? new THREE.Vector3(interactionFocus.target.x, interactionFocus.target.y, interactionFocus.target.z) : driving ?
      new THREE.Vector3(P.x + f.x * ahead, P.y + 1.4 + (DRIVING_CAMERA.lookHeight - 1.4) * aimWeight, P.z + f.z * ahead) :
      moving && Math.abs(this.orbitYaw) < 0.3 ? new THREE.Vector3(P.x + f.x * (interior ? 4 : 20), P.y + 1.2, P.z + f.z * (interior ? 4 : 20)) : pivot.clone();
    const aimK = driving && !this.dragging ? 1 - Math.exp(-dt * DRIVING_CAMERA.aimDamping) : k;
    if (cutToSpeaker||!this.camLook.lengthSq()) this.camLook.copy(look); else this.camLook.lerp(look, aimK);
    const cam = this.engine.camera;
    cam.position.copy(this.camPos);
    if (this.player.bump > 0) cam.position.add(new THREE.Vector3((Math.random() - 0.5) * this.player.bump, (Math.random() - 0.5) * this.player.bump, 0));
    cam.lookAt(this.camLook);
    const baseFov = speedCameraFov(this.player.speed);
    cam.fov = dt > 0 ? THREE.MathUtils.lerp(cam.fov, baseFov, 1 - Math.exp(-dt * 6)) : baseFov;
    if (this.player.takeoffAnimating) {
      frameTakeoff(cam, this.player.group, this.camLook, { solid: p => this.insideSolid(p), clear: (from, to) => this.clearCamera(from, to) });
      this.camPos.copy(cam.position);
    }
    cam.updateProjectionMatrix();
    this.traffic.hideNear(cam.position, P, this.player.jumping);
    this.engine.placeSun(new THREE.Vector3(P.x + f.x * 30, 0, P.z + f.z * 30));
    this.placeLampLights();
    this.city.signs.update(P.x, P.z);
  }
  // street life follows the place: shop rows and markets get crowds and dense traffic, colonies stay calm,
  // and arterials keep their traffic even where nobody shops
  busyT = 0; busy = 0;
  setStreetLife(x: number, z: number) {
    const shops = this.city.busyAt(x, z);
    let road = 0;
    for (const g of this.graph.nearestEdges(x, z, 2)) {
      const c = g.e.cls;
      road = Math.max(road, /motorway|trunk|primary/.test(c) ? 0.75 : /secondary/.test(c) ? 0.55 : /tertiary/.test(c) ? 0.35 : 0.1);
    }
    this.busy = shops;
    const low = this.opts.lowQ;
    this.traffic.max = trafficPopulationLimit(low,shops,road);
    this.walkers.max = Math.round((low ? 6 : 12) + (low ? 22 : 70) * shops + (low ? 4 : 8) * road);
  }
  // Camera volume against buildings, landmark piers, poles, walls and decks.
  insideSolid(p: THREE.Vector3) {
    return staticSolidAt(this.city, p, .35, .35, this.cameraCollisionOptions);
  }
  // walk from the car toward the wanted camera spot and stop before the first solid thing
  clearCamera(from: THREE.Vector3, to: THREE.Vector3) {
    const p = clearCameraPosition(this.city, from, to, this.cameraCollisionOptions);
    return new THREE.Vector3(p.x, p.y, p.z);
  }
  lampT = 0;
  private streetLampPositions:THREE.Vector3[]=[];
  private sceneLampReserved=false;
  private deliveryHeadlightGain=1;
  placeLampLights() {
    const sceneLamp=this.story?.sceneLamp,slot=this.engine.lampLights[0],mood=this.engine.mood?.lampLights??0;
    // A moving fixture updates one pooled light each frame. Ordinary street
    // selection keeps its Version21 cadence and there are no extra lights.
    if(slot&&(sceneLamp||this.sceneLampReserved)){this.sceneLampReserved=applySceneLamp(slot,sceneLamp??null,this.streetLampPositions[0]??null,mood,0);}
    if ((this.lampT -= 1) > 0) return; this.lampT = 20;
    const P = this.player.pos;
    const near = this.city.lamps.filter((l) => Math.abs(l.x - P.x) < 70 && Math.abs(l.z - P.z) < 70).sort((a, b) => a.distanceTo(P) - b.distanceTo(P));
    this.streetLampPositions=near;
    this.engine.lampLights.forEach((L,i)=>applySceneLamp(L,i===0?sceneLamp??null:null,near[i]??null,mood,i));
    this.sceneLampReserved=!!sceneLamp;
  }
  updateRoute(dt: number) {
    const tgt = this.routeTarget, P = this.player.pos, f = this.player.forward;
    // Keep actual road/minimap planning and the small HUD direction cue. The
    // occupied truck interior only clears its world-space beacon and ribbon.
    const hideWorldGuidance=!!this.story?.hideWorldGuidance;
    if(this.beacon)this.beacon.visible=!!tgt&&!hideWorldGuidance;
    if (!tgt) { this.gps.visible = false; return; }
    // Authored scenes may be on a roof, inside a hall or on a train. Route
    // the car along real roads to their approach; keep the exact scene marker.
    const roadTarget = this.story?.roadNavigationTarget ?? tgt;
    this.routeT -= dt; this.routeGuideT = (this.routeGuideT || 0) - dt;
    const airborne = this.player.flying || this.player.descending || this.player.jumping;
    if (airborne) {
      // Flight uses the beacon. The map may retain a coarse road overview, but
      // landing always creates a new route from the actual road and height.
      if (this.routeT <= 0) { this.route = this.graph.route(P.x, P.z, roadTarget.x, roadTarget.z, undefined, roadTarget.y); this.routeT = 4; }
      this.routeWasAirborne = true; this.gps.visible = false; return;
    }
    const revision = this.graph.revision || 0, changed = revision !== this.routeGraphRevision;
    const on = this.graph.edgeAt(P.x, P.z, P.y, { hx: f.x, hz: f.z, edgeId: this.player.lastEdge?.id || this.route?.edgeIds?.[0] });
    // Drop consumed edge identities so streamed tiles behind the car do not
    // invalidate an otherwise unchanged route ahead.
    if (this.route?.edgeIds && on) {
      const i = this.route.edgeIds.indexOf(on.g.e.id);
      if (i > 0) this.route.edgeIds = this.route.edgeIds.slice(i);
    }
    const feet = { x: P.x, y: P.y - .55, z: P.z };
    const advanced = this.route && advanceRoadRoute(this.route, feet, 6 + Math.abs(this.player.speed) * Math.max(dt, .001) * 2);
    let oppositeSide = false;
    if (on && advanced && hasCentreMedian(on.g.e) && advanced.route.pts.length) {
      const centre = this.graph.pointAt(on.g, on.s, 1), head = advanced.route.pts[0];
      const side = (x: number, z: number) => (x - centre.x) * centre.hz - (z - centre.z) * centre.hx;
      const carSide = side(P.x, P.z), lineSide = side(head[0], head[2]);
      oppositeSide = Math.abs(carSide) > .9 && Math.abs(lineSide) > .9 && carSide * lineSide < 0;
    }
    const offRoute = !!this.route && (oppositeSide || (!advanced || advanced.distance > Math.max(7, (on?.g.e.w || 10) * .6) || advanced.heightError > 1.6 || !on || (this.route.edgeIds?.length && !this.route.edgeIds.includes(on.g.e.id))));
    const missingRoad = changed && this.route?.edgeIds?.some(id => !this.graph.byId.has(id));
    const replan = this.routeWasAirborne || this.routePlacementRevision !== this.player.placementRevision || offRoute || missingRoad || (changed && this.route?.complete === false) || (!this.route && this.routeT <= 0);
    if (replan) {
      this.route = this.graph.route(P.x, P.z, roadTarget.x, roadTarget.z, { hx: f.x, hz: f.z, y: P.y, edgeId: on?.g.e.id }, roadTarget.y, P.y, true);
      this.routeT = .6; this.routeGuideT = 0; this.routeAlpha = 0; this.routeGuide = [];
    } else if (advanced) this.route = advanced.route;
    this.routeWasAirborne = false; this.routeGraphRevision = revision; this.routePlacementRevision = this.player.placementRevision;
    if (changed || this.routeGuideT <= 0) {
      this.routeGuideT = .75;
      const guidance = clearRoadGuidance(this.city, softenRoadCorners(this.city, this.route?.pts || []));
      this.routeGuidanceBlocked = guidance.blocked; this.routeGuide = guidance.pts;
    } else if (this.routeGuide.length > 1) {
      const advancedGuide = advanceRoadRoute({ pts: this.routeGuide, len: 700 }, feet, 6 + Math.abs(this.player.speed) * Math.max(dt, .001) * 2);
      if (advancedGuide) this.routeGuide = advancedGuide.route.pts;
    }
    const vertices = guidanceRibbon(this.routeGuide), geometry = this.gps.geometry;
    let attribute = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!attribute || attribute.array.length < vertices.length) {
      // Reuse the allocation during motion rather than dispose/upload a new
      // geometry at every frame or route refresh.
      attribute = new THREE.BufferAttribute(new Float32Array(3 * Math.max(256, 2 ** Math.ceil(Math.log2(vertices.length / 3 || 1)))), 3);
      attribute.setUsage(THREE.DynamicDrawUsage); geometry.setAttribute('position', attribute);
    }
    (attribute.array as Float32Array).set(vertices); attribute.needsUpdate = true; geometry.setDrawRange(0, vertices.length / 3);
    // Dynamic route vertices move between streets; a cached sphere can cull
    // the newly uploaded ribbon using the previous route location.
    this.gps.frustumCulled = false;
    this.routeAlpha = (this.routeAlpha || 0) + (1 - (this.routeAlpha || 0)) * (1 - Math.exp(-dt * 12));
    const material = this.gps.material as THREE.MeshBasicMaterial;
    material.side = THREE.DoubleSide; material.opacity = .6 * this.routeAlpha;
    this.gps.visible = !hideWorldGuidance && !!this.route && vertices.length > 0;
  }
  private capturePickupPose(pose: JumpPickupPose) {
    const p = this.player, bounds = p.jumpTrafficBounds;
    pose.x = p.pos.x; pose.y = p.pos.y; pose.z = p.pos.z;
    pose.bottom = bounds?.bottom ?? p.pos.y - .55;
    pose.top = bounds?.top ?? p.pos.y + .8;
    pose.jumping = p.jumping;
  }
  private updateCarrierPickup(dt: number) {
    const P = this.player.pos;
    const available = !this.story || this.story.canPickup;
    this.pickupDetector.enabled = available;
    const view = this.carrierView ??= { cameraX:0,cameraY:0,cameraZ:0, forwardX: 0, forwardZ: -1, jumping: false, airborne: false };
    view.forwardX = -Math.sin(this.player.yaw); view.forwardZ = -Math.cos(this.player.yaw);
    const camera = this.engine.camera.position; view.cameraX=camera.x; view.cameraY=camera.y; view.cameraZ=camera.z;
    view.jumping = this.player.jumping; view.airborne = this.player.flying || this.player.descending || this.player.jumping;
    this.carriers.update(dt, this.traffic.cars, P, available && !this.pickupDetector.caught, view);
    this.carrierSpawnT = Math.max(0, this.carrierSpawnT - dt);
    if (available && !this.pickupDetector.caught && !this.carriers.activeCount && this.carrierSpawnT === 0) {
      // A bounded call to Traffic's collision/gate-aware spawner also covers a
      // full budget of distant cars. Its normal update retires the farthest car.
      this.carrierSpawnT = 1;
      if (this.traffic.cars.length <= this.traffic.max) this.traffic.spawn(P.x, P.z, 'auto');
      this.carriers.update(0, this.traffic.cars, P, available, view);
    }
    this.capturePickupPose(this.pickupAfter);
    this.pickupDetector.update(this.pickupBefore, this.pickupAfter, this.carriers.markers,
      (marker, time) => pickupPathClear(this.city, this.pickupBefore, this.pickupAfter, marker, time));
  }
  areaNow = ''; areaCand = ''; areaCandT = 0;
  campusProximity = new CampusProximity(DESTINATION_IDENTITIES);
  updateHud() {
    const h = this.hud, o = this.order, P = this.player.pos;
    this.updateOrderAvailability();
    { const a = this.areaName(P.x, P.z) || ''; if (a !== this.areaCand) { this.areaCand = a; this.areaCandT = this.t; } else if (a && a !== this.areaNow && this.t - this.areaCandT > 1.5) { if (this.areaNow) h.areaChip(a); this.areaNow = a; } }
    const campus = this.campusProximity?.update(P.x, P.z, P.y, this.t);
    if (campus) h.areaChip(campus, 'Nearby');
    if (!this.carrierPickupMode) h.set('coins', this.coins.toLocaleString('en-IN'));
    h.set('clock', `Day ${this.day} · ${fmtTime(this.minutes)}`);
    const L = LEVELS[Math.min(this.level, LEVELS.length - 1)];
    h.set('level', this.story?.levelLabel ?? (this.carrierPickupMode ? 'Jump grab · Preview' : `Level ${this.level + 1} · ${this.doneInLevel}/${L.n}`));
    h.set('spd', String(Math.round(Math.abs(this.player.speed) * 3.6)));
    h.flightReserve?.(1, true);
    h.flightState?.(this.player.flying, this.player.descending);
    this.updateJumpState();
    const navigation = (s: Stop) => navigationReadout(this.route, this.routeGuidanceBlocked, P, s, this.player.flying || this.player.descending || this.player.jumping);
    const distanceLabel = (s: Stop) => { const n = navigation(s); return `${n.approximate ? '~' : ''}${n.metres} m`; };
    const sub = (s: Stop) => [s.sub, navigation(s).note].filter(Boolean).join(' · ');
    if (!o || o.state === 'offer') {
      const t = this.routeTarget;
      h.order({ state: t ? 'GPS' : o ? 'New request' : this.orderOffersEnabled ? 'Available for orders' : 'Free roam', title: t ? t.label : o ? 'Review delivery details' : this.orderOffersEnabled ? 'Waiting for a delivery' : 'Explore Hyderabad', sub: t ? sub(t) : '', dist: t ? distanceLabel(t) : '', time: '', meters: false, stage: 'idle' });
    } else if (o.state === 'toPickup') {
      h.order({ state: 'Head to pickup', title: o.pickup.label, sub: sub(o.pickup) || 'Follow the orange route.', dist: distanceLabel(o.pickup), time: '', meters: false,
        stage: h.activeAction === 'collect' ? 'collect' : 'pickup', next: o.drop.label, orderId: o.id });
    } else {
      const left = Math.max(0, o.limit - o.t);
      h.order({ state: 'Deliver to customer', title: o.drop.label, sub: sub(o.drop), dist: distanceLabel(o.drop), time: left > 0 ? `${Math.ceil(left)} s` : 'Late!', heat: o.heat, slices: o.slices, meters: true, stage: 'delivery', orderId: o.id });
    }
    this.drawMinimap();
  }
  /** One local path for the ground cue, road ribbon and rotating minimap. */
  private navigationRoadPoints() {
    return this.player.flying || this.player.descending || this.player.jumping ? this.route?.pts || [] : this.routeGuide;
  }
  private roadNavigation(target: { x: number; z: number }) {
    return this.story?.localNavigation ?? roadNavigationCue(this.routeGuidanceBlocked ? undefined : this.navigationRoadPoints(),
      this.route?.len ?? Math.hypot(target.x - this.player.pos.x, target.z - this.player.pos.z), { yaw: this.player.yaw });
  }
  drawMinimap() {
    const c = this.hud.el.minimap as HTMLCanvasElement; const g = c.getContext('2d')!;
    const W = c.width, R = 240, sc = (W / 2) / R, P = this.player.pos, yaw = this.player.yaw;
    const backingPerCss = W / (c.clientWidth || W);
    g.clearRect(0, 0, W, W); g.save();
    g.beginPath(); g.arc(W / 2, W / 2, W / 2, 0, 7); g.clip();
    g.fillStyle = '#1B1633'; g.fillRect(0, 0, W, W);
    g.translate(W / 2, W / 2); g.rotate(yaw); g.scale(sc, sc); g.translate(-P.x, -P.z);
    g.lineCap = 'round';
    for (const e of this.graph.nearestEdges(P.x, P.z, 5)) {
      g.strokeStyle = e.e.elev ? '#8a80b8' : ['trunk', 'primary', 'secondary'].includes(e.e.cls) ? '#CFC6E4' : '#5a4f8a';
      g.lineWidth = Math.max(2.5, e.e.w * 0.9);
      g.beginPath(); e.e.pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke();
    }
    const railways = railwayMapLayer(this.city.railway?.profiles || railwayNetwork().profiles);
    drawRailways(g, railways.nearby(P.x, P.z, R), sc);
    for (const l of metroCorridors(this.zone.metro.lines)) { g.strokeStyle = l.color; g.lineWidth = 3; g.setLineDash([10, 8]); g.beginPath(); l.center.pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke(); g.setLineDash([]); }
    if (this.route) strokeMinimapRoute(g, this.navigationRoadPoints().length > 1 ? this.navigationRoadPoints() : this.route.pts, sc, backingPerCss);
    if (this.routeTarget) { g.fillStyle = MINIMAP_NAVIGATION.target; g.strokeStyle = MINIMAP_NAVIGATION.casing; g.lineWidth = 2 * backingPerCss / sc; g.beginPath(); g.arc(this.routeTarget.x, this.routeTarget.z, 5 * backingPerCss / sc, 0, 7); g.fill(); g.stroke(); }
    g.restore();
    drawMinimapPlayer(g, W, backingPerCss);
  }
  stillFrame(q: URLSearchParams) {
    const sr = (q.get('showroom') || '').split(',').map(Number);
    if (sr.length >= 3) {
      // line up every traffic model and a crowd of walkers for a review render
      const [x0, z0, ang] = sr, ux = Math.cos(ang), uz = -Math.sin(ang);
      let off = 0;
      for (const pr of this.traffic.protos) {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(pr.body, this.engine.mats.vBody), new THREE.Mesh(pr.lights, this.engine.mats.vLight));
        for (const d of pr.decals) g.add(new THREE.Mesh(d.geo, d.mat));
        g.children.forEach((m) => { (m as THREE.Mesh).castShadow = true; });
        off += pr.size[0] / 2 + 0.6;
        g.position.set(x0 + ux * off, 0.07, z0 + uz * off); g.rotation.y = ang + Math.PI / 2 + (q.get('rot') ? +q.get('rot')! : 0);
        off += pr.size[0] / 2 + 0.6;
        this.engine.scene.add(g);
      }
      for (let i = 0; i < 28; i++) this.walkers.spawn(this.player.pos.x, this.player.pos.z);
      for (let i = 0; i < 40; i++) this.walkers.update(0.05, x0, z0, { x: 1e6, z: 1e6, y: 0, speed: 0, fx: 0, fz: 1 });
    }
    if (q.get('sim')) {
      const n = +q.get('sim')!;
      const P = this.player.pos;
      for (let i = 0; i < n; i++) { this.traffic.update(0.05, P.x, P.z, { x: P.x, z: P.z, y: P.y, speed: 0 }, this.walkers.list); this.walkers.update(0.05, P.x, P.z, { x: P.x, z: P.z, y: P.y, speed: 0, fx: 0, fz: 1 }); }
    }
    this.city.updateSignals(this.traffic.t);
    const p = (q.get('player') || '').split(',').map(Number);
    if (p.length >= 3) { this.player.place(p[0], p[1], p[2]); this.player.update(0.016, { throttle: 0, brake: 0, steer: 0, flyPressed: false, boost: false }, 0.4); }
  }
}
function esc(s: string) { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!)); }

function setLoading(t: string) { if (t) showLoading(t, 'streets'); else hideLoading(); }
