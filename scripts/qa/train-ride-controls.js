async (page) => {
  // Prepared only: this experiment drives real keyboard controls. Game observations are read-only.
  const started = Date.now(), deadline = started + 55000, held = new Set();
  const samples = [], events = [], rideWindows = [];
  let targetId = null, phase = 'approach', landPressed = false, provenRide = false, outcome = 'attempt';
  let window = null, longestStableSeconds = 0, lastSample = 0, maxSpeedKmh = 0, flightStarted = false;
  const key = async (k, on) => {
    if (on && !held.has(k)) { await page.keyboard.down(k); held.add(k); }
    if (!on && held.has(k)) { await page.keyboard.up(k); held.delete(k); }
  };
  const release = async () => { for (const k of [...held]) await key(k, false); };
  const event = (name, data = {}) => events.push({ ms: Date.now() - started, name, ...data });
  const inspect = () => page.evaluate((id) => {
    const g = window.__game; if (!g?.player) return { blocked: 'game unavailable' };
    const p = g.player;
    const shape = (b, source) => {
      const trains = source === 'metro' ? g.metro.trains : g.rail.trains;
      const train = trains.find(t => b.id.startsWith(`${t.id}:`));
      const dx = p.pos.x - b.x, dz = p.pos.z - b.z;
      const along = dx * b.hx + dz * b.hz, side = -dx * b.hz + dz * b.hx;
      const roofAtCar = b.roof + along * (b.grade || 0);
      return { ...b, previous: { ...b.previous }, source, trainId: train?.id,
        speedMps: train?.v ?? null, dwell: train?.dwell ?? null,
        distance: Math.hypot(dx, dz), local: { along, side }, roofAtCar,
        feetAboveRoof: p.pos.y - .55 - roofAtCar,
        headingDot: -Math.sin(p.yaw) * b.hx - Math.cos(p.yaw) * b.hz };
    };
    const bodies = [...g.metro.bodies.map(b => shape(b, 'metro')), ...g.rail.bodies.map(b => shape(b, 'rail'))];
    const attachedId = g.railContacts.attached; // Actual MovingRailInteraction support latch, never written.
    const body = bodies.find(b => b.id === (id || attachedId)) || null;
    const blocked = g.autopilot ? 'developer autopilot enabled' : g.paused ? 'paused' : g.choosing ? 'area picker open' :
      g.relocating ? 'relocation in progress' : g.hud.modalOpen ? 'modal open' : g.hud.tipOpen ? 'tip open' :
      g.map?.open ? 'map open' : g.hud.rotationBlocked ? 'landscape gate' :
      g.order?.state === 'offer' ? 'order offer open' : g.acceptingOrders !== false ? 'orders must be OFF' : null;
    const support = !!body && attachedId === body.id && p.lastKind === 'rail' && !p.flying && !p.descending && !p.jumping &&
      Math.abs(body.feetAboveRoof) <= .25 && Math.abs(body.local.side) < body.halfWidth - .1 &&
      Math.abs(body.local.along) < body.halfLength - 2.3;
    return { blocked, simTime: g.t, body, candidates: id ? undefined : bodies.sort((a, b) => a.distance - b.distance).slice(0, 16), support,
      contacts: { attachedId: attachedId ?? null, drift: { ...g.railContacts.drift }, placementRevision: g.railContacts.revision },
      player: { x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, speedMps: p.speed, vy: p.vy,
        flying: p.flying, descending: p.descending, jumping: p.jumping, lastKind: p.lastKind,
        lastSupport: p.lastSupport, onRoad: p.onRoad },
      area: g.area?.name, stream: { ...g.city.streamStats }, tiles: g.city.tiles.size,
      resources: { ...g.engine.renderer.info.memory } };
  }, targetId);
  const closeWindow = (reason, now) => {
    if (window) rideWindows.push({ ...window, endMs: now - started, reason });
    window = null;
  };
  try {
    const initial = await inspect(); samples.push({ ms: 0, phase: 'initial', ...initial });
    if (initial.blocked) { outcome = 'blocked'; event('guard', { reason: initial.blocked }); }
    else {
      // Prefer a nearby long coach. The chosen body remains fixed throughout the attempt.
      const candidates = (initial.candidates || []).filter(b => b.distance <= 1000 && b.halfLength >= 10 && Number.isFinite(b.speedMps));
      candidates.sort((a, b) => a.distance + (a.halfLength < 11 ? 8 : 0) - b.distance - (b.halfLength < 11 ? 8 : 0));
      const selected = initial.body && initial.support ? initial.body : candidates[0];
      if (!selected) { outcome = 'no nearby body'; event('no actual visible metro or rail coach within 1000m'); }
      else {
        targetId = selected.id; event('selected actual body', { body: selected });
        const canvas = page.locator('#game canvas'), box = await canvas.boundingBox();
        if (!box) throw new Error('Visible canvas unavailable');
        await canvas.click({ position: { x: box.width * .48, y: box.height * .54 }, timeout: 1500 });
        let state = await inspect();
        if (state.support) { phase = 'carry'; event('initial rail attachment observed', { bodyId: targetId }); }
        else if (!state.player.flying && !state.player.descending && !state.player.jumping) {
          await page.keyboard.press('Space'); flightStarted = true; event('FLY via Space');
        }
        while (Date.now() < deadline) {
          const s = await inspect(), now = Date.now();
          if (s.blocked || !s.body) { outcome = 'interrupted'; event('stopped', { reason: s.blocked || 'chosen body no longer present', state: s }); break; }
          const p = s.player, b = s.body; maxSpeedKmh = Math.max(maxSpeedKmh, p.speedMps * 3.6);
          if (now - lastSample >= 350) { samples.push({ ms: now - started, phase, ...s }); lastSample = now; }
          if (s.support) {
            if (phase !== 'carry') { phase = 'carry'; event('actual rail support acquired', { bodyId: b.id, contacts: s.contacts, local: b.local, position: p }); }
            // Player.speed is relative to the coach once attached. Brake it to zero so carry, not driving, proves motion.
            await key('w', false); await key('a', false); await key('d', false); await key('s', p.speedMps > .45);
            const stable = Math.abs(p.speedMps) <= .8;
            if (!stable) closeWindow('relative car motion still settling', now);
            else {
              if (!window) window = { bodyId: b.id, startMs: now - started, startSimTime: s.simTime, startBody: { x: b.x, z: b.z },
                startCar: { x: p.x, z: p.z }, minAlong: b.local.along, maxAlong: b.local.along, minSide: b.local.side, maxSide: b.local.side,
                maxRoofError: Math.abs(b.feetAboveRoof), maxRelativeSpeedMps: Math.abs(p.speedMps), samples: 0 };
              window.minAlong = Math.min(window.minAlong, b.local.along); window.maxAlong = Math.max(window.maxAlong, b.local.along);
              window.minSide = Math.min(window.minSide, b.local.side); window.maxSide = Math.max(window.maxSide, b.local.side);
              window.maxRoofError = Math.max(window.maxRoofError, Math.abs(b.feetAboveRoof));
              window.maxRelativeSpeedMps = Math.max(window.maxRelativeSpeedMps, Math.abs(p.speedMps)); window.samples++;
              window.wallSeconds = (now - started - window.startMs) / 1000;
              window.simSeconds = s.simTime - window.startSimTime;
              window.bodyWorldMetres = Math.hypot(b.x - window.startBody.x, b.z - window.startBody.z);
              window.carWorldMetres = Math.hypot(p.x - window.startCar.x, p.z - window.startCar.z);
              if (window.maxAlong - window.minAlong > 1 || window.maxSide - window.minSide > .45) closeWindow('local coordinates moved beyond stable bound', now);
              else {
                longestStableSeconds = Math.max(longestStableSeconds, Math.min(window.wallSeconds, window.simSeconds));
                if (window.wallSeconds >= 3 && window.simSeconds >= 3 && window.bodyWorldMetres >= 3 && window.carWorldMetres >= 3 && window.samples >= 12) {
                  provenRide = true; outcome = 'proven same-body moving-roof carry'; event('ride proven', { ...window }); closeWindow('proof complete', now); break;
                }
              }
            }
          } else {
            if (phase === 'carry') { event('actual rail support lost', { bodyId: b.id, contacts: s.contacts, local: b.local, position: p }); outcome = 'attachment lost'; closeWindow('support lost', now); break; }
            const trainSpeed = b.speedMps;
            const bodyYaw = Math.atan2(-b.hx, -b.hz), desiredAlong = -b.halfLength * .5;
            let desiredYaw, targetSpeed;
            if (b.distance > 90 || Math.abs(b.local.side) > 12) {
              const closing = Math.max(8, 40 - trainSpeed), leadSeconds = Math.min(4, b.distance / closing);
              const aim = { x: b.x + b.hx * (trainSpeed * leadSeconds + desiredAlong), z: b.z + b.hz * (trainSpeed * leadSeconds + desiredAlong) };
              desiredYaw = Math.atan2(-(aim.x - p.x), -(aim.z - p.z)); targetSpeed = 40;
            } else {
              // Parallel intercept: a small yaw correction centres the narrow roof; speed closes longitudinal error.
              desiredYaw = bodyYaw + Math.atan2(b.local.side, Math.max(12, trainSpeed * .8));
              targetSpeed = Math.max(0, Math.min(40, trainSpeed + Math.max(-12, Math.min(14, (desiredAlong - b.local.along) * .8))));
            }
            const error = Math.atan2(Math.sin(desiredYaw - p.yaw), Math.cos(desiredYaw - p.yaw));
            if (Math.abs(error) > .65) targetSpeed = Math.min(targetSpeed, 7);
            else if (Math.abs(error) > .3) targetSpeed = Math.min(targetSpeed, 16);
            await key('a', error > .018); await key('d', error < -.018);
            await key('w', p.speedMps < targetSpeed - .4); await key('s', p.speedMps > targetSpeed + .6 && p.speedMps > .4);
            if (!landPressed && p.flying && b.feetAboveRoof > 1 && b.feetAboveRoof < 30 &&
              Math.abs(b.local.side) < .38 && b.local.along > -b.halfLength + 3 && b.local.along < 0 &&
              b.headingDot > .985 && Math.abs(p.speedMps - trainSpeed) < 2.2) {
              await page.keyboard.press('Space'); landPressed = true; phase = 'landing';
              event('LAND via Space over actual rear half of coach', { bodyId: b.id, bodySpeedMps: trainSpeed, player: p, local: b.local, roof: b.roof });
            }
            if (landPressed && !p.flying && !p.descending && p.y < b.roof - 1) {
              outcome = 'missed moving roof'; event('landed below selected roof without support', { state: s }); break;
            }
          }
          await page.waitForTimeout(Math.min(110, Math.max(0, deadline - Date.now())));
        }
        closeWindow('bounded experiment ended', Date.now());
      }
    }
  } catch (error) { outcome = 'experiment error'; event('exception', { message: String(error), stack: error?.stack }); }
  finally {
    await release();
    const active = await page.evaluate(() => { const g = window.__game; return !!g && !g.paused && !g.choosing && !g.relocating && !g.hud.modalOpen && !g.hud.tipOpen; }).catch(() => false);
    if (active) { await page.keyboard.press('p'); event('paused via P after releasing controls'); }
  }
  return { started: new Date(started).toISOString(), ended: new Date().toISOString(), seconds: (Date.now() - started) / 1000,
    method: 'Actual keyboard W/A/D/S and Space; read-only g.metro.bodies, g.rail.bodies, g.railContacts.attached and source train velocities. No teleport, simulation stepping, hidden mutation, or developer autopilot; CPU setting preserved.',
    supportSource: 'src/game/moving-rail.ts: MovingRailInteraction.afterPlayer sets attached=roof.body.id, lastKind=rail; beforePlayer carries that body-local position.',
    criterion: 'Same actual support body >=3 wall and simulation seconds, >=3m body and car world movement, along drift <=1m, side drift <=.45m, feet/roof error <=.25m, relative car speed <=.8m/s; at least 12 observations.',
    targetBodyId: targetId, outcome, provenRide, flightStarted, landPressed, longestStableSeconds, maxSpeedKmh,
    events, samples, rideWindows, final: await inspect().catch(error => ({ error: String(error) })), releasedKeys: held.size === 0 };
}
