// Dated project evidence. This is a static game snapshot, not a live traffic feed.
// Road locations come from the shipped road geometry. The single-lane work area
// and machinery placement are conservative game estimates, not surveyed limits.
export const CONSTRUCTION_REVIEW_DATE = '2026-10-26';
export const CONSTRUCTION_SITES = [
  {
    id: 'uppal-narapally', name: 'Uppal–Narapally Elevated Corridor', status: 'active' as const,
    phase: 'unfinished-piers' as const,
    sources: [
      { url: 'https://telanganatoday.com/eight-years-after-launch-uppal-elevated-corridor-work-drags-on-commuters-fume', date: '2026-10-25' },
      { url: 'https://telanganatoday.com/hyderabad-infra-works-major-flyover-corridor-projects-trigger-monsoon-traffic-concerns', date: '2026-05-23' },
      { url: 'https://forestsclearance.nic.in/writereaddata/eds_UA/2014_27_25_Feb_2022_121238653_edsletter_EDS.pdf', date: '2022-02-25' },
    ],
    uncertainty: 'The project remains unfinished in the latest report. Earlier photographs show some launched segments; no continuous usable elevated deck is asserted. Exact current barricade limits are not surveyed.',
  },
  {
    id: 'iiit-junction', name: 'IIIT Junction Flyover & Underpass Works', status: 'active' as const,
    phase: 'excavation' as const,
    sources: [
      { url: 'https://hyderabadmail.com/iiit-junction-road-closure-extended-cyberabad-traffic-advisory/', date: '2026-10-26' },
      { url: 'https://telanganatoday.com/traffic-diversions-around-iiit-junction-dlf-road-for-90-days', date: '2026-10-26' },
    ],
    uncertainty: 'Advisory confirms ongoing works and a DLF-road closure. This game models a bounded junction work site and keeps through access; it does not claim to reproduce the changing DLF gate diversion exactly.',
  },
  {
    id: 'kbr-old-seven-flyovers', name: 'KBR Park former flyover package', status: 'superseded' as const,
    phase: 'not-rendered' as const,
    sources: [{ url: 'https://www.ndtv.com/hyderabad-news/hyderabads-elevated-corridor-plan-to-ease-traffic-around-kbr-national-park-12144954', date: '2026-10-06' }],
    uncertainty: 'The original seven-flyover/underpass package was replaced by a different proposal. Do not draw the cancelled structures or invent a completed replacement.',
  },
] as const;
