# Kit preparation and validation

Version 3.0. Prepared and checked on 17 October 2026. These results describe the supplied handoff, raw inputs and helper tools. They are not acceptance results for a completed game.

## Specification and latest requirements

- The master contains 31 numbered sections, 18 scene templates, 12 mission templates and 82 distinct acceptance IDs.
- All 82 machine-readable requirement descriptions match the master acceptance matrix. The requirements template records the exact packaged master hash.
- Mission templates use MT01 through MT12, separate from acceptance checks M01 through M14.
- Shared flight allowance is 25 seconds by default, with 20/30-second contract alternatives, continuous or split usage, and no ground recharge. Accepted but obstructed takeoff retains consumed ticks through its bounded abort path.
- The full selected three-corridor scope, fixed geographic scale, property-level evidence states, both required phone platforms, and eight gates remain intact.
- Whiteout is the user-selected visual reference in the master, launch prompt, graphics contracts and configuration. Q08 and C4 include actual reference inspection and comparison without adding acceptance IDs.
- Claude Code instructions use the requested Opus 5.5 model, verified supported CLI controls, explicit model checking, a live checklist, awaited work and bounded continuation. API-only settings are not described as CLI settings.
- New application location is game/ inside the extracted hyderabad-game-handoff workspace. Application copies of document references must be rewritten as documented in AGENT_ENVIRONMENT.md.
- The original user-provided Opus guide was compared byte-for-byte with the local attachment and remains unchanged.
- Canonical acceptance statuses are passed, failed, blocked, not_run and stale. Descriptive art-review categories are separate.

## Actual geographic-source checks

Executed from the kit root:

```bash
python3 -B scripts/fetch_sources.py --verify
python3 -B scripts/inventory_osm.py --json
```

All 14 manifest-listed source, query and report files matched their expected byte counts and SHA-256 hashes. No network calls were made by these verification commands. The inventory completed with exit 0 and retained its geographic-review limitations.

The four corridor XML files produced this calculated union:

| Measure | Observed |
|---|---:|
| Nodes | 37,990 |
| Ways | 8,336 |
| Relations | 56 |
| Highway-tagged ways | 1,347 |
| Highway ways with width | 7 |
| Highway ways with lanes | 26 |
| Building-tagged features | 6,767 |
| Building features with height | 2 |
| Building features with building:levels | 26 |
| Named features | 632 |
| Missing way-node references | 0 |
| Partial parent relations | 25 |
| Imported turn-restriction relations | 0 |
| Version or same-version content conflicts | 0 |
| Suspect raw-name fields requiring review | 7 |

These are source feature counts. They do not count verified streets, buildings or shops. Partial relations, uncertain names, sparse widths/heights and absent restriction records remain explicit geographic work. Metro-network source data covers the three lines; the four detailed street boxes cover the starter corridor.

## Starter material and font checks

Nine asset/support records matched local byte counts and SHA-256 hashes. The six original 1K textures additionally matched the provider's published MD5 records; the font, OFL and metadata matched the official directory's Git blob hashes.

All six textures decoded at 1024 by 1024 pixels. Both diffuse images were visually inspected. The font parsed as Noto Sans Telugu version 2.005. These checks establish usable source files, not correct game material setup, Telugu shaping in the selected browser, local sign spelling or phone performance.

Five bundled provider/source records matched their hashes. Two external-only licensing-review captures retain metadata and were explicitly excluded from bundled-file verification. The full captured provider webpages are outside the archive. See resources/STARTER_ASSETS.md for exact use, rights, channel semantics and limitations.

## Helper self-tests

Executed:

```bash
python3 -B -m unittest discover -s monitoring -p 'test_verify_run.py'
python3 -B scripts/inventory_osm.py --self-test
python3 -B scripts/fetch_sources.py --self-test
```

Results: **32 monitoring tests, 6 inventory tests and 6 acquisition tests passed**, for **44 helper tests** in total.

The monitoring suite includes protection against removing either required physical phone platform or duplicating platform entries. Its deliberately synthetic ledgers do not establish that any real device, game, map or reviewer passed. Acquisition tests use mocked responses and do not prove future live service availability.

## Unstarted-template behavior

The actual current templates and application-copy configuration were placed in a temporary empty implementation project following the documented paths. The master and graphics reference were copied under docs/handoff, and the application references were adjusted accordingly. The real monitoring CLI was then invoked in both modes:

| Mode | Exit | valid_ledger | ready_for_requested_release |
|---|---:|---|---|
| Report | 0 | true | false |
| Release | 1 | true | false |

This is the expected result. Unstarted templates cannot pass a completed-release gate. The checker validates declared metadata, record relationships, local artifact existence and hashes. The supervisor still has to inspect and reproduce consequential evidence.

## Package checker and negative checks

The current original handoff passes:

```bash
python3 -B scripts/check_handoff.py
```

The checker verifies 68 listed files, complete acceptance descriptions, the master binding, indexed paths, configuration agreement, requested Claude setup and required Whiteout reference. The archive contains those files plus kit-manifest.json, for 69 files total.

Two isolated negative checks also behaved as expected:

| Deliberate temporary mutation | Expected and observed |
|---|---|
| Change launch-prompt bytes without updating its hash | Exit 1; handoff rejected. |
| Change the required visual-reference URL and update that file's manifest hash | Exit 1; semantic reference mismatch rejected. |

Only temporary copies were changed for these checks. The source kit retained its intended contents. Manifest integrity is a reproducibility check, not an independent cryptographic signature.

All authored JSON parsed, Python files parsed without syntax errors, local indexed resource paths were checked, and Markdown code fences and local document links were inspected. Authored Markdown contains no em dashes; original supplied or downloaded source text is preserved as-is. The final ZIP is checked for readable entries, safe relative names, one expected top-level folder and exact agreement with kit-manifest.json. Python caches, temporary fixtures, upload helpers and credentials are excluded.

## Reference inspection and limits

The user-selected Whiteout page opened in a remote Chrome browser. Its opening interface loaded, but the browser could not create a WebGL context, leaving Start disabled. The console identified THREE.WebGLRenderer. Gameplay, car detail, lighting, camera motion, effects, sustained frame rate and phone performance were not observed. No reference assets or screenshots are bundled.

The receiving agent must inspect actual Whiteout gameplay in a capable browser and populate its visual rubric before claiming a match. That comparison remains separate from verified Hyderabad geometry and our own physical-device results.

No actual Three.js game was implemented, browser-played, deployed or phone-tested while preparing this kit. No Claude Code build or continuous background monitor was started. This is the complete handoff for the implementation agent, including the supplied inputs, remaining acquisition work and explicit completion gates.
