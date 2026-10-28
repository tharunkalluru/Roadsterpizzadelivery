async (page) => {
  // Explicit network-fault experiment. No game/worker state is written.
  const started = Date.now(), deadline = started + 85000, approachEnd = started + 65000;
  const held = new Set(), events = [], samples = [];
  let cdp = null, target = null, initial = null, frozen = null, freezeAfterInput = null, recovered = null;
  let outcome = 'attempt', retryClicked = false, networkRestored = false, freezeProven = false, recoveryProven = false;
  const event = (name, data = {}) => events.push({ ms: Date.now() - started, name, ...data });
  const key = async (k, on) => { if (on && !held.has(k)) { await page.keyboard.down(k); held.add(k); }
    if (!on && held.has(k)) { await page.keyboard.up(k); held.delete(k); } };
  const release = async () => { for (const k of [...held]) await key(k, false); };
  const offline = async (on) => {
    // Context offline includes dedicated-worker fetches. CDP applies the same
    // fault to the page; neither invalidates the worker's legitimate decoded cache.
    await page.context().setOffline(on);
    if (cdp) await cdp.send('Network.emulateNetworkConditions', { offline: on, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    if (!on) networkRestored = true;
  };
  const inspect = () => page.evaluate(() => {
    const g = window.__game; if (!g) return { unavailable: true };
    const p = g.player, city = g.city, loader = document.getElementById('loading');
    const missing = [], px = p.pos.x - Math.sin(p.yaw) * p.speed * .15, pz = p.pos.z - Math.cos(p.yaw) * p.speed * .15;
    for (let i = Math.floor((Math.min(p.pos.x, px) - 5) / 1000); i <= Math.floor((Math.max(p.pos.x, px) + 5) / 1000); i++)
      for (let j = Math.floor((Math.min(p.pos.z, pz) - 5) / 1000); j <= Math.floor((Math.max(p.pos.z, pz) + 5) / 1000); j++) {
        const k = `${i}_${j}`; if (city.packOf.has(k) && !city.tiles.has(k) && !city.empty.has(k)) missing.push(k);
      }
    return { at: new Date().toISOString(), bundle: [...document.scripts].map(s => s.src).find(s => /index-/.test(s)),
      simTime: g.t, minutes: g.minutes, day: g.day, area: g.area?.name, coins: g.coins, delivered: g.totalDelivered,
      pos: { x: p.pos.x, y: p.pos.y, z: p.pos.z }, yaw: p.yaw, speedMps: p.speed,
      flying: p.flying, descending: p.descending, jumping: p.jumping, jumpCooldown: p.jumpCooldown, jumpElapsed: p.jumpElapsed,
      surface: p.lastKind, supportY: p.lastSupport, order: g.order ? { state: g.order.state, t: g.order.t, heat: g.order.heat, slices: g.order.slices } : null,
      acceptingOrders: g.acceptingOrders, choosing: g.choosing, relocating: g.relocating, paused: g.paused,
      modal: g.hud.modalOpen, tip: g.hud.tipOpen, map: g.map?.open, rotationBlocked: g.hud.rotationBlocked, autopilot: g.autopilot,
      graphicsReady: g.engine.graphicsReady, active: g.gameplayActive(), boundary: !!g.streamingBoundary,
      loader: { visible: !!loader && !loader.hidden && !!loader.getClientRects().length, state: loader?.getAttribute('data-state'),
        status: document.getElementById('loading-status')?.textContent, gameLoading: document.documentElement.classList.contains('game-loading') },
      gameKeys: [...g.keys], flyQueued: g.flyQueued, jumpQueued: g.jumpQueued,
      missingMovement: missing, loadedKeys: [...city.tiles.keys()], pendingKeys: [...city.pending.keys()], stagedKeys: [...city.staged.keys()],
      failures: [...city.failures].map(([key, v]) => ({ key, ...v })), stream: { ...city.streamStats },
      retryVisible: [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Retry road loading' && !!b.getClientRects().length) };
  });
  const chooseFrontier = () => page.evaluate(() => {
    const g = window.__game, city = g.city, p = g.player.pos;
    const residentPacks = new Set([...city.tiles.keys()].map(k => city.packOf.get(k))), candidates = [];
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    for (const [key, pack] of city.packOf) {
      if (city.tiles.has(key) || city.empty.has(key) || city.pending.has(key) || city.staged.has(key)) continue;
      const [i, j] = key.split('_').map(Number), neighbours = [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]];
      for (let side = 0; side < neighbours.length; side++) {
        const [a, b] = neighbours[side], fromKey = `${a}_${b}`; if (!city.tiles.has(fromKey) && side !== 0) continue;
        const point = { x: clamp(p.x, i * 1000 + 30, (i + 1) * 1000 - 30), z: clamp(p.z, j * 1000 + 30, (j + 1) * 1000 - 30) };




        const distance = Math.hypot(point.x - p.x, point.z - p.z);
        const unknownPack = !residentPacks.has(pack);
        candidates.push({ key, fromKey, pack, point, distance, packNotRepresentedByResidentTiles: unknownPack,
          cacheCaveat: 'Decoded worker LRU contents are not inspected; even a nonresident pack may already be cached.' });
      }
    }
    candidates.sort((a, b) => a.distance - b.distance);
    const reachable = candidates.filter(c => c.distance <= 2800);
    return { selected: reachable.find(c => c.packNotRepresentedByResidentTiles) || reachable[0] || null,
      nearest: candidates.slice(0, 6), nearestNonresidentPack: candidates.find(c => c.packNotRepresentedByResidentTiles) || null };
  });
  const compareFreeze = (a, b) => ({
    positionMetres: Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y, a.pos.z - b.pos.z),
    simSeconds: b.simTime - a.simTime, cityMinutes: b.minutes - a.minutes,
    jumpCooldownDelta: (b.jumpCooldown || 0) - (a.jumpCooldown || 0), jumpElapsedDelta: (b.jumpElapsed || 0) - (a.jumpElapsed || 0),
    orderUnchanged: JSON.stringify(a.order) === JSON.stringify(b.order), progressUnchanged: a.coins === b.coins && a.delivered === b.delivered,
    inputBlocked: b.gameKeys.length === 0 && !b.flyQueued && !b.jumpQueued,
    opaqueRecovery: b.boundary && !b.active && b.loader.visible && b.loader.gameLoading
  });
  try {
    initial = await inspect();
    if (initial.paused && !initial.choosing && await page.getByRole('button', { name: 'Resume', exact: true }).isVisible()) {
      await page.getByRole('button', { name: 'Resume', exact: true }).click(); event('Resume visible pause panel'); initial = await inspect();
    }
    samples.push({ ms: Date.now() - started, phase: 'initial', state: initial });
    if (initial.unavailable || initial.autopilot || initial.choosing || initial.relocating || initial.modal || initial.tip || initial.map || initial.rotationBlocked || initial.acceptingOrders !== false || initial.order?.state === 'offer') {
      outcome = 'blocked by initial lifecycle'; event('initial guard', { state: initial });
    } else {
      const frontier = await chooseFrontier(); target = frontier.selected; event('read-only frontier selection', frontier);
      if (!target) outcome = 'no reachable unloaded frontier within2800m';
      else {
        const canvas = page.locator('#game canvas'), box = await canvas.boundingBox(); if (!box) throw new Error('Visible game canvas unavailable');
        await canvas.click({ position: { x: box.width * .48, y: box.height * .54 }, timeout: 1500 });
        cdp = await page.context().newCDPSession(page); await cdp.send('Network.enable'); await offline(true);
        event('network offline before forward streaming', { decodedCacheMayServeTarget: !target.packNotRepresentedByResidentTiles });
        if (!initial.flying && !initial.descending && !initial.jumping) { await page.keyboard.press('Space'); event('FLY via Space'); }
        let lastStamp = 0;
        while (Date.now() < approachEnd) {
          const s = await inspect(), now = Date.now();
          if (s.boundary) { frozen = s; event('actual streaming boundary entered', { state: s }); break; }
          if (!s.active || s.autopilot) { event('approach lifecycle interrupted', { state: s }); break; }
          if (now - lastStamp > 1000) { samples.push({ ms: now - started, phase: 'offline approach', state: s }); lastStamp = now; }
          const dx = target.point.x - s.pos.x, dz = target.point.z - s.pos.z, d = Math.hypot(dx, dz);
          if (s.loadedKeys.includes(target.key) && d < 150) { outcome = 'cached frontier loaded normally despite offline'; event('no failure manufactured', { state: s, distance: d }); break; }
          const desired = Math.atan2(-dx, -dz), error = Math.atan2(Math.sin(desired - s.yaw), Math.cos(desired - s.yaw));
          await key('a', error > .045); await key('d', error < -.045);
          const want = Math.abs(error) > .8 ? 7 : Math.abs(error) > .3 ? 16 : 160 / 3.6;
          await key('w', s.speedMps < want - .5); await key('s', s.speedMps > want + .8 && s.speedMps > 1);
          await page.waitForTimeout(110);
        }
        await release();
        if (!frozen) { if (outcome === 'attempt') outcome = 'frontier not reached within bounded approach'; }
        else {
          await page.screenshot({ path: `output/playwright/boundary-frozen-${started}.png` });
          // These are actual input attempts against the opaque recovery gate.
          await key('w', true); await key('d', true); await page.keyboard.press('Space'); await page.keyboard.press('j');
          await page.waitForTimeout(Math.min(2000, Math.max(0, deadline - Date.now())));
          freezeAfterInput = await inspect(); await release();
          const check = compareFreeze(frozen, freezeAfterInput);
          freezeProven = check.positionMetres < 1e-7 && Math.abs(check.simSeconds) < 1e-7 && Math.abs(check.cityMinutes) < 1e-7 &&
            Math.abs(check.jumpCooldownDelta) < 1e-7 && Math.abs(check.jumpElapsedDelta) < 1e-7 && check.orderUnchanged && check.progressUnchanged && check.inputBlocked && check.opaqueRecovery;
          event('frozen timers/position/input comparison', { check, freezeProven });
          const retryWaitEnd = Math.min(deadline - 12000, Date.now() + 4500);
          while (!freezeAfterInput.retryVisible && Date.now() < retryWaitEnd) { await page.waitForTimeout(180); freezeAfterInput = await inspect(); }
          await offline(false); event('network restored');
          if (await page.getByRole('button', { name: 'Retry road loading', exact: true }).isVisible()) {
            await page.getByRole('button', { name: 'Retry road loading', exact: true }).click(); retryClicked = true; event('visible Retry road loading clicked');
          }
          while (Date.now() < deadline) {
            const s = await inspect();
            if (s.retryVisible && !retryClicked) { await page.getByRole('button', { name: 'Retry road loading', exact: true }).click(); retryClicked = true; event('visible Retry after reconnect clicked'); }
            if (!s.boundary && !s.loader.visible && s.graphicsReady && !s.missingMovement.length) {
              recovered = s;
              const simSeconds = s.simTime - frozen.simTime, displacement = Math.hypot(s.pos.x - frozen.pos.x, s.pos.y - frozen.pos.y, s.pos.z - frozen.pos.z);
              const continuousPose = displacement <= Math.abs(frozen.speedMps) * Math.max(0, simSeconds) + 5;
              const progressPreserved = s.coins === frozen.coins && s.delivered === frozen.delivered && JSON.stringify(s.order) === JSON.stringify(frozen.order);
              recoveryProven = freezeProven && continuousPose && progressPreserved;
              event('coherent coverage resumed', { simSeconds, displacement, continuousPose, progressPreserved, state: s });
              outcome = recoveryProven ? retryClicked ? 'boundary freeze and explicit retry recovered' : 'boundary freeze and reconnect recovered; explicit retry not exercised' : 'recovery observed; strict freeze/pose proof failed';
              await page.screenshot({ path: `output/playwright/boundary-recovered-${started}.png` }); break;
            }
            await page.waitForTimeout(150);
          }
          if (!recovered) outcome = 'boundary freeze observed; recovery unfinished within85s';
        }
      }
    }
  } catch (error) { outcome = 'experiment error'; event('exception', { message: String(error), stack: error?.stack }); }
  finally {
    await release(); await offline(false).catch(error => event('network restore error', { error: String(error) }));
    const s = await inspect().catch(() => null);
    if (s && !s.paused && !s.boundary && !s.choosing && !s.modal && !s.tip) { await page.keyboard.press('p'); event('paused via P'); }
    else if (s?.boundary) event('left safely behind recovery loader; input released and network online', { retryVisible: s.retryVisible });
    if (cdp) await cdp.detach().catch(() => {});
  }
  return { started: new Date(started).toISOString(), ended: new Date().toISOString(), seconds: (Date.now() - started) / 1000,
    method: 'Actual visible keyboard controls and visible Retry; explicit CDP/context network fault; read-only manifest/game diagnostics. No game/worker mutation, teleport, simulation stepping or developer autopilot. Existing CPU setting preserved.',
    outcome, target, freezeProven, retryClicked, recoveryProven, networkRestored, releasedKeys: held.size === 0,
    initial, frozen, freezeAfterInput, recovered, events, samples, final: await inspect().catch(error => ({ error: String(error) })) };
}
