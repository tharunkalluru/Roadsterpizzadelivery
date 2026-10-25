// Real-user play-through: plays the game in real time through its own controls only (keyboard on desktop, multi-touch on
// the on-screen arrows / GO / BRAKE / ACT on a phone), following the GPS line like a person would. The page is only read
// to know where the car is relative to the route (what a player sees on screen) — nothing is teleported or stepped.
// Logs what a player would hit: load times, frame rate, stuck moments, crashes, collisions, UI states; screenshots throughout.
// node tools/userplay.mjs <outdir> [desktop|phone] [baseUrl]
import { chromium, devices } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const out = process.argv[2] || '.', mode = process.argv[3] || 'desktop', base = process.argv[4] || 'http://127.0.0.1:4173/';
fs.mkdirSync(out, { recursive: true });
const phone = mode === 'phone';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext(phone ? { ...devices['iPhone 13 landscape'], deviceScaleFactor: 1 } : { viewport: { width: 1024, height: 576 } });
const page = await ctx.newPage();
const log = [], errs = [];
const note = (s) => { const l = `[${((Date.now() - T0) / 1000).toFixed(0)}s] ${s}`; console.log(l); log.push(l); };
page.on('pageerror', (e) => { errs.push(e.message); note('PAGE ERROR ' + e.message); });
page.on('console', (m) => { if (m.type() === 'error') { errs.push(m.text()); note('CONSOLE ERROR ' + m.text().slice(0, 200)); } });
let shotN = 0;
const shot = async (name) => { const f = `${out}/${String(++shotN).padStart(2, '0')}_${name}.png`; try { await page.screenshot({ path: f, timeout: 120000 }); } catch (e) { note('screenshot failed ' + name); } return f; };
const T0 = Date.now();
await page.goto(base + '?' + (process.argv[5] || 'q=low'), { timeout: 120000 });
// fps meter (what the player feels)
await page.evaluate(() => { window.__fps = []; let n = 0, t = performance.now(); const f = () => { n++; const now = performance.now(); if (now - t > 1000) { window.__fps.push(Math.round(n * 1000 / (now - t))); n = 0; t = now; } requestAnimationFrame(f); }; requestAnimationFrame(f); });
const cdp = phone ? await ctx.newCDPSession(page) : null;

// ---------- 1. area picker ----------
await page.waitForSelector('.apick:not([hidden])', { timeout: 300000 });
note('area picker shown');
await shot('picker');
const area = phone ? 'Nagaram' : 'Uppal';
if (phone) {
  const b = page.locator('.apick .chips button', { hasText: area });
  await b.tap();
} else {
  await page.click('#ap-q'); await page.keyboard.type(area, { delay: 60 });
  await page.waitForTimeout(400); await shot('search'); await page.keyboard.press('Enter');
}
const tL = Date.now();
await page.waitForFunction(() => window.__game || window.__err, null, { timeout: 300000 });
note(`${area} loaded in ${((Date.now() - tL) / 1000).toFixed(1)} s`);
await page.waitForTimeout(1500); await shot('arrived');

// ---------- helpers ----------
const st = () => page.evaluate(() => {
  const g = window.__game, P = g.player.pos, f = g.player.forward, o = g.order;
  return { x: P.x, y: P.y, z: P.z, fx: f.x, fz: f.z, v: g.player.speed, fly: g.player.flying, order: o ? o.state : null, coins: g.coins,
    tgt: g.routeTarget ? { x: g.routeTarget.x, z: g.routeTarget.z, label: g.routeTarget.label } : null, route: g.route ? g.route.pts.map((p) => [p[0], p[2]]) : null,
    gt: g.t, prompt: document.getElementById('prompt').hidden ? '' : document.getElementById('prompt-t').textContent, offer: !document.getElementById('offer').hidden,
    toast: document.getElementById('toast').className.includes('show') ? document.getElementById('toast').textContent : '', area: g.areaName(P.x, P.z), charge: g.player.charge ?? null };
});
// controls
const held = new Set();
const key = async (k, on) => { if (on && !held.has(k)) { held.add(k); await page.keyboard.down(k); } else if (!on && held.has(k)) { held.delete(k); await page.keyboard.up(k); } };
let rects = null, touch = { steer: 0, gas: false, brake: false };
const tp = (id, x, y) => ({ id, x, y, radiusX: 8, radiusY: 8, force: 1 });
let touchActive = new Map();
const sendTouches = async (type) => { await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...touchActive.values()] }); };
const setTouch = async (want) => {
  if (!rects) rects = await page.evaluate(() => Object.fromEntries(['t-left', 't-right', 't-gas', 't-brake', 't-act', 't-fly'].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return [id, { x: r.x + r.width / 2, y: r.y + r.height / 2 }]; })));
  // Independent arrow holds use the same visible controls as the mobile HUD.
  for (const [id, fid, on] of [['t-left', 1, want.steer < -0.3], ['t-right', 4, want.steer > 0.3], ['t-gas', 2, want.gas], ['t-brake', 3, want.brake]]) {
    if (on && !touchActive.has(fid)) { touchActive.set(fid, tp(fid, rects[id].x, rects[id].y)); await sendTouches('touchStart'); }
    if (!on && touchActive.has(fid)) { const pt = touchActive.get(fid); touchActive.delete(fid); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [...touchActive.values()] }); void pt; }
  }
};
const drive = async (thr, brk, steer) => {
  if (phone) await setTouch({ steer, gas: thr, brake: brk });
  else { await key('KeyW', thr); await key('KeyS', brk); await key('KeyA', steer < -0.3); await key('KeyD', steer > 0.3); }
};
const release = async () => { if (phone) { touchActive.clear(); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); } else for (const k of [...held]) await key(k, false); };
const act = async () => { if (phone) { await page.locator('#t-act').tap(); } else { await page.keyboard.down('KeyE'); await page.waitForTimeout(1300); await page.keyboard.up('KeyE'); } };

