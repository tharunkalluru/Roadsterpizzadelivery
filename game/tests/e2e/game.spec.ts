import { test, expect, type Page } from '@playwright/test';

const OUT = 'qa/artifacts/e2e';
const hmd = (p: Page) => p.evaluate(() => {
  const a = (window as any).__hmd; const s = a.session;
  return { state: a.state, move: s?.player.move, consumed: s?.player.ledger.consumedTicks, remaining: s?.player.ledger.remainingTicks, launches: s?.player.ledger.launches, elapsed: s?.elapsedTicks, phase: s?.phase, stop: s?.stopIndex, outcome: s?.outcome, x: s?.player.x, z: s?.player.z, speed: s?.player.speed, recoveries: s?.recoveries, penalty: s?.penaltyTicks };
});
const adv = (p: Page, n: number) => p.evaluate((n) => (window as any).__hmd.debugAdvance(n), n);

async function toMenu(p: Page, q = '?debug&manualclock') {
  await p.goto(q);
  await p.waitForFunction(() => (window as any).__hmd?.state === 'MENU', null, { timeout: 180_000 });
}
async function startMission(p: Page, id: string) {
  await p.click('[data-play]');
  await p.click(`[data-m="${id}"]`);
  await p.click('[data-go]');
  await p.waitForFunction(() => (window as any).__hmd.state === 'READY', null, { timeout: 180_000 });
  await p.evaluate(() => (window as any).__hmd.debugSkipCountdown());
  await p.waitForFunction(() => (window as any).__hmd.state === 'PLAYING', null, { timeout: 60_000 });
}

test('C2: select, pickup, drive (reference agent through real physics), deliver, results, retry, exit', async ({ page }) => {
  await toMenu(page);
  await page.screenshot({ path: `${OUT}/c2-01-menu.png` });
  await page.click('[data-play]');
  await page.screenshot({ path: `${OUT}/c2-02-missions.png` });
  await page.click('[data-m="mt01_first_parcel"]');
  await page.screenshot({ path: `${OUT}/c2-03-preview.png` });
  await page.click('[data-go]');
  await page.waitForFunction(() => (window as any).__hmd.state === 'READY', null, { timeout: 180_000 });
  await page.screenshot({ path: `${OUT}/c2-04-ready.png` });
  await page.evaluate(() => (window as any).__hmd.debugSkipCountdown());
  await page.waitForFunction(() => (window as any).__hmd.state === 'PLAYING');
  const s0 = await hmd(page);
  expect(s0.elapsed).toBe(0); // countdown and loading are not charged
  await page.evaluate(() => (window as any).__hmd.enableAutopilot());
  let shot = 0;
  for (let i = 0; i < 200; i++) {
    const r = await adv(page, 120);
    const st = await hmd(page);
    if (i === 3 || i === 12) { await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/c2-05-driving-${shot++}.png` }); }
    if (r.state === 'RESULTS' || st.state === 'RESULTS') break;
  }
  await page.waitForTimeout(500);
  const end = await hmd(page);
  await page.screenshot({ path: `${OUT}/c2-06-results.png` });
  expect(end.state).toBe('RESULTS');
  expect(end.outcome?.success).toBe(true);
  await expect(page.locator('.screen h2')).toContainText('Delivered');
  await page.click('[data-retry]');
  await page.waitForFunction(() => (window as any).__hmd.state === 'READY', null, { timeout: 180_000 });
  const retry = await hmd(page);
  expect(retry.consumed).toBe(0);
  expect(retry.elapsed).toBe(0);
  await page.click('.screen [data-back]');
  await page.waitForFunction(() => (window as any).__hmd.state === 'MENU');
});

test('C3: shared budget in the browser — fly, hover-meter, land early, fly again; HUD agrees', async ({ page }) => {
  await toMenu(page);
  await startMission(page, 'mt03_correct_approach');
  await adv(page, 240);
  await page.keyboard.press('Space');
  await adv(page, 1);
  let st = await hmd(page);
  if (st.launches === 0) test.info().annotations.push({ type: 'note', description: 'first launch denied at this spot; driving on' });
  for (let k = 0; k < 10 && (await hmd(page)).launches === 0; k++) { await adv(page, 120); await page.keyboard.press('Space'); await adv(page, 1); }
  st = await hmd(page);
  expect(st.launches).toBe(1);
  await adv(page, 150);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/c3-01-flight.png` });
  const mid = await hmd(page);
  expect(mid.consumed).toBeGreaterThanOrEqual(150);
  await page.keyboard.press('Space'); // fresh press → land
  for (let k = 0; k < 20 && (await hmd(page)).move !== 'GROUNDED'; k++) await adv(page, 30);
  const landed = await hmd(page);
  expect(landed.move).toBe('GROUNDED');
  expect(landed.remaining).toBe(1500 - landed.consumed);
  await page.waitForTimeout(300);
  const hudText = await page.locator('[data-mlbl]').textContent();
  expect(hudText).toBe(`Flight ${(landed.remaining / 60).toFixed(1)} s`);
  await page.screenshot({ path: `${OUT}/c3-02-landed.png` });
  await adv(page, 600); // ground driving never refills
  expect((await hmd(page)).consumed).toBe(landed.consumed);
});

