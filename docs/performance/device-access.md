# CPU calibration and remote physical device access

Assessed on 2026-10-28 in an independent agent-owned `roadster-device-access` Chrome session. The game test session was not controlled or modified. No accounts, reservations, subscriptions or purchases were created.

## Measured CPU throttling

Chrome `156.0.8078.73` was calibrated using the published Chrome DevTools `CalibrationController` algorithm through the Chrome DevTools Protocol. This uses the same 250 ms Lighthouse BenchmarkIndex workload and binary-search target scores, rather than choosing arbitrary slowdown factors. The DevTools Settings calibration interface was not used, and its saved presets were not modified.

| Measurement | Result |
| --- | --- |
| Unthrottled BenchmarkIndex | 4213 |
| Mid-tier target score | 1000 |
| Fitted mid-tier slowdown | **4.04×** |
| Mid-tier fit score | 991 |
| Mid-tier follow-up samples | 1015.5, 1017, 1028 |
| Low-tier target score | 264 |
| Fitted low-tier slowdown | **16.05×** |
| Low-tier fit score | 256 |
| Low-tier follow-up samples | 248.5, 255, 254.5 |

Calibration source: [Chrome DevTools CalibrationController](https://chromium.googlesource.com/devtools/devtools-frontend/+/HEAD/front_end/panels/mobile_throttling/CalibrationController.ts). Its raw-source SHA256, browser fingerprint, per-rate search samples and follow-up measurements are recorded in `output/playwright/cpu-calibration.json`. The repeatable Playwright calibration code is `output/playwright/calibrate-cpu.js`; raw CLI output is `output/playwright/cpu-calibration-cli.txt`.

Apply the measured rates to a page using a CDP session:

```js
const cdp = await page.context().newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4.04 }); // mid-tier approximation
// OR rate: 16.05 for the low-tier approximation.
// Always reset in final cleanup:
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
```

Use one setting at a time and record the browser/build/host conditions. Recalibrate after a browser/host change or materially different system load. The follow-up score variation shows why the rates are approximations. CPU throttling does not reproduce a phone GPU, memory limits, thermal behavior or battery endurance. [Chrome calibration explanation](https://developer.chrome.com/docs/devtools/settings/throttling).

## Samsung Remote Test Lab

The [public Galaxy A catalog](https://developer.samsung.com/remotetestlab/devices/124/galaxy-a) was reachable. At inspection, it displayed Galaxy A36 Available (4), A26 Available (3), A54 Available (3), and A53 Available (4). Counts are transient catalog observations, not booked slots or proof of hardware access.

Clicking the Galaxy A36 card produced this exact notification:

> Please sign in if you want to use the Remote Test Lab service.

The dedicated browser session had no authenticated Samsung developer account. No physical session could be started. Screenshot: `output/playwright/samsung-rtl-signin-required.png`. The available models and actual browser/profile access would need rechecking after authenticated access exists; no physical performance, GPU or Samsung rendering result is claimed here.

## BrowserStack Live

Opening `https://live.browserstack.com/dashboard` redirected to `https://www.browserstack.com/users/sign_in`. The page displayed business-email/password fields and sign-in options; the dedicated session had no authenticated BrowserStack account. Device availability and account entitlement were therefore not accessible. Screenshot: `output/playwright/browserstack-signin-required.png`.

[BrowserStack documentation](https://www.browserstack.com/support/faq/mobile/features-mobile/can-i-use-developer-tools-on-mobile-browsers) confirms Chrome DevTools support for selected real Android Chrome sessions accessed from Chrome. That capability was not exercised because authentication was required. No trial, purchase or account creation was attempted.

## Result

CPU-calibrated local investigation is available using the measured rates above. Remote physical-phone validation remains blocked by unauthenticated service access in the available agent browser. The owned assessment browser was closed and CPU throttling reset to 1× after calibration. This assessment does not certify mobile FPS or heating/battery behavior.

## Later account authorization and comparison follow-up

The user subsequently authorized use of their account. The current blocker is attaching to their normal Chrome session: the Playwright extension is absent and the browser-control endpoint is unavailable (`DevToolsActivePort` missing). No account credentials were exported and no physical session was booked. See the [current access record](physical-device-followup.md) and the [completed 12-run desktop comparison](version-comparison.md). The preceding unauthenticated-service observations remain historical evidence, not a claim about whether the user is currently signed in in their normal browser.
