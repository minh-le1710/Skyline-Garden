export const MAX_LEVEL = 50;

/** Tổng XP cần có để đạt cấp `level` (cấp 1 = 0 XP). */
export const xpForLevel = (level: number): number => 5 * (level - 1) * level;

export const levelUpReward = (level: number): { gold: number; ruby: number } => ({
  gold: level * 20,
  ruby: 1,
});
