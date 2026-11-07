# iOS gameplay gesture protection

## Diagnosis and scope
The original HUD already uses `touch-action:none`, independent per-button pointer IDs and pointer capture. There was no native TouchEvent or Safari GestureEvent fallback. Camera look changes distance only in its wheel handler; touch look changes yaw/pitch. Engine resize reads container dimensions, not the magnified visual viewport, and avoids unchanged-size GPU reallocations.

The reported physical iPhone magnification has NOT been reproduced here. Therefore the cause is a code-supported Safari native-gesture hypothesis, not a confirmed device trace. WebKit documents a historical absolute-positioned-element double-tap issue: https://bugs.webkit.org/show_bug.cgi?id=218015 . This does not establish which current iOS versions are affected.

## Changes
- `src/ui/gameplay-gestures.ts`: iPhone/iPad-only cancelable touchstart/move/end and gesturestart/change prevention on active gameplay controls and canvas. Common-ancestor gestures are guarded only while a gameplay-origin touch remains active. No synthesized clicks or input state writes. Menus/story blocks disable prevention.
- `src/ui/hud.ts`: attach guards to existing controls and canvas; keep pointer capture and input architecture unchanged.
- `index.html`: declare canvas touch-action and selection prevention before HUD styles load. Viewport metadata remains zoom-accessible.
- `src/core/engine.ts`: visualViewport scroll joins coalesced resize notifications. Existing dimension guard preserves aspect unless container dimensions actually change. No scale writes or camera/vehicle state changes.
- `tests/v21-fixes/gameplay-gestures.test.ts`: native cancellation, inactive/menu behavior, platform detection, pointer independence from fallback, cleanup, common-ancestor gestures, cancel/blur clearing.
- `scripts/ios-gameplay-touch-probe.mjs`: real Chromium CDP multitouch sequences against the game, not synthetic PointerEvent dispatch. An iPhone UA activates the fallback but does NOT emulate WebKit.

## Diagnostics
On a development server, append `qaTouchDiagnostics=1`. Inspect `window.__touchDiagnostics.records`; call `.snapshot()` for a manual sample. The bounded 500-entry buffer captures scale, viewport dimensions/offsets, window size, orientation, active pointer IDs/button states, cancellation, blur, visibility and viewport events. Scale changes over .01 are flagged. Production builds and ordinary play install no diagnostic listeners.

## Remaining device acceptance
Physical iOS Safari browser mode and Add to Home Screen mode remain unverified, as does physical Android Chrome. Run the user-specified 30-second hold, 50 left/right/alternating taps, concurrent brake/fly/jump, both release orders, orientation and menu tests there. Export the diagnostic ring on any failure with iOS/browser version. Desktop Chromium touch simulation cannot certify Safari gesture handling or OS accessibility behavior. No global zoom restrictions were introduced.

## Browser evidence
Both recorded Chromium runs passed all of: 30-second GO hold; 50 LEFT taps; 50 RIGHT taps; 50 alternating taps; GO release retaining steering; GO with brake/fly/jump; portrait/landscape roundtrip. Viewport scale remained 1 and canvas/HUD both measured 1100 x 650 after rotation. JSON evidence includes the development event ring. The two runs exercise the iOS fallback enabled and Android path disabled respectively, with touch emulation. `controls-after-multitouch.png` shows the visible controls after the Android-path run. The existing 40-check legacy UI suite also passed independent held controls, cancellation, lost capture, keyboard, accessibility and modal/visibility resets.

## Final automated checks
`npm run check` passed on the final source: both TypeScript checks, 1,307 current regression tests, 38/38 portable legacy suites, and production build. Build retained its large-chunk warning. Focused native-gesture suite: 4/4. Physical-device acceptance remains pending as described above.
