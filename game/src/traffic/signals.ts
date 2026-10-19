import type { WorldPhysics } from '../world/collision';
import { SIM_HZ } from '../config/gameplay';
import {transportOf} from './placements';

export type SignalColor = 'green' | 'amber' | 'red';

/**
 * Fixed-time signal plans at OSM `highway=traffic_signals` junctions (S03). Approaches are split
 * into two phases by axis; timings are authored defaults (provisional — real phase plans unknown)
 * and run on the simulation clock so pause/replay stay consistent.
 */
export class SignalSystem {
  /** directed edge id → { junction node, phase index } for edges arriving at a signalled node */
  readonly approach = new Map<string, { node: string; phase: 0 | 1; offset: number;pedestrian?:boolean }>();
  readonly nodes: { node: string; x: number; z: number; approaches: { edge: string; phase: 0 | 1; heading: number }[]; offset: number;cluster:number;pedestrian?:boolean }[] = [];
  readonly crossings:{id:string;roadId:string;along:number;edgeIds:string[];controlled:boolean;offset:number}[]=[];
  static readonly GREEN = 18 * SIM_HZ;
  static readonly AMBER = 3 * SIM_HZ;
  static readonly CYCLE = 2 * (SignalSystem.GREEN + SignalSystem.AMBER);
  static readonly WALK=20*SIM_HZ;
  static readonly WALK_CLEAR=4*SIM_HZ;

  constructor(world: WorldPhysics) {
    const nodePos = new Map(world.core.nodes.map((n) => [n.id, n]));
    let k = 0;
    for (const j of world.core.junctions) {
      if (!j.signalled) continue;
      const n = nodePos.get(j.nodeId);
      if (!n) continue;
      // Split graph nodes of one physical junction share a clock; offsetting each head
      // independently makes neighbouring arms display contradictory phases.
      const adjacent = this.nodes.find(s => Math.hypot(s.x-n.x,s.z-n.z)<45);
      const cluster=adjacent?.cluster??k++;
      const offset = adjacent?.offset ?? (cluster * 7 * SIM_HZ) % SignalSystem.CYCLE;
      const approaches: { edge: string; phase: 0 | 1; heading: number }[] = [];
      for (const d of world.core.directed) {
        if (d.toNode !== j.nodeId) continue;
        const h = world.nav.pointOnDirected(d.id, Math.max(0, d.lengthM - 3)).heading;
        const phase: 0 | 1 = Math.abs(Math.cos(h)) >= Math.abs(Math.sin(h)) ? 0 : 1;
        approaches.push({ edge: d.id, phase, heading: h });
        this.approach.set(d.id, { node: j.nodeId, phase, offset });
      }
      if (approaches.length) this.nodes.push({ node: j.nodeId, x: n.x, z: n.z, approaches, offset,cluster });
    }
    const transport=transportOf(world.core);
    for(const match of transport?.matches??[]){
      const feature=transport!.features.find(f=>f.id===match.featureId)!;if(feature.kind!=='crossing')continue;
      const p=world.roads.pointAlong(match.roadId,match.alongM),near=this.nodes.filter(n=>Math.hypot(n.x-p.x,n.z-p.z)<45).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z));
      const controlled=feature.tags?.crossing==='traffic_signals'||feature.tags?.['crossing:signals']==='yes'||near.length>0;
      this.crossings.push({id:feature.id,roadId:match.roadId,along:match.alongM,edgeIds:match.edgeIds,controlled,offset:near[0]?.offset??0});
      if(controlled)for(const n of near){n.pedestrian=true;for(const ap of n.approaches)this.approach.get(ap.edge)!.pedestrian=true;}
    }
    // Every head in a shared physical junction must use the same cycle length too.
    // Updating only the heads nearest the crossing desynchronizes neighbouring arms.
    const pedestrianClusters=new Set(this.nodes.filter(n=>n.pedestrian).map(n=>n.cluster));
    for(const n of this.nodes)if(pedestrianClusters.has(n.cluster)){
      n.pedestrian=true;for(const ap of n.approaches)this.approach.get(ap.edge)!.pedestrian=true;
    }
  }

  colorFor(edge: string, tick: number): SignalColor | null {
    const a = this.approach.get(edge);
    if (!a) return null;
    return SignalSystem.phaseColor(a.phase, tick + a.offset,a.pedestrian);
  }

  canBeginCrossing(id:string,tick:number,durationTicks:number):boolean {
    const c=this.crossings.find(c=>c.id===id);if(!c)return false;if(!c.controlled)return true;
    const cycle=SignalSystem.CYCLE+SignalSystem.WALK+SignalSystem.WALK_CLEAR,t=((tick+c.offset)%cycle+cycle)%cycle;
    return t>=SignalSystem.CYCLE&&t<SignalSystem.CYCLE+SignalSystem.WALK&&cycle-t>=durationTicks+SIM_HZ;
  }

  crossingStopDistance(edge:string,along:number,tick:number,world:WorldPhysics):number|null {
    const e=world.nav.edges.get(edge)!;let stop=Infinity;
    for(const c of this.crossings){
      if(!c.controlled||!c.edgeIds.includes(edge))continue;
      const cycle=SignalSystem.CYCLE+SignalSystem.WALK+SignalSystem.WALK_CLEAR,t=((tick+c.offset)%cycle+cycle)%cycle;
      if(t<SignalSystem.CYCLE)continue;
      const at=e.forward?c.along:e.lengthM-c.along,distance=at-along;
      if(distance>=-1&&distance<60)stop=Math.min(stop,Math.max(0,distance-3));
    }
    return Number.isFinite(stop)?stop:null;
  }

  static phaseColor(phase: 0 | 1, t: number,pedestrian=false): SignalColor {
    const cycle=SignalSystem.CYCLE+(pedestrian?SignalSystem.WALK+SignalSystem.WALK_CLEAR:0);
    const c = ((t % cycle) + cycle) % cycle;
    if(c>=SignalSystem.CYCLE)return 'red';
    const g = SignalSystem.GREEN, am = SignalSystem.AMBER;
    const active: 0 | 1 = c < g + am ? 0 : 1;
    const local = active === 0 ? c : c - (g + am);
    if (active !== phase) return 'red';
    return local < g ? 'green' : 'amber';
  }
}
