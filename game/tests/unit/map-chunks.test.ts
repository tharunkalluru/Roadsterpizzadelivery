import { describe, expect, it, vi } from 'vitest';
import { MapChunkCache } from '../../src/ui/mapChunks';
import type { ChunkRef, WorldChunkV2 } from '../../src/world/schema';

const refs=Array.from({length:8},(_,ix)=>({id:`c_${ix}_0`,ix,iz:0} as ChunkRef));
const chunk=(id:string):WorldChunkV2=>({id,ix:0,iz:0,buildings:[],storefronts:[]});
const flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};

describe('independent full-city map cache',()=>{
  it('loads a distant viewport without visiting or inserting it in the physical world',async()=>{
    const load=vi.fn(async(id:string)=>chunk(id)),changed=vi.fn();
    const cache=new MapChunkCache(refs,200,load,changed,3,2);
    cache.request([610,10,790,190]);await flush();
    expect(load.mock.calls.map(c=>c[0])).toEqual(['c_3_0']);
    expect([...cache.chunks.keys()]).toEqual(['c_3_0']);
    cache.request([610,10,790,190]);await flush();
    expect(load).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenCalledOnce();
  });
  it('cancels stale requests and bounds cached city data while panning',async()=>{
    let release:(value:WorldChunkV2)=>void=()=>{};
    const cache=new MapChunkCache(refs,200,(id,signal)=>id==='c_0_0'?new Promise(resolve=>{release=resolve;expect(signal.aborted).toBe(false);}):Promise.resolve(chunk(id)),()=>{},2,1);
    cache.request([10,10,190,190]);
    cache.request([610,10,790,190]);release(chunk('c_0_0'));await flush();
    expect([...cache.chunks.keys()]).toEqual(['c_3_0']);
    for(const ix of [4,5,6]){cache.request([ix*200+10,10,ix*200+190,190]);await flush();}
    expect(cache.chunks.size).toBe(2);expect(cache.chunks.has('c_6_0')).toBe(true);
  });
  it('shows failures without a fetch loop and retries after the backoff on the next request',async()=>{
    vi.useFakeTimers();
    try{
      const load=vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(chunk('c_1_0'));
      const cache=new MapChunkCache(refs,200,load,()=>{});
      cache.request([210,10,390,190]);await flush();expect(cache.failed).toBe(1);
      cache.request([210,10,390,190]);await flush();expect(load).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(10001);cache.request([210,10,390,190]);await flush();
      expect(cache.failed).toBe(0);expect(cache.chunks.has('c_1_0')).toBe(true);
    }finally{vi.useRealTimers();}
  });
});
