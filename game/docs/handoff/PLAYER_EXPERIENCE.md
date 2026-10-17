# Hyderabad Metro Delivery: Player Experience and UX Contract

Version: 1.0  
Prepared: 17 October 2026  
Status: proposed player experience, not a claim that the game is implemented or tested

Read this with `MASTER_PROMPT.md`, `config/project-contract.json`, and `config/flight-budget.json`. Those files define the implementation and resource invariants. This document translates them into the experience a player sees, controls, and understands. UI wording, introductory sequencing, and presentation choices identified as proposed defaults may be refined through playtesting without changing the user's core rules.

## 1. The experience we are creating

You are a local delivery driver using a Roadster-inspired car with limited flight power. You accept a parcel, drive real Hyderabad roads through busy traffic, decide when flight is worth spending, and stop at the correct delivery entrance before the deadline. Learning the place and making better decisions should make repeat runs satisfying.

The requested world covers selected connected streets near all three operating metro corridors, including useful real deviations and delivery spurs. Uppal, Stadium, NGRI, Habsiguda, and Tarnaka anchor the first corridor. A short first slice and that corridor are internal milestones, not a replacement for the full requested scope. Preserve real geographic scale and road connections.

This is a mobile browser game with native-like touch behavior. It does not require an account, payment, location permission, or an installed application. References to future screens below describe intended behavior.

## 2. First launch and getting ready

You open the game and see a recognizable local road scene or an accurate preview of an available area. The home screen has Play, Practice, the selected corridor, and Settings. Returning players also see Continue when a compatible unfinished contract exists. Credits and data attribution remain accessible without obstructing play.

Proposed default: start as a guest and save settings, progress, and personal records locally. Explain local saving in Settings. If storage is unavailable, offer session-only play with a concise notice. Do not prevent the first delivery.

The game checks device support and loads the selected area's required content before a countdown begins. Show real progress or meaningful stages, such as “Loading Uppal area” and “Preparing the road.” A failed load offers Retry and Back. Downloading the world never spends delivery time or flight power.

The driving view is designed for landscape, with usable portrait menus. Suggest rotation without requiring successful orientation locking. Activate sound after the user's gesture; muted play must work completely.

## 3. Optional practice

Proposed default: offer a short practice that can be skipped and replayed. Teach steering and braking first, then stopping, a useful flight, and an early landing. Use a suitable real section rather than rearranging geography to fit the lesson.

Practice has its own resource allocation. Starting the first scored delivery creates a fresh contract with 25 seconds. Explaining a new control can pause the practice world. Do not leave a timer running behind an instructional popup.

Distribute denied launches, missed turns, and more advanced flight decisions across later contextual lessons. Teach one useful action at a time. A returning player can go directly to a job.

## 4. Choosing and starting a job

The job card shows the actual pickup and destination, selected road route, distance, tested expected commitment, deadline, traffic level, cargo sensitivity, and flight allocation. A multi-stop card explains stop order and that one flight allowance covers the whole contract.

Show only implemented missions as playable. A broader map can show planned areas distinctly, without presenting unfinished locations as working destinations. Station names provide orientation; pickup and drop markers use validated road entrances or stopping areas.

You select a job, wait for its required content, inspect the preview, and find the car staged at its accessible pickup point. You press Start delivery. A short countdown gives time to position your thumbs. The parcel is collected and the timed run begins after the countdown.

Deadline values must come from representative driving on the actual route. Standard deliveries remain achievable entirely on the ground. Short sessions use shorter real routes; a full Uppal-to-Tarnaka journey retains its actual scale.

## 5. Driving and reading the street

Proposed controls: your left thumb steers; the car accelerates automatically; your right thumb uses Brake and Fly. A clearly indicated low-speed Reverse control becomes available when nearly stopped. Emergency braking must not unexpectedly engage reverse. Desktop controls produce the same actions.

The chase camera lets you see the next maneuver, vehicles ahead, and overhead structures. The HUD prioritizes delivery time remaining, the next turn, flight seconds, and cargo when relevant. Keep secondary details out of the central driving view.

Traffic feels busy through readable behavior: bikes find sufficient gaps, an auto moves toward a curb, a bus starts a wide turn, and a pedestrian waits before crossing. These are supported scene behaviors, not assertions about specific real locations. Give time and space to respond. Braking and waiting must remain useful choices.

