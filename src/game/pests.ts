import { xpToNext } from './config/levels';
import {
  PEST_LIST,
  PEST_STAY_MAX_MS,
  PEST_STAY_MIN_MS,
  PEST_UNLOCK_LEVEL,
  PESTS,
  pestCatchGold,
  pestChancePct,
} from './config/pests';
import { PLANTS } from './config/plants';
import type { Rng } from './rng';
import type { ChestItemId, Counts, PestId, PestInfo, PlantId, PlantedCrop } from './types';

/**
 * Tung các giá trị ngẫu nhiên lúc trồng. Luôn rút đúng 4 số từ luồng `crops` dù kết quả thế nào,
 * để luồng tiến đều và thêm điều kiện sau này không làm lệch các lần trồng khác.
 */
export function rollPlanting(
  rng: Rng,
  plantId: PlantId,
  plantedAt: number,
  growMs: number,
  level: number,
  yieldPct: number,
): { bonusYield: boolean; pest: PestInfo | null } {
  const rYield = rng.next();
  const rChance = rng.next();
  const rTiming = rng.next();
  const rKind = rng.next();
  const bonusYield = rYield * 100 < yieldPct;
  const chance = level >= PEST_UNLOCK_LEVEL ? pestChancePct(PLANTS[plantId].growSec) : 0;
  if (rChance * 100 >= chance) return { bonusYield, pest: null };
  const at = plantedAt + Math.round(growMs * (0.2 + 0.6 * rTiming));
  const stay = Math.min(PEST_STAY_MAX_MS, Math.max(PEST_STAY_MIN_MS, Math.round(growMs * 0.6)));
  return { bonusYield, pest: { id: pickPest(rKind), at, leaveAt: at + stay } };
}

function pickPest(r: number): PestId {
  const total = PEST_LIST.reduce((sum, p) => sum + p.weight, 0);
  let x = r * total;
  for (const p of PEST_LIST) {
    x -= p.weight;
    if (x < 0) return p.id;
  }
  return PEST_LIST[PEST_LIST.length - 1]!.id;
}

/** Sâu chỉ thật sự xuất hiện nếu tới trước lúc cây chín (tăng tốc cây có thể khiến sâu không kịp tới). */
const appearsBeforeRipe = (c: PlantedCrop): boolean => c.pest !== null && c.pest.at < c.plantedAt + c.growMs;

/** Sâu đang bò trên cây và bắt được. */
export const activePest = (c: PlantedCrop, now: number): boolean =>
  appearsBeforeRipe(c) && c.pest!.at <= now && now < c.pest!.leaveAt;

/** Sâu đã bỏ đi mà không ai bắt: thu hoạch bị hụt 1. */
export const isNibbled = (c: PlantedCrop, now: number): boolean =>
  appearsBeforeRipe(c) && now >= c.pest!.leaveAt;

/** Sản lượng thực khi thu hoạch lúc `now`. */
export const harvestQty = (c: PlantedCrop, now: number): number =>
  isNibbled(c, now) ? Math.max(1, c.yield - 1) : c.yield;

/** Đồ rơi khi bắt sâu (rút từ luồng `loot`). */
export function rollPestDrop(rng: Rng, pestId: PestId): Counts<ChestItemId> {
  const def = PESTS[pestId];
  const out: Counts<ChestItemId> = {};
  let any = false;
  for (const drop of def.drops) {
    const hit = rng.next() * 100 < drop.pct;
    const qty = rng.int(drop.min, drop.max);
    if (hit) {
      out[drop.id] = (out[drop.id] ?? 0) + qty;
      any = true;
    }
  }
  if (!any && def.fallback) out[def.fallback.id] = def.fallback.min;
  return out;
}

/** XP khi bắt sâu: một phần nhỏ của cấp hiện tại, tối thiểu 2. */
export const pestCatchXp = (level: number): number => Math.max(2, Math.round(xpToNext(level) * 0.004));

export { pestCatchGold };
