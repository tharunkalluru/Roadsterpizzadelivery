import { test, expect } from '@playwright/test';

const OUT = 'qa/artifacts/e2e';

test('V2: whole-network package — levels menu, Level 1 delivery by the reference agent, streamed roads, real-name storefronts', async ({ page }) => {
  await page.goto('?debug&manualclock');
  await page.waitForFunction(() => (window as any).__hmd?.state === 'MENU', null, { timeout: 240_000 });
  const info = await page.evaluate(() => { const a = (window as any).__hmd; return { net: a.isNetwork(), levels: [...new Set(a.missions.filter((m: any) => !m.practice).map((m: any) => m.level))] }; });
  expect(info.net).toBe(true);
  expect(info.levels).toEqual([1, 2, 3, 4, 5]);
  await page.click('[data-play]');
  await expect(page.locator('h3.lvl').first()).toContainText('Level 1');
  // fresh progress: Level 2+ are locked and not selectable
  await expect(page.locator('h3.lvl').nth(1)).toContainText('Level 2');
  await expect(page.locator('h3.lvl').nth(1)).toContainText('Locked');
  await page.screenshot({ path: `${OUT}/v2-01-levels.png` });
  const id = await page.evaluate(() => (window as any).__hmd.missions.find((m: any) => m.level === 1 && !m.practice).id);
  await page.click(`[data-m="${id}"]`);
  await page.click('[data-go]');
  await page.waitForFunction(() => (window as any).__hmd.state === 'READY', null, { timeout: 240_000 });
  await page.evaluate(() => (window as any).__hmd.debugSkipCountdown());
  await page.evaluate(() => (window as any).__hmd.enableAutopilot());
  for (let i = 0; i < 60; i++) {
    const st = await page.evaluate(() => (window as any).__hmd.state);
    if (st === 'RESULTS') break;
    await page.evaluate(() => (window as any).__hmd.debugAdvance(600));
    if (i === 2) await page.screenshot({ path: `${OUT}/v2-02-driving.png` });
  }
  const r = await page.evaluate(() => { const a = (window as any).__hmd; return { state: a.state, ok: a.session?.outcome?.success, tiles: a.view.roadTileCount, sf: [...a.view.chunkGroups.values()].some((g: any) => { let f = false; g.traverse((o: any) => { if (o.userData?.stats?.storefronts > 0) f = true; }); return f; }) }; });
  expect(r.state).toBe('RESULTS');
  expect(r.ok).toBe(true);
  expect(r.tiles).toBeGreaterThan(0);
  expect(r.sf).toBe(true);
  await page.screenshot({ path: `${OUT}/v2-03-results.png` });
});