A compact route cue guides you. Opening the full map pauses the single-player world. A missed turn produces a feasible correction on actual connected roads. Supported deviations recalculate naturally; they cannot create a shortcut through a median, building, or different road level.

## 6. Understanding the shared flight allowance

The normal job begins at **Flight 25.0 s**. Explicitly configured jobs may advertise 20 or 30 seconds before acceptance. The chosen allocation stays fixed for the whole contract.

You can use it continuously on an eligible stretch or divide it across flights. There is no four-second launch limit. Takeoff, movement, hovering, air braking, coasting, and descent all consume the same allowance. Ground driving, landing, waiting, recovery, and intermediate deliveries never recharge it. No activation tax or pickup secretly changes the balance.

On the ground, pressing Fly first checks clearance and an affordable landing plan. A rejected press consumes nothing and shows the actual reason. It does not queue a launch for later. After an accepted takeoff, the control becomes Land. A fresh press requests descent; holding the original launch press cannot immediately cancel it.

You continue steering while assisted controls manage altitude and attitude. Flight follows the supported road network and permitted transitions. Roofs, rail tracks, sidewalks, opposing carriageways, and unbuilt neighboring areas are not landing shortcuts.

The flight meter shows a landing-reserve segment inside the remaining balance. This segment is not bonus power. The landing footprint communicates clear, uncertain, or blocked with symbols and text as well as color. Moving traffic makes it a forecast rather than a guarantee.

When the remaining balance approaches the time needed to land, “Landing soon” explains assisted descent. Steering and braking remain available within feasible limits. Landing early preserves only the time genuinely left after touchdown. If an immediate descent is unavailable, explain why and maintain the existing affordable plan.

A small remainder may be insufficient for another safe launch. Keep it visible and explain the restriction. Reaching zero after valid touchdown leaves you free to drive. An unsupported exhausted car enters explained recovery; it receives no free glide or emergency flight extension.

## 7. An illustrative longer delivery

This example describes intended decisions, not verified hazard placements, business identities, route timing, or measured gameplay. Attach encounters only where the completed geography supports them.

You accept a parcel from a validated pickup near Uppal to an accessible destination in the Tarnaka area. The card shows the measured route and tested deadline. Station-area landmarks help you recognize progress through Stadium, NGRI, and Habsiguda.

Early in the run, a queue forms on a section with adequate flight space. You could wait, follow an available ground path, or fly. You launch, steer along the supported road, and land after six seconds including ascent and descent. The meter now reads 19.0 seconds.

Later, a low overhead structure makes Fly unavailable. “Low clearance” appears without spending power. You brake and proceed on the road. At a real junction, a supported reconnecting side road offers a longer but less congested option. You can inspect the paused map before choosing.

On another suitable section, you spend seven seconds in a second flight, leaving twelve. You now face a genuine resource choice: use that remainder here or keep it for the final approach. A third flight lasting eight seconds would leave four. None of these individual durations is a required cap.

You could instead have spent almost all 25 seconds in one continuous eligible flight. The rest of the contract would still have a ground route and a tested standard deadline. The delivery is not scripted to demand power at a later point.

## 8. Reaching the destination

As you approach, navigation identifies the correct frontage, entrance, carriageway, and road level. Being above the marker on a flyover or flying over it does not finish the job. Missing the approach produces a real return route.

The stopping area is generous enough for mobile control and says “Stop here to deliver.” Intentionally slowing below the configured threshold inside it begins a visible hold. The master prompt proposes approximately one stable second below one metre per second. These are tuning defaults, not measured outcomes.

Automatic acceleration suspends during the hold. Passing through at speed cannot capture or abruptly stop the car. An explicit cancel or resume-driving action releases the hold. The car must remain grounded, correctly positioned, within the deadline, and above the cargo failure threshold.

The handoff completes without requiring a walking game. Intermediate stops keep the contract active and timed. They preserve the same flight balance. Traffic must not permanently block every valid delivery space.

## 9. Mistakes, recovery, and failure

Small mistakes should be understandable and recoverable. A light scrape can reduce speed and modestly affect cargo. Rough surfaces and hard landings have visible, bounded consequences. One sustained contact must not charge damage repeatedly each frame.

