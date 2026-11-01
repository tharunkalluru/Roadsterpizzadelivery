import type * as THREE from 'three';
import type { LevelConfig } from '../core/types';
import type { CharacterGpuContext } from '../art/gpu-preparation';
import { characterIdsForLevel } from '../art/scene-asset-window';
import { createReleasedSceneCharacter, sceneCharacterIdentity } from '../art/scene-character';
import { createDeliveryModule } from '../modules';
import type { DeliveryModule, DeliveryModuleContext, ModuleParams } from '../modules/types';
import { prepareLocalCharacterArtReview, type LocalArtReviewDependencies, type LocalArtReviewEvidence, type LocalArtReviewRecord, type LocalPushpaArtReview } from './pushpa-art-review';
import candidates from './local-candidate-catalog.json';

export interface LocalSceneArtEvidence { id:'scene-candidates-v1'; assets:LocalArtReviewEvidence[] }
/** A fixed DEV catalog, never a query-controlled URL or a production registry. */
export function sceneReviewCandidates(level:LevelConfig):LocalArtReviewRecord[]{
  return characterIdsForLevel(level).map(characterId=>{
    const matches=candidates.filter(candidate=>candidate.characterId===characterId);
    if(matches.length!==1)throw new Error(`No unique unpublished scene candidate is ready for ${characterId}.`);
    return matches[0];
  });
}

export class LocalSceneArtReview {
  readonly evidence:LocalSceneArtEvidence;
  constructor(private reviews:ReadonlyMap<string,LocalPushpaArtReview>){
    this.evidence={id:'scene-candidates-v1',assets:[...reviews.values()].map(review=>review.evidence)};
  }
  private prepareGraphics=async(instance?:THREE.Group,valid?:()=>boolean)=>{
    const identity=instance?.userData.localCharacterArtPreview?.characterId;
    const review=identity?this.reviews.get(identity):null;
    if(!review)throw new Error('Scene comparison graphics must belong to the selected exact candidate.');
    await review.prepareGraphics(instance,valid);
  };
  createModule=(name:string):DeliveryModule=>new LocalSceneModule(createDeliveryModule(name),ctx=>({...ctx,
    characterFactory:(style,seated,resources)=>{
      const identity=sceneCharacterIdentity(style),review=identity?this.reviews.get(identity):undefined;
      return review?review.createCharacter(resources.material):createReleasedSceneCharacter(style,seated,resources);
    },prepareCharacterGraphics:this.prepareGraphics}));
  dispose(){for(const review of this.reviews.values())review.dispose();}
}

/** Preserve every gameplay/camera/surface property of the existing module. */
class LocalSceneModule implements DeliveryModule {
  constructor(private inner:DeliveryModule,private context:(ctx:DeliveryModuleContext)=>DeliveryModuleContext){}
  get target(){return this.inner.target;} get status(){return this.inner.status;}
  get supports(){return this.inner.supports;} get movement(){return this.inner.movement;}
  get arrival(){return this.inner.arrival;} get trafficBodies(){return this.inner.trafficBodies;}
  get exitPending(){return this.inner.exitPending;} get sceneryPending(){return this.inner.sceneryPending;}
  get intentionalStop(){return this.inner.intentionalStop;}
  get hideWorldGuidance(){return this.inner.hideWorldGuidance;} get cameraFocus(){return this.inner.cameraFocus;}
  get charactersReady(){return this.inner.charactersReady;} get sceneLamp(){return this.inner.sceneLamp;}
  get headlightGain(){return this.inner.headlightGain;}
  setup(ctx:DeliveryModuleContext,params:ModuleParams){this.inner.setup(this.context(ctx),params);}
  update(dt:number){this.inner.update(dt);} onDrop(){this.inner.onDrop();} teardown(){this.inner.teardown();}
}

export async function prepareSceneArtReview(level:LevelConfig,gpu?:CharacterGpuContext,dependencies?:LocalArtReviewDependencies){
  const selected=sceneReviewCandidates(level),reviews=new Map<string,LocalPushpaArtReview>();
  try{
    // Only this scene's actors are held, sequentially, under the loading screen.
    for(const candidate of selected)reviews.set(candidate.characterId,await prepareLocalCharacterArtReview(candidate,gpu,dependencies,candidate.characterId==='pushpa-raj'));
    return new LocalSceneArtReview(reviews);
  }catch(error){for(const review of reviews.values())review.dispose();throw error;}
}
