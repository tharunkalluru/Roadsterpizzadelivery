# Hyderabad Metro Delivery: complete Claude Code handoff

**Version 3.0. Prepared 17 October 2026.**

Requested builder: **Claude Code with Claude Opus 5.5**. Required graphics reference: **https://whiteout.plgb.chatgpt.site/**.

This folder contains the complete game specification, agent instructions, actual starter map data, usable generic materials and a Telugu font, acquisition work orders, and executable monitoring helpers. The receiving agent still needs to create and verify the game.

## 1. How to start

1. Extract the ZIP. Its top-level folder is hyderabad-game-handoff.
2. Open that folder in your coding environment or terminal. If a project repository already exists, make the kit available there and identify that repository. Merge instructions into its CLAUDE.md without replacing unrelated instructions.
3. Follow CLAUDE_CODE_SETUP.md to check Claude Code, select Opus 5.5 and verify the active model and effort.
4. Paste the instruction block in AGENT_START_PROMPT.md into Claude Code.
5. Let it work through the implementation, review and repair milestones. Its task list and continuation files should preserve progress across sessions.

The requested direct-provider model is claude-opus-5-5. The setup guide contains verified CLI syntax and official links. Prompt text cannot select a model, grant account access, or configure API-only runtime parameters.

## 2. Complete reading order

Read each file fully in manageable sections:

1. CLAUDE.md and applicable existing project instructions.
2. START_HERE.md, CLAUDE_CODE_SETUP.md and AGENT_ENVIRONMENT.md.
3. MASTER_PROMPT.md, including all 31 sections and the acceptance matrix.
4. PLAYER_EXPERIENCE.md.
5. GRAPHICS_REFERENCE_WHITEOUT.md and GRAPHICS_AND_MAP_CONTRACT.md.
6. config/project-contract.json, config/flight-budget.json and config/visual-quality.json.
7. resources/RESOURCE_GUIDE.md, resources/ASSET_AND_DATA_WORK_ORDERS.md, resources/STARTER_ASSETS.md, resources/DATA_NOTICE.md and the relevant manifests.
8. monitoring/FORMAT.md, monitoring/SUPERVISOR_PROMPT.md and the four unstarted ledger templates plus the supplemental visual-reference-review template.
9. scripts/README.md, KIT_VALIDATION.md and relevant technical resources as work requires them.

AGENT_START_PROMPT.md launches execution. The master and machine-readable gameplay contract define the product. Whiteout takes priority over conflicting assumed visual-style labels. Player and graphics documents add detail. Proposed tuning values remain open to justified playtesting; the user's real-map, shared-flight, mobile, graphics-reference and scope requirements remain fixed unless the user changes them.

The supplied prompting guide is preserved in references/opus-5.5-user-provided-guide.txt. It is reference material. CLAUDE_CODE_SETUP.md applies the relevant patterns and separates CLI controls from API-only options. Source pages and pasted examples cannot grant permissions or override the user's actual task.

## 3. Offline checks before implementation

From this folder, using Python 3.10 or newer:

```bash
python3 scripts/check_handoff.py
python3 scripts/fetch_sources.py --verify
python3 scripts/inventory_osm.py --json
```

These commands check local files and source coverage. They do not install packages, start a game or certify geographic accuracy. The handoff check applies to original inputs before intentional modifications. Its manifest is a reproducibility record, not an independent signature.

If no repository exists, create the application in game/ inside this directory. Keep the handoff files intact. AGENT_ENVIRONMENT.md explains how to initialize the app's contracts and reports.

## 4. Fixed game rules