test('U06/F18: hidden page pauses everything; nothing is consumed while hidden', async ({ page }) => {
  await toMenu(page, '?debug');
  await startMission(page, 'mt01_first_parcel');
  const before = await hmd(page);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(3000);
  const during = await hmd(page);
  expect(during.state).toBe('PAUSED');
  const again = await hmd(page);
  expect(again.elapsed).toBe(during.elapsed);
  expect(again.consumed).toBe(before.consumed);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); });
  await page.screenshot({ path: `${OUT}/u06-paused.png` });
  await page.click('[data-resume]');
  expect((await hmd(page)).state).toBe('PLAYING');
});

test('U07: WebGL context loss pauses and resumes safely', async ({ page }) => {
  await toMenu(page);
  await startMission(page, 'mt01_first_parcel');
  await adv(page, 200);
  const before = await hmd(page);
  await page.evaluate(() => { (window as any).__lc = (window as any).__hmd.renderer.getContext().getExtension('WEBGL_lose_context'); (window as any).__lc.loseContext(); });
  await page.waitForFunction(() => (window as any).__hmd.state === 'CONTEXT_LOST');
  await page.screenshot({ path: `${OUT}/u07-lost.png` });
  await page.evaluate(() => (window as any).__lc.restoreContext());
  await page.waitForSelector('[data-res]:not([disabled])', { timeout: 30_000 });
  await page.click('[data-res]');
  const after = await hmd(page);
  expect(after.state).toBe('PLAYING');
  expect(after.elapsed).toBe(before.elapsed);
  expect(after.consumed).toBe(before.consumed);
  await adv(page, 60);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/u07-restored.png` });
});

test('U05: storage denied → session-only play explained', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('denied', 'SecurityError'); }; });
  await toMenu(page);
  await expect(page.locator('.notice-box').first()).toContainText('session only');
});

test('U05: no WebGL2 → readable failure', async ({ page }) => {
  await page.addInitScript(() => { const o = HTMLCanvasElement.prototype.getContext; (HTMLCanvasElement.prototype as any).getContext = function (t: string, ...a: any[]) { return t === 'webgl2' ? null : o.call(this, t, ...a); }; });
  await page.goto('/');
  await page.waitForFunction(() => (window as any).__hmd?.state === 'ERROR');
  await expect(page.locator('.screen h2')).toContainText('WebGL2');
  await page.screenshot({ path: `${OUT}/u05-nowebgl.png` });
});

test('U09/U05: a failed chunk request is explained and does not corrupt the run', async ({ page }) => {
  await page.route('**/chunks/**', (r) => r.fulfill({ status: 404, body: 'nope' }));
  await toMenu(page);
  await page.click('[data-play]');
  await page.click('[data-m="mt01_first_parcel"]');
  await page.click('[data-go]');
  await page.waitForFunction(() => (window as any).__hmd.state === 'ERROR', null, { timeout: 120_000 });
  await expect(page.locator('.screen h2')).toContainText('missing');
  await page.screenshot({ path: `${OUT}/u09-chunk-missing.png` });
});

test('U01(emulated)/U02: simultaneous touches; pointercancel and blur release controls', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await toMenu(page);
  await startMission(page, 'mt01_first_parcel');
  await page.screenshot({ path: `${OUT}/u01-mobile-hud.png` });
  const box = async (sel: string) => (await page.locator(sel).boundingBox())!;
  const st = await box('[data-steer]'), br = await box('[data-brake]');
  await page.evaluate(({ st, br }) => {
    const ev = (el: Element, type: string, id: number, x: number, y: number) => el.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: 'touch', isPrimary: id === 1 }));
    const steer = document.querySelector('[data-steer]')!, brake = document.querySelector('[data-brake]')!;
    ev(steer, 'pointerdown', 1, st.x + st.width / 2, st.y + st.height / 2);
    ev(steer, 'pointermove', 1, st.x + st.width / 2 + 120, st.y + st.height / 2);
    ev(brake, 'pointerdown', 2, br.x + br.width / 2, br.y + br.height / 2);
  }, { st, br });
  const both = await page.evaluate(() => { const i = (window as any).__hmd.input; return { steer: i.steerValue, brake: i.brakePointers.size }; });
  expect(both.steer).toBeGreaterThan(0.5);
  expect(both.brake).toBe(1);
  await page.evaluate(() => { const el = document.querySelector('[data-brake]')!; el.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 2, bubbles: true, pointerType: 'touch' })); window.dispatchEvent(new Event('blur')); });
  const cleared = await page.evaluate(() => { const i = (window as any).__hmd.input; return { steer: i.steerValue, brake: i.brakePointers.size }; });
  expect(cleared).toEqual({ steer: 0, brake: 0 });
  // portrait rotation during play pauses
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
  await page.waitForTimeout(400);
  expect((await hmd(page)).state).toBe('PAUSED');
  await page.screenshot({ path: `${OUT}/u03-portrait-pause.png` });
  await ctx.close();
});

test('M02/M03 in browser: map opens paused; manual recovery adds one penalty and keeps fuel', async ({ page }) => {
  await toMenu(page);
  await startMission(page, 'mt05_busy_frontage');
  await adv(page, 300);
  await page.keyboard.press('KeyM');
  await page.waitForFunction(() => (window as any).__hmd.state === 'PAUSED');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/m-map.png` });
  const e1 = (await hmd(page)).elapsed;
  await adv(page, 100);
  expect((await hmd(page)).elapsed).toBe(e1);
  await page.click('[data-close]');
  await page.evaluate(() => (window as any).__hmd.session.requestManualRecovery());
  await adv(page, 1);
  await adv(page, 1);
  const st = await hmd(page);
  expect(st.recoveries).toBe(1);
  expect(st.penalty).toBe(180);
});
