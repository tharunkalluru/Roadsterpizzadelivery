# Independent review of passive automatic-story QA evidence

Date: 2026-11-02. Reviewer: separate from the QA instrumentation producer and gameplay implementation owner.

**Outcome: scoped instrumentation review passes after the reproduced defects were fixed.** The final checked snapshot passes 56 focused tests and TypeScript. This approves the observer/recorder accounting in the reviewed scope; it does not approve gameplay, character likeness, a native campaign run, physical-phone performance or publication.

## Reviewed source and method

- `src/delivery/qa/campaign-observer.ts`
- `src/delivery/qa/campaign-recorder.ts`
- `src/delivery/qa/campaign-scenarios.ts`
- Producer report: `docs/qa/main-expansion-story-qa-evidence.md`
- Independent regressions: `tests/v21-fixes/story-qa-independent.test.ts`

The independent tests exercise both the actual recorder and actual `attachCampaignQA()` observer. Observer tests use real Three.js scenes, mesh/material/layer state and a camera/frustum, with a minimal DOM fixture to control visibility, event handling and time. The fixture's trusted-click bit is test data, not a claim of real human touch or physical hardware. No browser, GPU session, registry, gameplay, old evidence artifact or production file was edited by this reviewer.

## Reproduced findings and verified repairs

1. **An off-camera carton could count as a visible physical transfer.** The original ancestor `visible` check did not consider attachment, camera frustum, material state or layers. The actual observer accepted a complete carton entirely behind the camera, then used it to certify `automatic-handoff`. The repaired probe requires attachment to the actual scene, an enabled render branch/material/layer and actual static carton bounds intersecting the gameplay camera frustum. Independent positive and negative tests verify a front-facing renderable carton counts, while a behind-camera carton, hidden material and wrong camera layer do not.

2. **A revision jump could hide extra relocations as one expected Next.** The original ready condition accepted any placement revision greater than the requested revision and advanced the baseline before the ordinary sample. A jump from revision 1 to 3 therefore received clean `next-road-ready` proof. Normal production `Game.relocate` performs one `Player.place`; the revised transaction requires exactly one increment. Extra placements invalidate the transaction and remain assistance. Loading retries that really place again are not silently accepted as a single clean transition.

3. **Old-scene movement after the first loader sample was forgotten.** Once one valid loading observation had latched, the original code could observe an eight-metre departure from the old scene, later see a correct road, and still certify a clean direct Next. The repaired transaction permanently invalidates unexpected pre-placement motion. The initial repair also missed vertical motion because the requested pose stored only X/Z. A separate regression reproduced resurfacing/vertical departure at unchanged X/Z and revision; full XYZ is now captured and checked.

4. **A pending Next survived into a different attempt.** A new order could begin and a later observation could finish the older attempt's still-pending transition. Beginning another attempt now invalidates the old pending transaction instead of awarding it facts retroactively.

5. **A hidden stale restaurant node could count as a viewed ending.** Existing innerHTML with `data-opening="open"`, plus elapsed wall time, was sufficient even if the panel was hidden. The revised observer requires the visible final completed ceremony, finished progress, and the appropriate workflow prerequisite. Automatic levels require the trusted final Next observation; legacy call levels do not have that button. It requires over 2.2 seconds of continuously sampled visible-open exposure, restarting after hidden, background, Pause or an over-500ms sample gap. Independent actual-observer tests verify both the automatic positive and hidden negative, plus each interruption/reset case.

6. **The stricter ceremony gate initially broke legacy evidence.** Its first repair required `final-next-requested` unconditionally, but a non-NONE manual final level cannot produce that automatic-only fact. The independent legacy positive failed as expected, then passed after restricting the Next prerequisite to NONE workflow. Legacy visible final-opening evidence remains observable with its unchanged manual requirements.

The initial four independent regressions all failed before the first repair. Vertical departure and hidden opening were then separately reproduced; the subsequent legacy compatibility regression was also reproduced before its repair. The final independent suite is **16/16 passing**.

## Positive paths and boundaries retained