Severe crashes, invalid landings, or manual stuck recovery return you to previously reached valid road space. Recovery cannot advance the route, erase elapsed time, refill flight, or restore consumed cargo. The starting proposal is one three-second time penalty plus the event's disclosed cargo consequence. Freeze the short recovery presentation so it does not add another hidden time charge.

Contact with a pedestrian or vendor produces a non-graphic interruption and penalty, never a reward. Technical interruptions are handled separately and do not receive a crash penalty.

The initial game uses a hard deadline. Expiry before a valid completed stop, or cargo reaching its failure threshold, ends the contract with a specific explanation. A qualifying stop completed on time can succeed; a disqualifying contact at the same moment takes precedence.

Results offer a full retry. That begins a new run and resets time, cargo, stop progress, traffic state, penalties, and flight together. Recovery inside a run never performs this reset.

## 10. Results, replay, and the next job

Lead with “Delivered” or the precise failure reason. Show a compact summary of charged time, deadline, cargo condition, flight used, and penalties. Expandable details include active driving time, route distance, launches, recoveries, initial allocation, and remaining power.

Use a small, explained scoring formula. Keep records comparable by mission, world version, difficulty, and relevant conditions. Display them as local personal bests. Do not fabricate online rivals or a global leaderboard.

Proposed default: unused flight is informative rather than a dominant reward. A successful careful delivery that uses most of its allowance should still feel excellent. The goal is thoughtful use of the mechanic, not avoiding it for a score bonus.

Offer Retry same challenge, New variation, Another delivery, and Menu. A nearby next job can continue the sense of place. Choosing a distant pickup may use an explicit pre-contract relocation outside the timer. Starting the new contract supplies its advertised allowance.

Progression introduces completed destinations, contract types, corridor packages, and optional cosmetics. Basic controls and the core flight budget work from the beginning. No mandatory energy wait prevents another delivery.

## 11. Pausing, interruptions, and returning later

Pause freezes the car, traffic, delivery time, flight consumption, and mission state together. Opening the full map has the same effect. A compact driving map does not pause. Clear held touches so returning cannot unexpectedly steer or launch.

App switching, phone locking, disruptive rotation, rendering loss, and missing critical road content cause a safe technical pause. On return, restore a consistent world and require a clear Resume action. Do not process the background interval as elapsed driving time.

Continue restores the last complete compatible checkpoint, including consumed flight, time, cargo, and stop progress. If exact resumption is unavailable, explain a checkpoint recovery and mark the run resumed. Preserve fair local-score distinctions. Do not promise that a movement lost before saving survived.

If a save is incompatible or damaged, explain what happened and offer a fresh run while preserving unrelated settings and progress where possible. Denied storage still permits session-only play.

Downloaded, validated content may work offline. An unavailable corridor clearly says it requires downloading. Updates occur between missions rather than replacing part of the road during a run. The experience must not imply an installed native app or guaranteed offline coverage that has not been delivered.

## 12. Settings, accessibility, and useful wording

Provide steering sensitivity, sound channels, haptic toggle, reduced shake, reduced flashing, readable text, and graphics choices. Proposed optional handedness layouts should preserve simultaneous steering and action input. Critical information remains visible with audio muted, haptics unavailable, and reduced graphics. Color alone cannot communicate a blocked landing or low resource.

Pause before changing a layout that invalidates held controls. Settings must not secretly change the accepted deadline or allocation. Any later relaxed rules belong to an explicitly described mode with separate records.

| Situation | Suggested player-facing wording |
|---|---|
| Ready | “Parcel loaded. Start when ready.” |
| Remaining budget | “Flight 18.4 s” |
| Flight introduction | “25 seconds for this whole delivery. Use it together or in parts.” |
| Clearance denial | “Low clearance.” |
| Partial budget denial | “Not enough flight time to launch here.” |
| Landing commitment | “Landing soon.” |
| Empty allocation | “Flight power used. Keep driving.” |
| Unsupported branch | “Outside delivery area. Follow the marked return.” |
| Technical load pause | “Road still loading. Your delivery is paused.” |
| Resumed checkpoint | “Restored from your last saved checkpoint.” |
| Destination | “Stop here to deliver.” |
| Deadline failure | “Time ran out before delivery.” |

The complete experience should leave the player understanding what happened, which decision mattered, and how another attempt could improve. Preserve the place, the shared resource, and readable consequences throughout.
