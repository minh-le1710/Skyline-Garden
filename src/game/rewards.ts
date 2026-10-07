import { addXp } from './progression';
import { addCount } from './state';
import type { ChestItemId, Counts, GameEvent, GameState, PlantId, Reward } from './types';

export type { Reward } from './types';

/** Cộng thưởng vào bản nháp. */
export function grantReward(s: GameState, reward: Reward, now: number, events: GameEvent[]): void {
  s.gold += reward.gold ?? 0;
  s.ruby += reward.ruby ?? 0;
  for (const [id, n] of Object.entries(reward.seeds ?? {})) addCount(s.seeds, id as PlantId, n ?? 0);
  for (const [id, n] of Object.entries(reward.items ?? {})) addCount(s.items, id as ChestItemId, n ?? 0);
  addXp(s, reward.xp ?? 0, now, events);
}

/** Gộp nhiều món thưởng vật phẩm. */
export function mergeCounts<K extends string>(a: Counts<K>, b: Counts<K>): Counts<K> {
  const out: Counts<K> = { ...a };
  for (const [k, v] of Object.entries(b) as [K, number][]) out[k] = (out[k] ?? 0) + v;
  return out;
}
