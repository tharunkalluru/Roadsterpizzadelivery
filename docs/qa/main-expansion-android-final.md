# Frozen18 Android compatibility check

Status: BOUNDED EMULATOR COMPATIBILITY PASS on an explicit SwiftShader backend, with open acceptance limits below. Normal world rendering, controls, jump/flight, map, opaque menus and Android Home/Chrome return were observed. This is not a physical-device performance result or a complete campaign playthrough.

## Exact build and environment

- Candidate origin: `http://127.0.0.1:4268/` through emulator ADB reverse tcp:4268. Exact URL was visibly entered through Gboard and later remained visible after app return.
- Frozen18 expected runtime fingerprint supplied by the release owner: `ab8aef925b05341e038067c7783f063a208d46aa75a8b49c2bd4a289db18b963`. The release owner held the frozen source; no game source, assets, cryptographic verification or deployment was changed by this test. This pass covers frozen18 normal Level 1 entry, not subsequent source changes.
- Android Studio native Running Devices; AVD `Roadster Android15 Compat`, emulator-5554, Pixel 7a-shaped profile, API 35/Android 15, ARM64, 1080 x 2400, 420 dpi, 2 GB configured RAM and 4 configured CPU cores. The profile does not emulate that phone's physical processor, GPU or thermal behavior.
- Chrome 124.0.6367.219, existing signed-out test profile. No account enrollment, billing, agreements, new browser/device permissions or security bypasses.
- README-only temporary Android Studio workspace in Safe Mode. No trust-all, SDK change or unrelated Android project change.
- UI actions/captures used CUA native Android Studio only. No ADB input, CDP, hidden application-state evaluation or ADB screenshots. Readonly version/log/process diagnostics and owned-emulator lifecycle/reverse networking were used. Saved images are native JPEG bytes.

## Rendering investigation and resolution

1. Initial AVD Graphics acceleration was visually confirmed as Automatic. Auto game quality loaded the interface but no car, roads, traffic or scenery: only a minimap/controls on flat purple. Selecting the existing Low game preset and allowing its normal reload also produced HUD-only output. Neither result was accepted as successful 3D or FPS evidence.
2. The official AVD Graphics acceleration option was temporarily changed from Automatic to Software, followed by Cold Boot. Readonly metadata confirmed `hw.gpu.mode=software`. This still produced HUD-only purple output.
3. The original Automatic AVD configuration was restored/saved through the GUI. It remains `hw.gpu.mode=auto`. The paused owned AVD was then stopped and the official SDK emulator relaunched once with the existing IDE embedded flags, plus explicit `-gpu swiftshader -no-snapshot-load -no-snapshot-save`. Existing `-qt-hide-window -grpc-use-token -idle-grpc-timeout 300` were retained. No tokens or credential files were read or printed. Android Studio attached successfully; reverse tcp:4268 was reapplied.
4. On this explicit SwiftShader runtime, normal Play / Loading Inner Ring Road / Got It led to an actual visible 3D scene: Roadster, lane markings, curbs, buildings and the metro viaduct. Normal drive, jump and flight were then visible. Settings after app return visibly showed **Auto** selected, with Low unselected. Thus this is not a controlled Low-to-Low preset comparison.

Initial and GUI-Software Chrome GPU logs recorded `EGL_BAD_CONFIG: no ES 3.2 support`, `Failed to open rendernode`, and repeated ANGLE `ProgramGL.cpp:666 ... Program link or binary loading failed with no info log`. The explicit SwiftShader process still emitted some ProgramGL warnings while successfully rendering the world. Therefore those warnings alone do not prove a blank-world cause. The unchanged candidate rendering successfully with the explicit backend supports an emulator graphics-path issue; no baseline build comparison or full browser-JS diagnosis was completed, so a broader compatibility regression is not ruled out.

The earlier host alias `http://10.0.2.2:4268` failed before this pass. Loopback loaded without changing cryptographic verification. Insecure-origin `crypto.subtle` availability is a plausible setup explanation, not a confirmed exception diagnosis.

## Observed matrix

