// External visible-keyboard QA with read-only motion diagnostics, not human play.
// This isolated fixture save enables orders OFF; it is not a completed delivery.
async (page) => {
  const origin = new URL(page.url()).origin, stamp = Date.now(), errors = [], held = new Set();
  const cdp = await page.context().newCDPSession(page);
  const onPage = error => errors.push(String(error)), onConsole = message => { if (message.type() === 'error') errors.push(message.text()); };
  page.on('pageerror', onPage); page.on('console', onConsole);
  await page.setViewportSize({ width: 915, height: 412 });
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.addInitScript(() => {
    localStorage.setItem('p2ph-settings-v1', JSON.stringify({ quality: 'low', sound: false, steer: 'stick', tips: false, targetFPS: 60, adaptiveResolution: false }));
    localStorage.setItem('p2ph-tutorial-v1', '1');
    localStorage.setItem('p2ph-save-v1', JSON.stringify({ coins: 500, level: 0, doneInLevel: 0, day: 9, minutes: 1260, total: 1, acceptingOrders: false }));
  });
  const actions = [];
  try {
    await page.goto(origin + '/?area=RTC%20X%20Roads&q=low&perf=1');
    await page.waitForFunction(() => window.__game && !window.__game.relocating && !document.documentElement.classList.contains('game-loading'), null, { timeout: 90000 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4.04 });
    await page.waitForTimeout(20000);
    await page.evaluate(() => {
      const g = window.__game, engine = g.engine, frame = g.frame, render = engine.render;
      const data = { start: performance.now(), source: document.querySelector('script[type=module]').src, groups: {}, intervals: [], frameCPU: [], samples: [], carSamples: 0, mismatchSamples: 0, maxHeadingErrorDegrees: 0, lastRender: 0, stopped: false };
      engine.render = function (...args) {
        const before = this.renderer.info.render.frame, now = performance.now(), value = render.apply(this, args);
        if (this.renderer.info.render.frame !== before) { if (data.lastRender) data.intervals.push(now - data.lastRender); data.lastRender = now; }
        return value;
      };
      g.frame = function (...args) {
        const start = performance.now();
        try { return frame.apply(this, args); }
        finally {
          if (!g.paused && !g.hud.tipOpen && !g.hud.modalOpen && !g.relocating && !g.map?.open) {
            data.frameCPU.push(performance.now() - start);
            for (const c of g.traffic.cars) {
              const q = c.g.quaternion, fx = -2 * (q.x * q.z + q.w * q.y), fz = -(1 - 2 * (q.x * q.x + q.y * q.y));
              const cosine = (fx * c.hx + fz * c.hz) / (Math.hypot(fx, fz) * Math.hypot(c.hx, c.hz));
              const error = Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI;
              const group = data.groups[c.group] ||= { samples: 0, mismatches: 0, maxErrorDegrees: 0 };
              group.samples++; data.carSamples++; group.maxErrorDegrees = Math.max(group.maxErrorDegrees, error); data.maxHeadingErrorDegrees = Math.max(data.maxHeadingErrorDegrees, error);
              if (error > .25) { group.mismatches++; data.mismatchSamples++; }
            }
          }
        }
      };
      const sample = () => ({ atMs: performance.now() - data.start, position: { ...g.player.pos }, speed: g.player.speed, jumping: g.player.jumping, flying: g.player.flying,
        cars: g.traffic.cars.length, buses: g.traffic.cars.filter(c => c.group === 'bus').length, autos: g.traffic.cars.filter(c => c.group === 'auto').length,
        paused: g.paused, tip: g.hud.tipOpen, order: g.order?.state, autopilot: g.autopilot, tiles: g.city.tiles.size, render: { ...engine.renderer.info.render } });
      const timer = setInterval(() => data.samples.push(sample()), 2000);
      data.before = sample();
      data.stop = () => { if (data.stopped) return; data.stopped = true; clearInterval(timer); g.frame = frame; engine.render = render; data.elapsedMs = performance.now() - data.start; data.after = sample(); };
      window.__trafficHeadingQA = data;
    });
    await page.locator('#game canvas').click({ position: { x: 450, y: 215 } });
    const press = async (key, ms) => { const at = Date.now(); await page.keyboard.down(key); held.add(key); await page.waitForTimeout(ms); await page.keyboard.up(key); held.delete(key); actions.push({ key, milliseconds: Date.now() - at }); };
    await press('w', 4500); await press('s', 2200);
    await page.keyboard.press('j'); actions.push({ key: 'j' }); await page.waitForTimeout(3000);
    await page.keyboard.down('w'); held.add('w'); await press('d', 1700); await page.waitForTimeout(4500); await page.keyboard.up('w'); held.delete('w');
    await press('s', 2400); await page.waitForTimeout(15000);
    await page.keyboard.down('w'); held.add('w'); await press('a', 1500); await page.waitForTimeout(3500); await page.keyboard.up('w'); held.delete('w');
    await press('s', 2200); await page.waitForTimeout(15000);
    const result = await page.evaluate(() => { const data = window.__trafficHeadingQA; data.stop(); const { stop, ...result } = data; return result; });
    const shot = 'output/playwright/traffic-heading-' + stamp + '.png'; await page.screenshot({ path: shot });
    await page.keyboard.press('Escape');
    return { ...result, errors, actions, screenshot: shot, url: page.url(), viewport: page.viewportSize(), cpuRate: 4.04,
      scope: 'Night RTC X Roads, real visible keyboard controls with read-only post-render heading checks; touch layout + desktop CPU slowdown, not a physical-phone benchmark or completed delivery.' };
  } finally {
    for (const key of held) await page.keyboard.up(key);
    await page.evaluate(() => window.__trafficHeadingQA?.stop?.()).catch(() => {});
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }); await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false }); await cdp.detach();
    page.off('pageerror', onPage); page.off('console', onConsole);
  }
}
