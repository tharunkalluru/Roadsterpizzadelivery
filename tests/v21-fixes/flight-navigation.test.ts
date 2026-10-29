import test from 'node:test';
import assert from 'node:assert/strict';
import { flightNavigationLayout, flightNavigationNeedsCompactLane, flightNavigationReadout, smoothFlightBearing, type FlightNavigationInput } from '../../src/ui/flight-navigation';
import { mobileHudLayout } from '../../src/ui/hud-layout';
import { Hud } from '../../src/ui/hud';

const close = (actual: number, wanted: number) => assert.ok(Math.abs(actual - wanted) < 1e-9, `${actual} != ${wanted}`);
const input = (x: number, z: number, yaw = 0): FlightNavigationInput => ({ x: 0, z: 0, yaw, flying: true, target: { x, z, kind: 'pickup' } });

test('flight arrow uses car heading for ahead, left, right and behind, including a turned car', () => {
  close(flightNavigationReadout(input(0, -100))!.bearing, 0);
  close(flightNavigationReadout(input(100, 0))!.bearing, Math.PI / 2);
  close(flightNavigationReadout(input(-100, 0))!.bearing, -Math.PI / 2);
  close(Math.abs(flightNavigationReadout(input(0, 100))!.bearing), Math.PI);
  close(flightNavigationReadout(input(100, 0, -Math.PI / 2))!.bearing, 0);
  close(flightNavigationReadout(input(0, -100, -Math.PI / 2))!.bearing, -Math.PI / 2);
  assert.equal(flightNavigationReadout(input(100, 0))!.hint, 'Steer right');
  assert.equal(flightNavigationReadout(input(-100, 0))!.hint, 'Steer left');
  assert.equal(flightNavigationReadout(input(0, 100))!.hint, 'Turn around');
});

test('bearing smooths over the shortest wrap without a full rotation or a stale target', () => {
  const radians = (n: number) => n * Math.PI / 180;
  const next = smoothFlightBearing(radians(179), radians(-179), .05);
  assert.ok(next > radians(179) && next < radians(181));
  const reverse = smoothFlightBearing(radians(-179), radians(179), .05);
  assert.ok(reverse < radians(-179) && reverse > radians(-181));
  close(smoothFlightBearing(null, radians(-90), .016), radians(-90));
  close(smoothFlightBearing(0, Math.PI / 2, -1), 0);
  close(smoothFlightBearing(0, Math.PI / 2, NaN), 0);
  close(smoothFlightBearing(0, Math.PI / 2, 99), smoothFlightBearing(0, Math.PI / 2, .1));
  close(smoothFlightBearing(0, NaN, .016), 0);
});

test('nearby pickup/customer cues ask for landing without implying collection or handover', () => {
  assert.equal(flightNavigationReadout(input(0, -35))!.hint, 'Descend to marker');
  assert.equal(flightNavigationReadout(input(0, -36))!.hint, 'Straight ahead');
  const customer = input(0, -20); customer.target.kind = 'customer';
  assert.equal(flightNavigationReadout(customer)!.hint, 'Descend to marker');
  assert.equal(flightNavigationReadout(customer)!.kind, 'customer');
  customer.descending = true; customer.flying = false;
  assert.equal(flightNavigationReadout(customer)!.hint, 'Landing');
  close(flightNavigationReadout(input(0, 0))!.bearing, 0);
  assert.equal(flightNavigationReadout(input(0, -1500))!.distance, '1.5 km');
});

test('grounded, missing and malformed targets never show a flight instruction', () => {
  assert.equal(flightNavigationReadout(null), null);
  assert.equal(flightNavigationReadout({ ...input(0, -100), flying: false }), null);
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.equal(flightNavigationReadout({ ...input(0, -100), yaw: value }), null);
    assert.equal(flightNavigationReadout(input(value, -100)), null);
    assert.equal(flightNavigationReadout({ ...input(0, -100), x: value }), null);
  }
  assert.equal(flightNavigationReadout({ ...input(0, -100), target: null! }), null);
  assert.equal(flightNavigationReadout({ ...input(0, -100), target: { x: 0, z: -100, kind: 'theatre' as any } }), null);
  assert.equal(flightNavigationReadout({ ...input(-1e308, 0), x: 1e308 }), null);
});

