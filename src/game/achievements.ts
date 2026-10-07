import { ACHIEVEMENTS, type AchievementTier } from './config/achievements';
import { commit, fail } from './commit';
import { grantReward } from './rewards';
import {
  ACHIEVEMENT_IDS,
  type AchievementId,
  type ActionResult,
  type GameEvent,
  type GameState,
} from './types';

/** Giá trị hiện tại của chỉ số mà thành tựu theo dõi. */
export function achievementValue(s: GameState, id: AchievementId): number {
  const stat = ACHIEVEMENTS[id].stat;
  if (stat === 'level') return s.level;
  if (stat === 'floors') return s.floors.length;
  return s.stats[stat] ?? 0;
}

/** Số bậc đã nhận thưởng. */
export const claimedTiers = (s: GameState, id: AchievementId): number => s.achievements[id] ?? 0;

export interface AchievementProgress {
  id: AchievementId;
  value: number;
  /** Số bậc đã nhận. */
  claimed: number;
  /** Số bậc đã đạt (có thể chưa nhận). */
  reached: number;
  /** Bậc kế tiếp chưa nhận, null nếu đã nhận hết. */
  next: AchievementTier | null;
  claimable: boolean;
}

export function achievementProgress(s: GameState, id: AchievementId): AchievementProgress {
  const tiers = ACHIEVEMENTS[id].tiers;
  const value = achievementValue(s, id);
  const claimed = Math.min(claimedTiers(s, id), tiers.length);
  const reached = tiers.filter((t) => value >= t.goal).length;
  const next = tiers[claimed] ?? null;
  return { id, value, claimed, reached, next, claimable: next !== null && value >= next.goal };
}

/** Số bậc thành tựu đang chờ nhận (huy hiệu trên nút 🏆). */
export function claimableCount(s: GameState): number {
  let n = 0;
  for (const id of ACHIEVEMENT_IDS) {
    const p = achievementProgress(s, id);
    n += Math.max(0, p.reached - p.claimed);
  }
  return n;
}

/**
 * Bước cuối của applyMeta: báo các bậc vừa đạt trong lệnh này (giá trị trước lệnh chưa tới mục tiêu,
 * sau lệnh đã tới). Bậc đã đạt từ trước không báo lại.
 */
export function checkAchievements(before: GameState, after: GameState, events: GameEvent[]): void {
  for (const id of ACHIEVEMENT_IDS) {
    const from = achievementValue(before, id);
    const to = achievementValue(after, id);
    if (to <= from) continue;
    ACHIEVEMENTS[id].tiers.forEach((tier, index) => {
      if (index >= claimedTiers(after, id) && from < tier.goal && to >= tier.goal) {
        events.push({ type: 'achievementUnlocked', id, tier: index });
      }
    });
  }
}

/** Nhận thưởng bậc kế tiếp của một thành tựu. */
export function claimAchievement(state: GameState, id: AchievementId, now: number): ActionResult {
  const progress = achievementProgress(state, id);
  if (!progress.next) return fail('ALREADY_CLAIMED');
  if (!progress.claimable) return fail('NOT_ACHIEVED');
  const tier = progress.claimed;
  const reward = progress.next.reward;
  return commit(state, now, (draft, events) => {
    draft.achievements[id] = tier + 1;
    grantReward(draft, reward, now, events);
    events.push({ type: 'achievementClaimed', id, tier, reward });
  });
}
