import test from 'node:test';
import assert from 'node:assert/strict';
import { flightNavigationLayout, flightNavigationReadout, smoothFlightBearing, type FlightNavigationInput } from '../../src/ui/flight-navigation';
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
  assert.equal(flightNavigationReadout(input(0, -35))!.hint, 'Land for pickup');
  assert.equal(flightNavigationReadout(input(0, -36))!.hint, 'Straight ahead');
  const customer = input(0, -20); customer.target.kind = 'customer';
  assert.equal(flightNavigationReadout(customer)!.hint, 'Land for customer');
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
    assert.ok(box!.left >= 12 && box!.left + box!.width <= width - 12 && box!.top >= 112);
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
    assert.equal(el['flight-navigation'].dataset.kind, 'customer'); assert.equal(el['flight-nav-target'].textContent, 'Customer');
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