const overlaps = (a: any, b: any) => a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;
test('compact guidance keeps its own free lane on supported landscape phone sizes', () => {
  for (const [width, height] of [[640, 280], [640, 360], [667, 375], [800, 360], [844, 390], [915, 412], [1280, 720]]) {
    const controls = mobileHudLayout(width, height, 62, 106);
    const tasks = { left: 12, top: 62, width: 142, height: 44 };
    const left = controls.rightSteer.left + controls.rightSteer.width;
    const box = flightNavigationLayout(width, height, 54, 104,
      { ...tasks, width: left - tasks.left }, { ...controls.map, left: Math.min(controls.map.left, controls.brake.left) }, controls.brake.top);
    assert.ok(box, `${width}x${height}`);
    assert.ok(box!.width >= 156 && box!.width <= 180 && box!.height <= 64);
    assert.ok(box!.left >= 12 && box!.left + box!.width <= width - 12 && box!.top === 62);
    for (const blocker of [tasks, controls.map, controls.leftSteer, controls.rightSteer, controls.brake, controls.gas, controls.fly, controls.jump, controls.speed]) {
      assert.equal(overlaps(box, blocker), false, `${width}x${height} intersects ${JSON.stringify(blocker)}`);
    }
  }
  const narrowControls = mobileHudLayout(568, 320, 62, 106);
  const narrowBox = flightNavigationLayout(568, 320, 54, 104, { left: 12, top: 62, width: 142, height: 44 }, narrowControls.map, narrowControls.leftSteer.top + 4, 44);
  assert.ok(narrowBox, 'narrow landscape retains compact flight guidance');
  for (const blocker of [narrowControls.map, narrowControls.leftSteer, narrowControls.rightSteer, narrowControls.brake, narrowControls.gas, narrowControls.fly, narrowControls.jump, narrowControls.speed, narrowControls.context]) assert.equal(overlaps(narrowBox, blocker), false);
  assert.equal(flightNavigationLayout(320, 844, 90, 140, { left: 12, top: 90, width: 160, height: 200 }, { left: 190, top: 90, width: 112, height: 112 }, 700), null);
  assert.equal(flightNavigationLayout(800, 180, 54, 104, { left: 12, top: 62, width: 230, height: 40 }, { left: 660, top: 10, width: 122, height: 122 }, 90), null);
});

function hudFixture() {
  let writes = 0;
  const element = () => {
    let text = '', transform = '';
    return { hidden: true, dataset: {} as Record<string, string>,
      get textContent() { return text; }, set textContent(value: string) { text = value; writes++; },
      style: { get transform() { return transform; }, set transform(value: string) { transform = value; writes++; } } };
  };
  const classes = new Set<string>();
  const el: any = Object.fromEntries(['flight-navigation', 'flight-nav-arrow', 'flight-nav-target', 'flight-nav-distance', 'flight-nav-hint', 'modal', 'tip-layer'].map(id => [id, element()]));
  const hud: any = Object.assign(Object.create(Hud.prototype), { el, root: { classList: { contains: (name: string) => classes.has(name) } },
    flightNavHasRoom: true, flightNavAngle: null, flightNavTarget: '', flightNavRenderedAngle: '', rotationBlocked: false });
  return { hud, el, classes, writes: () => writes };
}

