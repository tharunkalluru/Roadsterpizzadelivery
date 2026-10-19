import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {describe,expect,it,vi} from 'vitest';

function serviceWorker(){
  const events=new Map<string,(event:any)=>void>(),stored=new Map<string,Response>();
  const network=vi.fn(async()=>new Response('current'));
  const caches={match:async(request:Request)=>stored.get(request.url)?.clone(),open:async()=>({put:async(request:Request,response:Response)=>{stored.set(request.url,response);}})};
  runInNewContext(readFileSync('public/sw.js','utf8'),{self:{addEventListener:(name:string,fn:(e:any)=>void)=>events.set(name,fn)},location:{origin:'https://game.test'},URL,caches,fetch:network});
  const request=async(path:string)=>{let response:Promise<Response>|undefined;events.get('fetch')!({request:new Request('https://game.test'+path),respondWith:(r:Promise<Response>)=>response=r});return (await response!)?.text();};
  return {stored,network,request};
}
describe('mutable full-map data discovery',()=>{
  it('refreshes previously cached manifests and accuracy/listing overlays on a normal request',async()=>{
    const sw=serviceWorker();
    for(const name of ['manifest','source-accuracy','listings']){
      const path=`/world/hyd-metro/v2/${name}.json`;sw.stored.set('https://game.test'+path,new Response('outdated'));
      expect(await sw.request(path)).toBe('current');expect(await sw.stored.get('https://game.test'+path)!.clone().text()).toBe('current');
    }
    expect(sw.network).toHaveBeenCalledTimes(3);
  });
  it('retains the last successful world metadata offline and immutable chunk cache online',async()=>{
    const sw=serviceWorker(),path='/world/hyd-metro/v2/manifest.json';
    sw.stored.set('https://game.test'+path,new Response('last-good'));sw.network.mockRejectedValue(new TypeError('offline'));
    expect(await sw.request(path)).toBe('last-good');
    const chunk='/world/hyd-metro/v2/chunks/c_0_0.json';sw.stored.set('https://game.test'+chunk,new Response('immutable-chunk'));
    expect(await sw.request(chunk)).toBe('immutable-chunk');expect(sw.network).toHaveBeenCalledTimes(1);
  });
});
