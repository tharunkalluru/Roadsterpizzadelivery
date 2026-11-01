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
    manualSteps: ['Jump-grab a carrier slice and follow the actual truck.', 'Approach its rear while moving; wait for the doors to form a ramp.', 'Drive up the ramp and inside; slow relative to the truck and hand over manually.', 'Continue, reverse down the still-present ramp and leave the moving truck.'],
    negativeTrial: 'Try a delivery from the roof or side; it must fail without consuming progress.',
    requiredFacts: ['container-closed', 'ramp-open', 'truck-interior-contact', 'manual-handoff', 'truck-exit'],
    visualChecks: ['Closed corrugated container, roomy aisle, sandalwood logs and reading corner.', 'Recognizable seated Pushpa reading Japanese; handoff does not erase the truck beneath the car.'], artIds: ['pushpa-raj'] },
  { id: 'train-top-table', title: 'Ram · Vande Bharat roof',
    manualSteps: ['Catch an order, fly to the moving train and land on a rear coach.', 'Drive across coach joins using normal acceleration/braking to reach Ram.', 'Stop beside him and hand over manually.', 'Remain aboard through a route terminal to inspect dwell/reverse continuity.'],
    negativeTrial: 'A nearby road or a flyby above the train cannot count as train-roof arrival.',
    requiredFacts: ['rail-roof-contact', 'rail-multiple-coaches', 'manual-handoff'],
    visualChecks: ['All coaches remain visible on continuous real tracks; no roof gap traps the car.', 'VVR Ram likeness/wardrobe and grounded figure remain stable through reversals.'], artIds: ['ram-vvr'] },
  { id: 'devara-depths', title: 'Devara · Hussain Sagar tableau',
    manualSteps: ['Fly or drive to the actual lake marker without automatic diving.', 'Tap Dive, wait for normal underwater movement, then approach the tableau.', 'Place the pizza manually and wait for actual safe surfacing.'],
    negativeTrial: 'Do not press Dive initially: the car must remain at the surface and the level must stay incomplete.',
    requiredFacts: ['dive-action', 'submerged-player', 'skeleton-scene', 'pizza-placement', 'resurfaced', 'manual-handoff'],
    visualChecks: ['Devara is behind the intact skeleton, hands on its neck, framed ahead of the Roadster.', 'Correct Devara likeness, costume and fixed grip survive the handover.'], artIds: ['devara'] },
  { id: 'paradise-rope-bucket', title: 'Odela · Paradise bucket',
    manualSteps: ['Approach the public restaurant frontage on the ground.', 'Watch the roof winch lower an open bucket.', 'Stop beside it, place the pizza manually and watch it travel back to the roof.'],
    negativeTrial: 'An early press or a hovering car cannot complete the delivery.',
    requiredFacts: ['bucket-lowered', 'pizza-in-bucket', 'bucket-raised', 'grounded-arrival', 'manual-handoff'],
    visualChecks: ['Existing restaurant facade is retained; roof cable is attached, basket is large and open.', 'Pizza remains visible in the basket throughout the lift. No Odela face is required.'], artIds: [] },
  { id: 'arundhati-haunted-gate', title: 'Arundhati · Haunted gate',
    manualSteps: ['Drive from the street into the clear approach.', 'Stop outside the iron gate and leave the pizza manually.', 'Drive away; no collection animation is required.'],
    negativeTrial: 'Jumping or hovering over the gate must not permit a handover.',
    requiredFacts: ['grounded-arrival', 'haunted-gate', 'manual-handoff'],
    visualChecks: ['Haunted property, webs, gate and aged scenery are legible from the driving camera.', 'Arundhati appears behind the gate in the correct film appearance.'], artIds: ['arundhati'] },
  { id: 'jessie-walking-delivery', title: 'Jessie · Walking handover',
    manualSteps: ['Find Jessie on the actual quiet residential road.', 'Follow alongside her at walking speed with the car facing its direction of travel.', 'Hand over while both continue moving; observe a full walking cycle.'],
    negativeTrial: 'A parked car, opposing movement, airborne car or missed reach must not complete.',
    requiredFacts: ['grounded-arrival', 'alongside-movement', 'authored-walk', 'manual-handoff'],
    visualChecks: ['Blue saree, loose hair and Ye Maaya Chesave resemblance.', 'Feet contact the street with natural gait; no sliding rigid body or teleport at path ends.'], artIds: ['jessie'] },
  { id: 'hasini-college-gate', title: 'Hasini · College entrance',
    manualSteps: ['Follow the location marker to the actual college approach.', 'Park near Hasini behind the pillar/gate and hand over manually.'],
    negativeTrial: 'Do not allow delivery from an adjacent roof or while jumping.',
    requiredFacts: ['grounded-arrival', 'college-gate', 'manual-handoff'],
    visualChecks: ['The entrance remains clear of real roads/buildings.', 'Bommarillu Hasini is recognizable and positioned behind the gate/pillar.'], artIds: ['hasini'] },
  { id: 'bhanumathi-wedding-street', title: 'Bhanumathi · Street wedding',
    manualSteps: ['Approach the moving street procession slowly.', 'Follow its clear central lane and inspect background dancers.', 'Hand over to dancing Bhanumathi and leave without a crowd collision trap.'],
    negativeTrial: 'Road-speed or airborne handovers must fail harmlessly.',
    requiredFacts: ['street-procession', 'crowd-animation', 'authored-dance', 'grounded-arrival', 'manual-handoff'],
    visualChecks: ['This is a wedding procession on a village street, not a static wedding venue.', 'Fidaa Bhanumathi dances with articulated limbs and remains recognizable during the handoff.'], artIds: ['bhanumathi'] },
  { id: 'sukumar-angle-parking', title: 'Sukumar · 45-degree parking',
    manualSteps: ['Drive into the production courtyard from the real street.', 'Use normal forward/reverse/steering to park inside the marked bay at 45 degrees.', 'Stop and deliver; repeat once from a near-miss parking angle.'],
    negativeTrial: 'Correct yaw in an adjacent bay, excess speed or more than eight degrees error must fail.',
    requiredFacts: ['bay-aligned', 'grounded-arrival', 'manual-handoff'],
    visualChecks: ['The angled bay, studio entrance and handoff point are readable.', 'Sukumar resembles the approved real director reference.'], artIds: ['sukumar'] },
  { id: 'vakeel-next-station', title: 'Vakeel Saab · Real metro ride',
    manualSteps: ['Fly onto the eligible real departing metro roof and land.', 'Stay aboard until its next different station; do not teleport to the platform.', 'Watch the lawyer and three women step out from an actual door in sequence.', 'Land on the platform and hand over manually.'],
    negativeTrial: 'Direct flight to a platform, terminal standing train or falling off before arrival cannot unlock delivery.',
    requiredFacts: ['metro-roof-contact', 'metro-next-station', 'four-exit-anchors', 'authored-metro-exit', 'grounded-arrival', 'manual-handoff'],
    visualChecks: ['Four visible correct-film people exit the proper door onto the physical platform.', 'Vakeel Saab lawyer costume, three companion appearances and natural walking are independently approved.'], artIds: ['vakeel-saab', 'vakeel-woman-1', 'vakeel-woman-2', 'vakeel-woman-3'] },
  { id: 'maruthi-villa-79', title: 'Maruthi · Villa 79',
    manualSteps: ['Drive to the public entrance near the requested Kondapur community.', 'Stop by the visible Villa 79 marker and hand over.'],
    negativeTrial: 'A hovering car or a remote press cannot deliver.',
    requiredFacts: ['villa-identity', 'grounded-arrival', 'manual-handoff'],
    visualChecks: ['Villa number and frontage read clearly; scenery does not pretend to verify a private address.', 'The director is recognizable.'], artIds: ['maruthi'] },
  { id: 'salaar-inner-compound', title: 'Salaar · Fortified compound',
    manualSteps: ['Approach from the road and watch the heavy gates slide clear.', 'Drive through the actual opening into the courtyard.', 'Deliver inside, then drive back through the opening and leave.'],
    negativeTrial: 'An outside-gate press, hovering car or blocked gate gap cannot count as an inner-courtyard delivery.',
    requiredFacts: ['gate-open', 'courtyard-entry', 'manual-handoff', 'compound-exit'],
    visualChecks: ['Tall fortified industrial walls evoke the approved fictional Salaar set.', 'Gates/colliders agree and the entire car exits. No Prabhas model is required.'], artIds: [] },
  { id: 'arjun-classroom', title: 'Arjun Reddy · Medical classroom',
    manualSteps: ['Drive to the clear medical-college courtyard.', 'Approach the recognizable classroom doorway and hand over outside.'],
    negativeTrial: 'No delivery from a nearby roof, mid-jump or remote spot.',
    requiredFacts: ['classroom-doorway', 'grounded-arrival', 'manual-handoff'],
    visualChecks: ['A doorway/room identity and medical classroom context replace an isolated number post.', 'Arjun Reddy appearance matches the film reference.'], artIds: ['arjun-reddy'] },
  { id: 'between-overs', title: 'Nani · Uppal Stadium',
    manualSteps: ['Fly into the actual stadium and land on its existing turf.', 'Wait for the live break-between-overs window, then drop manually.', 'Observe the completed restaurant opening and return to free roam on the same field.'],
    negativeTrial: 'A wrong beat, airborne car or outside-stadium press must fail without a penalty.',
    requiredFacts: ['real-stadium-surface', 'valid-timing-window', 'grounded-arrival', 'manual-handoff', 'final-opening'],
    visualChecks: ['Original oval field, wicket, stands and floodlights remain; no roads/traffic or duplicate pitch.', 'Jersey Nani is recognizable and physically present at the handoff.'], artIds: ['nani-jersey'] },
];

export const campaignScenario = (id: string) => CAMPAIGN_SCENARIOS.find(scenario => scenario.id === id);
export function campaignScenarioURL(level: Pick<LevelConfig, 'level'>, touch = false) {
  const query = new URLSearchParams({ qaDelivery: String(level.level), qaScene: '1', qaCampaign: '1', q: 'low' });
  if (touch) query.set('qaTouch', '1');
  if (level.level === 2) query.set('qaTrainRide', '1');
  return '/?' + query;
}
