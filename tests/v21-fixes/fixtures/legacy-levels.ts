import historicalContent from './legacy-seven-levels.json';
import { validateLevels } from '../../../src/delivery/content/levels';
import type { LevelConfig } from '../../../src/delivery/core/types';

/** Historical seven-level scripts exercise the retained call engine and save
 * migrations. Production content is the separate fourteen-scene campaign.
 * Each invocation makes an isolated copy, including any selected scene variant. */
export function loadLegacyLevels(variants: Record<string, string> = {}): LevelConfig[] {
  const levels: LevelConfig[] = JSON.parse(JSON.stringify(historicalContent));
  for (const level of levels) {
    const name = variants[level.id] ?? level.defaultVariant;
    if (!name) continue;
    const variant = level.variants?.[name];
    if (!variant) throw new Error(`Unknown variant ${name} for ${level.id}.`);
    Object.assign(level, variant, { celebrity: { ...level.celebrity, ...variant.celebrity } });
  }
  return validateLevels(levels);
}
