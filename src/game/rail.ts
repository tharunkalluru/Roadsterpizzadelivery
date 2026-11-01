import * as THREE from 'three';
import { Batch } from '../core/util';
import { buildRailwayRun, railwayPoint, projectRailwayRun, parallelRailwayRuns, sharedRailwayWay, RailwayFlow, railwaySweepsConflict, railwayContinuations, type RailwayTrack, type RailwayRun, type RailDirection } from './railway-flow';
import { MovingRailFrames, type MovingRailShape } from './moving-rail';
import type { RailwayCrossings, RailwayApproach } from './railway-crossings';

// Suburban and express trains on the railway lines around the player: a locomotive and a rake of coaches that
// follow the curves of the track, spawned a little way off and running through.
type Track = RailwayTrack;
type Run = RailwayRun;
interface Train { id: string; run: Run; s: number; dir: 1 | -1; v: number; cars: THREE.Mesh[]; cruise?: number; motionSpeed?: number;
  /** Coach geometry retains this heading when a double-cab shuttle reverses. */
  formationDir?: RailDirection; story?: {active:boolean;dwell:number};
  /** A source train adopted in place must retain every existing rider height. */
  coachRoofs?:number[];coachHalfLengths?:number[]; }
const CAR = 22.5, GAP = 0.9, MAXT = 2, END_BUFFER = 6, END_BRAKE = 1.5;

function coachGeo(kind: 'loco' | 'coach', livery: string) {
  const b = new Batch();
  if (kind === 'loco') {
    b.box(0, 2.25, 0, 3.05, 3.3, CAR - 4, '#c8352e'); b.box(0, 1.35, 0, 3.08, 0.5, CAR - 4, '#f2f2ee');
    b.box(0, 2.9, -(CAR - 4) / 2 - 0.4, 2.8, 1.2, 0.8, '#1c2533'); b.box(0, 4.3, 0, 0.3, 0.6, 3, '#55565c');
  } else {
    b.box(0, 2.3, 0, 3.1, 3.4, CAR, livery); b.box(0, 2.6, 0, 3.14, 0.9, CAR - 2, '#1c2533');
    b.box(0, 4.05, 0, 2.9, 0.25, CAR - 0.6, '#9a9aa2');
  }
  b.box(0, 0.45, 0, 2.4, 0.5, (kind === 'loco' ? CAR - 4 : CAR) - 2, '#2b2a30');
  return b.geometry();
}

function vandeBharatGeo(end: 'front'|'rear'|'middle'){
  const b=new Batch();
  b.box(0,2.3,0,3.12,3.4,CAR-1,'#E9EEF0');b.box(0,1.1,0,3.16,.65,CAR-.6,'#2558A8');
  b.box(0,2.65,0,3.16,.93,CAR-4,'#20354D');b.box(0,3.95,0,2.98,.4,CAR-1,'#E7ECEC');
  b.box(0,.45,0,2.4,.5,CAR-2,'#292D34');
  for(const x of[-1.58,1.58])for(const z of[-7.7,7.7]){b.box(x,2,z,.035,2.2,1.2,'#234B8D');b.box(x,2.55,z,.045,.65,.8,'#243E53');}
  if(end!=='middle'){
    const sign=end==='front'?-1:1;
    b.box(0,2,sign*(CAR/2-.45),2.7,2.6,.9,'#E9EEF0');b.box(0,2.95,sign*(CAR/2+.015),2.45,.9,.035,'#213A55');
    b.box(0,1.38,sign*(CAR/2+.04),2.65,.32,.06,'#2558A8');
    for(const x of[-.94,.94])b.box(x,1.95,sign*(CAR/2+.07),.34,.17,.08,'#FFF2D4');
  }
  return b.geometry();
}