- A distinct matching `setpieceDone` event in the captured playing/REVEAL phase is required for automatic handoff. A `levelComplete` event alone is insufficient.
- A clean retained character scene must be observed for over one active second, with Pause and Next visible and gameplay HUD hidden. Observed violations remain reportable after later clean samples.
- Trusted visible Next, actual loader mutation, old-scene release, held pose, exact one-placement progression and a prepared on-road spawn within four kilometres are separate evidence conditions.
- One legitimate placement can finish asset warming under the loader without being mislabeled assistance or prematurely accepted as ready. A later R/map relocation or extra placement remains visible as assistance.
- Automatic scenario facts no longer require manual Drop, truck departure, compound departure or resurfacing before Next. Legacy non-NONE fact requirements remain unchanged.
- The observer remains passive: the reviewed source does not call movement, pickup, module drop, completion or gameplay loading methods. The MutationObserver reads the real loading DOM; it does not replace game methods.
- The export explicitly records the carton probe's limit: scene attachment/render flags and frustum bounds are **not pixel visibility or occlusion proof**. An opaque obstacle can still hide a frustum-intersecting carton. Explicit native visual review remains mandatory; telemetry must not be described as proof of the final pixels or likeness.

## Historical evidence and new native-run requirement

The checked historical `docs/qa/evidence/main-expansion/normal-campaign-pickup-delivery-v1.json` remains schema 2 and honestly reports:

- Pushpa completed with natural jump pickup;
- missing old `manual-handoff`/`truck-exit` facts;
- `player-relocated` assistance;
- `fullCampaignAccepted: false`.

It was not rewritten or upgraded into an accepted run. Frozen build 11 predates the independent repairs above. Root must freeze the corrected source and capture/export a fresh normal pickup → visible physical story → retained viewing → trusted Next/loading → prepared new road flow from that exact build. The fresh run, final all-fourteen playthrough, visual reviews and hardware/performance evidence remain separate acceptance gates.

## Verification on the final held source

| Command filter | Result |
| --- | --- |
| `story-qa-independent` | 16/16 pass |
| `story-qa-evidence` | 17/17 pass |
| `campaign-evidence` | 10/10 pass |
| `local-art-review` | 13/13 pass |
| `npm run typecheck` | pass |
| `git diff --check` | pass |

Final source fingerprints reviewed:

```json
{
  "src/delivery/qa/campaign-observer.ts": "dfc772a5decc44d26283405929cf346698063ce088eac2f8cd102228ae1345a5",
  "src/delivery/qa/campaign-recorder.ts": "2dd95e2a21318931ae767913044253875e5f7c09d279e2c8598731daabeda0e9",
  "src/delivery/qa/campaign-scenarios.ts": "b44403b2ab7c71828967b37e7b7d2fb9cd28204b6c7bc8fdda458c7d4a8e34a7",
  "tests/v21-fixes/story-qa-independent.test.ts": "6b9ff396532963dc0bcc59d94451ff89ef2944d15eb1344abc77f5125e135605"
}
```

No unresolved blocker remains in the scoped observer/recorder review at these fingerprints. Changes to these files require a fresh check before using their reports as release evidence.

## Follow-up: native final ceremony covered-HUD false violation

Root's native final-level run exposed a distinct observer false positive after the review above: the runtime intentionally restores underlying HUD DOM when showing its opaque full-screen restaurant completion presentation. Computed visibility of that covered DOM does not mean the player can see it. This is an evidence correction, not a product UI change.

I independently reviewed the held `finaleOverlay()` / `coveredByFinale()` implementation and the14 actual-observer regressions. The exception is confined to the completed final NONE level, matching recorded attempt, retained cinematic/viewing state, finished progress and prior trusted final Next. The opening must belong to the known final completion sheet and actual modal overlay, remain attached/computed-visible, and have a recognized ceremony phase. The ancestor branch must be fully opaque and visible without filters or blending; the overlay background must be opaque and its rectangle must cover the viewport. Each otherwise visible gameplay control is excluded only when the overlay covers its full rectangle and real hit testing at its center and four inset corners resolves inside that overlay.

The negative cases retain violations for hidden/detached elements, translucent overlay/ancestor, undersized coverage, unrelated or nonfinal modals, a control above the overlay, an invalid phase, a still-playing story and viewing before trusted final Next. Coverage of a closed/lighting/doors presentation does not award `final-opening`; continuously visible-open exposure remains separate. The earlier automatic and legacy final-opening positive cases and hidden/background/Pause reset cases still pass. No blanket modal suppression was introduced, and no gameplay, character, camera or old evidence was changed by this narrow source patch.

