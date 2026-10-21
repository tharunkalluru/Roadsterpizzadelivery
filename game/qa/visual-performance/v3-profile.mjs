import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const phase = process.argv[2] ?? 'v3-before';
const port = process.argv[3] ?? '5486';
// Optional source directory binds a separately served frozen baseline.
const sourceRoot = process.argv[4] ? pathToFileURL(`${resolve(process.argv[4])}/`) : new URL('../../', import.meta.url);
const out = new URL(`../../output/visual-performance/${phase}/`, import.meta.url);
const configUrl = new URL('../../config/provisional-preview.json', import.meta.url);
const profiles = [
  { name: 'phone-low', width: 844, height: 390, quality: 'low', touch: true, dpr: 2 },
  { name: 'desktop-standard', width: 1280, height: 720, quality: 'standard', touch: false, dpr: 1 },
];

await mkdir(out, { recursive: true });
const config = JSON.parse(await readFile(configUrl));
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const results = [];

try {
  for (const profile of profiles) {
    const context = await browser.newContext({
      viewport: { width: profile.width, height: profile.height },
      hasTouch: profile.touch,
      isMobile: profile.touch,
      deviceScaleFactor: profile.dpr,
    });
    let cdp;

    try {
      await context.addInitScript(({ id, quality }) => {
        localStorage.setItem(`hmd.provisional.${id}.settings`, JSON.stringify({
          schema: 1,
          data: { quality, practiceDone: true, musicVolume: 0, sfxVolume: 0, uiVolume: 0 },
        }));
      }, { id: config.zone.id, quality: profile.quality });

      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => {
        if (message.type() === 'error') errors.push(message.text());
      });

      const start = performance.now();
      await page.goto(`http://127.0.0.1:${port}/preview.html?debug&manualclock`, {
        waitUntil: 'domcontentloaded',
      });
      await page.locator('[data-preview-start]').click();
      await page.waitForFunction(() => window.__hmd?.state === 'MENU', null, { timeout: 120000 });
      await page.locator('[data-play]').click();
      await page.locator('[data-m]').first().click();
      await page.locator('[data-go]').click();
      await page.waitForFunction(() => window.__hmd?.state === 'READY', null, { timeout: 120000 });
      await page.locator('[data-start]').click();
      await page.waitForFunction(() => window.__hmd?.state === 'PLAYING');
      const readyMs = performance.now() - start;

      await page.evaluate(() => {
        window.__hmd.debug = false;
        document.querySelector('[data-debug]').classList.add('hidden');
      });
      await page.waitForTimeout(2000);
      cdp = await context.newCDPSession(page);
      await cdp.send('Performance.enable');

      const scene = await page.evaluate(() => {
        const app = window.__hmd;
        const rows = [];
        const restore = [];
        const buffers = new Set();
        const names = new Map();
        let nodes = 0;
        let meshCount = 0;
        let geometryBytes = 0;

        try {
          app.view.scene.traverse(object => {
            nodes++;
            if (!object.isMesh) return;
            meshCount++;

            for (const attribute of Object.values(object.geometry.attributes)) {
              if (!buffers.has(attribute.array.buffer)) {
                buffers.add(attribute.array.buffer);
                geometryBytes += attribute.array.buffer.byteLength;
              }
            }
            const index = object.geometry.index;
            if (index && !buffers.has(index.array.buffer)) {
              buffers.add(index.array.buffer);
              geometryBytes += index.array.buffer.byteLength;
            }

            const own = Object.getOwnPropertyDescriptor(object, 'onBeforeRender');
            const original = object.onBeforeRender;
            restore.push(() => {
              if (own) Object.defineProperty(object, 'onBeforeRender', own);
              else delete object.onBeforeRender;
            });
            object.onBeforeRender = function (...args) {
              const material = args[4];
              rows.push({
                name: object.name,
                parent: object.parent?.name,
                type: object.type,
                material: material.name || material.type,
                triangles: (object.geometry.index?.count ?? object.geometry.attributes.position.count)
                  / 3 * (object.isInstancedMesh ? object.count : 1),
              });
              return original.apply(this, args);
            };
          });
          app.renderer.render(app.view.scene, app.view.camera);
        } finally {
          for (const restoreCallback of restore) restoreCallback();
        }

        for (const row of rows) {
          const key = `${row.name || row.parent || '(unnamed)'}|${row.material}`;
          let aggregate = names.get(key);
          if (!aggregate) {
            aggregate = { name: key, draws: 0, triangles: 0 };
            names.set(key, aggregate);
          }
          aggregate.draws++;
          aggregate.triangles += row.triangles;
        }

        const gl = app.renderer.getContext();
        const extension = gl.getExtension('WEBGL_debug_renderer_info');
        const resources = performance.getEntriesByType('resource');
        return {
          trainStats: app.view.metroVisual?.getObjectByName('metro-moving-service')?.userData.trainStats ?? null,
          signalStats: app.view.signalPresentation?.stats ?? null,
          nodes,
          meshCount,
          geometryBytes,
          renderInfo: { ...app.renderer.info.render },
          resources: { ...app.renderer.info.memory, programs: app.renderer.info.programs.length },
          rendered: [...names.values()].sort((a, b) => b.triangles - a.triangles),
          renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
          resolution: {
            dpr: app.renderer.getPixelRatio(),
            width: app.renderer.domElement.width,
            height: app.renderer.domElement.height,
          },
          position: { x: app.session.player.x, z: app.session.player.z },
          // Resource Timing entries observed after warm-up, not a packet capture.
          loadedResources: {
            count: resources.length,
            transferBytes: resources.reduce((total, resource) => total + resource.transferSize, 0),
            decodedBytes: resources.reduce((total, resource) => total + resource.decodedBodySize, 0),
          },
        };
      });

      // Explicit collection stays outside the timing windows. This is retained
      // JavaScript heap, not GPU memory or total process/device RAM.
      await cdp.send('HeapProfiler.collectGarbage');
      const heap = await cdp.send('Runtime.getHeapUsage');
      const samples = [];

      try {
        for (const rate of [1, 4]) {
          await cdp.send('Emulation.setCPUThrottlingRate', { rate });
          await page.waitForTimeout(1000);
          const before = (await cdp.send('Performance.getMetrics')).metrics;
          const work = await page.evaluate(async () => {
            const app = window.__hmd;
            const stats = { frame: [], update: [], render: [], hud: [], interval: [] };
            const restore = [];

            try {
              for (const [object, key, name] of [
                [app, 'frame', 'frame'],
                [app.view, 'update', 'update'],
                [app.view, 'render', 'render'],
                [app.hud, 'update', 'hud'],
              ]) {
                const own = Object.getOwnPropertyDescriptor(object, key);
                const original = object[key];
                restore.push(() => {
                  if (own) Object.defineProperty(object, key, own);
                  else delete object[key];
                });
                object[key] = function (...args) {
                  const started = performance.now();
                  try {
                    return original.apply(this, args);
                  } finally {
                    stats[name].push(performance.now() - started);
                  }
                };
              }

              let last;
              const started = performance.now();
              await new Promise(resolve => {
                function sample(time) {
                  if (last !== undefined) stats.interval.push(time - last);
                  last = time;
                  if (time - started >= 10000) resolve();
                  else requestAnimationFrame(sample);
                }
                requestAnimationFrame(sample);
              });
            } finally {
              for (const restoreMethod of restore) restoreMethod();
            }

            return Object.fromEntries(Object.entries(stats).map(([key, values]) => {
              values.sort((a, b) => a - b);
              const quantile = percentile => values[Math.floor((values.length - 1) * percentile)];
              const total = values.reduce((sum, value) => sum + value, 0);
              return [key, {
                samples: values.length,
                p50: quantile(.5),
                p95: quantile(.95),
                p99: quantile(.99),
                total,
                mean: total / values.length,
              }];
            }));
          });

          const after = (await cdp.send('Performance.getMetrics')).metrics;
          const metricNames = ['Timestamp', 'TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration'];
          const delta = Object.fromEntries(metricNames.map(name => [
            name,
            after.find(metric => metric.name === name)?.value
              - before.find(metric => metric.name === name)?.value,
          ]));
          samples.push({
            desktopCPUThrottle: rate,
            workMs: work,
            processMetricsDeltaSeconds: delta,
          });
        }
      } finally {
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      }

      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
      await cdp.send('Profiler.start');
      await page.waitForTimeout(6000);
      const { profile: cpu } = await cdp.send('Profiler.stop');
      await writeFile(new URL(`${profile.name}.cpuprofile`, out), JSON.stringify(cpu));

      const nodeMap = new Map(cpu.nodes.map(node => [node.id, node]));
      const totals = new Map();
      for (let i = 0; i < cpu.samples.length; i++) {
        const frame = nodeMap.get(cpu.samples[i]).callFrame;
        const source = frame.url.split('/').slice(-2).join('/').split('?')[0];
        const key = `${frame.functionName || '(anonymous)'} ${source}:${frame.lineNumber + 1}`;
        totals.set(key, (totals.get(key) ?? 0) + cpu.timeDeltas[i]);
      }

      const screenshotFile = `${profile.name}.png`;
      const screenshot = await page.screenshot({ path: new URL(screenshotFile, out).pathname });
      const result = {
        profile,
        readyMs,
        scene,
        retainedHeapAfterGC: heap,
        samples,
        cpuTopSelfMilliseconds: [...totals]
          .map(([name, microseconds]) => ({ name, ms: microseconds / 1000 }))
          .sort((a, b) => b.ms - a.ms)
          .slice(0, 40),
        screenshot: {
          file: screenshotFile,
          sha256: createHash('sha256').update(screenshot).digest('hex'),
        },
        errors,
      };
      results.push(result);
      console.log(JSON.stringify(result));
    } finally {
      try {
        if (cdp) await cdp.detach();
      } finally {
        await context.close();
      }
    }
  }

  // These hashes bind the working files at the end of the run. sourceHead is the
  // checkout commit; it does not imply that these working files are committed.
  const sourceHashes = {};
  for (const path of ['src/app/view.ts', 'src/art/metroTrains.ts', 'src/art/trafficSignals.ts']) {
    try {
      const contents = await readFile(new URL(path, sourceRoot));
      sourceHashes[path] = createHash('sha256').update(contents).digest('hex');
    } catch {
      // A baseline can predate one of the new presentation modules.
    }
  }

  const method = [
    'Serial stationary normal-spawn diagnostic on desktop Chrome; manual simulation clock.',
    'Method timing includes instrumentation overhead; frame and child method timings are nested/inclusive, not additive.',
    'Each 1x/4x window lasts 10 seconds after a 1-second settle; 4x throttle is desktop CPU pressure, not phone certification.',
    'CPU self sampling lasts 6 seconds at 1x and includes idle and browser overhead.',
    'Rendered mesh rows estimate full-geometry submissions; renderInfo is authoritative for actual renderer counts.',
    'Geometry bytes count distinct CPU attribute/index backing buffers reachable from scene meshes, excluding detached rigs and GPU allocations.',
    'Resource totals cover browser Resource Timing entries available after warm-up and may reflect cache or timing-buffer limits.',
    'No GPU/total RAM measurement. sourceHead names the checkout commit; sourceHashes capture the specified served-source directory at run end.',
  ].join(' ');

  await writeFile(new URL('metrics.json', out), `${JSON.stringify({
    sourceHashes,
    phase,
    at: new Date().toISOString(),
    sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    method,
    results,
  }, null, 2)}\n`);
  if (results.some(result => result.errors.length)) process.exitCode = 1;
} finally {
  await browser.close();
}
