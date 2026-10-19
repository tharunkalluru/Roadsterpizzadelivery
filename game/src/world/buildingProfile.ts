import type { Vec2 } from './schema';

/** Dated appearance and separately classified dimensions. Business names belong to storefront records. */
export interface ResearchedBuildingProfile {
  /** Additional dated boards only; keep the existing architecture and shared access plan. */
  signageOnly?:boolean;
  sourceIds:string[];
  appearanceStatus:'observed'|'inferred';
  dimensionStatus:'provisional'|'verified';
  wallColor:string;
  material?:'painted_plaster'|'stone_cladding'|'metal_cladding'|'brick'|'curtain_wall'|'mixed';
  /** Displays the independently sourced Building.name; does not create another tenancy. */
  nameBand?:{frontIndex?:number;at?:number;baseM:number;heightM:number;widthRatio?:number;color:string;textColor:string;outsetM?:number};
  /** Observed non-tenant boards, such as a dated sale advertisement; not independent business records. */
  signPanels?:{text:string;frontIndex?:number;at?:number;baseM:number;heightM:number;widthRatio?:number;color:string;textColor:string;outsetM?:number}[];
  fronts:ResearchedFrontProfile[];
}

export interface ResearchedFrontProfile {
  /** A local photographed entrance section; architecture remains on the primary front. */
  accessOnly?:boolean;
  /** Match these researched storefronts to canonical exterior footprint edges. */
  storefrontIds?:string[];
  /** Explicit observed face permits a researched non-shop wall; endpoints must remain on the footprint. */
  facade?:[Vec2,Vec2];
  facingHeading?:number;
  setbackM?:number;
  floors:{baseM:number;heightM:number;glazingRatio:number;glazingHeightRatio?:number;openingShape?:'arched';balustrade?:{heightM:number;color:string;spacingM?:number};glassColor?:string;wallColor?:string;bandColor?:string;bandHeightM?:number;outsetM?:number}[];
  /** Normalised left-to-right divisions, independent of metric facade width. */
  bays?:{start:number;end:number;glazingRatio?:number;glassColor?:string}[];
  piers?:{at:number;widthM:number;color:string;depthM?:number}[];
  fascia?:{baseM:number;heightM:number;color:string;outsetM?:number};
  accents?:{start:number;end:number;baseM:number;heightM:number;color:string;outsetM?:number;outlineM?:number;depthM?:number;kind?:'cladding'|'light_string'}[];
  /** Independently drawn patterned cladding. Points are [facade fraction, height metres]. */
  screens?:{outline:[number,number][];color:string;outsetM?:number;cellM?:number;pattern?:'lattice'|'solid'}[];
  /** Authored access dimensions are provisional; one shared road-cleared plan supplies rendering and solid collision. */
  access?:{
    landingHeightM:number;landingDepthM:number;railings?:boolean;
    stairs:{at:number;widthM:number;risers:number;runM:number}[];
    basementOpenings?:{at:number;widthM:number;depthM:number;grille?:boolean}[];
  };
}
