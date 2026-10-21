import release from '../../config/provisional-preview.json';
import type { ProvisionalZoneDefinition } from './provisionalZone';

const ui=document.getElementById('ui')!;
async function boot(){
  if(release.zone===null||release.status!=='ready'){
    ui.innerHTML='<main class="pilot-gate"><section class="pilot-card"><span class="pilot-eyebrow">PROVISIONAL MAP PREVIEW</span><h1>Preparing the partial-map test.</h1><p class="pilot-lead">This separate preview is allowed to use incomplete map evidence. A connected bounded driving route and source-listed pickup points are still being checked.</p><p>No verified-coverage claim is made. The main game and verified-mode gate are unchanged.</p></section></main>';
    return;
  }
  const response=await fetch('./research/street-survey.json',{cache:'no-store'});
  if(!response.ok)throw Error(`Pinned map unavailable (${response.status})`);
  const bytes=await response.arrayBuffer();
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  const sha=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
  if(sha!==release.surveySha256)throw Error('Preview survey pin changed');
  const definition=release.zone as unknown as ProvisionalZoneDefinition;
  ui.innerHTML='<main class="pilot-gate"><div class="pilot-wordmark">ROADSTER <span>PIZZA DELIVERY</span></div><section class="pilot-card preview-card"><div class="pilot-intro"><span class="pilot-eyebrow">SURVEY 133 · PROVISIONAL PREVIEW</span><h1>Your next delivery<br>starts here.</h1><p class="pilot-lead">A playable partial-map preview. Buildings, shops, entrances and road dimensions are approximate. This area is not fully mapped or verified.</p><button type="button" data-preview-start>Open provisional preview <span aria-hidden="true">↗</span></button><p class="pilot-footnote">The main game is unchanged. Verified mode stays locked until evidence qualifies.</p></div><div class="pilot-notes"><div class="pilot-status"><span class="pilot-order-number" aria-hidden="true">01</span><div><strong>Pick up. Drive. Deliver.</strong><p>Collect a test pizza and drive the bounded preview route. Orders are game scenarios based on saved listings, not confirmation of current business operation or exact entrances.</p></div></div><div class="pilot-scope"><span class="pilot-eyebrow">YOUR PREVIEW AREA</span><p class="pilot-detail" data-scope></p></div></div></section><div class="pilot-bottomline" aria-hidden="true">A LITTLE CITY. A HOT PIZZA. ONE MORE TURN.</div></main>';
  ui.querySelector('[data-scope]')!.textContent=definition.label+' — '+definition.limitations.join(' ');
  const button=ui.querySelector<HTMLButtonElement>('[data-preview-start]')!;
  button.addEventListener('click',async()=>{
    button.disabled=true;
    try{
      const {App}=await import('../app/app');
      ui.replaceChildren();
      const app=new App(document.getElementById('gl') as HTMLCanvasElement,ui,{definition,mode:'provisional',surveySha256:sha,surveyData:JSON.parse(new TextDecoder().decode(bytes))});
      await app.boot();
    }catch(error){ui.replaceChildren();const message=document.createElement('p');message.className='pilot-error';message.setAttribute('role','alert');message.textContent=`Preview unavailable: ${error instanceof Error?error.message:String(error)}`;ui.append(message);}
  },{once:true});
}
void boot().catch(error=>{ui.replaceChildren();const p=document.createElement('p');p.className='pilot-error';p.setAttribute('role','alert');p.textContent=`Preview unavailable: ${error instanceof Error?error.message:String(error)}`;ui.append(p);});
