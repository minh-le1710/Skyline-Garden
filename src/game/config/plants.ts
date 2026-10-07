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

const MIN = 60;
const HOUR = 3600;

// Thứ tự trong object cũng là thứ tự hiển thị trong shop.
export const PLANTS: Record<PlantId, PlantDef> = {
  rose: { id: 'rose', seedPrice: 5, growSec: 30, yield: 2, sellPrice: 4, xp: 1, unlockLevel: 1 },
  sunflower: {
    id: 'sunflower',
    seedPrice: 10,
    growSec: 2 * MIN,
    yield: 2,
    sellPrice: 8,
    xp: 2,
    unlockLevel: 1,
  },
  strawberry: {
    id: 'strawberry',
    seedPrice: 20,
    growSec: 5 * MIN,
    yield: 2,
    sellPrice: 15,
    xp: 3,
    unlockLevel: 2,
  },
  mint: { id: 'mint', seedPrice: 30, growSec: 10 * MIN, yield: 2, sellPrice: 22, xp: 5, unlockLevel: 3 },
  lavender: {
    id: 'lavender',
    seedPrice: 40,
    growSec: 15 * MIN,
    yield: 2,
    sellPrice: 30,
    xp: 6,
    unlockLevel: 4,
  },
  tea: { id: 'tea', seedPrice: 60, growSec: 30 * MIN, yield: 2, sellPrice: 45, xp: 9, unlockLevel: 5 },
  lily: { id: 'lily', seedPrice: 80, growSec: 45 * MIN, yield: 2, sellPrice: 60, xp: 12, unlockLevel: 6 },
  apple: { id: 'apple', seedPrice: 100, growSec: HOUR, yield: 2, sellPrice: 75, xp: 15, unlockLevel: 7 },
  cotton: {
    id: 'cotton',
    seedPrice: 130,
    growSec: 90 * MIN,
    yield: 2,
    sellPrice: 95,
    xp: 20,
    unlockLevel: 9,
  },
  banana: {
    id: 'banana',
    seedPrice: 160,
    growSec: 2 * HOUR,
    yield: 2,
    sellPrice: 120,
    xp: 25,
    unlockLevel: 10,
  },
  lotus: {
    id: 'lotus',
    seedPrice: 220,
    growSec: 3 * HOUR,
    yield: 2,
    sellPrice: 165,
    xp: 34,
    unlockLevel: 12,
  },
  coconut: {
    id: 'coconut',
    seedPrice: 280,
    growSec: 4 * HOUR,
    yield: 2,
    sellPrice: 210,
    xp: 42,
    unlockLevel: 14,
  },
  cocoa: {
    id: 'cocoa',
    seedPrice: 380,
    growSec: 6 * HOUR,
    yield: 2,
    sellPrice: 285,
    xp: 58,
    unlockLevel: 16,
  },
  dragonfruit: {
    id: 'dragonfruit',
    seedPrice: 480,
    growSec: 8 * HOUR,
    yield: 2,
    sellPrice: 360,
    xp: 72,
    unlockLevel: 19,
  },
  vanilla: {
    id: 'vanilla',
    seedPrice: 580,
    growSec: 10 * HOUR,
    yield: 2,
    sellPrice: 440,
    xp: 86,
    unlockLevel: 22,
  },
  starfruit: {
    id: 'starfruit',
    seedPrice: 700,
    growSec: 12 * HOUR,
    yield: 2,
    sellPrice: 530,
    xp: 100,
    unlockLevel: 25,
  },
};

export const PLANT_LIST: PlantDef[] = Object.values(PLANTS);
