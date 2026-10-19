import type {Actor} from './traffic';
export interface EdgeTraffic {speedRatio:number;vehicles:number;delayFactor:number}
/** Directional, current simulated observations only; absent edges have no traffic reading. */
export function trafficByEdge(actors:readonly Pick<Actor,'edge'|'speed'|'vmax'>[]):Map<string,EdgeTraffic>{
 const totals=new Map<string,{ratio:number;n:number}>();
 for(const a of actors){const t=totals.get(a.edge)??{ratio:0,n:0};t.ratio+=Math.min(1,Math.max(0,a.speed/Math.max(1,a.vmax)));t.n++;totals.set(a.edge,t);}
 return new Map([...totals].map(([id,t])=>{const speedRatio=t.ratio/t.n;return[id,{speedRatio,vehicles:t.n,delayFactor:Math.min(5,Math.max(1,1/Math.max(.2,speedRatio)))}];}));
}
