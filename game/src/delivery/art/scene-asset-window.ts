import type { LevelConfig } from '../core/types';

export function characterIdsForLevel(level: LevelConfig | null | undefined): string[] {
  const identity=level?.moduleParams.characterId;
  if(typeof identity!=='string'||!identity.trim())return [];
  return level?.module==='metroRide'?[identity,'vakeel-woman-1','vakeel-woman-2','vakeel-woman-3']:[identity];
}

/** Bound loading by story position, keeping an occupied completed set alive. */
export function sceneAssetWindow(levels:readonly LevelConfig[], currentId:string|null, retainedId:string|null=null):string[] {
  const index=levels.findIndex(level=>level.id===currentId), retained=levels.find(level=>level.id===retainedId);
  return [...new Set([
    ...characterIdsForLevel(index>=0?levels[index]:null),
    ...characterIdsForLevel(index>=0?levels[index+1]:null),
    ...characterIdsForLevel(retained),
  ])];
}
