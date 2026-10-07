import type { Counts, MaterialId } from '../types';

export const SLOTS_PER_FLOOR = 6;

/** Giá và cấp yêu cầu để mở tầng thứ i (tính từ 0). Hai tầng đầu có sẵn. */
export const FLOOR_UNLOCKS: { gold: number; level: number }[] = [
  { gold: 0, level: 1 },
  { gold: 0, level: 1 },
  { gold: 400, level: 3 },
  { gold: 2000, level: 6 },
  { gold: 7500, level: 10 },
  { gold: 18000, level: 14 },
  { gold: 40000, level: 18 },
  { gold: 80000, level: 23 },
];
export const MAX_FLOORS = FLOOR_UNLOCKS.length;

export const START_STORAGE = 50;

export interface StorageUpgrade {
  gold: number;
  materials: Counts<MaterialId>;
  /** Sức chứa tăng thêm. */
  capacity: number;
}

/** Bảng nâng cấp kho (số literal, không tính bằng hàm mũ để client và server luôn giống nhau). */
export const STORAGE_UPGRADES: StorageUpgrade[] = [
  { gold: 250, materials: {}, capacity: 25 },
  { gold: 360, materials: {}, capacity: 25 },
  { gold: 530, materials: {}, capacity: 25 },
  { gold: 760, materials: { cloudclay: 5 }, capacity: 25 },
  { gold: 1110, materials: { cloudclay: 6 }, capacity: 25 },
  { gold: 1600, materials: { cloudclay: 7 }, capacity: 25 },
  { gold: 2320, materials: { cloudclay: 8, dewglass: 2 }, capacity: 50 },
  { gold: 3370, materials: { cloudclay: 9, dewglass: 3 }, capacity: 50 },
  { gold: 4890, materials: { cloudclay: 10, dewglass: 4 }, capacity: 50 },
  { gold: 7080, materials: { cloudclay: 11, dewglass: 5 }, capacity: 50 },
  { gold: 10270, materials: { cloudclay: 12, dewglass: 6, sunstone: 1 }, capacity: 50 },
  { gold: 14890, materials: { cloudclay: 13, dewglass: 7, sunstone: 2 }, capacity: 50 },
  { gold: 21600, materials: { cloudclay: 14, dewglass: 8, sunstone: 3 }, capacity: 50 },
  { gold: 31310, materials: { cloudclay: 15, dewglass: 9, sunstone: 4 }, capacity: 50 },
  { gold: 45400, materials: { cloudclay: 16, dewglass: 10, sunstone: 5 }, capacity: 100 },
  { gold: 65840, materials: { cloudclay: 17, dewglass: 11, sunstone: 6 }, capacity: 100 },
  { gold: 95460, materials: { cloudclay: 18, dewglass: 12, sunstone: 7 }, capacity: 100 },
  { gold: 138420, materials: { cloudclay: 19, dewglass: 13, sunstone: 8 }, capacity: 100 },
  { gold: 200710, materials: { cloudclay: 20, dewglass: 14, sunstone: 9 }, capacity: 100 },
  { gold: 291030, materials: { cloudclay: 21, dewglass: 15, sunstone: 10 }, capacity: 100 },
];

/** Sức chứa kho sau `upgrades` lần nâng cấp. */
export function storageCapacityAfter(upgrades: number): number {
  let cap = START_STORAGE;
  for (let i = 0; i < upgrades; i++) cap += STORAGE_UPGRADES[i]?.capacity ?? 0;
  return cap;
}

/** Ruby để thu hoạch ngay: 1 ruby cho mỗi 10 phút còn lại, tối thiểu 1. */
export const speedUpCost = (remainingMs: number): number => Math.max(1, Math.ceil(remainingMs / 600_000));

export const START = {
  gold: 100,
  ruby: 5,
  seeds: { rose: 6, sunflower: 2 },
  /** Số chậu đất có sẵn trên tầng 0 và tầng 1. */
  potsPerFloor: [6, 2],
} as const;
