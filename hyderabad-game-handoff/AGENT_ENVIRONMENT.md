# Environment and project setup for the receiving agent

Version 3.0. Prepared 17 October 2026.

This kit is a complete implementation handoff. Its Python tools inspect data and evidence. The Three.js application still needs to be created. There is no existing package.json, npm start command, production build, hosting account, or game server in the kit.

For the requested Claude Code build, follow [CLAUDE_CODE_SETUP.md](CLAUDE_CODE_SETUP.md) and the persistent instructions in [CLAUDE.md](CLAUDE.md). Verify the installed CLI, actual Opus 5.5 model, account access, effective effort, and loaded project instructions before implementation. A prompt cannot grant model access, change the selected account, or apply CLI settings. If the requested model is unavailable or the active model differs, follow the setup guide's mismatch procedure without selecting an alternative silently.

## 1. Required capabilities

| Capability | Needed for | If unavailable |
|---|---|---|
| Read and write project files | Implement the game and retain its source and reports. | A chat-only assistant can discuss the specification but cannot complete the requested build. Use a coding workspace. |
| Execute a shell and project commands | Install permitted dependencies, process maps, build, and run tests. | Record the capability gap and provide the exact continuation environment needed. |
| Python 3.10 or newer | All supplied source and handoff helpers. | Install through an allowed environment mechanism, or run them in another suitable environment. |
| Supported Node.js LTS and a package manager | Three.js/TypeScript application tooling. | Inspect the chosen tools' engine requirements before selecting a version. |
| Browser interaction, working WebGL, and screenshot inspection | Actual play, the required Whiteout reference inspection, touch-layout checks, loading behavior, and visual QA. | Check real graphics-context creation and a rendered scene. HTML access alone is insufficient; keep dependent checks blocked when rendering or interaction is unavailable. |
| Permitted network access | Dependency installation, additional public map sources, and selected assets. | Use the frozen local data and supplied assets; continue independent implementation. |
| Image inspection and asset production | Assess references, model local geometry, and evaluate materials. | Clearly distinguish uninspected or provisional content. |
| Physical Android and iPhone access | Required sustained mobile interaction and performance evidence. | Browser emulation remains useful, but physical checks stay blocked. |
| Local or independent geographic review | Names, entrances, road arrangements, and critical clearances. | Produce precise location-specific review tasks and retain unresolved accuracy states. |

A third-party API token is not required to begin with the bundled OSM data. Optional imagery providers may require authorized access. Obtain credentials only through the execution environment's supported mechanism, keep them out of source control and client bundles, and never include them in evidence files.

## 2. Choose the project directory

If the user supplies a repository, inspect its instructions, status, package manager, existing assets, and current behavior. Place the handoff within its permitted workspace and merge the relevant persistent instructions without replacing unrelated instructions or work. Launch Claude Code from the repository and record the actual handoff and application paths in `IMPLEMENTATION_STATUS.md`. Create an isolated branch or worktree when appropriate and available.

If no repository exists, use the archive's extracted `hyderabad-game-handoff/` directory as the workspace. Launch Claude Code from that directory so its `CLAUDE.md` applies, and create the application inside its `game/` subdirectory. Keep the original handoff documents and source snapshots intact. Add the app's entry point, TypeScript source, build configuration, package.json, lockfile, public assets, tests, and documentation under `game/`. Create the live `IMPLEMENTATION_STATUS.md` checklist at the handoff root. The kit root and the application root are different directories within the same workspace.

Use a simple Three.js plus TypeScript application with a compatible Vite build as the default. A UI framework can be used if it materially helps menus and state. Keep the render loop and fixed-step simulation outside per-frame component rendering. Use the master architecture for the physics, traffic, world, input, mission, persistence, and UI systems.

Do not assume the blank kit can be launched with npm. First create and validate the application toolchain. Once implemented, expose at least `dev`, `build`, `preview`, `typecheck`, and meaningful test commands in the project, then document the actual commands and ports.

