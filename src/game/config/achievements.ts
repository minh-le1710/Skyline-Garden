import type { AchievementId, Reward, StatKey } from '../types';

/** Chỉ số suy ra từ state (không lưu trong `stats`). */
export type DerivedStat = 'level' | 'floors';

export interface AchievementTier {
  goal: number;
  reward: Reward;
}

export interface AchievementDef {
  stat: StatKey | DerivedStat;
  tiers: AchievementTier[];
}

/** Bậc thành tựu: mục tiêu tăng dần, thưởng chủ yếu là ruby. */
export const ACHIEVEMENTS: Record<AchievementId, AchievementDef> = {
  green_thumb: {
    stat: 'harvests',
    tiers: [
      { goal: 50, reward: { gold: 100 } },
      { goal: 500, reward: { ruby: 3 } },
      { goal: 5000, reward: { ruby: 10, items: { cloudBomb: 3 } } },
    ],
  },
  owl_friend: {
    stat: 'ordersDelivered',
    tiers: [
      { goal: 10, reward: { gold: 150 } },
      { goal: 100, reward: { ruby: 5 } },
      { goal: 500, reward: { ruby: 15 } },
    ],
  },
  merchant: {
    stat: 'goldEarned',
    tiers: [
      { goal: 2000, reward: { ruby: 2 } },
      { goal: 50_000, reward: { ruby: 5 } },
      { goal: 500_000, reward: { ruby: 20 } },
    ],
  },
  sky_architect: {
    stat: 'floors',
    tiers: [
      { goal: 4, reward: { ruby: 3 } },
      { goal: 6, reward: { ruby: 6 } },
      { goal: 8, reward: { ruby: 12 } },
    ],
  },
  rising_star: {
    stat: 'level',
    tiers: [
      { goal: 10, reward: { ruby: 5 } },
      { goal: 20, reward: { ruby: 10 } },
      { goal: 30, reward: { ruby: 20 } },
    ],
  },
  bug_buster: {
    stat: 'pestsCaught',
    tiers: [
      { goal: 20, reward: { gold: 200 } },
      { goal: 200, reward: { ruby: 5 } },
      { goal: 1000, reward: { ruby: 15 } },
    ],
  },
  artisan: {
    stat: 'goodsMade',
    tiers: [
      { goal: 50, reward: { gold: 300 } },
      { goal: 500, reward: { ruby: 5 } },
      { goal: 3000, reward: { ruby: 15 } },
    ],
  },
  potter: {
    stat: 'potsForged',
    tiers: [
      { goal: 1, reward: { ruby: 2 } },
      { goal: 10, reward: { ruby: 5 } },
      { goal: 50, reward: { ruby: 15 } },
    ],
  },
  balloonist: {
    stat: 'balloonsCompleted',
    tiers: [
      { goal: 5, reward: { ruby: 3 } },
      { goal: 30, reward: { ruby: 8 } },
      { goal: 100, reward: { ruby: 20 } },
    ],
  },
  dedicated: {
    stat: 'questsCompleted',
    tiers: [
      { goal: 10, reward: { ruby: 2 } },
      { goal: 50, reward: { ruby: 6 } },
      { goal: 200, reward: { ruby: 15 } },
    ],
  },
};
