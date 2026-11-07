const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
import {writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const [port='4402',label='candidate-story']=process.argv.slice(2);
const out=(process.env.PERF_OUTPUT||'/tmp/roadster-perf')+'/'+label;await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal','--ignore-gpu-blocklist']});
const report={kind:'Desktop Chrome actual game controls and touch emulation; no physical-phone or FPS claim',base:'http://127.0.0.1:'+port,scenarios:[]};
let p;
const snapshot=()=>p.evaluate(()=>{const g=window.__game,s=g?.story,button=document.querySelector('[data-du="story-next"]');return {time:g?.t,xyz:g?.player.pos.toArray(),speed:g?.player.speed,flying:g?.player.flying,descending:g?.player.descending,jumping:g?.player.jumping,ctx:g?.sound.ctx?.state,music:g?.sound.music?.position,voice:g?.sound.dialoguePlayback,phase:s?.director.phase,state:s?.controller.state,level:s?.controller.activeLevel?.level,cinematic:s?.cinematic,rail:g?.railContacts.supportId,traffic:g?.traffic.cars.length,routePoints:g?.route?.pts.length??0,ribbon:g?.gps.visible,next:!!button&&!button.hidden&&getComputedStyle(button).visibility==='visible',title:document.title,renderer:g?.engine.renderer.info.render}});
const btn=name=>p.getByRole('button',{name,exact:true});
async function open(level,touch=false,extra=''){
  if(p)await p.close();p=await browser.newPage({viewport:{width:1080,height:600},hasTouch:touch,isMobile:touch,deviceScaleFactor:1});
  await p.routeWebSocket('**/*',()=>{});
  p.on('pageerror',e=>report.scenarios.at(-1)?.errors?.push(String(e)));
  await p.goto(`${report.base}/?qaDelivery=${level}&qaCampaign=1&qaScene=1&qaProfile=1&q=${touch?'low':'high'}${touch?'&qaTouch=1':''}${extra}`);
  await btn('Prepare order').waitFor({timeout:90000});await p.waitForFunction(()=>!!window.__game && !Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Prepare order')?.disabled,null,{timeout:120000});
}
async function act(locator,touch){if(touch)await locator.tap();else await locator.click();}
async function hide(){for(const name of ['Hide QA controls','Hide (F4 restores)'])if(await btn(name).isVisible())await btn(name).click();}
async function conversation(touch){
  const row={name:`mahesh-${touch?'touch':'desktop'}`,errors:[],samples:[]};report.scenarios.push(row);await open(17,touch);await act(btn('Prepare order'),touch);await p.waitForTimeout(800);await p.evaluate(()=>window.__frameProfile.reset());
  for(let i=0;i<20;i++){if((await snapshot()).cinematic)break;await act(btn('Stage at scene approach'),touch);await p.waitForTimeout(700);}
  await hide();let audio=false,completed=false;
  for(let i=0;i<240;i++){const s=await snapshot();row.samples.push(s);audio ||= s.ctx==='running'&&s.voice?.speechLevel>.01;if(s.next){row.timings=await p.evaluate(()=>window.__frameProfile.report());await p.screenshot({path:`${out}/${row.name}-next.png`});await p.evaluate(()=>window.__frameProfile.reset());await act(p.locator('[data-du="story-next"]'),touch);await p.waitForFunction(()=>{const g=window.__game;return g&&!g.relocating&&!g.choosing&&!g.paused&&!g.story.cinematic},null,{timeout:120000});await p.waitForTimeout(1000);row.afterNext=await snapshot();row.nextTimings=await p.evaluate(()=>window.__frameProfile.report());completed=true;break;}await p.waitForTimeout(250);}
  row.audioDecoded=audio;row.completed=completed;assert.ok(audio);assert.ok(completed);assert.equal(row.afterNext.cinematic,false);
}
try{await conversation(false);report.ok=true;}catch(error){report.error=String(error);console.error(error);if(p)await p.screenshot({path:out+'/failure.png'}).catch(()=>{});process.exitCode=1;}finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify({ok:report.ok,error:report.error,scenarios:report.scenarios.map(s=>({name:s.name,audio:s.audioDecoded,completed:s.completed,contact:s.physicalContact,cinematic:s.cinematic}))}));}