test('HUD updates the existing arrow and text without repeated stationary DOM writes', () => {
  const previous = (globalThis as any).document;
  (globalThis as any).document = { hidden: false, documentElement: { classList: { contains: () => false } } };
  try {
    const { hud, el, writes } = hudFixture(), target = input(100, 0);
    hud.flightNavigation(target, .016);
    assert.equal(el['flight-navigation'].hidden, false); assert.equal(el['flight-navigation'].dataset.kind, 'pickup');
    assert.equal(el['flight-nav-arrow'].style.transform, 'rotate(90.0deg)'); assert.equal(el['flight-nav-hint'].textContent, 'Steer right');
    const written = writes();
    for (let i = 0; i < 600; i++) hud.flightNavigation(target, 1 / 60);
    assert.equal(writes(), written);
    const next = input(-100, 0); next.target.kind = 'customer'; hud.flightNavigation(next, .016);
    assert.equal(el['flight-navigation'].dataset.kind, 'customer'); assert.equal(el['flight-nav-target'].textContent, '', 'navigation stays concise without the redundant Customer label');
    assert.equal(el['flight-nav-arrow'].style.transform, 'rotate(-90.0deg)', 'new stop has no stale smoothed pickup direction');
  } finally { (globalThis as any).document = previous; }
});

test('HUD hides immediately for no job, ground, blocked surfaces, rotation and hidden pages', () => {
  const previous = (globalThis as any).document;
  const doc: any = { hidden: false, documentElement: { classList: { contains: () => false } } };
  (globalThis as any).document = doc;
  try {
    const { hud, el, classes } = hudFixture();
    const show = () => { hud.flightNavigation(input(0, -100), .016); assert.equal(el['flight-navigation'].hidden, false); };
    show(); hud.flightNavigation(null); assert.equal(el['flight-navigation'].hidden, true);
    show(); hud.flightNavigation({ ...input(0, -100), flying: false }); assert.equal(el['flight-navigation'].hidden, true);
    for (const name of ['has-offer']) { show(); classes.add(name); hud.flightNavigation(input(0, -100), .016); assert.equal(el['flight-navigation'].hidden, true); classes.delete(name); }
    for (const id of ['modal', 'tip-layer']) { show(); el[id].hidden = false; hud.flightNavigation(input(0, -100), .016); assert.equal(el['flight-navigation'].hidden, true); el[id].hidden = true; }
    show(); hud.rotationBlocked = true; hud.flightNavigation(input(0, -100), .016); assert.equal(el['flight-navigation'].hidden, true); hud.rotationBlocked = false;
    show(); hud.flightNavHasRoom = false; hud.flightNavigation(input(0, -100), .016); assert.equal(el['flight-navigation'].hidden, true); hud.flightNavHasRoom = true;
    show(); doc.hidden = true; hud.flightNavigation(input(0, -100), .016); assert.equal(el['flight-navigation'].hidden, true); doc.hidden = false;
    show(); doc.documentElement.classList.contains = (name: string) => name === 'ui-blocks-world'; hud.flightNavigation(input(0, -100), .016); assert.equal(el['flight-navigation'].hidden, true);
  } finally { (globalThis as any).document = previous; }
});

test('production HUD keeps the navigation rectangle fixed while area notices show and expire',()=>{
  for(const [width,height] of [[568,320],[599,320],[600,320],[610,320],[618,320],[619,320],[640,280],[800,360],[852,393],[918,384],[1280,720]]){
    const controls=mobileHudLayout(width,height,62,106),narrow=flightNavigationNeedsCompactLane(width,controls.rightSteer.left+controls.rightSteer.width,controls.map.left,controls.brake.left);
    const area={left:(width-300)/2,top:62,width:300,height:42};
    const classes=new Set<string>(),panel={style:{},dataset:{}};
    const hud:any=Object.assign(Object.create(Hud.prototype),{el:{'area-chip':{classList:{contains:(name:string)=>classes.has(name)}},'flight-navigation':panel},flightNavigation(){assert.fail('supported landscape must retain guidance');}});
    const left=narrow?154:controls.rightSteer.left+controls.rightSteer.width;
    const right=narrow?controls.map.left:Math.min(controls.map.left,controls.brake.left);
    const args=[{left:0,top:0,width,height},54,area,{left:12,top:62,width:left-12,height:0},{...controls.map,left:right},narrow?controls.leftSteer.top+4:controls.brake.top,narrow];
    for(const visible of [false,true,false]){
      visible?classes.add('show'):classes.delete('show');
      const box=hud.positionFlightNavigation(...args);
      assert.equal(box.top,62,`${width}×${height}: notice visibility cannot move navigation`);
      assert.equal(box.height,narrow?44:48,'quiet strip has no oversized 64px default');
      assert.equal(panel.style['height' as keyof typeof panel.style],`${narrow?44:48}px`);
      const blockers=[{left:0,top:0,width,height:54},controls.map,controls.leftSteer,controls.rightSteer,controls.brake,controls.gas,controls.fly,controls.jump,controls.speed];
      for(const blocker of blockers)assert.equal(overlaps(box,blocker),false,`${width}×${height}: guidance overlaps ${JSON.stringify(blocker)}`);
    }
  }
});

