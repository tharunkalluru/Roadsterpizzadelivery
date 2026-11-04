import type { LevelConfig } from '../core/types';

export interface CampaignScenario {
  id: string;
  title: string;
  manualSteps: readonly string[];
  negativeTrial: string;
  requiredFacts: readonly string[];
  visualChecks: readonly string[];
  artIds: readonly string[];
}

/** Acceptance instructions, not a completion script. The game still owns every
 * movement, pickup and handover. Future content remains playable without a QA
 * entry, but must acquire one before it can be called fully tested. */
export const CAMPAIGN_SCENARIOS: readonly CampaignScenario[] = [
  { id: 'sandalwood-special', title: 'Pushpa · Enclosed moving container',
    manualSteps: ['Jump-grab a carrier slice and follow the actual truck.', 'Reach its rear marker on the road; watch the automatic ramp entry and physical handoff without driving input.', 'Remain inside with Pushpa until Next; Next must show loading and a prepared road within four kilometres of the next delivery, without a truck-exit detour.'],
    negativeTrial: 'Try a delivery from the roof or side; it must fail without consuming progress.',
    requiredFacts: ['container-closed', 'ramp-open', 'truck-interior-contact', 'manual-handoff', 'truck-exit'],
    visualChecks: ['Closed corrugated container, roomy aisle, sandalwood logs and reading corner.', 'Recognizable seated Pushpa reading Japanese; handoff does not erase the truck beneath the car.'], artIds: ['pushpa-raj'] },
  { id: 'train-top-table', title: 'Ram · Vande Bharat roof',
    manualSteps: ['Catch an order, fly to the marked moving train and land manually on any real coach; include a separate rear-coach trial.', 'Only actual roof contact starts the automatic ride across coach joins and physical handoff beside Ram.', 'Remain aboard to view him until Next; separately inspect terminal dwell/reverse continuity.'],
    negativeTrial: 'A nearby road or a flyby above the train cannot count as train-roof arrival.',
    requiredFacts: ['rail-roof-contact', 'rail-multiple-coaches', 'manual-handoff'],
    visualChecks: ['All coaches remain visible on continuous real tracks; no roof gap traps the car.', 'VVR Ram likeness/wardrobe and grounded figure remain stable through reversals.'], artIds: ['ram-vvr'] },
  { id: 'devara-depths', title: 'Devara · Hussain Sagar tableau',
    manualSteps: ['Fly or drive to the actual lake surface marker.', 'Watch the automatic dive, intact skeleton tableau and physical pizza placement without a Dive or Drop press.', 'Remain underwater with Devara until Next; loading leads directly to the next prepared road, without mandatory resurfacing.'],
    negativeTrial: 'An unrelated land position or a distant pass over the lake cannot complete an underwater delivery.',
    requiredFacts: ['dive-action', 'submerged-player', 'skeleton-scene', 'pizza-placement', 'resurfaced', 'manual-handoff'],
    visualChecks: ['Devara is behind the intact skeleton, hands on its neck, framed ahead of the Roadster.', 'Correct Devara likeness, costume and fixed grip survive the handover.'], artIds: ['devara'] },
  { id: 'paradise-rope-bucket', title: 'Odela · Paradise bucket',
    manualSteps: ['Approach the public restaurant frontage on the ground.', 'Watch the automatic stop, visible pizza transfer and attached winch returning the bucket to the actual roof.', 'Inspect the rooftop Odela model in the retained scene; only Next advances.'],
    negativeTrial: 'An early press or a hovering car cannot complete the delivery.',
    requiredFacts: ['bucket-lowered', 'pizza-in-bucket', 'bucket-raised', 'grounded-arrival', 'manual-handoff'],
    visualChecks: ['Existing restaurant facade is retained; roof cable is attached, basket is large and open.', 'Pizza remains visible throughout the lift; the released Odela model stands on the real roof and is clearly framed during the held view.'], artIds: ['srikanth-odela'] },
  { id: 'arundhati-haunted-gate', title: 'Arundhati · Haunted gate',
    manualSteps: ['Drive from the street into the clear front approach.', 'Watch the automatic stop and physical pizza placement outside the iron gate.', 'Inspect Arundhati behind the gate until Next; no automatic departure is required.'],
    negativeTrial: 'Jumping or hovering over the gate must not permit a handover.',
    requiredFacts: ['grounded-arrival', 'haunted-gate', 'manual-handoff'],
    visualChecks: ['Haunted property, webs, gate and aged scenery are legible from the driving camera.', 'Arundhati appears behind the gate in the correct film appearance.'], artIds: ['arundhati'] },
  { id: 'jessie-walking-delivery', title: 'Jessie · Walking handover',
    manualSteps: ['Find Jessie on the actual quiet residential road and reach her marker.', 'Watch the car automatically follow alongside her walking direction and pass the pizza while both move.', 'Observe a full natural walking cycle and the retained character view before Next.'],
    negativeTrial: 'A parked car, opposing movement, airborne car or missed reach must not complete.',
    requiredFacts: ['grounded-arrival', 'alongside-movement', 'authored-walk', 'manual-handoff'],
    visualChecks: ['Blue saree, loose hair and Ye Maaya Chesave resemblance.', 'Feet contact the street with natural gait; no sliding rigid body or teleport at path ends.'], artIds: ['jessie'] },
  { id: 'hasini-college-gate', title: 'Hasini · College entrance',
    manualSteps: ['Follow the location marker to the actual college front approach.', 'Watch the automatic stop and physical handoff to Hasini behind the pillar/gate.', 'View the retained character until Next.'],
    negativeTrial: 'Do not allow delivery from an adjacent roof or while jumping.',
    requiredFacts: ['grounded-arrival', 'college-gate', 'manual-handoff'],
    visualChecks: ['The entrance remains clear of real roads/buildings.', 'Bommarillu Hasini is recognizable and positioned behind the gate/pillar.'], artIds: ['hasini'] },
  { id: 'bhanumathi-wedding-street', title: 'Bhanumathi · Street wedding',
    manualSteps: ['Reach the moving village-street procession marker.', 'Watch the automatic slow approach and physical handoff to dancing Bhanumathi.', 'Inspect natural dancers and the retained scene until Next, without a crowd collision trap.'],
    negativeTrial: 'Road-speed or airborne handovers must fail harmlessly.',
    requiredFacts: ['street-procession', 'crowd-animation', 'authored-dance', 'grounded-arrival', 'manual-handoff'],
    visualChecks: ['This is a wedding procession on a village street, not a static wedding venue.', 'Fidaa Bhanumathi dances with articulated limbs and remains recognizable during the handoff.'], artIds: ['bhanumathi'] },
  { id: 'sukumar-angle-parking', title: 'Sukumar · 45-degree parking',
    manualSteps: ['Reach the production-courtyard marker from the real street.', 'Watch the automatic parking alignment at 45 degrees and physical handoff inside the marked bay.', 'Inspect Sukumar in the retained completed scene before Next.'],
    negativeTrial: 'Correct yaw in an adjacent bay, excess speed or more than eight degrees error must fail.',
    requiredFacts: ['bay-aligned', 'grounded-arrival', 'manual-handoff'],
    visualChecks: ['The angled bay, studio entrance and handoff point are readable.', 'Sukumar resembles the approved real director reference.'], artIds: ['sukumar'] },
  { id: 'vakeel-next-station', title: 'Vakeel Saab · Real metro ride',
    manualSteps: ['Fly onto the marked departing metro and land manually on an actual roof; no automatic boarding is allowed.', 'Watch the automatic ride to its next different station and the car clearing the coach side before lowering onto the actual platform.', 'Watch the lawyer and three women exit the real door and receive the pizza; inspect all four until Next.'],
    negativeTrial: 'Direct flight to a platform, terminal standing train or falling off before arrival cannot unlock delivery.',
    requiredFacts: ['metro-roof-contact', 'metro-next-station', 'four-exit-anchors', 'authored-metro-exit', 'grounded-arrival', 'manual-handoff'],
    visualChecks: ['Four visible correct-film people exit the proper door onto the physical platform.', 'Vakeel Saab lawyer costume, three companion appearances and natural walking are independently approved.'], artIds: ['vakeel-saab', 'vakeel-woman-1', 'vakeel-woman-2', 'vakeel-woman-3'] },
  { id: 'maruthi-villa-79', title: 'Maruthi · Villa 79',
    manualSteps: ['Drive to the public entrance near the requested Kondapur community.', 'Reach the Villa 79 marker and watch the automatic stop and physical handoff.', 'Inspect the retained director before Next.'],
    negativeTrial: 'A hovering car or a remote press cannot deliver.',
    requiredFacts: ['villa-identity', 'grounded-arrival', 'manual-handoff'],
    visualChecks: ['Villa number and frontage read clearly; scenery does not pretend to verify a private address.', 'The director is recognizable.'], artIds: ['maruthi'] },
  { id: 'salaar-inner-compound', title: 'Salaar · Fortified compound',
    manualSteps: ['Reach the front marker from the real road and watch the heavy gates slide clear.', 'Watch the car automatically pass through the actual opening and deliver inside the courtyard.', 'Inspect the released Salaar model until Next; loading must go directly to the next road without a compound-exit detour.'],
    negativeTrial: 'An outside-gate press, hovering car or blocked gate gap cannot count as an inner-courtyard delivery.',
    requiredFacts: ['gate-open', 'courtyard-entry', 'manual-handoff', 'compound-exit'],
    visualChecks: ['Tall fortified industrial walls evoke the approved fictional Salaar set.', 'Gates and colliders agree; the released Salaar model is physically present and clearly framed inside the retained courtyard.'], artIds: ['prabhas-salaar'] },
  { id: 'arjun-classroom', title: 'Arjun Reddy · Medical classroom',
    manualSteps: ['Drive to the clear medical-college courtyard and reach the marker.', 'Watch the automatic stop and physical handoff outside the recognizable classroom doorway.', 'View Arjun in the retained scene before Next.'],
    negativeTrial: 'No delivery from a nearby roof, mid-jump or remote spot.',
    requiredFacts: ['classroom-doorway', 'grounded-arrival', 'manual-handoff'],
    visualChecks: ['A doorway/room identity and medical classroom context replace an isolated number post.', 'Arjun Reddy appearance matches the film reference.'], artIds: ['arjun-reddy'] },
  { id: 'between-overs', title: 'Nani · Uppal Stadium',
    manualSteps: ['Reach the actual stadium delivery marker.', 'Watch the automatic landing/positioning on the existing turf and physical handoff during the real break-between-overs window.', 'View Nani until Next; then inspect the restaurant opening and Explore action.'],
    negativeTrial: 'A wrong beat, airborne car or outside-stadium press must fail without a penalty.',
    requiredFacts: ['real-stadium-surface', 'valid-timing-window', 'grounded-arrival', 'manual-handoff', 'final-opening'],
    visualChecks: ['Original oval field, wicket, stands and floodlights remain; no roads/traffic or duplicate pitch.', 'Jersey Nani is recognizable and physically present at the handoff.'], artIds: ['nani-jersey'] },
];

