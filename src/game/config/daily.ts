import type { ChestItemId, Counts } from '../types';

export const QUEST_UNLOCK_LEVEL = 2;
export const questsPerDay = (level: number): number => (level >= 15 ? 4 : 3);

/** Đơn vị vàng của phần thưởng ngày, tăng theo cấp. */
export const dailyGold = (level: number): number => 40 + 25 * level;

/** Quà đăng nhập theo vòng 7 ngày (không mất vòng nếu bỏ ngày). */
export interface LoginGift {
  goldUnits: number;
  ruby: number;
  items: Counts<ChestItemId>;
}

export const LOGIN_GIFTS: LoginGift[] = [
  { goldUnits: 3, ruby: 0, items: {} },
  { goldUnits: 0, ruby: 0, items: { cloudclay: 4 } },
  { goldUnits: 5, ruby: 0, items: {} },
  { goldUnits: 0, ruby: 0, items: { dewglass: 2 } },
  { goldUnits: 8, ruby: 0, items: {} },
  { goldUnits: 0, ruby: 2, items: { cloudclay: 4 } },
  { goldUnits: 0, ruby: 3, items: { sunstone: 1, stardust: 1 } },
];

export const REROLL_RUBY = 2;
export const QUEST_MATERIAL_CHANCE_PCT = 25;