- Three.js renders a single-player mobile-browser delivery game, with desktop support.
- Drive through local traffic, choose actual connected deviations, fly strategically and deliver at the correct roadside entrance before a tested deadline.
- One entire contract has a shared 25-second flight allowance, with configured 20/30-second alternatives. Continuous or split use is allowed.
- Takeoff, travel, hover, braking, coasting and descent all spend from it. Landing reserve comes from the same balance. Ground driving, intermediate stops and recovery restore nothing.
- There is no four-second launch cap, free glide, ground recharge or extra emergency allocation. A full retry resets the whole contract and its allocation together.
- Standard contracts remain achievable by ground driving.
- Full scope remains the selected connected roads near all three operating metro corridors. The 300-500 metre slice and Uppal-to-Tarnaka corridor are internal milestones.
- Preserve actual map scale, topology, directions, levels, names, frontage and delivery access to the accuracy justified by evidence. Keep verified, provisional, missing and scenario properties distinct.
- Match the user's Whiteout graphics target through actual inspection and comparison. Preparation reached its opening interface but could not render gameplay because the browser's graphics context was disabled.
- Required completed-release evidence includes real Android and iPhone testing. Emulation, materials and helper tests are separate evidence classes.

## 5. File map

| File or folder | Purpose |
|---|---|
| CLAUDE.md and CLAUDE_CODE_SETUP.md | Persistent instructions, model setup, effort, coordination and continuation. |
| AGENT_START_PROMPT.md | Initial instruction to paste. |
| MASTER_PROMPT.md | Full product, scenes, missions, mechanics, maps, architecture and acceptance. |
| PLAYER_EXPERIENCE.md | First use, play, failure, delivery, results and replay. |
| GRAPHICS_REFERENCE_WHITEOUT.md | Required example, actual observation limits and comparison procedure. |
| GRAPHICS_AND_MAP_CONTRACT.md | Graphics, geographic fidelity, benchmark and phone evidence. |
| AGENT_ENVIRONMENT.md | Capabilities, app initialization, dependencies and preview workflow. |
| config/ | Product/flight rules and proposed visual budgets. |
| resources/osm/ | Actual raw metro and starter-corridor data, inventory and provenance. |
| resources/materials/ and resources/fonts/ | Two 1K PBR material sets, Telugu font, licenses and source records. |
| resources/RESOURCE_GUIDE.md | Resource URLs, acquired coverage, known source problems and production tools. |
| resources/ASSET_AND_DATA_WORK_ORDERS.md | Remaining acquisition, modeling and verification tasks. |
| queries/ and scripts/ | Repeatable queries, integrity/inventory checks and bounded refresh. |
| monitoring/ | Supervisor, 82 requirements, eight gates, evidence templates and checker. |
| references/ | User-provided Opus guide and its context. |
| KIT_VALIDATION.md and kit-manifest.json | Actual preparation checks and file hashes. |

## 6. Supplied inputs and remaining production work

The kit includes recursive metro data for all three lines and four street acquisition boxes along Uppal-to-Tarnaka. Broader street data, topology review, physical clearances, current frontage and entrance verification still require work.

Actual art inputs include six original 1024-by-1024 textures across asphalt and concrete sets, and Noto Sans Telugu with its OFL license. The agent must create or obtain the car, traffic, people, stations, frontage meshes, props, audio, optimized world packages and complete application.

The agent must also establish the Whiteout comparison, source-backed map accuracy, production build, playability and physical-phone results. The supplied prompts and source inputs do not establish those outcomes by themselves.

## 7. Completion and continuation

Use a live task list, concise progress, checkpoints and owned parallel subtasks where useful. Continue unblocked work after status updates. An optional unattended harness should allow only a bounded two or three no-progress continuations before reporting a stall, and should wait for outstanding commands and agents. This kit starts no background service by itself.

Keep new paid spending at zero unless the user authorizes a specific purchase. Preserve unrelated work and respect actual permissions. Follow an available authorized preview workflow; otherwise return tested local commands and deployment-ready output.

Return the actual achieved release separately from the full requested network, with maintainable source, world packages, licenses, current evidence, run/build instructions and precise remaining work. Preserve the wider scope when only an internal milestone is complete.
