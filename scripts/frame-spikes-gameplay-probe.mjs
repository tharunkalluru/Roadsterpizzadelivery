const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
import {writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=process.env.PERF_GAMEPLAY_OUTPUT||'/tmp/roadster-perf-gameplay';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal','--ignore-gpu-blocklist']});
const report={kind:'Desktop Chrome actual game controls and touch emulation; no physical-phone or FPS claim',base:'http://127.0.0.1:4402',scenarios:[]};
let p;
const snapshot=()=>p.evaluate(()=>{const g=window.__game,s=g?.story,button=document.querySelector('[data-du="story-next"]');return {time:g?.t,xyz:g?.player.pos.toArray(),speed:g?.player.speed,flying:g?.player.flying,descending:g?.player.descending,jumping:g?.player.jumping,ctx:g?.sound.ctx?.state,music:g?.sound.music?.position,voice:g?.sound.dialoguePlayback,phase:s?.director.phase,state:s?.controller.state,level:s?.controller.activeLevel?.level,cinematic:s?.cinematic,rail:g?.railContacts.supportId,traffic:g?.traffic.cars.length,routePoints:g?.route?.pts.length??0,ribbon:g?.gps.visible,next:!!button&&!button.hidden&&getComputedStyle(button).visibility==='visible',title:document.title,renderer:g?.engine.renderer.info.render}});
const btn=name=>p.getByRole('button',{name,exact:true});
async function open(level,touch=false,extra=''){
  if(p)await p.close();p=await browser.newPage({viewport:{width:1080,height:600},hasTouch:touch,isMobile:touch,deviceScaleFactor:1});
  await p.routeWebSocket('**/*',()=>{});
  p.on('pageerror',e=>report.scenarios.at(-1)?.errors?.push(String(e)));
  await p.goto(`${report.base}/?qaDelivery=${level}&qaCampaign=1&qaScene=1&q=${touch?'low':'high'}${touch?'&qaTouch=1':''}${extra}`);
  await btn('Prepare order').waitFor({timeout:90000});await p.waitForFunction(()=>!!window.__game && !Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Prepare order')?.disabled,null,{timeout:120000});
}
async function act(locator,touch){if(touch)await locator.tap();else await locator.click();}
async function hide(){for(const name of ['Hide QA controls','Hide (F4 restores)'])if(await btn(name).isVisible())await btn(name).click();}
async function conversation(touch){
  const row={name:`mahesh-${touch?'touch':'desktop'}`,errors:[],samples:[]};report.scenarios.push(row);await open(17,touch);await act(btn('Prepare order'),touch);await p.waitForTimeout(800);
  for(let i=0;i<20;i++){if((await snapshot()).cinematic)break;await act(btn('Stage at scene approach'),touch);await p.waitForTimeout(700);}
  await hide();let audio=false,completed=false;
  for(let i=0;i<240;i++){const s=await snapshot();row.samples.push(s);audio ||= s.ctx==='running'&&s.voice?.speechLevel>.01;if(s.next){await p.screenshot({path:`${out}/${row.name}-next.png`});await act(p.locator('[data-du="story-next"]'),touch);await p.waitForFunction(()=>{const g=window.__game;return g&&!g.relocating&&!g.choosing&&!g.paused&&!g.story.cinematic},null,{timeout:120000});await p.waitForTimeout(1000);row.afterNext=await snapshot();completed=true;break;}await p.waitForTimeout(250);}
  row.audioDecoded=audio;row.completed=completed;assert.ok(audio);assert.ok(completed);assert.equal(row.afterNext.cinematic,false);
}
async function rail(level){
  const row={name:level===2?'train-rear-roof-descent':'metro-roof-descent',errors:[],samples:[],assistance:'Used existing visible QA preparation and descent staging. Physical support and cinematic are ordinary game runtime.'};report.scenarios.push(row);await open(level,true,level===2?'&qaTrainRide=1':'');await btn('Prepare order').tap();await p.waitForTimeout(1800);await act(btn(level===2?'Land above rear coach':'Stage at scene approach'),true);
  let contact=false,cinematic=false;
  for(let i=0;i<120;i++){const s=await snapshot();row.samples.push(s);contact ||= typeof s.rail==='string'&&s.rail.startsWith(level===2?'rail:':'metro:');cinematic ||= s.cinematic;if(i===12)await p.screenshot({path:`${out}/${row.name}.png`});if(contact&&cinematic)break;await p.waitForTimeout(250);}
  await p.screenshot({path:`${out}/${row.name}.png`});row.physicalContact=contact;row.cinematic=cinematic;assert.ok(contact,'Expected real roof support');
}
async function controls(){
  const row={name:'road-jump-flight-touch-controls',errors:[],samples:[]};report.scenarios.push(row);await open(1,true);await hide();await p.locator('canvas').first().click({position:{x:450,y:300}});
  row.before=await snapshot();await p.keyboard.down('w');await p.waitForTimeout(1300);row.driving=await snapshot();await p.keyboard.up('w');
  await p.keyboard.down('Space');await p.waitForTimeout(750);await p.keyboard.up('Space');row.braked=await snapshot();
  await p.locator('#t-jump').tap();await p.waitForTimeout(200);row.jumped=await snapshot();await p.waitForTimeout(2400);
  await p.locator('#t-fly').tap();await p.waitForTimeout(1400);row.flew=await snapshot();await p.screenshot({path:`${out}/${row.name}.png`});
  assert.ok(row.driving.speed>row.before.speed);assert.ok(row.braked.speed<row.driving.speed);assert.ok(row.jumped.jumping);assert.ok(row.flew.flying);
}
try{const which=process.argv[2]||'all';if(which==='all'||which==='story'){await conversation(false);await conversation(true);}if(which==='all'||which==='rail'){await rail(2);await rail(10);}if(which==='all'||which==='controls')await controls();report.ok=true;}catch(error){report.error=String(error);console.error(error);if(p)await p.screenshot({path:out+'/failure.png'}).catch(()=>{});process.exitCode=1;}finally{await writeFile(out+`/report-${process.argv[2]||'all'}.json`,JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify({ok:report.ok,error:report.error,scenarios:report.scenarios.map(s=>({name:s.name,audio:s.audioDecoded,completed:s.completed,contact:s.physicalContact,cinematic:s.cinematic}))}));}
