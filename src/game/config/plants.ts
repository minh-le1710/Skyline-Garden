import type { PlantId } from '../types';

export interface PlantDef {
  id: PlantId;
  /** Giá một hạt giống. */
  seedPrice: number;
  growSec: number;
  /** Số nông sản mỗi lần thu hoạch. */
  yield: number;
  /** Giá bán một nông sản cho cửa hàng. */
  sellPrice: number;
  /** XP mỗi lần thu hoạch. */
  xp: number;
  unlockLevel: number;
}

// Thứ tự trong object cũng là thứ tự hiển thị trong shop.
export const PLANTS: Record<PlantId, PlantDef> = {
  rose: { id: 'rose', seedPrice: 5, growSec: 30, yield: 2, sellPrice: 4, xp: 1, unlockLevel: 1 },
  sunflower: { id: 'sunflower', seedPrice: 10, growSec: 120, yield: 2, sellPrice: 8, xp: 2, unlockLevel: 1 },
  strawberry: {
    id: 'strawberry',
    seedPrice: 18,
    growSec: 300,
    yield: 2,
    sellPrice: 14,
    xp: 3,
    unlockLevel: 2,
  },
  lavender: { id: 'lavender', seedPrice: 30, growSec: 900, yield: 2, sellPrice: 25, xp: 5, unlockLevel: 3 },
  lily: { id: 'lily', seedPrice: 45, growSec: 1800, yield: 2, sellPrice: 38, xp: 8, unlockLevel: 4 },
  apple: { id: 'apple', seedPrice: 70, growSec: 3600, yield: 2, sellPrice: 60, xp: 12, unlockLevel: 5 },
  banana: { id: 'banana', seedPrice: 100, growSec: 7200, yield: 2, sellPrice: 85, xp: 18, unlockLevel: 6 },
  coconut: {
    id: 'coconut',
    seedPrice: 150,
    growSec: 14400,
    yield: 2,
    sellPrice: 125,
    xp: 26,
    unlockLevel: 8,
  },
};

export const PLANT_LIST: PlantDef[] = Object.values(PLANTS);
