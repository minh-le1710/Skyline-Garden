import type { ChestItemId, GoodId, MaterialId, MineTileKind } from '../types';

// Mỏ Đá Mây: lưới 6×10 dưới đảo đất, đào theo lượt bằng năng lượng, làm mới mỗi ngày.

export const MINE_UNLOCK_LEVEL = 9;
export const MINE_COLS = 6;
export const MINE_ROWS = 10;

export const ENERGY_MAX = 30;
export const ENERGY_REGEN_MS = 5 * 60_000;
/** Mua năng lượng: +30, giá ruby tăng theo số lần trong ngày (giữ giá cuối). */
export const REFILL_ENERGY = 30;
export const REFILL_RUBY = [5, 10, 20] as const;
/** Ăn nhẹ không đẩy năng lượng quá mức này. */
export const ENERGY_CAP = ENERGY_MAX * 2;

/** Hàng chế biến ăn được trong mỏ và số năng lượng hồi. */
export const MINE_SNACKS: Partial<Record<GoodId, number>> = {
  strawberry_jam: 4,
  apple_jam: 5,
  roasted_seeds: 3,
  green_tea: 6,
  mint_tea: 7,
  apple_juice: 6,
  smoothie: 9,
  chocolate: 10,
  banana_bread: 12,
  vanilla_cake: 20,
};

/** Độ bền mỗi loại khối. */
export const TILE_HP: Record<MineTileKind, number> = { soil: 1, stone: 2, granite: 3, obsidian: 5, chest: 4 };

export interface PickaxeDef {
  damage: number;
  level: number;
  gold: number;
  items: Partial<Record<MaterialId, number>>;
}

/** Bậc cuốc: gỗ (có sẵn) → sắt → pha lê. */
export const PICKAXES: readonly PickaxeDef[] = [
  { damage: 1, level: 0, gold: 0, items: {} },
  { damage: 2, level: 12, gold: 2500, items: { dewglass: 15 } },
  { damage: 3, level: 18, gold: 9000, items: { dewglass: 20, sunstone: 10 } },
];

/** Dải độ sâu theo hàng: 0 (hàng 0–2), 1 (3–6), 2 (7–9). */
export const bandOf = (row: number): 0 | 1 | 2 => (row <= 2 ? 0 : row <= 6 ? 1 : 2);

/** Trọng số loại khối theo dải (soil, stone, granite, obsidian). */
export const KIND_WEIGHTS: readonly (readonly [MineTileKind, number][])[] = [
  [
    ['soil', 70],
    ['stone', 30],
  ],
  [
    ['soil', 25],
    ['stone', 50],
    ['granite', 25],
  ],
  [
    ['stone', 30],
    ['granite', 50],
    ['obsidian', 20],
  ],
];

export type LootRoll =
  | { kind: 'nothing' }
  | { kind: 'gold'; min: number; max: number }
  | { kind: 'item'; id: ChestItemId; min: number; max: number }
  | { kind: 'ruby' };

/** Trọng số đồ rơi theo dải. Vật liệu theo độ sâu: đất mây ở nông, thủy tinh sương ở giữa, đá mặt trời ở sâu. */
export const LOOT_WEIGHTS: readonly (readonly [LootRoll, number][])[] = [
  [
    [{ kind: 'nothing' }, 40],
    [{ kind: 'gold', min: 10, max: 30 }, 25],
    [{ kind: 'item', id: 'cloudclay', min: 1, max: 3 }, 30],
    [{ kind: 'ruby' }, 2],
    [{ kind: 'item', id: 'petTreat', min: 1, max: 1 }, 3],
  ],
  [
    [{ kind: 'nothing' }, 30],
    [{ kind: 'gold', min: 30, max: 80 }, 20],
    [{ kind: 'item', id: 'cloudclay', min: 1, max: 2 }, 15],
    [{ kind: 'item', id: 'dewglass', min: 1, max: 2 }, 25],
    [{ kind: 'ruby' }, 3],
    [{ kind: 'item', id: 'petTreat', min: 1, max: 1 }, 5],
    [{ kind: 'item', id: 'cloudBomb', min: 1, max: 1 }, 2],
  ],
  [
    [{ kind: 'nothing' }, 20],
    [{ kind: 'gold', min: 80, max: 200 }, 15],
    [{ kind: 'item', id: 'dewglass', min: 1, max: 2 }, 22],
    [{ kind: 'item', id: 'sunstone', min: 1, max: 2 }, 15],
    [{ kind: 'ruby' }, 5],
    [{ kind: 'item', id: 'petTreat', min: 1, max: 1 }, 5],
    [{ kind: 'item', id: 'cloudBomb', min: 1, max: 1 }, 3],
  ],
];

/** Rương ở hàng cuối: vàng, ruby, đá mặt trời, một quả bom; có cơ hội ra bụi sao. */
export const CHEST = {
  gold: [200, 500] as const,
  ruby: [2, 3] as const,
  sunstone: 2,
  cloudBomb: 1,
  stardustChancePct: 30,
};

/** XP khi phá một khối = độ bền gốc của khối. */
export const tileXp = (kind: MineTileKind): number => TILE_HP[kind];