export class RailTrains {
  group = new THREE.Group(); trains: Train[] = []; t = 0; geos: Record<string, THREE.BufferGeometry> = {};
  private nextTrain = 0; private frames = new MovingRailFrames();
  private requestedStoryRun:Run|null=null;
  get bodies() { return this.frames.bodies; }
  private crossings?: RailwayCrossings;
  setCrossings(crossings: RailwayCrossings) { this.crossings = crossings; }
  get approaches(): RailwayApproach[] { return this.trains.map(t => ({ id: t.id, run: t.run, s: this.travelHead(t), dir: t.dir, speed: t.motionSpeed ?? t.v, length: t.cars.length * (CAR + GAP) })); }
  constructor(public mat: THREE.Material) {}
  geo(k: string) { return this.geos[k] || (this.geos[k] = k.startsWith('vande:')?vandeBharatGeo(k.slice(6) as 'front'|'rear'|'middle'):k === 'loco' ? coachGeo('loco', '') : coachGeo('coach', k)); }
  private formation(t:Pick<Train,'dir'|'formationDir'>){return t.formationDir??t.dir;}
  private travelHead(t:Pick<Train,'dir'|'formationDir'|'s'|'cars'>){const formation=this.formation(t);return t.dir===formation?t.s:t.s-formation*(Math.max(0,t.cars.length-1)*(CAR+GAP)+CAR);}
  /** Pin an actual mapped, continuous route. Never replace or erase an ordinary
   * visible train to make room; callers may retry when the line becomes clear. */
  ensureStoryShuttle(run:Run,near:{x:number;z:number}):string|null{
    this.requestedStoryRun=run;
    const existing=this.trains.find(t=>t.story?.active);if(existing)return existing.id;
    const retained=this.trains.find(t=>t.story&&t.run===run);if(retained){retained.story!.active=true;return retained.id;}
    const occupying=this.trains.filter(t=>sharedRailwayWay(t.run,run));
    if(occupying.length===1&&this.adoptStoryTrain(occupying[0],run))return occupying[0].id;
    const n=8,dir=1,limits=this.limits({run,dir,cars:Array(n)});
    if(run.pts.length<2||limits.max<limits.min||!Number.isFinite(run.len)||this.trains.some(t=>sharedRailwayWay(t.run,run)))return null;
    const nearS=projectRailwayRun(run,near.x,near.z).s;
    let s=Math.max(limits.min,Math.min(limits.max,nearS+2*(CAR+GAP)+CAR/2));
    s=this.crossings?.safeSpawn(run,s,dir,n*(CAR+GAP))??s;if(s<limits.min||s>limits.max)return null;
    const id=`rail:story:${this.nextTrain++}`,draft:Train={id,run,s,dir,formationDir:dir,v:0,cruise:16,cars:Array(n).fill(null),story:{active:true,dwell:0}};
    const shapes=this.shapes(draft,s);if(this.trains.some(t=>railwaySweepsConflict(shapes,shapes,this.shapes(t,t.s),this.shapes(t,t.s))))return null;
    draft.cars=Array.from({length:n},(_,k)=>{const mesh=new THREE.Mesh(this.geo(`vande:${k===0?'front':k===n-1?'rear':'middle'}`),this.mat);mesh.name=`Vande Bharat ${k+1}`;mesh.castShadow=true;mesh.frustumCulled=false;this.group.add(mesh);return mesh;});
    this.trains.push(draft);
    draft.cars.forEach((mesh,k)=>{const p=this.at(run,s-k*(CAR+GAP)-CAR/2);mesh.position.set(p.x,p.y,p.z);mesh.rotation.set(p.pitch,p.yaw+Math.PI,0,'YXZ');});
    this.frames.set(this.trains.flatMap(t=>this.shapes(t,t.s)));return id;
  }
  /** Keep all coach poses, identities and collision heights when an ordinary
   * train is already on the requested corridor. Extending its scalar route is
   * safe only if every rendered coach agrees with the canonical full route. */
  private adoptStoryTrain(train:Train,run:Run){
    const before=this.shapes(train,train.s);if(before.length!==train.cars.length||!before.length)return false;
    const head=projectRailwayRun(run,before[0].x,before[0].z),tangent=this.at(run,head.s);
    const formation:RailDirection=before[0].hx*Math.sin(tangent.yaw)+before[0].hz*Math.cos(tangent.yaw)>=0?1:-1;
    const distance=head.s+formation*CAR/2,limits=this.limits({...train,run,formationDir:formation});
    if(distance<limits.min||distance>limits.max)return false;
    const draft:Train={...train,run,s:distance,dir:formation,formationDir:formation,story:{active:true,dwell:0},
      coachRoofs:before.map(b=>b.roof-b.y),coachHalfLengths:before.map(b=>b.halfLength)};
    const after=this.shapes(draft,distance);
    if(after.length!==before.length||after.some((body,k)=>Math.hypot(body.x-before[k].x,body.z-before[k].z)>.015||Math.abs(body.y-before[k].y)>.015||body.hx*before[k].hx+body.hz*before[k].hz<.9999))return false;
    Object.assign(train,draft);train.cruise=Math.max(16,train.cruise??train.v);
    train.cars.forEach((mesh,k)=>{
      mesh.geometry=this.geo(`vande:${k===0?'front':k===train.cars.length-1?'rear':'middle'}`);mesh.name=`Vande Bharat ${k+1}`;mesh.frustumCulled=false;
      mesh.scale.set(1,train.coachRoofs![k]/4.175,train.coachHalfLengths![k]/(CAR/2));
      const p=this.at(run,distance-formation*(k*(CAR+GAP)+CAR/2));mesh.position.set(p.x,p.y,p.z);mesh.rotation.set(formation*p.pitch,p.yaw+(formation>0?Math.PI:0),0,'YXZ');
    });
    this.frames.set(this.trains.flatMap(t=>this.shapes(t,t.s)));return true;
  }
  clearStoryShuttle(){this.requestedStoryRun=null;for(const train of this.trains)if(train.story)train.story.active=false;}
  storyCoach(id:string,index=2){return this.bodies.find(b=>b.id===`${id}:${index}`)??null;}
  private flow = new RailwayFlow();
  private runSnapshot: Map<string, Track> | null = null;
  private canonicalRuns: Run[] = [];
  private networkRevision = 0;
  private continuationChecks = new WeakMap<Train, { run: Run; revision: number }>();
  // Both the physical mapped rails and the trains retain their source geometry.
  buildRun(rails: Map<string, Track>, start: Track): Run { return buildRailwayRun(rails, start); }
  private runsFor(rails: Map<string, Track>) {
    // Streamed track objects are immutable. A neighboring tile can replace a
    // way without changing the Map's size, so compare keys and object identity.
    if(this.runSnapshot&&this.runSnapshot.size===rails.size) {
      let same=true;
      // Map.forEach avoids allocating one entry tuple per canonical way on
      // every frame, while still detecting in-place same-size replacement.
      rails.forEach((track,id)=>{if(same&&this.runSnapshot!.get(id)!==track)same=false;});
      if(same)return this.canonicalRuns;
    }
    const runs: Run[] = [], used = new Set<string>();
    for (const [id, track] of rails) {
      if (track.pts.length < 2 || used.has(id)) continue;
      const run = this.buildRun(rails, track); runs.push(run);
      for (const way of run.ways) used.add(way.id);
    }
    this.runSnapshot = new Map(rails); this.canonicalRuns = runs; this.networkRevision++;
    return runs;
  }
  private point(run: Run, s: number) {
    const p = railwayPoint(run, s); return { ...p, yaw: Math.atan2(p.hx, p.hz) };
  }
  at(run: Run, s: number) {
    const p = this.point(run, s), a = this.point(run, s - 7), b = this.point(run, s + 7);
    if (Math.hypot(b.x - a.x, b.z - a.z) > .01) { p.yaw = Math.atan2(b.x - a.x, b.z - a.z); p.pitch = Math.atan2(b.y - a.y, Math.hypot(b.x - a.x, b.z - a.z)); }
    return p;
  }
  private shapes(t: Pick<Train, 'id' | 'run' | 'dir' | 'cars'|'formationDir'|'story'|'coachRoofs'|'coachHalfLengths'>, distance: number): MovingRailShape[] {
    const bodies: MovingRailShape[] = [],formation=this.formation(t);
    t.cars.forEach((_, k) => {
      const s = distance - formation * (k * (CAR + GAP) + CAR / 2);
      if (s < 0 || s > t.run.len) return;
      const p = this.at(t.run, s);
      bodies.push({ id: `${t.id}:${k}`, x: p.x, y: p.y, z: p.z,
        hx: Math.sin(p.yaw) * formation, hz: Math.cos(p.yaw) * formation, grade: Math.tan(p.pitch) * formation,
        halfWidth: 1.57, halfLength: t.coachHalfLengths?.[k]??(k === 0&&!t.story ? 10.05 : CAR / 2), bottom: p.y + .2, roof: p.y + (t.coachRoofs?.[k]??(k === 0&&!t.story ? 3.9 : 4.175)),
        roofGroup: t.id, roofIndex: k });
    });
    return bodies;
  }
  private limits(t: Pick<Train,'cars'|'dir'|'run'|'formationDir'>) {
    const length = Math.max(0,t.cars.length-1)*(CAR+GAP)+CAR;
    const formation=this.formation(t);
    return { min:formation>0?length+END_BUFFER:END_BUFFER, max:formation>0?t.run.len-END_BUFFER:t.run.len-length-END_BUFFER };
  }
  private onward(t: Train, rails: Map<string,Track>) {
    if(t.story)return;
    for(let step=0;step<8;step++) {
      const remaining=t.dir>0?t.run.len-t.s:t.s;
      if(remaining>Math.max(500,t.v*t.v/(2*END_BRAKE)+200))break;
      const checked=this.continuationChecks.get(t);
      if(checked?.run===t.run&&checked.revision===this.networkRevision)break;
      this.continuationChecks.set(t,{run:t.run,revision:this.networkRevision});
      const next=railwayContinuations(t.run,t.dir,rails).find(option=>
        !(this.requestedStoryRun&&!sharedRailwayWay(t.run,this.requestedStoryRun)&&sharedRailwayWay(option.run,this.requestedStoryRun))&&
        !this.trains.some(other=>other.story&&sharedRailwayWay(other.run,option.run))&&this.flow.reserve(option.run,t.dir));
      if(!next)break;
      // Prepending changes scalar distance only; every existing world-space
      // point, coach ID, heading and carried passenger remains in place.
      if(t.dir<0)t.s+=next.added;
      t.run=next.run;
    }
  }
  private spawn(px: number, pz: number, rails: Map<string, Track>) {
    const nearby: { run: Run; distance: number; pair: number }[] = [];
    for (const run of this.runsFor(rails)) {
      const distance = projectRailwayRun(run, px, pz).d;
      if (run.len <= 700 || distance > 900 ||this.requestedStoryRun&&sharedRailwayWay(this.requestedStoryRun,run)|| this.trains.some(t => sharedRailwayWay(t.run, run))) continue;
      const pair = this.trains.reduce((score, t) => Math.max(score, parallelRailwayRuns(t.run, run)?.score || 0), 0);
      nearby.push({ run, distance, pair });
    }
    // When one train is present, fill its other mapped track first. No random
    // direction can send two rakes toward each other on a shared source way.
    nearby.sort((a, b) => b.pair - a.pair || a.distance - b.distance || a.run.ways[0].id.localeCompare(b.run.ways[0].id));
    for (const { run } of nearby) {
      let dir: RailDirection | null = this.flow.direction(run); if (!dir) continue;
      const partners = [...this.trains.map(t => t.run), ...nearby.map(t => t.run)]
        .map(other => ({ other, pair: parallelRailwayRuns(run, other) }))
        .filter(p => p.pair).sort((a, b) => b.pair!.score - a.pair!.score);
      if (partners.length) {
        let paired = false;
        for (const partner of partners) {
          const selected = this.flow.pair(run, partner.other);
          if (selected) { dir = selected; paired = true; break; }
        }
        if (!paired) continue;
      }
      if (!this.flow.reserve(run, dir)) continue;
      const ns = projectRailwayRun(run, px, pz).s;
      const n = 8 + Math.floor(Math.random() * 6);
      const limits=this.limits({run,dir,cars:Array(n)});
      if(limits.max<limits.min)continue;
      let s = Math.max(limits.min, Math.min(limits.max, ns - dir * 550));
      s = this.crossings?.safeSpawn(run, s, dir, n * (CAR + GAP)) ?? s;
      if(s<limits.min||s>limits.max)continue;
      const id = `rail:${this.nextTrain}`, draft = { id, run, dir, cars: Array(n).fill(null) as THREE.Mesh[] };
      const shape = this.shapes(draft, s);
      if (this.trains.some(t => railwaySweepsConflict(shape, shape, this.shapes(t, t.s), this.shapes(t, t.s)))) continue;
      const livery = ['#2f5d9a', '#7b2d26', '#2f5d9a', '#3d6b4f'][Math.floor(Math.random() * 4)], cars: THREE.Mesh[] = [];
      for (let k = 0; k < n; k++) { const m = new THREE.Mesh(this.geo(k === 0 ? 'loco' : livery), this.mat); m.castShadow = true; this.group.add(m); cars.push(m); }
      this.trains.push({ id, run, dir, s, v: 12 + Math.random() * 8, cars }); this.nextTrain++; return;
    }
  }
  update(dt: number, px: number, pz: number, rails: Map<string, Track>) {
    this.t += dt;
    if(rails.size)this.runsFor(rails);
    if (this.trains.length < MAXT && this.t > 6 && rails.size) { this.t = 0; this.spawn(px, pz, rails); }
    for(const train of this.trains)this.onward(train,rails);
    const travelled=new Map(this.trains.map(train=>[train,0]));
    // At turnouts or genuinely crossing mapped lines, reserve the swept whole
    // rake before moving. Substeps bound rotation while priority lets one pass.
    const steps = Math.max(1, Math.ceil(dt / .05)), step = dt / steps;
    for (let i = 0; i < steps; i++) {
      const current = this.trains.map(t => this.shapes(t, t.s));
      const distances = this.trains.map(t => {
        const limits=this.limits(t),remaining=Math.max(0,t.dir>0?limits.max-t.s:t.s-limits.min);
        if(t.story&&remaining<.04&&t.v<.3){
          t.v=0;t.story.dwell+=step;
          if(t.story.dwell>=2.5){t.dir=-t.dir as RailDirection;t.story.dwell=0;t.cruise=16;}
          return 0;
        }
        const cruise=t.cruise??t.v,limit=Math.sqrt(2*END_BRAKE*remaining),desired=Math.min(cruise,limit);
        if(limit<cruise)t.cruise=cruise;
        if(t.v>desired)t.v=desired;
        else if(t.v<desired&&step>0)t.v=Math.min(desired,t.v+step*1.2);
        if(t.cruise!==undefined&&t.v>=cruise&&limit>=cruise)delete t.cruise;
        const requested=Math.min(remaining,Math.max(0,t.v)*step);
        return this.crossings?.trainAdvance(t.run,this.travelHead(t),t.dir,requested)??requested;
      });
      const next = this.trains.map((t, i) => this.shapes(t, t.s + t.dir * distances[i]));
      const advance = this.trains.map(() => true);
      for (let a = 0; a < this.trains.length; a++) for (let b = a + 1; b < this.trains.length; b++) {
        if (!railwaySweepsConflict(current[a], next[a], current[b], next[b])) continue;
        if (!railwaySweepsConflict(current[a], next[a], current[b], current[b])) advance[b] = false;
        else if (!railwaySweepsConflict(current[a], current[a], current[b], next[b])) advance[a] = false;
        else { advance[a] = false; advance[b] = false; }
      }
      this.trains.forEach((t, i) => { if (advance[i]) {t.s += t.dir * distances[i];travelled.set(t,travelled.get(t)!+distances[i]);} });
    }
    const bodies: MovingRailShape[] = [];
    for (const t of [...this.trains]) {
      if(dt>0)t.motionSpeed=travelled.get(t)!/dt;
      const shapes=this.shapes(t,t.s);
      // Retire only a whole distant rake. Its tail may still carry the player
      // even when the locomotive has left the nearby visual region.
      if(!t.story?.active&&shapes.length&&shapes.every(coach=>Math.hypot(coach.x-px,coach.z-pz)>2600)) { for (const c of t.cars) this.group.remove(c); this.trains.splice(this.trains.indexOf(t), 1); continue; }
      t.cars.forEach((c, k) => {
        const formation=this.formation(t),s = t.s - formation * (k * (CAR + GAP) + CAR / 2);
        if (s < 0 || s > t.run.len) { c.visible = false; return; }
        const p = this.at(t.run, s); c.visible = true;
        c.position.set(p.x, p.y, p.z); c.rotation.set(formation * p.pitch, p.yaw + (formation > 0 ? Math.PI : 0), 0, 'YXZ');
      });
      bodies.push(...shapes);
    }
    this.frames.set(bodies);
  }
}
