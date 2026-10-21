import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const output = new URL(`../../output/visual-performance/${process.argv[2] ?? 'v2-after'}/`, import.meta.url);
await mkdir(output, { recursive: true });
try {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage(), errors = [], failures = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) failures.push({ url: r.url(), status: r.status() }); });
  await page.goto('http://127.0.0.1:5486/preview.html?debug&manualclock', { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ content: '.debug { display:none !important; }' });
  const source = await readFile(new URL('../phone-preview/touch-journeys.js', import.meta.url), 'utf8');
  const captured = source.replace("await wait('READY');await tap('[data-start]');", "await wait('READY');await capture('ready');await tap('[data-start]');").replace("await wait('RESULTS');\n    const result=", "await wait('RESULTS');await capture('result');\n    const result=").replace('const arrival=await driveToAction()', 'await capture(name); const arrival=await driveToAction()').replace("await wait('MENU');", `await wait('MENU'); await page.evaluate(()=>{ const a=window.__hmd, original=a.audio.pickup.bind(a.audio); window.__v2PickupCues=0; a.audio.pickup=()=>{window.__v2PickupCues++;original();}; });`);
  const nearPickupLabels = [];
  const screenChecks = [];
  const capturedScreens = new Set();
  const journeys = await new Function('capture', `return (${captured});`)(async name => {
    if (name === 'ready' || name === 'result') {
      if (capturedScreens.has(name)) return;
      capturedScreens.add(name);
      await page.setViewportSize({width:568,height:320});
      await page.waitForTimeout(100);
      const action = name === 'ready' ? '[data-start]' : '[data-retry]';
      await page.locator(action).scrollIntoViewIfNeeded();
      await page.screenshot({path:new URL(`${name}-568.png`,output).pathname});
      await page.locator('.screens summary').click();
      const expanded=await page.locator('.screens details').evaluate(n=>n.open);
      await page.screenshot({path:new URL(`${name}-expanded-568.png`,output).pathname});
      await page.locator('.screens summary').click();
      await page.locator(action).scrollIntoViewIfNeeded();
      const hittable=await page.locator(action).evaluate(n=>{const r=n.getBoundingClientRect();return n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));});
      if(!expanded||!hittable)throw Error('Small screen handoff failed: '+name);
      screenChecks.push({name,width:568,expanded,hittable});
      await page.setViewportSize({width:844,height:390});
      return;
    }
    await page.waitForTimeout(2700);
    await page.screenshot({ path: new URL(`collected-${name.replace(/[^a-z]+/gi, '-').toLowerCase()}.png`, output).pathname });
    if (name.startsWith('first job')) for (const width of [568, 844]) {
      await page.setViewportSize({ width, height: width === 568 ? 320 : 390 });
      await page.waitForTimeout(300);
      nearPickupLabels.push(await page.evaluate(() => ({ width: innerWidth, stats: { ...window.__hmd.view.worldLabels.stats }, labels: [...document.querySelectorAll('.world-label:not([hidden])')].map(n => n.innerText) })));
      await page.screenshot({ path: new URL(`pickup-names-${width}.png`, output).pathname });
    }
  })(page);
  const pickupCues = await page.evaluate(() => window.__v2PickupCues);
  if (pickupCues !== 3) throw Error('Expected one cue per successful pickup: ' + pickupCues);
  // Start a fresh normal-spawn run after the three delivery journeys and abandon.
  await page.locator('[data-retry]').tap();
  await page.waitForFunction(() => window.__hmd.state === 'READY');
  await page.locator('[data-start]').tap();
  await page.waitForFunction(() => window.__hmd.state === 'PLAYING');
  const cdp = await context.newCDPSession(page);
  const rect = await page.locator('[data-accel]').boundingBox();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }] });
  const held = await page.evaluate(() => window.__hmd.input.sample().accel);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  const cancelled = await page.evaluate(() => window.__hmd.input.sample().accel);
  if (!held || cancelled) throw Error('Cancelled accelerator pointer remained active');
  const pad = await page.locator('[data-steer]').boundingBox();
  const sx = pad.x + pad.width / 2, sy = pad.y + pad.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx + 40, y: sy }] });
  const steer = await page.evaluate(() => window.__hmd.input.sample().steer);
  const expectedSteer = 34 / (Math.min(844 * .42, 360) * .28);
  if (Math.abs(steer - expectedSteer) > .02) throw Error(`Steering calibration changed: ${steer} vs ${expectedSteer}`);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  const cancelledSteer = await page.evaluate(() => window.__hmd.input.sample().steer);
  if (cancelledSteer !== 0) throw Error('Cancelled steering did not recenter');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => window.__hmd.state === 'PAUSED');
  const portraitPause = await page.evaluate(() => window.__hmd.pauseReason);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.locator('[data-resume]').tap();
  await page.waitForFunction(() => window.__hmd.state === 'PLAYING');
  const layouts = [];
  for (const width of [568, 667, 844]) {
    await page.setViewportSize({ width, height: width === 568 ? 320 : 390 });
    await page.waitForTimeout(220);
    layouts.push(await page.evaluate(() => {
      const selectors = ['[data-steer]', '[data-accel]', '[data-brake]', '[data-fly]', '[data-pause]', '[data-map]'];
      return { width: innerWidth, height: innerHeight, controls: selectors.map(selector => {
        const node = document.querySelector(selector), r = node.getBoundingClientRect();
        return { selector, width: r.width, height: r.height, inBounds: r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, hittable: node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) };
      }), labels: [...document.querySelectorAll('.world-label:not([hidden])')].map(node => {
        const r = node.getBoundingClientRect();
        return { text: node.innerText, signId: node.dataset.signId, fontPx: parseFloat(getComputedStyle(node.querySelector('.world-label__name')).fontSize), pointerEvents: getComputedStyle(node).pointerEvents, inBounds: r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight };
      }) };
    }));
    await page.screenshot({ path: new URL(`phone-labels-${width}.png`, output).pathname });
  }
  if (layouts.some(l => l.controls.some(c => !c.inBounds || !c.hittable || c.width < 44 || c.height < 44))) throw Error('Touch control layout failed: ' + JSON.stringify(layouts));
  if (layouts.some(l => l.labels.length > 1 || l.labels.some(label => !label.inBounds || label.fontPx < 12 || label.pointerEvents !== 'none'))) throw Error('World label layout failed: ' + JSON.stringify(layouts));
  if (layouts.some(l => l.labels.length !== 0)) throw Error('Passive driving view showed helper labels');
  await page.setViewportSize({ width: 844, height: 390 });
  const inspection = [];
  for (const drag of [-100, 100, -170, 170, -50, 50]) {
    await page.evaluate(() => window.__hmd.view.resetCamera());
    await page.waitForTimeout(80);
    await page.mouse.move(430, 190); await page.mouse.down();
    await page.mouse.move(430 + drag, 190, { steps: 8 });
    await page.waitForTimeout(900);
    const record = await page.evaluate(() => ({ speed: window.__hmd.session.player.speed, stats: {...window.__hmd.view.worldLabels.stats}, labels: [...document.querySelectorAll('.world-label:not([hidden])')].map(n=>({text:n.textContent,rect: n.getBoundingClientRect().toJSON()})) }));
    inspection.push({drag,...record});
    if (record.labels.length) await page.screenshot({path:new URL('parked-inspection.png',output).pathname});
    await page.mouse.up();
    if (record.labels.length) break;
  }
  if (!inspection.some(i=>i.labels.length===1)) throw Error('Deliberate parked inspection never revealed a name: '+JSON.stringify(inspection));
  await page.waitForTimeout(1700);
  if (await page.locator('.world-label:not([hidden])').count()) throw Error('Inspection label linger did not expire');
  await page.evaluate(()=>window.__hmd.view.resetCamera());
  const resetResources = [];
  for (let cycle = 0; cycle < 4; cycle++) {
    await page.locator('[data-pause]').tap();
    await page.locator('[data-abandon]').tap();
    await page.waitForFunction(() => window.__hmd.state === 'RESULTS');
    await page.locator('[data-retry]').tap();
    await page.waitForFunction(() => window.__hmd.state === 'READY');
    await page.locator('[data-start]').tap();
    await page.waitForFunction(() => window.__hmd.state === 'PLAYING');
    await page.waitForTimeout(750);
    await cdp.send('HeapProfiler.collectGarbage');
    const heap = await cdp.send('Runtime.getHeapUsage');
    resetResources.push(await page.evaluate(({ cycle, usedSize }) => {
      const a = window.__hmd;
      return { cycle, gpuResources: { ...a.renderer.info.memory }, programs: a.renderer.info.programs.length, retainedJSHeapAfterGC: usedSize, chunks: a.view.chunkIds.length, roadTiles: a.view.roadTileCount, labelNodes: document.querySelectorAll('.world-label').length, labelStats: { ...a.view.worldLabels.stats }, position: { x: a.session.player.x, z: a.session.player.z } };
    }, { cycle, usedSize: heap.usedSize }));
  }
  // Real animation frames and real fixed-step physics, distinct from the manual-clock functional harness.
  await page.evaluate(() => { const a = window.__hmd; a.manualClock = false; a.debug = false; a.frameTimes.length = 0; a.enableAutopilot(); a.clock.reset(); document.querySelector('[data-debug]').classList.add('hidden'); });
  const before = await page.evaluate(() => { window.__v2MovingLabelViolations=0;window.__v2Watch=true; const watch=()=>{const a=window.__hmd;if((Math.abs(a.session.player.speed)>.15||a.session.player.isAirborne)&&document.querySelector('.world-label:not([hidden])'))window.__v2MovingLabelViolations++;if(window.__v2Watch)requestAnimationFrame(watch);};requestAnimationFrame(watch);return ({ tick: window.__hmd.session.tick, distance: window.__hmd.session.distanceTravelled }); });
  await page.waitForTimeout(15000);
  const driving = await page.evaluate(() => {
    const a = window.__hmd, s = a.session;
    return { state: a.state, tick: s.tick, distance: s.distanceTravelled, recoveries: s.recoveries, inside: a.pilotZone.allowsPose(s.player), frameMs: a.frameStats(), graphics: a.quality, pixelRatio: a.renderer.getPixelRatio(), gpuResources: { ...a.renderer.info.memory } };
  });
  if (driving.tick <= before.tick + 600 || driving.distance <= before.distance + 20 || !driving.inside || driving.recoveries !== 0) throw Error('Normal-clock driving failed: ' + JSON.stringify(driving));
  await page.screenshot({ path: new URL('moving-phone.png', output).pathname });
  // A CPU-slowed desktop proxy is useful extra pressure, never a physical-phone measurement.
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const slowBefore = await page.evaluate(() => { const a = window.__hmd; a.frameTimes.length = 0; return { tick: a.session.tick, distance: a.session.distanceTravelled }; });
  await page.waitForTimeout(15000);
  const slowedDriving = await page.evaluate(() => { const a = window.__hmd; return { state: a.state, tick: a.session.tick, distance: a.session.distanceTravelled, frameMs: a.frameStats(), pixelRatio: a.renderer.getPixelRatio(), recoveries: a.session.recoveries }; });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const flight = { launch: await page.evaluate(() => window.__hmd.session.player.evaluateLaunch()) };
  if (flight.launch.ok) {
    await page.evaluate(() => { window.__hmd.autopilot = null; window.__hmd.input.clearAll(); });
    await page.locator('[data-fly]').tap();
    await page.waitForFunction(() => window.__hmd.session.player.isAirborne, null, { timeout: 5000 });
    await page.waitForTimeout(800);
    flight.airborne = await page.evaluate(() => { const a = window.__hmd, p = a.session.player; return { move: p.move, height: p.y, withinZone: a.pilotZone.allowsPose(p), drawCalls: a.renderer.info.render.calls, triangles: a.renderer.info.render.triangles }; });
    await page.screenshot({ path: new URL('flight-phone.png', output).pathname });
    await page.locator('[data-fly]').tap();
    await page.waitForFunction(() => !window.__hmd.session.player.isAirborne, null, { timeout: 20000 });
    flight.landed = await page.evaluate(() => ({ move: window.__hmd.session.player.move, recoveries: window.__hmd.session.recoveries }));
  }
  const movingLabelViolations = await page.evaluate(()=>{window.__v2Watch=false;return window.__v2MovingLabelViolations;});
  if (movingLabelViolations) throw Error('Moving label visibility violations: '+movingLabelViolations);
  const labelLifecycle = await page.evaluate(() => {
    const labels = window.__hmd.view.worldLabels, before = labels.stats.candidates;
    const [id, chunk] = [...labels.chunks].find(([, c]) => c.candidates.length);
    const signs = chunk.candidates.map(c => c.source), buildings = chunk.blockers.map(c => c.building);
    labels.attachChunk(id, signs, buildings); labels.attachChunk(id, signs, buildings);
    const afterReattach = labels.stats.candidates;
    labels.removeChunk(id);
    const afterRemove = labels.stats.candidates, dangling = [...document.querySelectorAll('.world-label:not([hidden])')].some(n => signs.some(s => s.id === n.dataset.signId));
    labels.dispose();
    return { before, afterReattach, afterRemove, removed: signs.length, dangling, rootsAfterDispose: document.querySelectorAll('.world-labels').length, candidatesAfterDispose: labels.stats.candidates };
  });
  if (labelLifecycle.before !== labelLifecycle.afterReattach || labelLifecycle.afterRemove !== labelLifecycle.before - labelLifecycle.removed || labelLifecycle.dangling || labelLifecycle.rootsAfterDispose || labelLifecycle.candidatesAfterDispose || resetResources.some(r => r.labelNodes !== 1)) throw Error('World label lifecycle failed: ' + JSON.stringify(labelLifecycle));
  const result = { at: new Date().toISOString(), journeys, screenChecks, pickupCues, inspection, movingLabelViolations, nearPickupLabels, pointerCancel: { held, cancelled, steer, expectedSteer, cancelledSteer }, portraitPause, layouts, resetResources, normalClockDriving: { before, ...driving }, desktopCpuProxy: { slowdown: 4, before: slowBefore, ...slowedDriving }, flight, labelLifecycle, pageErrors: errors, failedResponses: failures, physicalPhone: false };
  await writeFile(new URL('regression.json', output), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ journeys: journeys.runs.map(r => ({ name: r.name, success: r.result.outcome.success })), pointerCancel: result.pointerCancel, portraitPause, layoutsPass: true, resetResources, normalClockDriving: { ...driving, frameMs: { p50: driving.frameMs.p50, p95: driving.frameMs.p95, p99: driving.frameMs.p99 } }, errors, failures }));
  await cdp.detach();
} finally { await browser.close(); }
