import data from './levels.json';
import type { LevelConfig, ScriptLine } from '../core/types';

const callModes = new Set(['NONE', 'PLAYER_CALLS', 'CUSTOMER_CALLS', 'CUSTOMER_NAGS_EN_ROUTE']);
function scriptValid(script: unknown): script is ScriptLine[] {
  return Array.isArray(script) && script.length > 0 && script.every(line => line &&
    ['customer', 'player'].includes(line.who) && typeof line.text === 'string' && line.text.trim() &&
    (!line.replies || (line.who === 'player' && Array.isArray(line.replies) && line.replies.length > 0 && line.replies.length <= 2 &&
      line.replies.every(reply => typeof reply === 'string' && reply.trim()))));
}

/** Invalid content fails at loading, rather than leaving a player with an unfinishable order. */
export function validateLevels(input: unknown): LevelConfig[] {
  if (!Array.isArray(input) || !input.length) throw new Error('At least one delivery level is required.');
  const ids = new Set<string>();
  input.forEach((level, index) => {
    const bad = (why: string) => { throw new Error(`Delivery level ${index + 1}: ${why}`); };
    if (!level || typeof level.id !== 'string' || !level.id.trim() || ids.has(level.id)) bad('id must be unique.');
    ids.add(level.id);
    if (level.level !== index + 1) bad('level numbers must match their ordered content position.');
    if (!level.celebrity || !['name', 'movie', 'image'].every(key => typeof level.celebrity[key] === 'string' && level.celebrity[key].trim())) bad('celebrity identity is incomplete.');
    if (!level.destination || typeof level.destination.label !== 'string' || !level.destination.label.trim() ||
      ![level.destination.x, level.destination.z, level.destination.y ?? 0].every(Number.isFinite)) bad('destination is invalid.');
    if (!callModes.has(level.callMode)) bad('unknown call mode.');
    if (level.callMode === 'NONE' ? !Array.isArray(level.script) || level.script.length !== 0 : !scriptValid(level.script)) bad('call script is invalid.');
    if (level.callMode === 'NONE' && (level.revealAt !== 'afterDelivery' || level.nagScript || level.bonusScript)) bad('scene-only levels cannot require a call.');
    if (level.storyScript && !scriptValid(level.storyScript)) bad('cinematic script is invalid.');
    if (level.storyAudio !== undefined) {
      const audio = level.storyAudio;
      if (!audio || typeof audio.url !== 'string' || !/^\/audio\/[a-z0-9-]+\.mp3$/.test(audio.url) ||
          !Number.isFinite(audio.duration) || audio.duration <= 0) bad('invalid story recording.');
      const ends = audio.lineEnds;
      if (ends !== undefined && (!Array.isArray(ends) || ends.length !== level.storyScript?.length ||
          ends.some((end: number, i: number) => !Number.isFinite(end) || end <= (i ? ends[i - 1] : 0) || end > audio.duration))) {
        bad('subtitle timings must increase within the recording and match the script.');
      }
    }
    if (level.nagScript && !scriptValid(level.nagScript)) bad('nag script is invalid.');
    if (level.callMode === 'CUSTOMER_NAGS_EN_ROUTE' && !scriptValid(level.nagScript)) bad('nag call needs a script.');
    if (level.bonusScript && !scriptValid(level.bonusScript)) bad('bonus script is invalid.');
    if (!['callLine', 'afterDelivery'].includes(level.revealAt)) bad('unknown reveal mode.');
    if (level.revealAt === 'callLine' && !level.script.some(line => line.reveal)) bad('call-line reveal has no reveal line.');
    if (level.revealAt === 'afterDelivery' && [...level.script, ...(level.nagScript || [])].some(line => line.reveal)) bad('identity cannot reveal before delivery.');
    if (typeof level.module !== 'string' || !level.module.trim() || !level.moduleParams || typeof level.moduleParams !== 'object') bad('mechanic is incomplete.');
    if (typeof level.restaurantStage !== 'string' || !level.restaurantStage.trim() || typeof level.completionLine !== 'string') bad('completion content is incomplete.');
    if (level.arrivalRadius !== undefined && (!Number.isFinite(level.arrivalRadius) || level.arrivalRadius <= 0)) bad('arrival radius must be positive.');
    if (level.defaultVariant && !level.variants?.[level.defaultVariant]) bad('default variant is missing.');
  });
  return input as LevelConfig[];
}

/** Variant choice is content data, not a branch in the delivery mechanics. */
export function loadLevels(variants: Record<string, string> = {}): LevelConfig[] {
  const levels: LevelConfig[] = JSON.parse(JSON.stringify(data));
  for (const level of levels) {
    const name = variants[level.id] ?? level.defaultVariant;
    if (!name) continue;
    const variant = level.variants?.[name];
    if (!variant) throw new Error(`Unknown variant ${name} for ${level.id}.`);
    const celebrity = { ...level.celebrity, ...variant.celebrity };
    Object.assign(level, variant, { celebrity });
  }
  return validateLevels(levels);
}

export const DELIVERY_LEVELS = loadLevels();
