import { RARITY_ROLLS, STAT_WEIGHTS, TIME_STAT_FACTOR } from './config/forge';
import type { Rng } from './rng';
import {
  POT_STATS,
  RARITIES,
  type GameState,
  type PotId,
  type PotInstance,
  type PotStats,
  type Rarity,
} from './types';

/** Khóa gom các chậu giống hệt nhau (cùng dáng, độ hiếm, chỉ số, nguồn) thành một chồng trong khay. */
export function potStackKey(p: PotInstance): string {
  const stats = POT_STATS.map((k) => p.stats[k] ?? 0).join(',');
  return `${p.potId}|${p.rarity}|${stats}|${p.origin === 'shop' ? 'shop' : 'other'}`;
}

/** Điểm để chọn chậu "tốt nhất": độ hiếm trước, rồi tổng chỉ số. */
export const potScore = (p: PotInstance): number =>
  RARITIES.indexOf(p.rarity) * 1000 + POT_STATS.reduce((sum, k) => sum + (p.stats[k] ?? 0), 0);

export interface PotStack {
  key: string;
  /** Chậu đại diện (để hiển thị). */
  sample: PotInstance;
  uids: number[];
}

/** Gom kho chậu thành các chồng, chồng tốt nhất đứng đầu. */
export function potStacks(state: GameState): PotStack[] {
  const map = new Map<string, PotStack>();
  for (const p of state.potBag) {
    const key = potStackKey(p);
    const stack = map.get(key);
    if (stack) stack.uids.push(p.uid);
    else map.set(key, { key, sample: p, uids: [p.uid] });
  }
  return [...map.values()].sort((a, b) => potScore(b.sample) - potScore(a.sample));
}

/** uid của chiếc chậu kế tiếp trong một chồng, hoặc null nếu chồng đã hết. */
export const nextUidInStack = (state: GameState, key: string): number | null =>
  state.potBag.find((p) => potStackKey(p) === key)?.uid ?? null;

/** Chậu tốt nhất trong kho (dùng khi chạm vào ô trống). */
export function bestPotUid(state: GameState): number | null {
  let best: PotInstance | null = null;
  for (const p of state.potBag) if (!best || potScore(p) > potScore(best)) best = p;
  return best?.uid ?? null;
}

// ---------- Đúc chậu ----------

/** Tung một chiếc chậu từ lò đúc: độ hiếm theo tỉ lệ, rồi các dòng chỉ số khác nhau. */
export function rollForgedPot(
  rng: Rng,
  odds: readonly number[],
): { potId: PotId; rarity: Rarity; stats: PotStats } {
  const r = rng.next() * 100;
  let acc = 0;
  let rarity: Rarity = 'common';
  for (let i = 0; i < RARITIES.length; i++) {
    acc += odds[i] ?? 0;
    if (r < acc) {
      rarity = RARITIES[i]!;
      break;
    }
  }
  const roll = RARITY_ROLLS[rarity];
  const stats: PotStats = {};
  const available = [...POT_STATS];
  for (let line = 0; line < roll.lines; line++) {
    const total = available.reduce((sum, k) => sum + STAT_WEIGHTS[k], 0);
    let x = rng.next() * total;
    let stat = available[available.length - 1]!;
    for (const k of available) {
      x -= STAT_WEIGHTS[k];
      if (x < 0) {
        stat = k;
        break;
      }
    }
    available.splice(available.indexOf(stat), 1);
    const value = rng.int(roll.min, roll.max);
    stats[stat] = Math.max(1, stat === 'timePct' ? Math.round(value * TIME_STAT_FACTOR) : value);
  }
  return { potId: roll.shape, rarity, stats };
}
