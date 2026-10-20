// Owner-private service access stays in Node request routing memory, never page code or files.
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

if(process.stdin.isTTY)process.stdin.setRawMode(true);
process.stdin.setEncoding('utf8');process.stdout.write('Ready for hosted QA JSON on stdin (input is hidden).\n');
const input=await new Promise((resolve,reject)=>{let data='';process.stdin.on('data',chunk=>{data+=chunk;const n=data.indexOf('\n');if(n>=0){process.stdin.pause();try{resolve(JSON.parse(data.slice(0,n)));}catch(e){reject(e);}}});});
if(process.stdin.isTTY)process.stdin.setRawMode(false);
const {url,token,executablePath}=input;
if(!url||!token||!executablePath)throw Error('Hosted QA requires the exact deployed URL and supported owner-private service access.');
const origin=new URL(url).origin;
let browser;
try{
  const anonymous=await fetch(url,{redirect:'manual'});
  browser=await chromium.launch({executablePath,headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
  const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1});
  await context.route('**/*',route=>{
    const request=route.request();
    if(new URL(request.url()).origin===origin)return route.continue({headers:{...request.headers(),'OAI-Sites-Authorization':`Bearer ${token}`}});
    return route.continue();
  });
  const page=await context.newPage();const errors=[],badResponses=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',response=>{if(new URL(response.url()).origin===origin&&response.status()>=400)badResponses.push({path:new URL(response.url()).pathname,status:response.status()});});
  const response=await page.goto(url+'?debug&manualclock',{waitUntil:'domcontentloaded'});
  if(!response?.ok()||new URL(page.url()).origin!==origin)throw Error(`Hosted entry unavailable (${response?.status()??'no response'})`);
  const source=await readFile(fileURLToPath(new URL('./touch-journeys.js',import.meta.url)),'utf8');
  const journey=new Function(`return (${source});`)();
  const result=await journey(page);
  result.hosted=true;result.url=url;result.rootStatus=response.status();result.anonymousStatus=anonymous.status;
  result.anonymousLocation=anonymous.headers.get('location')?new URL(anonymous.headers.get('location'),url).origin:null;
  result.pageErrors=errors;result.badResponses=badResponses;
  await mkdir('output/playwright/hosted',{recursive:true});
  await page.screenshot({path:'output/playwright/hosted/results-phone.png'});
  const safe=JSON.stringify(result,null,2).split(token).join('[redacted]');
  await writeFile('qa/phone-preview/hosted-touch-journeys.json',safe+'\n');
  console.log(JSON.stringify({hosted:true,url,rootStatus:result.rootStatus,anonymousStatus:result.anonymousStatus,runs:result.runs.map(r=>({name:r.name,success:r.result.outcome.success,recoveries:r.result.recoveries})),selectionBack:result.selectionBackReturned,abandon:result.abandon,pageErrors:errors,badResponses}));
}catch(error){console.error(String(error?.stack??error).split(token).join('[redacted]'));process.exitCode=1;}
finally{await browser?.close();}
