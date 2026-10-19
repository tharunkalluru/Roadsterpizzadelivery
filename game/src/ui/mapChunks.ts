import type { ChunkRef, WorldChunkV2 } from '../world/schema';

export type MapBounds = [minX: number, minZ: number, maxX: number, maxZ: number];

/** A separate, bounded 2D cache: exploring the map never inserts physical buildings or traffic. */
export class MapChunkCache {
  readonly chunks = new Map<string, WorldChunkV2>();
  private wanted = new Set<string>();
  private pending = new Map<string, AbortController>();
  private failedUntil = new Map<string, number>();
  private queue: string[] = [];
  constructor(private refs: ChunkRef[], private size: number,
    private load: (id: string, signal: AbortSignal) => Promise<WorldChunkV2>,
    private changed: () => void, readonly capacity = 120, private concurrency = 6) {}

  get loading() { return this.pending.size + this.queue.length; }
  get failed() { return [...this.wanted].filter(id => this.failedUntil.has(id)).length; }

  request(bounds: MapBounds | null) {
    const [x0,z0,x1,z1] = bounds ?? [0,0,0,0], cx=(x0+x1)/2, cz=(z0+z1)/2;
    const visible = bounds ? this.refs.filter(r => (r.ix+1)*this.size>=x0 && r.ix*this.size<=x1 && (r.iz+1)*this.size>=z0 && r.iz*this.size<=z1)
      .sort((a,b)=>Math.hypot((a.ix+.5)*this.size-cx,(a.iz+.5)*this.size-cz)-Math.hypot((b.ix+.5)*this.size-cx,(b.iz+.5)*this.size-cz)).slice(0,this.capacity) : [];
    this.wanted = new Set(visible.map(r=>r.id));
    for(const [id,controller] of this.pending) if(!this.wanted.has(id)) controller.abort();
    for(const id of this.wanted) { const cached=this.chunks.get(id); if(cached){this.chunks.delete(id);this.chunks.set(id,cached);} }
    this.queue=[...this.wanted].filter(id=>!this.chunks.has(id)&&!this.pending.has(id)&&(this.failedUntil.get(id)??0)<=Date.now());
    this.pump();
  }

  private pump() {
    while(this.pending.size<this.concurrency && this.queue.length){
      const id=this.queue.shift()!;if(!this.wanted.has(id))continue;
      const controller=new AbortController();this.pending.set(id,controller);
      void this.load(id,controller.signal).then(chunk=>{
        if(controller.signal.aborted||!this.wanted.has(id))return;
        this.chunks.set(id,chunk);this.failedUntil.delete(id);
        while(this.chunks.size>this.capacity){const victim=[...this.chunks.keys()].find(k=>!this.wanted.has(k))??this.chunks.keys().next().value!;this.chunks.delete(victim);}
      }).catch(error=>{
        if(!controller.signal.aborted&&(error as Error).name!=='AbortError')this.failedUntil.set(id,Date.now()+10000);
      }).finally(()=>{this.pending.delete(id);this.pump();this.changed();});
    }
  }
}
