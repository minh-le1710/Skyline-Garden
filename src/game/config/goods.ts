import type { BarnItemId, Counts, GoodId, MachineId } from '../types';

export interface GoodDef {
  id: GoodId;
  machine: MachineId;
  unlockLevel: number;
  /** Nguyên liệu cho một mẻ (nông sản và/hoặc hàng chế biến khác). */
  inputs: Counts<BarnItemId>;
  minutes: number;
  sellPrice: number;
  /** XP khi lấy hàng ra khỏi máy. */
  xp: number;
}

const g = (
  id: GoodId,
  machine: MachineId,
  unlockLevel: number,
  inputs: Counts<BarnItemId>,
  minutes: number,
  sellPrice: number,
  xp: number,
): GoodDef => ({ id, machine, unlockLevel, inputs, minutes, sellPrice, xp });

// Giá bán ≈ (giá trị nguyên liệu × 1,2) + số phút; XP ≈ 2 + 0,45 × số phút.
export const GOODS: Record<GoodId, GoodDef> = {
  rose_water: g('rose_water', 'still', 4, { rose: 4 }, 5, 25, 4),
  mint_oil: g('mint_oil', 'still', 4, { mint: 3 }, 15, 95, 9),
  lavender_oil: g('lavender_oil', 'still', 5, { lavender: 3 }, 25, 135, 13),
  lotus_essence: g('lotus_essence', 'still', 13, { lotus: 2, rose_water: 1 }, 90, 515, 43),
  strawberry_jam: g('strawberry_jam', 'kettle', 6, { strawberry: 4 }, 15, 85, 9),
  apple_jam: g('apple_jam', 'kettle', 7, { apple: 3 }, 40, 310, 20),
  dragonfruit_jam: g('dragonfruit_jam', 'kettle', 19, { dragonfruit: 2, strawberry: 3 }, 120, 1040, 56),
  roasted_seeds: g('roasted_seeds', 'roaster', 8, { sunflower: 5 }, 10, 60, 7),
  green_tea: g('green_tea', 'roaster', 8, { tea: 3 }, 30, 190, 16),
  mint_tea: g('mint_tea', 'roaster', 9, { tea: 2, mint: 2 }, 45, 205, 22),
  lotus_tea: g('lotus_tea', 'roaster', 13, { tea: 3, lotus: 1 }, 120, 480, 56),
  yarn: g('yarn', 'loom', 11, { cotton: 3 }, 40, 380, 20),
  cloth: g('cloth', 'loom', 12, { yarn: 2 }, 90, 1000, 43),
  scented_sachet: g('scented_sachet', 'loom', 14, { cloth: 1, lavender_oil: 1 }, 60, 1420, 29),
  apple_juice: g('apple_juice', 'press', 13, { apple: 3 }, 30, 300, 16),
  smoothie: g('smoothie', 'press', 13, { banana: 1, strawberry: 2, apple: 1 }, 45, 315, 22),
  coconut_milk: g('coconut_milk', 'press', 14, { coconut: 2 }, 60, 565, 29),
  starfruit_juice: g('starfruit_juice', 'press', 25, { starfruit: 2 }, 120, 1390, 56),
  chocolate: g('chocolate', 'oven', 16, { cocoa: 3 }, 60, 1085, 29),
  banana_bread: g('banana_bread', 'oven', 16, { banana: 2, roasted_seeds: 1 }, 75, 435, 36),
  vanilla_cake: g('vanilla_cake', 'oven', 22, { vanilla: 1, chocolate: 1, apple_jam: 1 }, 180, 2380, 83),
  bouquet: g('bouquet', 'atelier', 21, { lily: 3, rose: 5, yarn: 1 }, 60, 755, 29),
  spa_basket: g(
    'spa_basket',
    'atelier',
    23,
    { lavender_oil: 1, lotus_essence: 1, scented_sachet: 1 },
    180,
    2665,
    83,
  ),
  grand_hamper: g(
    'grand_hamper',
    'atelier',
    26,
    { vanilla_cake: 1, starfruit_juice: 1, dragonfruit_jam: 1 },
    360,
    6130,
    164,
  ),
};

export const GOOD_LIST: GoodDef[] = Object.values(GOODS);