| Check | Actual observation | Result and limit |
| --- | --- | --- |
| Portrait guard | Single opaque landscape-required screen; Enter Full Screen Mode visible; no concurrent title/HUD layers | Pass layout |
| Fullscreen / landscape | Button exits Chrome chrome; native Rotate Left puts the physical emulator viewer in landscape; title and cards fit | Pass emulator compatibility |
| Initial loading | Branded opaque preparation screen covers initialization; normal Play shows Loading Inner Ring Road; first-run tip is opaque | Pass loading layout, not timed |
| Actual 3D world | Visible Roadster, streets, buildings, road markings and metro viaduct after explicit SwiftShader retry | Pass on this emulator/backend |
| GO | Sequential native holds produced speed UI 4 then 14 km/h; lane positions and roadside scene advanced with the visible car | Pass basic forward movement, not acceleration benchmark |
| Brake | Initial HUD-only run: brake returned speed UI from 3 to 0 | UI response only; no separate visible-world braking-distance test |
| Steering | Left/right button press feedback responded; steering was exercised during motion/hover | Basic input response observed; precision maneuvering/turning-radius acceptance remains open |
| Jump | Tap produced a visible airborne Roadster and altered camera view; later returned to the road and showed cooldown | Pass basic animation/return. Saved image 18 is the post-jump ground state; the airborne frame was observed in the live CUA result |
| Fly / Land | Tap produced visible hover over road/buildings and metro with Land state; Land tap produced descent / Landing state | Pass basic flight/landing response; not a full flight-route test |
| Minimap / full map | Minimap stayed right with speed integrated; tap opened full map with roads/rail drawing and Deliver From Here; Close Map returned to visible gameplay | Pass open/close UI; no latency or relocation-matrix measurement |
| Pause | Opaque game-paused panel with progress bar/options, no duplicated game HUD underneath it | Pass layout |
| Settings / Done | Opaque settings, Auto selected; Done top right returned to pause | Pass action/layout |
| Android Home / Chrome return | Native Home attempts initially did not visibly transition. Two swipe-up gestures eventually reached the actual Android launcher. Chrome icon restored the rendered game, then the paused menu settled correctly | Pass one background/return cycle; transient orientation resizing observed, no persistent duplicate layers |
| One-pointer use / reachability | GO, steering, Jump, Fly, map and pause were operated sequentially with one emulated pointer; no held input remained | Not equivalent to human thumb ergonomics or physical multi-touch |
| Normal jump pickup / all levels | No pickup or full story delivery completed in this bounded Android pass | Not accepted / outstanding |

## Evidence

Directory: `docs/qa/evidence/main-expansion/android-final-v18/`. `manifest.json` records hashes and scope.

- Images 01-04: loading, portrait gate, landscape title, first-run tip.
- 05 and 08: initial Automatic/Low HUD-only failures; 13-14: GUI-Software failure/pause.
- 06-07 and 09-11: initial menus, UI input states and full map.
- 12 and 15: original/restored Automatic AVD configuration.
- 16: actual visible world on explicit SwiftShader; 17: visible drive; 18: post-jump road state; 19: map; 20: actual flight/hover.
- 21: Android launcher after backgrounding; 22: restored Chrome pause menu; 23: Auto quality selected; 24: Done returned to pause.
- Three filtered `chromium-*-gpu-diagnostic.txt` files document the graphics investigation; `restored-avd-graphics.txt` records the saved graphics state.

## Handoff and remaining limits

The test ended on the game's normal paused menu, with no held input. The saved AVD configuration was restored to Automatic; the temporary explicit SwiftShader command-line override did not modify it. Game quality was visibly Auto. No frame-rate or adaptive-resolution setting was changed during this pass. After UI handoff and evidence capture, Root removed only the owned tcp:4268 reverse and stopped emulator-5554 through the official SDK lifecycle command. The AVD and Android Studio workspace were preserved. Mac Chrome and its user/game tabs were not touched by this reviewer.

This was an emulator pointer/stylus session, not a physical finger, actual mobile GPU or Samsung Z Flip. The landscape image was displayed at about 19% IDE host scale, limiting fine visual and text judgments. No controlled FPS, sustained 60/90/120 Hz claim, thermal measurement, battery endurance, complete campaign, railway/metro story flow, jump-over-bus visibility, night-lighting or physical-thumb acceptance is established here. No physical phone was connected. Those remain separate release gates.