// one leg: follow the GPS line to the target and stop on it
async function leg(name, maxS = 300) {        // maxS in game seconds (the software renderer here runs slower than real time)
  const t0 = Date.now(); const g0 = (await st()).gt; let lastP = null, lastMoveT = g0, stuck = 0, hits = 0, lastToast = '', reversing = 0, minD = 1e9;
  while (true) {
    const s = await st();
    if (s.gt - g0 > maxS) break;
    if (s.toast && s.toast !== lastToast) { lastToast = s.toast; note(`toast: ${s.toast}`); if (/Watch the|Baigan/.test(s.toast)) hits++; }
    if (!s.tgt) { note(`${name}: target cleared (${s.order})`); break; }
    const dT = Math.hypot(s.tgt.x - s.x, s.tgt.z - s.z); minD = Math.min(minD, dT);
    if (dT < 7) {
      await drive(false, Math.abs(s.v) > 0.8, 0);
      if (Math.abs(s.v) < 2) { await release(); note(`${name}: at target after ${(s.gt - g0).toFixed(0)} game-s (${((Date.now() - t0) / 1000).toFixed(0)} real s), prompt "${s.prompt}"`); return { ok: true, secs: s.gt - g0, stuck, hits }; }
      await page.waitForTimeout(150); continue;
    }
    // lookahead point on the GPS line
    let aim = [s.tgt.x, s.tgt.z];
    if (s.route && s.route.length > 1 && dT > 25) {
      let bi = 0, bd = 1e9; s.route.forEach((p, i) => { const d = Math.hypot(p[0] - s.x, p[1] - s.z); if (d < bd) { bd = d; bi = i; } });
      let acc = 0, k = bi; const look = 9 + Math.abs(s.v) * 0.9;
      while (k < s.route.length - 1 && acc < look) { acc += Math.hypot(s.route[k + 1][0] - s.route[k][0], s.route[k + 1][1] - s.route[k][1]); k++; }
      aim = s.route[k];
    }
    const vx = aim[0] - s.x, vz = aim[1] - s.z, L = Math.hypot(vx, vz) || 1;
    const cross = (s.fx * vz - s.fz * vx) / L, dot = (s.fx * vx + s.fz * vz) / L;
    let steer = Math.max(-1, Math.min(1, cross * 2.2)); if (dot < 0) steer = cross >= 0 ? 1 : -1;
    const want = dot < 0.5 ? 5 : dT < 30 ? 5 : 11;
    // stuck: barely moved for 4 s while trying -> back up with opposite lock, like a player would
    if (lastP && Math.hypot(s.x - lastP[0], s.z - lastP[1]) > 2.5) { lastP = [s.x, s.z]; lastMoveT = s.gt; }
    if (!lastP) lastP = [s.x, s.z];
    if (reversing > 0) { reversing--; await drive(false, true, -steer); await page.waitForTimeout(120); continue; }
    if (s.gt - lastMoveT > 4) {
      stuck++; lastMoveT = s.gt; note(`${name}: STUCK #${stuck} at ${s.x.toFixed(0)},${s.z.toFixed(0)} (${s.area}) speed ${s.v.toFixed(1)}`);
      await shot(`stuck_${name}_${stuck}`);
      if (stuck >= 3 && !s.fly) { note(`${name}: trying FLY to get out`); if (phone) await page.locator('#t-fly').tap(); else await page.keyboard.press('Space'); }
      reversing = 12; continue;
    }
    await drive(s.v < want, s.v > want + 3, steer);
    await page.waitForTimeout(110);
  }
  await release();
  note(`${name}: GAVE UP after ${maxS} game-s (closest ${minD.toFixed(0)} m)`); await shot(`gaveup_${name}`);
  return { ok: false, secs: maxS, stuck, hits };
}

