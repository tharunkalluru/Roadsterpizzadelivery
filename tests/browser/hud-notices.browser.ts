/** Production-component layout fixture, deliberately independent of Game.
 * Open /tests/browser/hud-notices.html with Vite. The audit runs automatically
 * at 568×320, 667×375, 800×360, 1024×768 or 1280×720, and reruns after resizing.
 * Public APIs alone activate notices. The real 4.2-second area expiry is tested.
 * Results are visible and also readable on <html data-hud-layout-result>.
 * This verifies browser layout, not real-phone performance or rendering.
 */
import { Hud } from '../../src/ui/hud';
import type { FlightNavigationInput } from '../../src/ui/flight-navigation';
import { DeliveryUI, type DeliveryView } from '../../src/delivery/ui/delivery-ui';

type Rect = { left:number; top:number; width:number; height:number; right:number; bottom:number };
type StateResult = { name:string; guide:Rect; chip:Rect; toolbar:Rect; overlays:Record<string,{ visible:boolean; rect:Rect }>; failures:string[] };

const status = document.querySelector<HTMLOutputElement>('#hud-audit-status')!;
const hud = new Hud(true);
const noop = () => {};
const delivery = new DeliveryUI(hud.root, { call:noop, advanceCall:noop, endCall:noop, drop:noop, continue:noop });
const model:DeliveryView = {
  level:2,total:7,stage:'SETPIECE',restaurantStage:1,restaurantLabel:'Pizza cart',
  nav:{label:'Mystery destination',distance:1000,angle:0},
  call:{state:'ringing'},action:{label:'Deliver',enabled:true,hint:'Match the truck speed'},collection:[],
};
const navigation:FlightNavigationInput = {
  x:0,z:0,yaw:0,flying:true,
  road:{metres:1000,hint:'Continue straight',bearing:0},
  target:{x:0,z:-1000,kind:'customer'},
};
const failureNotice = 'Missed the landing window. Match the truck speed, then try again.';
const areaName = 'Chappal Bazaar';
const sleep = (ms:number) => new Promise<void>(resolve => setTimeout(resolve,ms));
const rect = (element:Element):Rect => {
  const box=element.getBoundingClientRect();
  return {left:box.left,top:box.top,width:box.width,height:box.height,right:box.right,bottom:box.bottom};
};
const overlaps = (a:Rect,b:Rect) => a.left<b.right-.5 && a.right>b.left+.5 && a.top<b.bottom-.5 && a.bottom>b.top+.5;
const visible = (element:HTMLElement) => {
  if (!element.getBoundingClientRect().width || !element.getBoundingClientRect().height) return false;
  for (let current:HTMLElement|null=element;current;current=current.parentElement) {
    const css=getComputedStyle(current);
    if (current.hidden || css.display==='none' || css.visibility==='hidden' || Number(css.opacity)===0) return false;
  }
  return true;
};
const settled = async () => {
  await document.fonts.ready;
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
};

hud.carrierPickupMode();
// Legacy game updates remain safe after their visible Day/Level nodes are gone.
hud.set('clock','Day 1 · 9:08 AM');
hud.set('level','Level 2 / 7');
hud.set('spd','0');
hud.flightState(true,false);
delivery.setVisible(true);
delivery.update(model);

let generation=0,refreshTimer=0,resizeTimer=0;
let areaActiveUntil=0,toastActiveUntil=0;
const showArea = (name=areaName,label='Entering') => {
  // Legacy callers may still pass a prefix. The production API must ignore it.
  hud.areaChip(name,label);areaActiveUntil=performance.now()+4200;
};
const showToast = () => { hud.toast('Follow the destination marker','teal');toastActiveUntil=performance.now()+1900; };