## 3. Check the handoff before starting

From the extracted kit root:

```bash
python3 scripts/check_handoff.py
python3 scripts/fetch_sources.py --verify
python3 scripts/inventory_osm.py --json
```

These commands use local files. The first checks package integrity, the specification binding, acceptance IDs, and the critical configuration invariants. The second checks the frozen source cache. The third reports the source inventory and its known gaps. None of these commands installs dependencies, initializes a game, calls a live map provider, or establishes geographic accuracy.

Use Python 3.10 or newer for the whole kit, even if an individual script supports an earlier interpreter. The helper self-tests listed in KIT_VALIDATION.md are available when auditing changes to the helper tools.

## 4. Initialize the application's documents and ledgers

Create these target paths in the application project, `game/` for the default new-project layout. If they already exist, review and merge intentionally. Do not overwrite an existing run's evidence with the unstarted templates. The table's input paths are relative to the handoff root; its target paths are relative to the application root.

| Kit input | Application target |
|---|---|
| `config/project-contract.json` | `config/project-contract.json` |
| `config/flight-budget.json` | `config/flight-budget.json` |
| `config/visual-quality.json` | `config/visual-quality.json` |
| `monitoring/status.template.json` | `qa/status.json` |
| `monitoring/scope.template.json` | `scope-manifest.json` |
| `monitoring/requirements.template.json` | `requirements.json` |
| `monitoring/evidence-index.template.json` | `qa/evidence-index.json` |
| `monitoring/visual-reference-review.template.json` | `qa/visual-reference-review.json` |
| `monitoring/verify_run.py` | `monitoring/verify_run.py` |
| `monitoring/FORMAT.md` | `monitoring/FORMAT.md` |
| `monitoring/SUPERVISOR_PROMPT.md` | `monitoring/SUPERVISOR_PROMPT.md` |
| Complete specification, supplements, Claude setup, graphics reference, resource guide, and work orders | `docs/handoff/`, preserving their internal relative paths |

In the application's requirements.json, set `source_specification` to the actual project-relative location of the copied MASTER_PROMPT.md and retain its correct byte hash. Preserve all acceptance descriptions and IDs. Record the reference-kit version and original kit hash in DATA_SOURCES.md.

For the supplied `docs/handoff/` layout, set the application copy of `config/project-contract.json` field `visual_reference.contract_path` and the application copy of `config/visual-quality.json` field `required_reference.contract_path` to `docs/handoff/GRAPHICS_REFERENCE_WHITEOUT.md`. If integrating into an existing repository with another recorded documentation layout, use that actual application-relative path in both fields. Preserve the original kit configuration bytes. Populate `qa/visual-reference-review.json` only with actual observations and comparisons, and register its review and capture artifacts in `qa/evidence-index.json` for Q08/C4 according to monitoring/FORMAT.md.

Keep raw geographic data under a project data directory used by import tools. Generate compact reviewed world packages into the runtime asset directory. Raw XML, survey references, and contributor metadata do not belong in the initial mobile download merely because the builder needs them.

Run the ledger checker from the application root. For the default layout, first enter `game/`; the source and handoff helpers in Section 3 still run from the handoff root.

```bash
python3 monitoring/verify_run.py --root . --status qa/status.json --requirements requirements.json --scope scope-manifest.json --evidence qa/evidence-index.json
```

The initial report should be structurally valid and explicitly not ready. Add `--release` only when assessing release readiness. A complete release requires current evidence for the whole selected network and both Android and iOS.

## 5. Runtime and version policy

At preparation time, Vite's official guide lists Node.js 20.19+ or 22.12+ as its minimum version ranges and warns that some templates need higher versions. Treat those as documented minimums for the guide checked on 17 October 2026, not a recommendation to choose an unsupported Node release. Select a currently supported compatible LTS when building, verify package engine ranges, and record the actual versions.

