# Phone fix / provisional preview checkpoint

Owner returning-account-game-01, existing PR9/personal branch. Base game commit ee02e66c7b704431de660dbbb3708137edd38d43; current code commit resolves as `git log -1 --format=%H -- game/work/phone-provisional-preview-survey133/checkpoint.md`. Mapping and sole survey integration remain with second-computer-01; no survey/world/generated data, mapping lease or provider hold changed. Main Site unchanged. New direct voice request explicitly permits a labelled partial-map game preview and excludes steering redesign; verified-mode null/locked gate remains intact.

## Reproduced phone defects and fixes

Actual touch-enabled844x390 Chrome-for-Testing UI selected and accepted an order successfully. A diagnostic placement at the existing pickup isolated the collection tap: button visible/canInteract true, computed pointer-events none, elementFromPoint hit CANVAS, real touchscreen tap did not collect (holdTicks0). A temporary CSS override pointer-events:auto made a real tap collect and enter DELIVERY. Source fix now applies pointer-events:auto to .cbtn.interact only. No steering changes. Raw compact evidence is qa/phone-preview/reproduction.json; the diagnostic test is not a normal-start complete journey.

Cancellation exposed a second bug: nudging accelerate during collection set holdArmed false; after stopping, the visible button ignored every fresh press until movement exceeded2m/s or the player left the stop. The new regression failed before the fix and passed after. Re-arm now occurs only after accelerator release and the existing stopped/grounded/approach/level checks; a new interaction edge remains required. No auto-collection.

## Checks completed

57 focused tests passed across source-preview, provisional-zone, session and verified pilot-zone tests. TypeScript passed after the latest changes. Earlier60-test batch also included storage. Verified mode still rejects provisional survey evidence. Source pin133 and all five SNAPSHOT hashes unchanged. No full new build, current real-map complete touch journey, cancellation/repeat browser run, physical phone or hosted test has completed yet. Do not report those as passing.

## Provisional capability / source-only candidate

Separate ProvisionalZone uses explicit source-listed deliveries and hash-verified listing-index identities, finite convex bounds, connected canonical-road routes, spawn/stop containment, mode-bound saves and existing recovery; it never weakens or populates PilotZone. The provisional entry labels incomplete mapping, approximate entrances/dimensions and unknown business operation. Its build helper serves only preview.html as root and removes the inherited service worker. It is not yet built/deployed.

A source-only game-catalogue candidate is recorded in config/provisional-preview.json and source-scope.md/JSON:800m square Paradise/S.D.Road,67 canonical-road context records,2appearance-researched roads/31provisional storefronts, no overlap with eight active mapping leases or Miyapur hold. Pizza/place markers are existing bundled records for Domino's, Radisson and Eco Basket, not newly invented entrances. Two connected job routes pass ProvisionalZone admission against the actual pinned core/listing index. This is catalogue/source validation, not mapping qualification, street-view continuity, current tenancy or successful driving QA. Surrounding roads are explicitly canonical context. The other dot owns the known inspection geography: three connectors/junctions with R357, about216m to inspect for its proposed~244m loop. Unknowns are the supported real pickup and permitted return feasibility, not the geographic bounds. Its27.5m Bata option and244m pending-feasibility candidate are NOT imported, adopted as proof or fabricated into a loop here. No provider/browser research or new evidence acquisition was performed.

## Site status and next safe action

Reuse existing owner-private project appgprj_6ad76f01fa8c81919c9133f696ca256f, persisted at task-2/sites/roadster-qualified-pilot/.openai/hosting.json. Latest read confirmed owner/custom one-user/no-editor/no-group access,version0/live URL null. No new source credential, source push, saved version or deployment in this resumed work. No hosted provisional preview exists.

Next: review the explicit provisional source scope through the existing coordination handoff; run normal-start touch selection, both actual-source driving/pickup/handover jobs, collection cancellation and retry/abandon, boundary/reload checks; fix any observed failures. Then production-build/package and use supported Sites source-push/archive/private-deploy flow and test the actual hosted flow. Full verified mapping is not the provisional release gate. Do not silently wait for complete coverage or publish a tiny fictional driving fragment. If scope evidence or native publication is rejected, report that exact narrow blocker.

The parent requested this safe checkpoint for live-user review; implementation is paused here with changes preserved. Local owned preview port5481 and named testing browser roadster-phone-fix were left available for continuation; no uncertain operation is running.
