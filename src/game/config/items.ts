import {
  CONSUMABLE_IDS,
  GOOD_IDS,
  MATERIAL_IDS,
  PLANT_IDS,
  type BarnItemId,
  type ChestItemId,
  type ItemId,
} from '../types';
import { GOODS } from './goods';
import { PLANTS } from './plants';

export type ItemKind = 'crop' | 'good' | 'material' | 'consumable';

export interface ItemDef {
  id: ItemId;
  kind: ItemKind;
  /** Giá bán cho cửa hàng; 0 là không bán được. */
  sellPrice: number;
  /** XP quy đổi cho một món khi giao trong đơn hàng. */
  xpValue: number;
}

/** Danh mục mọi món trong kho, dựng từ config cây và hàng chế biến. */
export const ITEMS = {} as Record<ItemId, ItemDef>;
for (const id of PLANT_IDS) {
  const p = PLANTS[id];
  ITEMS[id] = { id, kind: 'crop', sellPrice: p.sellPrice, xpValue: p.xp / p.yield };
}
for (const id of GOOD_IDS) {
  const def = GOODS[id];
  // Giá trị XP của hàng chế biến = XP của nguyên liệu × 1,1 + một nửa XP lúc lấy hàng.
  let inputXp = 0;
  for (const [input, qty] of Object.entries(def.inputs))
    inputXp += (ITEMS[input as BarnItemId]?.xpValue ?? 0) * qty!;
  ITEMS[id] = {
    id,
    kind: 'good',
    sellPrice: def.sellPrice,
    xpValue: Math.round(inputXp * 1.1 + def.xp * 0.5),
  };
}
for (const id of [...MATERIAL_IDS, ...CONSUMABLE_IDS]) {
  ITEMS[id] = {
    id,
    kind: MATERIAL_IDS.includes(id as never) ? 'material' : 'consumable',
    sellPrice: 0,
    xpValue: 0,
  };
}

export const isBarnItem = (id: ItemId): id is BarnItemId => {
  const kind = ITEMS[id].kind;
  return kind === 'crop' || kind === 'good';
};

export const isChestItem = (id: ItemId): id is ChestItemId => !isBarnItem(id);