Pin the chosen Three.js version, physics library, TypeScript, build tools, model/texture decoders, and browser test tools through the appropriate manifest and lockfile. Use one package manager. Match Three.js addons to the engine version. Verify actual support for the chosen compression and font pipeline.

Use local caches and reproducible imports. The timed game should load prepared world packages from its application hosting, with coherent versioning for geometry, routing, collision, names, and assets. Public OSM and imagery endpoints are development acquisition sources.

## 6. Browser, phone, and hosting workflow

The builder should create and test a production build as well as a development build. Serve it through an HTTP development or preview server. Document the actual origin, port, network binding, base path, and HTTPS requirements of any installed or offline features.

Use available browser tools to play the implementation, capture errors, inspect loading, and test responsive controls. Emulated device dimensions and touch events are a distinct evidence class from physical-device testing. Record actual model, OS, browser, orientation, quality preset, temperature/power context where observable, test duration, frame-time data, and interruptions during physical tests.

Inspect the user-selected [Whiteout reference](https://whiteout.plgb.chatgpt.site/) according to [GRAPHICS_REFERENCE_WHITEOUT.md](GRAPHICS_REFERENCE_WHITEOUT.md). Preparation reached its opening interface, but the browser could not create a WebGL context, so gameplay graphics and performance were not observed. The receiving agent must inspect actual gameplay in a capable browser before establishing its gameplay visual rubric, then compare the running Hyderabad build with the inspected reference. Keep an inaccessible comparison blocked under the existing Q08 acceptance check and C4 gate while independent implementation continues. A page title, text fetch, or URL in the prompt does not establish visual access.

The required release is mobile-browser play with physical Android and iOS validation. Touch controls and a native-like presentation do not establish installed native packaging, app-store readiness, or phone performance. Any later native packaging requires its own implementation and validation.

Use an already authorized preview workflow when the agent's environment provides one. A local server URL is local to that environment and must be labeled accordingly. This handoff does not assume an account or grant permission to buy a domain, start paid hosting, publish an app-store listing, or upload private project content to a new external service. Prepare deployment-ready output and identify any final hosting input when it is unavailable.

## 7. Checkpoint and continuation contract

Maintain an active `IMPLEMENTATION_STATUS.md` checklist with the actual project paths, requirement IDs, owners, running command or agent IDs, completed evidence, blockers, and next actions. Use owned parallel tasks where useful and integrate their results before claiming the affected requirements pass. Save source, lockfile, scripts, configuration, raw-source identities, content manifests, and evidence after meaningful milestones. Record the current command that starts the playable app and the current achieved release level. Commit only through an available authorized repository workflow.

Await or poll running commands and subagents, collect their results, and record any explicit cancellation or failure. Do not launch duplicates because a job is quiet or declare completion with required work still pending. Progress updates should accompany concrete work and lead to the next unblocked checklist item. This kit does not install an unattended supervisor. An optional authorized supervisor may make at most three consecutive continuation attempts on the same unchanged task without substantive progress, as described in CLAUDE_CODE_SETUP.md; it then diagnoses the stall, records the blocker, and continues independent work instead of repeating indefinitely.

Before context compaction, a long operation, or an execution limit, preserve the checklist, revision, exact commands, job state, source versions, failures, and a specific continuation note. If the context or execution budget ends, leave the runnable checkpoint at the achieved stage. Separate the work completed from the remaining requested network. A missing physical phone, capture, reference inspection, or credential should block the corresponding evidence claim while independent code, art, and import work continues.

## Official references

- [Vite getting started and compatibility](https://vite.dev/guide/)
- [Node.js release lifecycle](https://nodejs.org/en/about/previous-releases)
- [Three.js installation](https://threejs.org/manual/en/installation.html)
- [Three.js documentation](https://threejs.org/docs/)
- [Playwright device emulation](https://playwright.dev/docs/emulation)
- [Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)
