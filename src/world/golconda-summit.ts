import type { Kit } from './landmarks';

// Balahisar Baradari: broad pointed openings, a projecting terrace, a flat
// crenellated roof and corner finials, rather than three stacked solid boxes
// dressed with dozens of tiny arches. The district's original photographs and
// ASI visitor map support this topology, not a measured reconstruction.
// https://hyderabad.telangana.gov.in/tourist-place/golconda-fort/
// https://commons.wikimedia.org/wiki/File:Golconda_Fort_002_-_Baradari.jpg
// Keep the inherited game elevation/dimensions until a surveyed terrain datum
// exists; the published120m hill description is not an AMSL roof measurement.
export const GOLCONDA_SUMMIT = Object.freeze({ base:78, roof:91.5, width:37, depth:28, roofWidth:26.8, roofDepth:15.8, roofV:-4 });

export function drawGolcondaSummit(K: Kit) {
  const oldY=K.y0; K.y0=GOLCONDA_SUMMIT.base;
  const stone='#9b8c73', trim='#c3b497', dark='#716756';
  // Foundation meets the granite below; the visitor gallery is above it.
  K.box(0,0,-5,37,5.5,28,dark);
  K.box(0,0,.5,36.6,.22,27.6,stone);
  // Three large arches per front/back gallery, with deep side arcades. Nothing
  // fills the openings; their piers carry the collision footprints instead.
  for(const v of [-13.5,13.5]) K.arcade('archBig',-18,v,18,v,3,.72,3.45,1.0,trim);
  for(const u of [-17.5,17.5]) K.arcade('archBig',u,-13.5,u,13.5,3,.72,3.45,1.0,stone);
  K.box(0,0,4.17,37.2,.33,28.2,trim);
  // The upper hall is set back from the terrace. Larger upper openings and
  // visible side recesses give the summit its distinct rectangular silhouette.
  for(const v of [-11.35,3.35]) K.arcade('archBig',-12.7,v,12.7,v,3,4.5,7.7,1.0,stone);
  for(const u of [-12.2,12.2]) K.arcade('archBig',u,-11.35,u,3.35,2,4.5,7.7,1.0,stone);
  K.box(0,-4,12.2,26.2,.7,15.2,stone);
  K.box(0,-4,12.9,GOLCONDA_SUMMIT.roofWidth,.6,GOLCONDA_SUMMIT.roofDepth,trim);
  // Low parapet/merlons leave a broad, unbroken visible terrace for landing.
  for(const v of [-11.55,3.55]) {
    K.box(0,v,13.5,26.6,.6,.45,stone);
    for(let u=-12;u<=12;u+=2.4) K.box(u,v,14.1,.75,.75,.5,stone);
  }
  for(const u of [-13.1,13.1]) K.box(u,-4,13.5,.45,.6,15.5,stone);
  for(const u of [-12.8,12.8]) for(const v of [-11.5,3.5]) {
    K.cyl(u,v,12.9,.55,3.4,trim,'cyl10'); K.shape('melon',u,v,16.3,1.2,.55,1.2,stone);
    K.cyl(u,v,16.85,.1,.8,trim,'cyl8');
  }
  // Corner/pier collision follows open architecture instead of blanketing the
  // entire hall volume. Upward support comes from these exact rendered faces.
  for(const u of [-17.5,-6,6,17.5]) for(const v of [-13.5,13.5]) K.solidRect(u,v,1.25,1.1,4.17);
  for(const u of [-12.2,-4.25,4.25,12.2]) for(const v of [-11.35,3.35]) K.solidRect(u,v,1.5,1.1,12.2);
  K.solidRect(0,0,37,28,.72);
  // A staircase belongs to a pedestrian monument. It is not presented as a
  // modern vehicle access ramp; flight is how the game car reaches the terrace.
  for(let i=0;i<18;i++) K.box(17.0,20.8-i*.4,i*.25,3.1,.25,.44,trim);
  K.y0=oldY;
}
