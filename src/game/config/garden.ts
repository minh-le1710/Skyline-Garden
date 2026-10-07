export const SLOTS_PER_FLOOR = 6;

/** Giá và cấp yêu cầu để mở tầng thứ i (tính từ 0). Hai tầng đầu có sẵn. */
export const FLOOR_UNLOCKS: { gold: number; level: number }[] = [
  { gold: 0, level: 1 },
  { gold: 0, level: 1 },
  { gold: 300, level: 3 },
  { gold: 1000, level: 5 },
  { gold: 2500, level: 7 },
  { gold: 5000, level: 9 },
  { gold: 9000, level: 11 },
  { gold: 15000, level: 13 },
];
export const MAX_FLOORS = FLOOR_UNLOCKS.length;

export const START_STORAGE = 50;
export const STORAGE_UPGRADE_STEP = 25;
export const storageUpgradeCost = (upgrades: number): number => 200 * (upgrades + 1);

/** Ruby để thu hoạch ngay: 1 ruby cho mỗi 10 phút còn lại, tối thiểu 1. */
export const speedUpCost = (remainingMs: number): number => Math.max(1, Math.ceil(remainingMs / 600_000));

export const START = {
  gold: 100,
  ruby: 5,
  seeds: { rose: 6, sunflower: 2 },
  /** Số chậu đất có sẵn trên tầng 0 và tầng 1. */
  potsPerFloor: [6, 2],
} as const;