Independent rerun on the final held source: `story-qa-finale`14/14 and `story-qa-independent`16/16 pass (**30 tests**). The producer's wider70-case/typecheck run is documented separately in `main-expansion-story-qa-evidence.md`; it is not represented here as another independent native run. DOM hit-test/style telemetry still requires Root's fresh native computed-style/paint verification on the newly frozen build and is not a physical-device or GPU-pixel benchmark.

Verified unchanged historical artifact: `evidence/main-expansion/native-scenes-v13/level-14-campaign-evidence.json` SHA-256 `8c2bebddfd49235fe374f9d359c429de5ae255a4bde13e17038bae478c795351`. Its original false violation remains in that immutable export; this review does not rewrite it into acceptance.

New held source SHA-256: `src/delivery/qa/campaign-observer.ts` = `7cf79c63f101640387454bbb433b6bba6e43cfec81b2b25f9114ee06d083e322`. New regression SHA-256: `tests/v21-fixes/story-qa-finale.test.ts` = `a2a0c7b7c2c439b2e40b5081b8e16865002e3d519fbda572de6d09f73e42969f`.

**Follow-up verdict: scoped passive-QA fix passes independent source/regression review. No concrete masking defect found in the known final presentation.** Native/release approval remains Root's gate. Only this independent document was edited by the reviewer during the follow-up.

## Follow-up: grouped crowd observation and observer isolation

The native Wedding replay exposed an instrumentation crash after the crowd became a Group of four instanced batches. The observer still read `crowd.instanceMatrix.version` from the named Group. Because its synchronous `setpieceDone` listener threw, it could interrupt real controller completion. This is a concrete reason passive diagnostics must be isolated from gameplay.

The corrected observer traverses actual visible `InstancedMesh` descendants, including the older single-mesh form. Presence and matrix-version changes remain distinct facts; every currently visible rendered batch must change its version before the group receives animation evidence. An empty, hidden or partially moving group cannot supply the full proof. The producer's regression uses the actual `WeddingCrowd` implementation, not an invented replacement shape.

I inspected the guard coverage over synchronous delivery events, keyboard/pointer/Next listeners, loading MutationObserver callbacks, initial observation, periodic RAF/performance observation, evidence UI actions and performance reporting. A diagnostic failure is retained in bounded `observer.failures` with a permanent total/failure bit, forces a visible `QA INVALID` status, and makes global scenario/mechanics/full-campaign acceptance false. Recovery and a later attempt cannot clear it. Event-listener guards return without interrupting downstream game listeners; RAF scheduling occurs after the guarded observation so a failed poll does not terminate polling. The observer does not replace the game's event bus or wrap gameplay movement/completion methods.

The independent challenge found one escape in the initial repair: JavaScript permits `Error.message` to be nonstring. `observerFailed()` assigned that value, then called `.slice()` outside the protected conversion, throwing `message.slice is not a function` from the error handler itself. New `story-qa-safety-independent.test.ts` reproduced the failure. The producer made a bounded coercion-only repair, converting and slicing inside the protected try. Numeric, null, Symbol and unprintable Error messages now remain exportable failures; unprintable thrown values and a failing diagnostic clock also remain safe, bounded and immutable to report consumers.

Independent final rerun: grouped/error-containment7, prior independent16, finale14 and additional safety2 = **39/39 passing**, plus `git diff --check`. The producer separately reports the wider79-case/typecheck run; this independent review does not convert that into native or hardware evidence. No source/gameplay/browser/old evidence was edited by this reviewer; only the new independent safety tests and this document changed. Root/native QA owns the reported healthy frozen17 replays and preservation of the failed frozen15 exports/console evidence.

Reviewed held SHA-256 values:

```json
{
  "src/delivery/qa/campaign-observer.ts": "d6ee599e8ad995addfab999f61ddb48a83e3783aaadb052f78563db7747598f3",
  "src/delivery/qa/campaign-recorder.ts": "ed3d45095fe82a2727774fbe01abd8bf73cc8012ff6f27cb4bffeab91a271d26",
  "tests/v21-fixes/story-qa-safety-independent.test.ts": "eceae76a88557d41913e6c17f64d1c6a33e4cc13687c7c0c773eded106bd7879"
}
```

**Safety follow-up verdict: scoped observer/recorder isolation review passes after the independently found coercion defect was fixed.** Historical failed evidence remains failed; a fresh healthy run must be captured at the final release fingerprint. The broader native/visual/phone/release gates are unchanged.