// ---------- 2. take an order ----------
await page.waitForFunction(() => !document.getElementById('offer').hidden, null, { timeout: 60000 }).catch(() => note('NO ORDER OFFER within 60 s'));
await shot('offer');
const offerText = await page.evaluate(() => document.getElementById('offer').innerText.replace(/\n+/g, ' | '));
note('offer: ' + offerText.slice(0, 220));
if (phone) await page.locator('#offer .btn.go').tap(); else await page.keyboard.press('KeyE');
await page.waitForTimeout(1200);
const s0 = await st(); note(`accepted: heading to ${s0.tgt?.label} (${s0.order})`);
await shot('accepted');
// ---------- 3. pickup ----------
const r1 = await leg('pickup');
await shot('at_pickup');
await act(); await page.waitForTimeout(1500);
let s1 = await st(); note(`after collect: order=${s1.order} target=${s1.tgt?.label}`);
if (s1.order === 'toPickup') { await act(); await page.waitForTimeout(1500); s1 = await st(); note(`second try: order=${s1.order}`); }
// ---------- 4. drop ----------
let r2 = null;
if (s1.order === 'toDrop') {
  await page.waitForTimeout(600); await shot('to_drop');
  r2 = await leg('drop');
  await act(); await page.waitForTimeout(2200);
  const s2 = await st(); note(`after hand-over: order=${s2.order} coins=${s2.coins}`); await shot('delivered');
}
// ---------- 5. move via the map ----------
if (phone) await page.locator('#minimap').tap(); else await page.keyboard.press('KeyM');
await page.waitForTimeout(1500); await shot('map');
const moveVisible = await page.locator('#map-move').isVisible();
note(`map open; "Deliver from here" visible: ${moveVisible}`);
if (moveVisible) {
  if (phone) await page.locator('#map-move').tap(); else await page.click('#map-move');
  await page.waitForTimeout(500);
  // drag the map ~ a few km
  const box = await page.locator('.fmap canvas').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx - 260, cy + 140, { steps: 12 }); await page.mouse.up();
  await page.waitForTimeout(700);
  const where = await page.locator('#map-where').innerText(); note(`pin over: ${where}`); await shot('map_pick');
  if (phone) await page.locator('#map-pick-ok').tap(); else await page.click('#map-pick-ok');
  const tM = Date.now();
  await page.waitForFunction(() => window.__game && !window.__game.relocating && !window.__game.choosing, null, { timeout: 300000 });
  const sm = await st(); note(`moved to ${sm.area} in ${((Date.now() - tM) / 1000).toFixed(1)} s`); await page.waitForTimeout(1500); await shot('moved');
}
// ---------- 6. change area from the pause menu ----------
if (phone) await page.locator('#b-help').tap(); else await page.keyboard.press('KeyP');
await page.waitForTimeout(600); await shot('pause');
if (await page.locator('#area').isVisible()) {
  if (phone) await page.locator('#area').tap(); else await page.click('#area');
  await page.waitForTimeout(600); await shot('change_area');
  const chip = page.locator('.apick .chips button', { hasText: 'Charminar' });
  if (phone) await chip.tap(); else await chip.click();
  await page.waitForFunction(() => window.__game && !window.__game.relocating && !window.__game.choosing, null, { timeout: 300000 });
  await page.waitForTimeout(2500); const sc = await st(); note(`changed area: now in ${sc.area}`); await shot('charminar');
}
const fps = await page.evaluate(() => window.__fps);
note(`fps samples: median ${fps.slice().sort((a, b) => a - b)[fps.length >> 1]} min ${Math.min(...fps)} max ${Math.max(...fps)} (software renderer)`);
const summary = { mode, area, pickup: r1, drop: r2, errors: errs.slice(0, 10) };
note('SUMMARY ' + JSON.stringify(summary));
fs.writeFileSync(`${out}/userplay.log`, log.join('\n') + '\n');
await browser.close();
