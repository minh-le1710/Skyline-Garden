import type { ChestItemId, PestId } from '../types';

export const PEST_UNLOCK_LEVEL = 5;

/** Xác suất có sâu (%) theo thời gian lớn của cây. Cây lớn dưới 5 phút không bao giờ có sâu. */
export function pestChancePct(growSec: number): number {
  if (growSec < 300) return 0;
  if (growSec < 1800) return 10;
  if (growSec < 7200) return 15;
  return 18;
}

export const PEST_STAY_MIN_MS = 15 * 60_000;
export const PEST_STAY_MAX_MS = 4 * 3_600_000;

/** Một khả năng rơi đồ: `pct`% nhận từ `min` tới `max` món. */
export interface Drop {
  id: ChestItemId;
  pct: number;
  min: number;
  max: number;
}

export interface PestDef {
  id: PestId;
  weight: number;
  drops: Drop[];
  /** Rơi món này nếu không trúng món nào ở `drops`. */
  fallback: Drop | null;
}

export const PESTS: Record<PestId, PestDef> = {
  caterpillar: {
    id: 'caterpillar',
    weight: 45,
    drops: [{ id: 'cloudclay', pct: 60, min: 1, max: 1 }],
    fallback: null,
  },
  snail: { id: 'snail', weight: 30, drops: [{ id: 'cloudclay', pct: 80, min: 1, max: 2 }], fallback: null },
  beetle: {
    id: 'beetle',
    weight: 18,
    drops: [{ id: 'dewglass', pct: 60, min: 1, max: 1 }],
    fallback: { id: 'cloudclay', pct: 100, min: 1, max: 1 },
  },
  starmoth: {
    id: 'starmoth',
    weight: 7,
    drops: [
      { id: 'sunstone', pct: 35, min: 1, max: 1 },
      { id: 'dewglass', pct: 50, min: 2, max: 2 },
      { id: 'stardust', pct: 4, min: 1, max: 1 },
    ],
    fallback: null,
  },
};

export const PEST_LIST: PestDef[] = Object.values(PESTS);

/** Thưởng khi bắt một con sâu: XP theo cấp, vàng nhỏ. */
export const pestCatchGold = (level: number): number => 5 + 2 * level;
