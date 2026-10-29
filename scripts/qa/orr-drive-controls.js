async (page) => {
  // PREPARED EXPERIMENT ONLY. All vehicle input below is visible keyboard input.
  // __game is read for navigation/evidence; no simulation or game state is written.
  const started = Date.now(), deadline = started + 55000, held = new Set();
  const events = [], samples = [], drivenEdges = new Set();
  let phase = 'approach', route = null, target = null, last = null, lastSample = 0;
  let groundedMetres = 0, groundedSeconds = 0, maxRoadKmh = 0, maxAirKmh = 0;
  let lastTick = started, landPressed = false, enteredFlight = false, outcome = 'attempt', lastCoverageBlocker = '';
  const key = async (k, down) => {
    if (down && !held.has(k)) { await page.keyboard.down(k); held.add(k); }
    if (!down && held.has(k)) { await page.keyboard.up(k); held.delete(k); }
  };
  const release = async () => { for (const k of [...held]) await key(k, false); };
  const event = (name, details = {}) => events.push({ ms: Date.now() - started, name, ...details });
  const inspect = async (selection = null) => page.evaluate(({ selection }) => {
    const g = window.__game;
    if (!g) return { blocked: 'game unavailable' };
    const p = g.player, graph = g.graph;
    const mainline = (q) => q.e.cls === 'motorway' && !q.e.expressway?.ramp &&
      !/_link$/.test(q.e.cls) && (q.e.expressway?.controlled === true || /outer ring road|\borr\b/i.test(q.e.name || ''));
    const allowedDirs = (q) => q.e.oneway === 'forward' ? [-1] : q.e.oneway === 'backward' ? [1] : [1, -1];
    const lateral = (q) => q.e.oneway ? 0 : Math.min(3.5, q.e.w / 4);
    const pose = (q, progress, dir) => graph.pointAt(q, progress, dir, lateral(q));
    const project = (q, dir, x = p.pos.x, z = p.pos.z) => {
      let best = null;
      for (let i = 1; i < q.e.pts.length; i++) {
        const a = q.e.pts[i - 1], b = q.e.pts[i], dx = b[0] - a[0], dz = b[1] - a[1];
        const len = Math.hypot(dx, dz); if (!len) continue;
        const u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (len * len)));
        const sourceS = q.cum[i - 1] + len * u, progress = dir === 1 ? sourceS : q.len - sourceS;
        const at = pose(q, progress, dir), d = Math.hypot(at.x - x, at.z - z);
        if (!best || d < best.distance) best = { progress, distance: d, pose: at };
      }
      return best;
    };
    const continuation = (q, dir) => {
      const end = pose(q, q.len, dir), nodeId = dir === 1 ? q.to : q.from;
      const candidates = (graph.nodes.get(nodeId)?.out || []).filter(o => o.edge !== q && mainline(o.edge));
      return candidates.map(o => {
        const at = pose(o.edge, 0, o.dir);
        return { ...o, alignment: end.hx * at.hx + end.hz * at.hz, dy: Math.abs(end.y - at.y) };
      }).filter(o => o.alignment > .65 && o.dy <= .8)
        .sort((a, b) => b.alignment - a.alignment)[0] || null;
    };
    const ahead = (q, progress, dir, distance) => {
      const transitions = []; let remaining = distance;
      for (let n = 0; n < 16; n++) {
        const usable = q.len - progress;
        if (remaining <= usable) return { ...pose(q, progress + remaining, dir), edgeId: q.e.id, dir, transitions, complete: true };
        remaining -= usable;
        const next = continuation(q, dir);
        if (!next) return { ...pose(q, q.len, dir), edgeId: q.e.id, dir, transitions, complete: false };
        transitions.push({ from: q.e.id, to: next.edge.e.id, via: dir === 1 ? q.to : q.from, alignment: next.alignment });
        q = next.edge; dir = next.dir; progress = 0;
      }
      return { ...pose(q, progress, dir), edgeId: q.e.id, dir, transitions, complete: false };
    };
    // Read the same finite road/deck surfaces as physics. An overpass is a valid
    // landing surface but invalid evidence for driving the lower ORR mainline.
    const coveredAt = (point) => {
      const blockers = [], seen = new Set(); let supportKnown = false;
      const triangleY = (a, b, c) => {
        const bx = b[0] - a[0], bz = b[2] - a[2], cx = c[0] - a[0], cz = c[2] - a[2], det = bx * cz - bz * cx;
        if (Math.abs(det) < 1e-9) return null;
        const px = point.x - a[0], pz = point.z - a[2], u = (px * cz - pz * cx) / det, v = (bx * pz - bz * px) / det;
        return u >= -1e-6 && v >= -1e-6 && u + v <= 1.000001 ? a[1] + u * (b[1] - a[1]) + v * (c[1] - a[1]) : null;
      };
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const cell = g.city.surfaceGrid.get(`${Math.floor(point.x / 30) + i},${Math.floor(point.z / 30) + j}`) || [];
        for (const surface of cell) {
          if (seen.has(surface)) continue; seen.add(surface);
          const dx = surface.bx - surface.ax, dz = surface.bz - surface.az, ll = dx * dx + dz * dz;
          const raw = ll ? ((point.x - surface.ax) * dx + (point.z - surface.az) * dz) / ll : 0;
          const u = Math.max(0, Math.min(1, raw));
          let y;
          if (surface.roadQuad) {
            const quad = surface.roadQuad;
            y = triangleY(quad[0], quad[1], quad[2]) ?? triangleY(quad[0], quad[2], quad[3]);
            if (y === null) continue;
          } else {
            if (raw < 0 || raw > 1 || Math.hypot(point.x - surface.ax - dx * u, point.z - surface.az - dz * u) > surface.hw) continue;
            y = surface.ya + (surface.yb - surface.ya) * u;
          }
          if (surface.e?.id === point.edgeId && Math.abs(y - point.y) < 1) supportKnown = true;
          if (y > point.y + 2) blockers.push({ sourceEdgeId: surface.e?.id || null, kind: surface.kind, y, clearance: y - point.y,
            segment: surface.i, at: { x: point.x, y: point.y, z: point.z } });
        }
      }
      return { supportKnown, blockers };
    };
    const runwayCoverage = (q, progress, dir) => {
      const checks = [];
      for (const metres of [0, 25, 50, 75, 100]) {
        const point = ahead(q, progress, dir, metres);
        checks.push({ metres, point, ...coveredAt(point) });
      }
      return { supportKnown: checks.every(c => c.supportKnown), blockerCount: checks.reduce((n, c) => n + c.blockers.length, 0), checks };
    };
    const serializeEdge = (q, dir) => ({ id: q.e.id, name: q.e.name, cls: q.e.cls, width: q.e.w,
      onewayDenied: q.e.oneway, dir, length: q.len, from: q.from, to: q.to, expressway: q.e.expressway,
      sourceStart: q.e.pts[0], sourceEnd: q.e.pts[q.e.pts.length - 1] });
    const blocked = g.autopilot ? 'developer autopilot is enabled' : g.paused ? 'paused' : g.choosing ? 'area picker open' :
      g.relocating ? 'relocation in progress' : g.hud.modalOpen ? 'modal open' : g.hud.tipOpen ? 'tip open' :
      g.order?.state === 'offer' ? 'order offer open' : g.acceptingOrders !== false ? 'orders must be OFF' : null;
    const state = { x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, speedMps: p.speed, kmh: p.speed * 3.6,
      flying: p.flying, descending: p.descending, jumping: p.jumping, onRoad: p.onRoad, surface: p.lastKind,
      supportY: p.lastSupport, supportEdgeId: p.lastEdge?.e?.id || p.lastEdge?.id || null,
      area: g.area?.name, order: g.order?.state, blocked, tiles: g.city.tiles.size,
      stream: { ...g.city.streamStats }, resources: { ...g.engine.renderer.info.memory } };
    if (!selection) {
      let best = null; const blockedCandidates = [];
      for (const q of graph.edges) {
        if (!mainline(q) || q.len < 30) continue;
        for (const dir of allowedDirs(q)) {
          const projection = project(q, dir); if (!projection) continue;
          // Try farther along this same legal mainline when the closest approach
          // is covered by a stacked flyover; never treat that overpass as a bug.
          const options = [...new Set([projection.progress + 70, projection.progress + 200, q.len / 2]
            .map(s => Math.max(12, Math.min(q.len - 12, s))))];
          for (const progress of options) {
            const point = pose(q, progress, dir), runway = ahead(q, progress, dir, 100);
            if (!runway.complete) continue;
            const distance = Math.hypot(point.x - p.pos.x, point.z - p.pos.z);
            if (best && distance > best.score + 50) continue;
            const coverage = runwayCoverage(q, progress, dir);
            if (coverage.blockerCount) {
              blockedCandidates.push({ sourceEdgeId: q.e.id, dir, progress, point, distance, reason: 'overhead surface covers candidate100m landing runway', coverage });
              continue;
            }
            const score = distance + (1 - (-Math.sin(p.yaw) * point.hx - Math.cos(p.yaw) * point.hz)) * 20 + (coverage.supportKnown ? 0 : 40);
            if (!best || score < best.score) best = { edge: serializeEdge(q, dir), progress, point, runway, distance, score, coverage,
              coverageStatus: coverage.supportKnown ? 'loaded100m runway has no overhead road/deck' : 'unloaded support remains unverified; recheck before LAND' };
          }
        }
      }
      return { state, target: best, blockedCandidates: blockedCandidates.sort((a, b) => a.distance - b.distance).slice(0, 12) };
    }
    const q = graph.byId.get(selection.edgeId);
    if (!q || !mainline(q) || !allowedDirs(q).includes(selection.dir)) return { state, missingRoute: true };
    let active = q, dir = selection.dir, projection = project(q, dir), transitions = [];
    // Only move to a connected, legal, same-level through edge. Never snap across a ramp or carriageway.
    for (let n = 0; n < 5 && active.len - projection.progress < 120; n++) {
      const next = continuation(active, dir); if (!next) break;
      const other = project(next.edge, next.dir);
      if (!other || other.distance + .5 >= projection.distance || Math.abs(other.pose.y - (p.pos.y - .55)) > 3 && !p.flying && !p.descending) break;
      transitions.push({ from: active.e.id, to: next.edge.e.id, via: dir === 1 ? active.to : active.from });
      active = next.edge; dir = next.dir; projection = other;
    }
    const lookahead = Math.max(75, Math.min(100, Math.abs(p.speed) * 2.7));
    const aim = ahead(active, projection.progress, dir, lookahead);
    const forwardDot = -Math.sin(p.yaw) * projection.pose.hx - Math.cos(p.yaw) * projection.pose.hz;
    const levelError = Math.abs(p.pos.y - .55 - projection.pose.y);
    const supported = !p.flying && !p.descending && !p.jumping && p.onRoad &&
      projection.distance <= Math.max(2, active.e.w / 2 - 2) && levelError < 1 && forwardDot > .65;
    return { state, edge: serializeEdge(active, dir), progress: projection.progress,
      laneDistance: projection.distance, levelError, forwardDot, supported,
      lanePose: projection.pose, aim, transitions, landingCoverage: runwayCoverage(active, projection.progress, dir) };
  }, { selection });
  try {
    const initial = await inspect(); samples.push({ ms: 0, phase: 'initial', ...initial });
    if (initial.blocked || initial.state?.blocked) { outcome = 'blocked'; event('guard', { reason: initial.blocked || initial.state.blocked }); }
    else if (!initial.target) { outcome = 'target unavailable'; event('no mainline target with an uncovered legal100m runway', { blockedCandidates: initial.blockedCandidates }); }
    else {
      target = initial.target;
      route = { edgeId: target.edge.id, dir: target.edge.dir };
      if (target.distance > 1200) { outcome = 'target too distant'; event('distance guard', { distance: target.distance, limit: 1200 }); }
      else {
        const canvas = page.locator('#game canvas'), box = await canvas.boundingBox();
        if (!box) throw new Error('Visible game canvas unavailable');
        await canvas.click({ position: { x: box.width * .48, y: box.height * .54 }, timeout: 1500 });
        let state = await inspect(route);
        if (state.supported) { phase = 'drive'; event('already grounded on legal mainline', { edgeId: state.edge.id }); }
        else if (!state.state.flying && !state.state.descending && !state.state.jumping) {
          await page.keyboard.press('Space'); enteredFlight = true; event('FLY via Space');
        } else enteredFlight = state.state.flying;
        while (Date.now() < deadline) {
          const current = await inspect(route), now = Date.now(), dt = Math.min(1, (now - lastTick) / 1000); lastTick = now;
          if (current.state?.blocked || current.missingRoute || !current.state) { outcome = 'interrupted'; event('stopped', { current }); break; }
          const s = current.state;
          for (const transition of current.transitions || []) event('legal continuation observed', transition);
          route = { edgeId: current.edge.id, dir: current.edge.dir };
          if (phase !== 'drive' && current.supported) { phase = 'drive'; event('grounded mainline verified', { edgeId: current.edge.id, position: { x: s.x, y: s.y, z: s.z }, laneDistance: current.laneDistance, levelError: current.levelError }); }
          if (phase === 'drive' && current.supported) {
            maxRoadKmh = Math.max(maxRoadKmh, s.kmh); drivenEdges.add(current.edge.id);
            if (last?.supported && last.phase === 'drive') {
              const step = Math.hypot(s.x - last.x, s.z - last.z);
              if (step < Math.max(15, Math.abs(s.speedMps) * dt * 2)) { groundedMetres += step; groundedSeconds += dt; }
            }
          } else if (s.flying || s.descending) maxAirKmh = Math.max(maxAirKmh, s.kmh);
          if (now - lastSample >= 1000) { samples.push({ ms: now - started, phase, ...current }); lastSample = now; }
          if (phase === 'drive' && !current.supported) { outcome = 'left supported mainline'; event('mainline support lost', { current }); break; }
          let aim;
          if (phase === 'approach') {
            const distance = Math.hypot(target.point.x - s.x, target.point.z - s.z);
            // Aim no more than 100m away. Close to the lane, align along its legal tangent.
            if (distance > 100) { const f = 100 / distance; aim = { x: s.x + (target.point.x - s.x) * f, z: s.z + (target.point.z - s.z) * f }; }
            else aim = current.aim;
            if (s.flying && distance < 140 && (!current.landingCoverage.supportKnown || current.landingCoverage.blockerCount)) {
              const signature = `${current.edge.id}:${current.landingCoverage.supportKnown}:${current.landingCoverage.checks.flatMap(c => c.blockers.map(b => b.sourceEdgeId || b.kind)).sort().join(',')}`;
              if (signature !== lastCoverageBlocker) event('LAND withheld: test approach coverage unverified or obstructed', {
                classification: 'experiment approach limitation; not a product geometry defect', edgeId: current.edge.id,
                distance, coverage: current.landingCoverage });
              lastCoverageBlocker = signature;
            }
            if (s.flying && current.landingCoverage.supportKnown && !current.landingCoverage.blockerCount &&
              current.laneDistance < Math.max(2, current.edge.width / 2 - 3) && current.forwardDot > .95 && distance < 140 && !landPressed) {
              await page.keyboard.press('Space'); landPressed = true; phase = 'landing'; event('LAND via Space', { distance, edgeId: current.edge.id, laneDistance: current.laneDistance });
            }
          } else aim = current.aim;
          const desired = Math.atan2(-(aim.x - s.x), -(aim.z - s.z));
          const error = Math.atan2(Math.sin(desired - s.yaw), Math.cos(desired - s.yaw));
          await key('a', error > .055); await key('d', error < -.055);
          const speed = phase === 'landing' ? 8 : phase === 'approach' ? Math.abs(error) > .7 ? 6 : Math.abs(error) > .3 ? 14 : 30 :
            !current.aim.complete ? 8 : Math.abs(error) > .45 ? 9 : Math.abs(error) > .22 ? 17 : 120 / 3.6;
          await key('w', s.speedMps < speed - .6); await key('s', s.speedMps > speed + .8 && s.speedMps > 1);
          last = { x: s.x, z: s.z, supported: current.supported, phase };
          await page.waitForTimeout(Math.min(160, Math.max(0, deadline - Date.now())));
        }
        if (outcome === 'attempt' && groundedMetres >= 100 && groundedSeconds >= 4) outcome = 'completed grounded mainline drive';
      }
    }
  } catch (error) { outcome = 'experiment error'; event('exception', { message: String(error), stack: error?.stack }); }
  finally {
    await release();
    // Leave the car safely paused without hiding a failed landing or changing location.
    const active = await page.evaluate(() => { const g = window.__game; return !!g && !g.paused && !g.choosing && !g.relocating && !g.hud.modalOpen && !g.hud.tipOpen; }).catch(() => false);
    if (active) { await page.keyboard.press('p'); event('paused via P after releasing controls'); }
  }
  const final = route ? await inspect(route).catch(error => ({ error: String(error) })) : null;
  return { started: new Date(started).toISOString(), ended: new Date().toISOString(), seconds: (Date.now() - started) / 1000,
    method: 'Read-only graph navigation plus actual Playwright keyboard W/A/D/S and Space; no developer autopilot, hidden state changes, teleport, or simulation stepping. CPU setting is preserved.',
    outcome, enteredFlight, landPressed, target, groundedMetres, groundedSeconds, maxRoadKmh, maxAirKmh,
    drivenSourceEdgeIds: [...drivenEdges], completed: outcome === 'completed grounded mainline drive',
    completionCriterion: 'At least 100m and 4s of observed legal-direction, level-matched, grounded ORR through-carriageway travel; fly-only approach is an attempt.',
    events, samples, final, releasedKeys: held.size === 0 };
}
