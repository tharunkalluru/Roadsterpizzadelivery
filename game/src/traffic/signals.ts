import type { WorldPhysics } from '../world/collision';
import { SIM_HZ } from '../config/gameplay';

export type SignalColor = 'green' | 'amber' | 'red';

/**
 * Fixed-time signal plans at OSM `highway=traffic_signals` junctions (S03). Approaches are split
 * into two phases by axis; timings are authored defaults (provisional — real phase plans unknown)
 * and run on the simulation clock so pause/replay stay consistent.
 */
export class SignalSystem {
  /** directed edge id → { junction node, phase index } for edges arriving at a signalled node */
  readonly approach = new Map<string, { node: string; phase: 0 | 1; offset: number }>();
  readonly nodes: { node: string; x: number; z: number; approaches: { edge: string; phase: 0 | 1; heading: number }[]; offset: number }[] = [];
  static readonly GREEN = 18 * SIM_HZ;
  static readonly AMBER = 3 * SIM_HZ;
  static readonly CYCLE = 2 * (SignalSystem.GREEN + SignalSystem.AMBER);

  constructor(world: WorldPhysics) {
    const nodePos = new Map(world.core.nodes.map((n) => [n.id, n]));
    let k = 0;
    for (const j of world.core.junctions) {
      if (!j.signalled) continue;
      const n = nodePos.get(j.nodeId);
      if (!n) continue;
      const offset = (k++ * 7 * SIM_HZ) % SignalSystem.CYCLE;
      const approaches: { edge: string; phase: 0 | 1; heading: number }[] = [];
      for (const d of world.core.directed) {
        if (d.toNode !== j.nodeId) continue;
        const h = world.nav.pointOnDirected(d.id, Math.max(0, d.lengthM - 3)).heading;
        const phase: 0 | 1 = Math.abs(Math.cos(h)) >= Math.abs(Math.sin(h)) ? 0 : 1;
        approaches.push({ edge: d.id, phase, heading: h });
        this.approach.set(d.id, { node: j.nodeId, phase, offset });
      }
      if (approaches.length) this.nodes.push({ node: j.nodeId, x: n.x, z: n.z, approaches, offset });
    }
  }

  colorFor(edge: string, tick: number): SignalColor | null {
    const a = this.approach.get(edge);
    if (!a) return null;
    return SignalSystem.phaseColor(a.phase, tick + a.offset);
  }

  static phaseColor(phase: 0 | 1, t: number): SignalColor {
    const c = ((t % SignalSystem.CYCLE) + SignalSystem.CYCLE) % SignalSystem.CYCLE;
    const g = SignalSystem.GREEN, am = SignalSystem.AMBER;
    const active: 0 | 1 = c < g + am ? 0 : 1;
    const local = active === 0 ? c : c - (g + am);
    if (active !== phase) return 'red';
    return local < g ? 'green' : 'amber';
  }
}
