# Physical-device access follow-up

2026-10-28. The user explicitly authorized use of their account for sign-in and requested previous/new comparisons plus physical-phone testing. That authorization is retained; another permission request is not needed.

## Current access result

The normal Chrome application is running. The owned Playwright game-test browser uses an isolated in-memory profile and therefore does not inherit the user's authenticated Samsung or BrowserStack sessions.

- Attaching through the Playwright extension failed because the extension is absent from the normal Chrome profile.
- Attaching through `--cdp=chrome` failed because Chrome's `DevToolsActivePort` is absent. Playwright specifically requests `chrome://inspect/#remote-debugging` → **Allow remote debugging for this browser instance**.
- A bounded AppleScript attempt to read the active Chrome tab returned **AppleEvent timed out (-1712)**. This does not establish a specific macOS privacy-denial cause.
- The Android SDK's `adb devices -l` returned no devices. No emulator or physical phone is being counted as a hardware test in this follow-up.

An asynchronous request to enable the Chrome connection is pending. Passwords, cookies, browser credential databases and account secrets were not exported. There is no booked physical-device session and no new physical FPS, thermal or battery result. The blocker is the unavailable browser-control connection; the user's account authorization is already sufficient.

## Prepared execution path after connection

1. Attach to the existing Chrome profile, then use existing Samsung RTL or BrowserStack sign-in. Allow the user to complete any human-only authentication challenge. Do not create a paid subscription or assume that a ChatGPT sign-in is a Samsung/BrowserStack account.
2. Verify actual mid-range-device availability and existing/free entitlement before reserving a device. Record its real model, chipset, OS, Chrome version, physical resolution, viewport and browser callback cadence. Do not treat the catalog listing or streamed preview FPS as the game's FPS.
3. Prefer Samsung RTL's [Remote Debug Bridge](https://developer.samsung.com/remote-test-lab/blog/en/2022/07/13/connect-to-devices-on-remote-test-lab-using-rdb-in-android-studio), which connects the actual lab phone to local ADB/Android Studio. If supported in the allocated session, scope ADB reverse mappings to that device and ports 4201 (Version 21) and 4199 (optimized), so the real phone can load both frozen local builds. No production release is needed for this comparison. Reverse support through the chosen lab connection is not yet verified.
4. BrowserStack's alternatives are [Local Testing](https://www.browserstack.com/docs/live/local-testing) and its [Android Chrome DevTools](https://www.browserstack.com/docs/live/debug-website/devtools). Confirm profiling access in the allocated session; do not assume desktop features work on every remote device.
5. Run alternating old/new pairs at identical quality and scene resolution with CPU throttling **off** on the real phone. Keep initial preparation, static rendering, ordinary traffic/driving and delivery-loop results distinct. Capture raw presented-frame intervals, CPU/GPU timings where supported, long tasks, build IDs, world-visible screenshots and device conditions. A HUD over an absent world is invalid performance evidence.
6. Exercise visible touch controls, landscape/fullscreen, minimap close, pause/resume, app switch/return, bus jump/landing continuity, order acceptance, held collection and explicit handover. Record completed deliveries separately from attempts and synthetic fixture saves.
7. Use a sustained session for FPS stability and record charging/temperature conditions. A charging cloud-lab phone cannot establish unplugged battery runtime; unavailable thermal/GPU telemetry stays unknown.
8. Release held input, close only agent-created phone/browser tabs, remove only test-owned forwarding/reverse mappings, release the reservation and detach from the user's Chrome. Do not close the user's browser.

The desktop A/B artifacts are independent of this access blocker. They must not be presented as physical-phone certification.
