export const MAX_LEVEL = 50;

/**
 * Tổng XP cần có để đạt từng cấp: XP_TABLE[L - 1] là ngưỡng của cấp L.
 * Sinh một lần từ công thức xpToNext(L) = max(20, round10(8·L²·1.06^L)) rồi ghi thành số literal
 * (không tính lũy thừa lúc chạy để client và server luôn giống nhau).
 * Đổi bảng này thì phải thêm migration quy đổi XP cho save cũ.
 */
export const XP_TABLE: readonly number[] = [
  0, 20, 60, 150, 310, 580, 990, 1580, 2400, 3490, 4920, 6760, 9080, 11960, 15510, 19820, 25020, 31250, 38650,
  47390, 57650, 69640, 83590, 99760, 118420, 139880, 164480, 192600, 224660, 261110, 302460, 349270, 402140,
  461740, 528800, 604120, 688590, 783170, 888920, 1006990, 1138650, 1285270, 1448360, 1629570, 1830690,
  2053680, 2300670, 2573980, 2876150, 3209940,
];

/** Tổng XP cần có để đạt cấp `level` (cấp 1 = 0 XP). */
export const xpForLevel = (level: number): number => XP_TABLE[Math.min(MAX_LEVEL, Math.max(1, level)) - 1]!;

/** XP cần để từ cấp `level` lên cấp kế. */
export const xpToNext = (level: number): number =>
  level >= MAX_LEVEL ? 0 : xpForLevel(level + 1) - xpForLevel(level);

/** Vàng thưởng khi lên cấp L: round10(30·L^1.5). */
const LEVEL_UP_GOLD: readonly number[] = [
  30, 80, 160, 240, 340, 440, 560, 680, 810, 950, 1090, 1250, 1410, 1570, 1740, 1920, 2100, 2290, 2480, 2680,
  2890, 3100, 3310, 3530, 3750, 3980, 4210, 4440, 4690, 4930, 5180, 5430, 5690, 5950, 6210, 6480, 6750, 7030,
  7310, 7590, 7880, 8170, 8460, 8760, 9060, 9360, 9670, 9980, 10290, 10610,
];

export const levelUpReward = (level: number): { gold: number; ruby: number } => ({
  gold: LEVEL_UP_GOLD[level - 1] ?? 0,
  ruby: level % 5 === 0 ? 3 : 1,
});
