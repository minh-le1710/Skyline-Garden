import type { ChestItemId, Counts, ForgeId, PotId, PotStat, Rarity } from '../types';

export interface ForgeDef {
  id: ForgeId;
  unlockLevel: number;
  materials: Counts<ChestItemId>;
  gold: number;
  minutes: number;
  /** Tỉ lệ % ra từng độ hiếm: thường, tốt, hiếm, sử thi, huyền thoại. */
  odds: [number, number, number, number, number];
}

export const FORGES: Record<ForgeId, ForgeDef> = {
  forge_basic: {
    id: 'forge_basic',
    unlockLevel: 7,
    materials: { cloudclay: 8 },
    gold: 200,
    minutes: 30,
    odds: [70, 25, 5, 0, 0],
  },
  forge_glazed: {
    id: 'forge_glazed',
    unlockLevel: 10,
    materials: { cloudclay: 6, dewglass: 3 },
    gold: 800,
    minutes: 60,
    odds: [30, 45, 20, 5, 0],
  },
  forge_sunfired: {
    id: 'forge_sunfired',
    unlockLevel: 15,
    materials: { cloudclay: 6, dewglass: 4, sunstone: 2 },
    gold: 2500,
    minutes: 180,
    odds: [0, 30, 45, 20, 5],
  },
  forge_starlit: {
    id: 'forge_starlit',
    unlockLevel: 20,
    materials: { dewglass: 6, sunstone: 4, stardust: 1 },
    gold: 8000,
    minutes: 360,
    odds: [0, 0, 40, 45, 15],
  },
};

export const FORGE_LIST: ForgeDef[] = Object.values(FORGES);

/** Mỗi độ hiếm: số dòng chỉ số, khoảng giá trị (%), dáng chậu. */
export const RARITY_ROLLS: Record<Rarity, { lines: number; min: number; max: number; shape: PotId }> = {
  common: { lines: 1, min: 3, max: 8, shape: 'stoneware' },
  uncommon: { lines: 2, min: 5, max: 12, shape: 'stoneware' },
  rare: { lines: 2, min: 10, max: 18, shape: 'jade' },
  epic: { lines: 3, min: 14, max: 24, shape: 'crystal' },
  legendary: { lines: 4, min: 20, max: 30, shape: 'celestial' },
};

/** Trọng số chọn loại chỉ số; chỉ số thời gian nhân 0,6 vì rất mạnh. */
export const STAT_WEIGHTS: Record<PotStat, number> = { xpPct: 30, goldPct: 30, yieldPct: 20, timePct: 20 };
export const TIME_STAT_FACTOR = 0.6;

/** XP khi lấy chậu ra khỏi lò. */
export const forgeXp = (minutes: number): number => Math.round(2 + 0.45 * minutes);

/** Vật liệu nhận lại khi phân rã chậu đúc/thưởng. */
export const SALVAGE: Record<Rarity, Counts<ChestItemId>> = {
  common: { cloudclay: 3 },
  uncommon: { cloudclay: 4, dewglass: 1 },
  rare: { dewglass: 3, sunstone: 1 },
  epic: { dewglass: 4, sunstone: 2 },
  legendary: { sunstone: 4, stardust: 1 },
};