test('area notice is name-only and replaces its timer without relaying out navigation',()=>{
  const priorWindow=(globalThis as any).window,priorClear=globalThis.clearTimeout;
  let timerId=0,layouts=0;const timers=new Map<number,()=>void>(),classes=new Set<string>();
  const chip={innerHTML:'',classList:{contains:(name:string)=>classes.has(name),add:(name:string)=>classes.add(name),remove:(name:string)=>classes.delete(name)}};
  const hud:any=Object.assign(Object.create(Hud.prototype),{el:{'area-chip':chip},areaT:0,updateLayout(){layouts++;}});
  try{
    (globalThis as any).window={setTimeout(fn:()=>void,ms:number){assert.equal(ms,4200);timers.set(++timerId,fn);return timerId;}};
    (globalThis as any).clearTimeout=(id:number)=>timers.delete(id);
    hud.areaChip('RTC X Roads');assert.equal(chip['textContent'],'RTC X Roads');assert.equal(layouts,0);assert.equal(classes.has('show'),true);assert.equal(timers.size,1);
    for(let i=0;i<20;i++)hud.areaChip(`Neighbourhood ${i}`);
    assert.equal(layouts,0,'notice content must never move navigation');assert.equal(timers.size,1);
    const expire=timers.get(timerId)!;timers.delete(timerId);expire();
    assert.equal(classes.has('show'),false);assert.equal(layouts,0,'expiry cannot move navigation');
    hud.areaChip('HITEC City','Nearby');assert.equal(chip['textContent'],'HITEC City');assert.equal(layouts,0);assert.equal(timers.size,1);
  }finally{(globalThis as any).window=priorWindow;globalThis.clearTimeout=priorClear;}
});


test('invalid viewport clears the old reserved navigation bounds and restores them on resize',()=>{
  const slot={style:{} as Record<string,string>},panel={style:{},dataset:{}};let hidden=0;
  const hud:any=Object.assign(Object.create(Hud.prototype),{el:{'hud-navigation-slot':slot,'flight-navigation':panel},flightNavigation(){hidden++;}});
  const root={left:0,top:0,width:800,height:360},area={left:18,top:62,width:180,height:28},tasks={left:18,top:62,width:200,height:0},map={left:660,top:62,width:122,height:122};
  assert.ok(hud.positionFlightNavigation(root,54,area,tasks,map,250,false));
  assert.equal(slot.style.width,'180px');assert.equal(slot.style.height,'48px');
  assert.equal(hud.positionFlightNavigation({...root,height:130},54,area,tasks,map,90,false),null);
  assert.equal(slot.style.width,'0px');assert.equal(slot.style.height,'0px');assert.equal(hidden,1);
  assert.ok(hud.positionFlightNavigation(root,54,area,tasks,map,250,false));
  assert.equal(slot.style.width,'180px');assert.equal(slot.style.height,'48px');
});


test('navigation selects its compact lane by free space rather than the 600px breakpoint',()=>{
  for(const [width,compact] of [[568,true],[599,true],[600,true],[610,true],[618,true],[619,false],[667,false],[800,false]] as const){
    const c=mobileHudLayout(width,320,62,106);
    assert.equal(flightNavigationNeedsCompactLane(width,c.rightSteer.left+c.rightSteer.width,c.map.left,c.brake.left),compact,`${width}px`);
  }
});