export const campaignScenario = (id: string) => CAMPAIGN_SCENARIOS.find(scenario => scenario.id === id);
/** The same scenery also supports the older call/manual-drop campaign. Its
 * proof must not silently become automatic just because the current content
 * uses NONE. These are acceptance rules, never gameplay commands. */
export function campaignRequiredFacts(level: Pick<LevelConfig, 'id' | 'callMode'>, final: boolean) {
  const scenario=campaignScenario(level.id);if(!scenario)return [];
  if(level.callMode!=='NONE')return [...scenario.requiredFacts];
  const replaced=new Set(['manual-handoff','truck-exit','compound-exit','resurfaced','dive-action','rail-multiple-coaches']);
  return [...scenario.requiredFacts.filter(fact=>!replaced.has(fact)),
    ...(level.id==='devara-depths'?['automatic-dive']:[]),
    'story-captured','physical-pizza-transfer','automatic-handoff','story-viewing-hold',
    ...(final?['final-next-requested']:['next-requested','direct-next-transition','next-loading','next-road-ready'])];
}
export function campaignScenarioURL(level: Pick<LevelConfig, 'level'>, touch = false) {
  const query = new URLSearchParams({ qaDelivery: String(level.level), qaScene: '1', qaCampaign: '1', q: 'low' });
  if (touch) query.set('qaTouch', '1');
  if (level.level === 2) query.set('qaTrainRide', '1');
  return '/?' + query;
}
