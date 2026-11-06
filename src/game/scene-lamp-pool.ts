import * as THREE from 'three';

export interface SceneLampPosition { readonly x: number; readonly y: number; readonly z: number }
export interface SceneLampRequest { readonly position: SceneLampPosition;readonly kind?:'reading'|'porch'|'lantern'|'underwater'|'street-scene'|'stadium'|'metro-platform' }

export const SCENE_READING_LIGHT = Object.freeze({ color: '#FFE0B0', intensity: 2.5, distance: 5.5, decay: 2 });
export const SCENE_PORCH_LIGHT = Object.freeze({color:'#FFE0B0',intensity:8,distance:7,decay:2});
export const SCENE_LANTERN_LIGHT = Object.freeze({color:'#FFD49A',intensity:28,distance:12,decay:2});
export const SCENE_UNDERWATER_LIGHT = Object.freeze({color:'#B9DDE1',intensity:8,distance:8,decay:2});
export const SCENE_STREET_LIGHT = Object.freeze({color:'#FFE6C2',intensity:22,distance:26,decay:1.6});
export const SCENE_STADIUM_LIGHT = Object.freeze({color:'#F3F5FF',intensity:40000,distance:600,decay:2});
// Keep the local diffuse illumination below the High bloom veil observed on
// pale platform concrete; do not change the city's exposure or bloom setup.
export const SCENE_METRO_LIGHT = Object.freeze({color:'#E7F2FF',intensity:18,distance:18,decay:2});
export const STREET_LAMP_DEFAULTS = Object.freeze({ color: '#ffcf8a', intensity: 22, distance: 26, decay: 1.6 });

// Construct the linear-space colors once, rather than allocating while the truck moves.
const readingColor = new THREE.Color(SCENE_READING_LIGHT.color);
const lanternColor=new THREE.Color(SCENE_LANTERN_LIGHT.color);
const underwaterColor=new THREE.Color(SCENE_UNDERWATER_LIGHT.color);
const sceneStreetColor=new THREE.Color(SCENE_STREET_LIGHT.color);
const stadiumColor=new THREE.Color(SCENE_STADIUM_LIGHT.color);
const metroColor=new THREE.Color(SCENE_METRO_LIGHT.color);
const streetColor = new THREE.Color(STREET_LAMP_DEFAULTS.color);

function finitePosition(position: SceneLampPosition | null | undefined): position is SceneLampPosition {
  return !!position && Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z);
}

/**
 * Borrow an existing street-light slot for a nearby setpiece. The caller owns
 * selecting a nearby request and must call again when it moves or is released.
 * Keeping the same PointLight in the scene preserves the renderer's light count
 * and authored PBR shaders; this does not add lights or change their visibility.
 * Returns false when the slot was restored to its ordinary street-light role.
 */
export function applySceneLamp(
  slot: THREE.PointLight,
  request: SceneLampRequest | null,
  streetPosition: SceneLampPosition | null,
  moodLampLights: number,
  index: number,
): boolean {
  if (finitePosition(request?.position)) {
    slot.position.set(request.position.x, request.position.y, request.position.z);
    const underwater=request.kind==='underwater',streetScene=request.kind==='street-scene',stadium=request.kind==='stadium',lantern=request.kind==='lantern',metro=request.kind==='metro-platform';
    const settings=metro?SCENE_METRO_LIGHT:underwater?SCENE_UNDERWATER_LIGHT:streetScene?SCENE_STREET_LIGHT:stadium?SCENE_STADIUM_LIGHT:lantern?SCENE_LANTERN_LIGHT:request.kind==='porch'?SCENE_PORCH_LIGHT:SCENE_READING_LIGHT;
    slot.color.copy(metro?metroColor:underwater?underwaterColor:streetScene?sceneStreetColor:stadium?stadiumColor:lantern?lanternColor:readingColor);
    slot.intensity = settings.intensity;
    slot.distance = settings.distance;
    slot.decay = settings.decay;
    return true;
  }

  if (finitePosition(streetPosition)) slot.position.set(streetPosition.x, streetPosition.y, streetPosition.z);
  else slot.position.set(0, -200, 0);
  slot.color.copy(streetColor);
  slot.intensity = index < Math.round(moodLampLights) ? STREET_LAMP_DEFAULTS.intensity : 0;
  slot.distance = STREET_LAMP_DEFAULTS.distance;
  slot.decay = STREET_LAMP_DEFAULTS.decay;
  return false;
}
