import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

// Run only after visual review and other benchmarks finish. Method wrappers add
// overhead, so this diagnostic reports transform calls rather than frame timings.
const phase = process.argv[2] ?? 'v2-workload';
const port = process.argv[3] ?? '5486';
const out = new URL(`../../output/visual-performance/${phase}/`, import.meta.url);
const config = JSON.parse(await readFile(new URL('../../config/provisional-preview.json', import.meta.url)));
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const results = [];
try {
  for (const profile of [
    { name: 'phone-low', width: 844, height: 390, quality: 'low', touch: true, dpr: 2 },
    { name: 'desktop-standard', width: 1280, height: 720, quality: 'standard', touch: false, dpr: 1 },
  ]) {
    const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height }, hasTouch: profile.touch, isMobile: profile.touch, deviceScaleFactor: profile.dpr });
    try {
      await context.addInitScript(({ id, quality }) => localStorage.setItem(`hmd.provisional.${id}.settings`, JSON.stringify({ schema: 1, data: { quality, practiceDone: true, musicVolume: 0, sfxVolume: 0, uiVolume: 0 } })), { id: config.zone.id, quality: profile.quality });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      await page.goto(`http://127.0.0.1:${port}/preview.html?debug&manualclock`, { waitUntil: 'domcontentloaded' });
      await page.locator('[data-preview-start]').click();
      await page.waitForFunction(() => window.__hmd?.state === 'MENU', null, { timeout: 120000 });
      await page.locator('[data-play]').click();
      await page.locator('[data-m]').first().click();
      await page.locator('[data-go]').click();
      await page.waitForFunction(() => window.__hmd?.state === 'READY', null, { timeout: 120000 });
      await page.locator('[data-start]').click();
      await page.waitForFunction(() => window.__hmd?.state === 'PLAYING', null, { timeout: 30000 });
      await page.evaluate(() => {
        window.__hmd.debug = false;
        document.querySelector('[data-debug]')?.classList.add('hidden');
      });
      await page.waitForTimeout(2000);

      const diagnostic = await page.evaluate(async () => {
        const app = window.__hmd, scene = app.view.scene;
        const nodes = [];
        scene.traverse(object => nodes.push(object));
        const nodeSet = new Set(nodes);
        const frozen = nodes.filter(object => !object.matrixAutoUpdate && !object.matrixWorldAutoUpdate);
        const frozenSet = new Set(frozen);
        const flags = nodes.map(object => ({ object, local: object.matrixAutoUpdate, world: object.matrixWorldAutoUpdate }));
        const restorers = [];
        const methodChecks = [];
        const totals = { updateMatrix: 0, multiplyWorld: 0, frozenUpdateMatrix: 0, frozenMultiplyWorld: 0 };
        const keys = Object.keys(totals);
        const describe = object => ({ name: object.name || '(unnamed)', type: object.type, id: object.id });
        const topologyMatches = () => {
          let count = 0, matches = true;
          scene.traverse(object => { count++; if (!nodeSet.has(object)) matches = false; });
          return matches && count === nodes.length;
        };
        const restoreFlags = () => {
          for (const { object, local, world } of flags) {
            object.matrixAutoUpdate = local;
            object.matrixWorldAutoUpdate = world;
          }
        };
        const thawStatic = () => {
          for (const object of frozen) {
            object.matrixAutoUpdate = true;
            object.matrixWorldAutoUpdate = true;
          }
        };
        const wrap = (receiver, key, counter, staticCounter, isFrozen) => {
          const descriptor = Object.getOwnPropertyDescriptor(receiver, key);
          const original = receiver[key];
          receiver[key] = function (...args) {
            totals[counter]++;
            if (isFrozen) totals[staticCounter]++;
            return original.apply(this, args);
          };
          restorers.push(() => {
            if (descriptor) Object.defineProperty(receiver, key, descriptor);
            else delete receiver[key];
          });
          methodChecks.push(() => receiver[key] === original && !!Object.getOwnPropertyDescriptor(receiver, key) === !!descriptor);
        };
        const sampleFrames = async () => {
          const samples = [];
          let previous = null;
          await new Promise(resolve => {
            const sample = () => {
              const current = { ...totals };
              if (previous) samples.push(Object.fromEntries(keys.map(key => [key, current[key] - previous[key]])));
              previous = current;
              if (samples.length === 60) resolve();
              else requestAnimationFrame(sample);
            };
            requestAnimationFrame(sample);
          });
          const perFrame = Object.fromEntries(keys.map(key => {
            const values = samples.map(sample => sample[key]);
            const total = values.reduce((sum, value) => sum + value, 0);
            return [key, { min: Math.min(...values), max: Math.max(...values), total, mean: total / samples.length }];
          }));
          return { frames: samples.length, perFrame, topologyStable: topologyMatches() };
        };

        let current, automatic, matrixComparison, restored = false;
        try {
          for (const object of nodes) {
            wrap(object, 'updateMatrix', 'updateMatrix', 'frozenUpdateMatrix', frozenSet.has(object));
            wrap(object.matrixWorld, 'multiplyMatrices', 'multiplyWorld', 'frozenMultiplyWorld', frozenSet.has(object));
          }
          current = await sampleFrames();
          thawStatic();
          automatic = await sampleFrames();
          restoreFlags();

          // Both renders happen synchronously in this single task: neither the
          // simulation nor animation can advance between these matrix snapshots.
          app.renderer.render(scene, app.view.camera);
          const reference = nodes.map(object => object.matrixWorld.elements.slice());
          thawStatic();
          app.renderer.render(scene, app.view.camera);
          const mismatches = [];
          let differentElements = 0;
          for (let i = 0; i < nodes.length; i++) {
            const elements = nodes[i].matrixWorld.elements;
            const indices = elements.flatMap((value, j) => value === reference[i][j] ? [] : [j]);
            differentElements += indices.length;
            if (indices.length) mismatches.push({ ...describe(nodes[i]), indices });
          }
          matrixComparison = {
            method: 'Two synchronous renders of the same paused simulation state; exact numeric equality of every scene world-matrix element',
            nodesCompared: nodes.length, differentNodes: mismatches.length, differentElements,
            examples: mismatches.slice(0, 10), topologyStable: topologyMatches(),
          };
        } finally {
          restoreFlags();
          for (const restore of restorers.reverse()) restore();
          restored = flags.every(({ object, local, world }) => object.matrixAutoUpdate === local && object.matrixWorldAutoUpdate === world) && methodChecks.every(check => check());
        }
        app.renderer.render(scene, app.view.camera);
        return {
          method: 'Paired 60-frame real-scene transform-call diagnostic at normal spawn with manual simulation clock; instrumented, not an FPS benchmark',
          nodes: { total: nodes.length, frozen: frozen.length, meshes: nodes.filter(object => object.isMesh).length, invisible: nodes.filter(object => !object.visible).length },
          current, automatic, matrixComparison, restored,
          valid: frozen.length > 0 && current.topologyStable && automatic.topologyStable && matrixComparison.topologyStable && matrixComparison.differentElements === 0 && restored,
          quality: app.quality, state: app.state, tick: app.session.tick,
          position: { x: app.session.player.x, z: app.session.player.z },
          resolution: { dpr: app.renderer.getPixelRatio(), width: app.renderer.domElement.width, height: app.renderer.domElement.height },
        };
      });
      const result = { profile, ...diagnostic, pageErrors: errors };
      results.push(result);
      console.log(JSON.stringify(result));
    } finally { await context.close(); }
  }
  await writeFile(new URL('metrics.json', out), JSON.stringify({ phase, at: new Date().toISOString(), results }, null, 2) + '\n');
  if (results.some(result => !result.valid || result.pageErrors.length)) process.exitCode = 1;
} finally { await browser.close(); }
