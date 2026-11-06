import type { LevelConfig } from '../core/types';
import { getCharacterReleaseDecision, REVIEWED_PROCEDURAL_CANDIDATE } from './release-gate';
import assets from './character-assets.json';

/** Scene mechanics can be tested locally while incomplete film art remains
 * blocked from the release. No caller may turn a mechanics pass into a likeness
 * approval. Future asset integrations must supply their reviewed artifact hash. */
export function auditCampaignCharacters(levels:readonly LevelConfig[]){
  return levels.flatMap(level=>{
    const primary=typeof level.moduleParams.characterId==='string'?level.moduleParams.characterId:null;
    const ids=primary?[primary,...(level.module==='metroRide'?['vakeel-woman-1','vakeel-woman-2','vakeel-woman-3']:[])]:[];
    return ids.map(characterId=>({levelId:level.id,level:level.level,characterId,
      ...getCharacterReleaseDecision(characterId,assets.assets.find(asset=>asset.characterId===characterId)?.candidate??REVIEWED_PROCEDURAL_CANDIDATE)}));
  });
}
