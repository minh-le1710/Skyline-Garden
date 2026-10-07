import type { PotId, PotStats, Rarity } from '../types';

/** Số chậu tối đa cất trong kho. */
export const POT_BAG_MAX = 40;

export interface ShopPotDef {
  id: PotId;
  price: number;
  unlockLevel: number;
  rarity: Rarity;
  stats: PotStats;
}

/** Chậu bán ở cửa hàng. Chậu hiếm hơn chỉ có từ lò đúc. */
export const SHOP_POTS: Partial<Record<PotId, ShopPotDef>> = {
  clay: { id: 'clay', price: 40, unlockLevel: 1, rarity: 'common', stats: {} },
  ceramic: { id: 'ceramic', price: 600, unlockLevel: 4, rarity: 'uncommon', stats: { xpPct: 10 } },
  porcelain: { id: 'porcelain', price: 1500, unlockLevel: 8, rarity: 'uncommon', stats: { timePct: 8 } },
};

export const SHOP_POT_LIST: ShopPotDef[] = Object.values(SHOP_POTS);

/** Giới hạn chỉ số sau khi cộng dồn. */
export const POT_STAT_CAPS: Record<keyof PotStats, number> = {
  timePct: 30,
  xpPct: 60,
  goldPct: 60,
  yieldPct: 50,
};

/** Phần trăm giá cửa hàng nhận lại khi bán chậu mua ở cửa hàng. */
export const POT_RESALE_PCT = 25;
