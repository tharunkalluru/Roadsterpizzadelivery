const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
import {writeFile,mkdir} from 'node:fs/promises';
const out=process.env.PERF_GAMEPLAY_OUTPUT||'/tmp/roadster-perf-gameplay';await mkdir(out,{recursive:true});const r={assistance:'Player staged alongside a real marked traffic auto with its current speed via player.place; Jump tapped using touch emulation. No pickup/controller event invoked or Prepare button used.',samples:[],errors:[]};
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal','--ignore-gpu-blocklist']});
const p=await browser.newPage({viewport:{width:1080,height:600},hasTouch:true,isMobile:true,deviceScaleFactor:1});p.on('pageerror',e=>r.errors.push(String(e)));await p.routeWebSocket('**/*',()=>{});
const snap=()=>p.evaluate(()=>{const g=window.__game;return {picked:window.__pickupEvents,caught:g.pickupDetector.caught,activeOrder:!!g.story.activeOrder,state:g.story.controller.state,jumping:g.player.jumping,pos:g.player.pos.toArray(),routePoints:g.route?.pts.length??0,ribbon:g.gps.visible,target:!!g.routeTarget,guide:g.routeGuide.length,markers:g.carriers.markers.length};});
try {
 await p.goto('http://127.0.0.1:4402/?qaDelivery=1&qaPickup=1&qaTouch=1&q=low');
 await p.waitForFunction(()=>window.__game?.carriers.markers.length>0,null,{timeout:120000});
 const hide=p.getByRole('button',{name:'Hide QA controls',exact:true});if(await hide.isVisible())await hide.tap();
 await p.evaluate(()=>{window.__pickupEvents=[];window.__game.deliveryEvents.on('orderPicked',e=>window.__pickupEvents.push({event:e,jumping:window.__game.player.jumping}));});
 r.before=await snap();
 for(let attempt=0;attempt<3;attempt++){
  if(attempt)await p.waitForTimeout(6500);
  r.staging=await p.evaluate(()=>{const g=window.__game,m=g.carriers.markers[0],c=g.traffic.cars.find(c=>c.g.uuid===m.carrierId);g.resetInput();g.player.place(c.x+c.hz*2.2-c.hx,c.z-c.hx*2.2-c.hz,Math.atan2(-c.hx,-c.hz),c.y);g.player.speed=c.speed;return {carrier:m.carrierId,speed:c.speed,position:g.player.pos.toArray()};});
  await p.locator('#t-jump').tap();
  for(let i=0;i<30;i++){const s=await snap();r.samples.push(s);if(s.caught)break;await p.waitForTimeout(100);}
  if((await snap()).caught)break;
 }
 await p.waitForTimeout(4000);r.after=await snap();await p.screenshot({path:out+'/jump-grab-touch.png'});r.ok=r.after.caught&&r.after.activeOrder&&r.after.picked.some(e=>e.jumping)&&r.after.target;
}catch(e){r.error=String(e);}finally{await writeFile(out+'/report-pickup.json',JSON.stringify(r,null,2));await browser.close();console.log(JSON.stringify(r));}
