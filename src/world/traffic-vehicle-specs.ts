/** Metres. Manufacturer dimensional references, not licensed CAD replicas.
 * Geometry is an authored interpretation; mirrors/lenses may project slightly
 * beyond the nominal body width/length, as they do on the existing vehicles. */
export const TRAFFIC_VEHICLE_SPECS = {
  hatch: {length:3.860,width:1.735,height:1.520,wheelbase:2.450,source:'https://www.marutisuzuki.com/arena/swift'},
  sedan: {length:3.995,width:1.735,height:1.525,wheelbase:2.450,source:'https://www.marutisuzuki.com/arena/dzire'},
  cab: {length:3.995,width:1.735,height:1.525,wheelbase:2.450,source:'https://www.marutisuzuki.com/tour/dzire'},
  suv: {length:4.330,width:1.790,height:1.635,wheelbase:2.610,source:'https://www.hyundai.com/in/en/find-a-car/creta/specification'},
  miniTruck: {length:3.800,width:1.500,height:1.840,wheelbase:2.100,source:'https://smalltrucks.tatamotors.com/tata-ace-gold-petrol'},
  van: {length:5.100,width:1.925,height:2.615,wheelbase:3.050,source:'https://www.forcemotors.com/vehicles/traveller-3050wb/'},
} as const;

export interface VehicleOccupant {role:'driver'|'passenger';x:number;hipY:number;z:number;scale:number;control?:{x:number;y:number;z:number}}
