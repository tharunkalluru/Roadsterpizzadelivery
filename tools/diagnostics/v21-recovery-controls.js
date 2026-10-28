// Isolated fixture + real visible controls. This is not human play or a phone benchmark.
async (page) => {
  const cdp = await page.context().newCDPSession(page), errors = [], held = new Set(), checkpoints = [];
  const onError = e => errors.push(String(e)), onConsole = m => { if (m.type() === 'error') errors.push(m.text()); };
  page.on('pageerror', onError); page.on('console', onConsole);
  await page.setViewportSize({ width: 915, height: 412 });
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.addInitScript(() => {
    localStorage.setItem('p2ph-settings-v1', JSON.stringify({ quality: 'low', sound: false, steer: 'stick', tips: false }));
    // A synthetic completed-order flag enables orders OFF; no delivery is claimed.
    localStorage.setItem('p2ph-save-v1', JSON.stringify({ coins: 500, level: 0, doneInLevel: 0, day: 1, minutes: 720, total: 1, acceptingOrders: false }));
    localStorage.setItem('p2ph-tutorial-v1', '1');
  });
  const sample = async label => { const value = await page.evaluate(() => { const g = window.__game; return { position: { ...g.player.pos }, speed: g.player.speed, flying: g.player.flying, descending: g.player.descending, area: g.area?.name, paused: g.paused, keys: [...g.keys], render: { ...g.engine.renderer.info.render }, tiles: g.city.tiles.size, bootError: window.__err || null }; }); checkpoints.push({ label, ...value }); return value; };
  const press = async (key, ms) => { await page.keyboard.down(key); held.add(key); await page.waitForTimeout(ms); await page.keyboard.up(key); held.delete(key); };
  try {
    await page.goto('https://hyderabad-pizza-picture-hall.blithe-okapi-0017.chatgpt.site/?area=RTC%20X%20Roads&q=low&restored=21');
    await page.waitForFunction(() => window.__game && !window.__game.relocating && !document.documentElement.classList.contains('game-loading'), null, { timeout: 90000 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4.04 }); await page.waitForTimeout(8000);
    const before = await sample('ready');
    await page.locator('#game canvas').click({ position: { x: 440, y: 210 } });
    await press('w', 3000); const driven = await sample('accelerated'); await press('s', 1700);
    await page.keyboard.press('Space'); await press('w', 5500); const airborne = await sample('airborne');
    await press('d', 750); await press('w', 3500); await sample('flight steering');
    await page.keyboard.press('Space'); await press('s', 2000); await page.waitForTimeout(9000); const landed = await sample('landed');
    const shot = 'output/playwright/v21-restored-flight-landed.png'; await page.screenshot({ path: shot });
    await page.keyboard.press('Escape'); await sample('paused');
    return { scope: 'Visible keyboard driving/takeoff/steering/landing on restored Version21; desktop CPU4.04x with touch layout, not a physical-phone/FPS or completed-delivery result.',
      source: await page.locator('script[type=module]').getAttribute('src'), checkpoints, errors, screenshot: shot,
      checks: { renderedWorld: before.render.triangles > 0, roadMotion: Math.hypot(driven.position.x - before.position.x, driven.position.z - before.position.z) > 5,
        flightStarted: airborne.flying && airborne.position.y > before.position.y + 3, landed: !landed.flying && !landed.descending, paused: checkpoints.at(-1).paused, keysReleased: checkpoints.at(-1).keys.length === 0 } };
  } finally {
    for (const key of held) await page.keyboard.up(key);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }); await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false }); await cdp.detach();
    page.off('pageerror', onError); page.off('console', onConsole);
  }
}
