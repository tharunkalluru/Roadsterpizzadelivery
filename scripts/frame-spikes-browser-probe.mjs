const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
import fs from 'node:fs';
const [port='4401',label='baseline',seconds='20']=process.argv.slice(2),duration=Number(seconds)*1000;
const output=process.env.PERF_OUTPUT||'/tmp/roadster-perf';fs.mkdirSync(output,{recursive:true});
const throttle=Number(process.env.CPU_THROTTLE||1);
const b=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal','--ignore-gpu-blocklist']});
const p=await b.newPage({viewport:{width:960,height:540},deviceScaleFactor:1});
const session=await p.context().newCDPSession(p);await session.send('Emulation.setCPUThrottlingRate',{rate:throttle});
const results={throttle,label,port,quality:'high',viewport:[960,540],device:'desktop Chrome, Apple Metal, synthetic CPU throttle recorded separately; QA placement followed by real control input',scenarios:[],errors:[]};
p.on('pageerror',e=>results.errors.push(e.message));
const button=name=>p.getByRole('button',{name,exact:true});
const setup=async()=>{
 await p.goto('http://127.0.0.1:'+port+'/?qaDelivery=17&qaCampaign=1&qaScene=1&qaProfile=1&q=high');
 await button('Prepare order').waitFor({timeout:120000});
 await p.waitForFunction(()=>!!window.__game&&!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Prepare order')?.disabled,null,{timeout:120000});
 await button('Prepare order').click();
 for(const name of ['Hide QA controls','Hide (F4 restores)'])if(await button(name).isVisible())await button(name).click();
 await p.waitForTimeout(5000);
 await p.evaluate(()=>{
  const g=window.__game,f=window.__frameProfile;
  const wrap=(obj,name,label)=>{const old=obj[name];if(!old)return;obj[name]=function(...args){return f.measure(label,()=>old.apply(this,args))}};
  for(const [obj,name,label] of [[g.city,'update','world.update'],[g.traffic,'update','traffic.update'],[g.walkers,'update','walkers.update'],[g.rail,'update','rail.update'],[g.metro,'update','metro.update'],[g.player,'update','player.update'],[g,'updateRoute','navigation.update'],[g,'updateCamera','camera.update'],[g,'updateCarrierPickup','carrier.update']])wrap(obj,name,label);
  wrap(g.engine,'render','render.call');wrap(g.engine.pmrem,'fromScene','environment.pmrem');wrap(g.graph,'route','gps.call');wrap(g.city,'add','tile.add');
  const gl=g.engine.renderer.getContext();wrap(gl,'bufferData','gpu.bufferData.submit');wrap(gl,'texImage2D','gpu.texture.submit');
  window.__resources=[];window.__resourceTimer=setInterval(()=>{let i=g.engine.renderer.info;window.__resources.push({t:performance.now(),speed:g.player.speed*3.6,pos:g.player.pos.toArray(),flying:g.player.flying,tiles:g.city.tiles.size,pending:g.city.pending.size,draws:i.render.calls,triangles:i.render.triangles,geometries:i.memory.geometries,textures:i.memory.textures,phase:g.story.director.phase})},1000);
 });
};
const sample=async (name,ms=duration)=>{
 await p.evaluate(()=>{window.__frameProfile.reset();window.__resources=[]});
 await p.waitForTimeout(ms);
 const result=await p.evaluate(()=>({timings:window.__frameProfile.report(),resources:window.__resources,renderer:window.__game.engine.renderer.getContext().getParameter(7937),ratio:window.__game.engine.renderer.getPixelRatio()}));
 results.scenarios.push({name,...result});fs.writeFileSync(output+'/'+label+'.json',JSON.stringify(results,null,2));
 console.log(label,name,result.timings['frame.interval']);
 await p.screenshot({path:output+'/'+label+'-'+name+'.png'});
};
try{
 await setup();await sample('stationary');
 await p.evaluate(()=>{window.__game.minutes=17.5*60;window.__game.applyClockMood(true)});await sample('dusk');
 const corridor=await p.evaluate(async()=>{
  const g=window.__game;let best;
  for(const edge of g.graph.edges){
   if(!['motorway','trunk','primary'].includes(edge.e.cls)||edge.e.w<10)continue;
   for(let i=1;i<edge.e.pts.length;i++){
    const a=edge.e.pts[i-1],b=edge.e.pts[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    if(Math.max(...a.map(Math.abs),...b.map(Math.abs))>9000||length<(best?.length||0))continue;
    best={edge,i,length};
   }
  }
  if(!best)throw Error('No test corridor');
  const {edge,i,length}=best,dir=edge.e.oneway==='forward'?-1:1;
  const source=dir===1?edge.cum[i-1]+30:edge.len-edge.cum[i]+30;
  const pose=g.graph.pointAt(edge,source,dir,Math.min(3,edge.e.w/4));
  await g.city.ensure(pose.x,pose.z,1);
  g.player.place(pose.x,pose.z,Math.atan2(pose.hx,pose.hz),pose.y);
  return {edge:edge.e.id,length,pose};
 });
 results.corridor=corridor;
 await p.waitForTimeout(5000);
 await p.keyboard.down('w');await p.evaluate(()=>window.__game.player.speed=120/3.6);await sample('road-input-120');await p.keyboard.up('w');
 await p.evaluate(pose=>{const g=window.__game;g.player.place(pose.x,pose.z,Math.atan2(pose.hx,pose.hz),pose.y)},corridor.pose);await p.waitForTimeout(2000);
 await p.keyboard.press('q');await p.waitForTimeout(1800);await p.keyboard.down('w');await p.evaluate(()=>window.__game.player.speed=160/3.6);await sample('flight-160-streaming');await p.keyboard.up('w');
 // Cinematic entry and Next are validated by frame-spikes-story-probe.mjs.
 await p.evaluate(()=>clearInterval(window.__resourceTimer));
}catch(e){results.errors.push(String(e));console.error(e);process.exitCode=1}
finally{fs.writeFileSync(output+'/'+label+'.json',JSON.stringify(results,null,2));await b.close()}