async function audit() {
  const run=++generation;
  clearInterval(refreshTimer);refreshTimer=0;
  status.dataset.result='running';status.textContent=`Checking ${innerWidth}×${innerHeight} · area expiry…`;
  document.documentElement.removeAttribute('data-hud-layout-result');
  // A resize can happen while the final combined state is being held. Let the
  // actual public notice timers expire before measuring the new baseline.
  hud.rescue(false);delivery.update(model);
  await sleep(Math.max(0,areaActiveUntil-performance.now()+220,toastActiveUntil-performance.now()+50));
  if (run!==generation) return;
  await settled();
  const states:StateResult[]=[],failures:string[]=[];
  let baseline:Rect|null=null;
  const measure = async (name:string) => {
    await settled();if(run!==generation)return;
    delivery.update(modelWithNotice);
    hud.flightNavigation(navigation,1/60);
    await settled();if(run!==generation)return;
    const guide=hud.el['flight-navigation'],area=hud.el['area-chip'],toolbar=hud.root.querySelector<HTMLElement>('.btnrow')!;
    const guideRect=rect(guide),stateFailures:string[]=[];
    if (!visible(guide)) stateFailures.push('navigation is not visible');
    if (!baseline) baseline=guideRect;
    for(const key of ['left','top','width','height'] as const) {
      if(Math.abs(guideRect[key]-baseline[key])>.25)stateFailures.push(`navigation ${key} moved: ${baseline[key]} → ${guideRect[key]}`);
    }
    if(Math.abs(guideRect.top-10)>.5)stateFailures.push('navigation is outside the fixed top row');
    if(Math.abs((guideRect.left+guideRect.right)/2-innerWidth/2)>.5)stateFailures.push('navigation is not horizontally centered');
    if(overlaps(guideRect,rect(toolbar)))stateFailures.push('toolbar overlaps navigation');
    if(hud.root.querySelector('#clock,#level,.du-collection-button'))stateFailures.push('removed status or restaurant HUD control is present');
    const expectedChipHeight=innerHeight<=520?28:32;
    if(Math.abs(rect(area).height-expectedChipHeight)>.5||rect(area).width>180.5)stateFailures.push('area chip is not compact');
    if(/\b(entering|nearby)\b/i.test(area.textContent||''))stateFailures.push('area chip contains a redundant prefix');
    const overlays:StateResult['overlays']={};
    const selector='#minimap,.btnrow,#area-chip,#toast,#rescue,.du-notice,.du-call,.du-actions,.touch button,.speed,#orders-toggle,#t-act';
    for(const [index,element] of [...hud.root.querySelectorAll<HTMLElement>(selector)].entries()) {
      const key=element.id||element.classList[0]||`overlay-${index}`,isVisible=visible(element),bounds=rect(element);
      overlays[key]={visible:isVisible,rect:bounds};
      if(isVisible&&overlaps(bounds,guideRect))stateFailures.push(`${key} overlaps navigation`);
      if(isVisible&&(bounds.left<-.5||bounds.top<-.5||bounds.right>innerWidth+.5||bounds.bottom>innerHeight+.5))stateFailures.push(`${key} leaves the viewport`);
    }
    const map=overlays.minimap,speed=overlays.speed;
    if(!map?.visible||!speed?.visible)stateFailures.push('minimap or integrated speed is hidden');
    else if(speed.rect.left<map.rect.left-.5||speed.rect.right>map.rect.right+.5||speed.rect.top<map.rect.top+map.rect.height/2||speed.rect.bottom>map.rect.bottom+.5)stateFailures.push('speed is outside the minimap bottom arc');
    for(const name of ['du-call','du-actions']){
      const action=overlays[name];if(!action?.visible)continue;
      for(const obstacle of ['minimap','t-left','t-right','t-gas','t-brake','t-fly','t-jump']){
        if(overlays[obstacle]?.visible&&overlaps(action.rect,overlays[obstacle].rect))stateFailures.push(`${name} overlaps ${obstacle}`);
      }
    }
    const notices=['area-chip','toast','rescue','du-notice','du-call','du-actions'];
    for(let i=0;i<notices.length;i++)for(let j=i+1;j<notices.length;j++) {
      const first=overlays[notices[i]],second=overlays[notices[j]];
      if(first?.visible&&second?.visible&&overlaps(first.rect,second.rect))stateFailures.push(`${notices[i]} overlaps ${notices[j]}`);
    }
    for(const key of ['du-call','du-actions']) {
      const box=overlays[key];
      if(!box?.visible)stateFailures.push(`${key} is not visible`);
      else if(box.rect.width<44||box.rect.height<44)stateFailures.push(`${key} has a small touch target`);
    }
    if(modelWithNotice.notice) {
      if(!hud.root.classList.contains('has-delivery-notice'))stateFailures.push('delivery notice priority is missing');
      if(overlays.toast?.visible)stateFailures.push('HUD toast remains visible over delivery notice');
    }
    // Use the same physical slot in both driving modes, with different copy.
    hud.flightNavigation({...navigation,flying:false},1/60);
    const roadRect=rect(guide);
    if(!visible(guide))stateFailures.push('road navigation is not visible');
    for(const key of ['left','top','width','height'] as const)if(Math.abs(roadRect[key]-guideRect[key])>.25)stateFailures.push(`road/flight navigation ${key} changed`);
    hud.flightNavigation(navigation,1/60);
    states.push({name,guide:guideRect,chip:rect(area),toolbar:rect(toolbar),overlays,failures:stateFailures});
    failures.push(...stateFailures.map(failure=>`${name}: ${failure}`));
    status.textContent=`Checking ${innerWidth}×${innerHeight} · ${states.length}/8 states`;
  };
  let modelWithNotice:DeliveryView=model;
  await measure('none');if(run!==generation)return;
  showArea();await measure('area');if(run!==generation)return;
  showArea('HITEC City','Nearby');await measure('area-refresh');if(run!==generation)return;
  await sleep(Math.max(0,areaActiveUntil-performance.now()+220));if(run!==generation)return;
  await measure('area-expired');if(run!==generation)return;
  if(hud.el['area-chip'].classList.contains('show'))failures.push('area-expired: area timer did not expire');
  showToast();await measure('toast');if(run!==generation)return;
  modelWithNotice={...model,notice:failureNotice};delivery.update(modelWithNotice);
  await measure('delivery-failure');if(run!==generation)return;
  modelWithNotice=model;delivery.update(modelWithNotice);hud.rescue(true,'Stuck? Back to the road');
  await measure('rescue');if(run!==generation)return;
  showArea();showToast();modelWithNotice={...model,notice:failureNotice};delivery.update(modelWithNotice);
  await measure('all-active');if(run!==generation)return;
  const result={
    passed:failures.length===0,viewport:{width:innerWidth,height:innerHeight},fonts:document.fonts.status,
    fontFamilies:{navigation:getComputedStyle(hud.el['flight-navigation']).fontFamily,toolbar:getComputedStyle(hud.root.querySelector<HTMLElement>('.btnrow')!).fontFamily,area:getComputedStyle(hud.el['area-chip']).fontFamily},
    productionComponents:['Hud(true)','DeliveryUI'],states,failures,
    note:'Browser layout only. Combined state remains active; production priority hides the lower-priority HUD toast.',
  };
  document.documentElement.dataset.hudLayoutResult=JSON.stringify(result);
  status.dataset.result=result.passed?'pass':'fail';
  status.textContent=`${result.passed?'PASS':'FAIL'} · ${innerWidth}×${innerHeight} · ${states.length} states${failures.length?` · ${failures[0]}`:''}`;
  status.title=failures.join('\n')||'Navigation stayed fixed and clear; notices and touch actions stayed separate.';
  // Keep the final visual reproducible after its normal timers would expire.
  // No production state or timers are overwritten by this fixture.
  refreshTimer=window.setInterval(()=>{
    showArea();showToast();delivery.update(modelWithNotice);hud.rescue(true,'Stuck? Back to the road');hud.flightNavigation(navigation,1/60);
  },1000);
}

const run = () => void audit().catch(error=>{
  const message=error instanceof Error?error.message:String(error);
  document.documentElement.dataset.hudLayoutResult=JSON.stringify({passed:false,viewport:{width:innerWidth,height:innerHeight},failures:[message]});
  status.dataset.result='fail';status.textContent=`FAIL · ${message}`;
});
window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=window.setTimeout(run,180);});
window.addEventListener('pagehide',()=>{generation++;clearInterval(refreshTimer);clearTimeout(resizeTimer);});
run();
