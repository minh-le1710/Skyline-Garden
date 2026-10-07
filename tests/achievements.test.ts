import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  achievementProgress,
  checkAchievements,
  checkInvariants,
  claimAchievement,
  claimableCount,
  harvest,
  parseCommand,
  plant,
  sellItem,
  unlockFloor,
  type GameEvent,
  type GameState,
  type PotInstance,
} from '../src/game';
import { T0, errorOf, newGame, ok } from './helpers';

const unlocked = (events: GameEvent[]) =>
  events
    .filter((e) => e.type === 'achievementUnlocked')
    .map((e) => e.type === 'achievementUnlocked' && [e.id, e.tier]);

/** Trồng rồi thu hoạch một cây hoa hồng ở ô (0, 0). Trả về sự kiện của lần thu hoạch. */
function growAndHarvest(s: GameState, at: number): { state: GameState; events: GameEvent[] } {
  s = ok(plant(s, 0, 0, 'rose', at));
  const pot = s.floors[0]!.slots[0] as PotInstance & { plant: { growMs: number } };
  const r = harvest(s, 0, 0, at + pot.plant.growMs);
  if (!r.ok) throw new Error(r.error);
  return { state: r.state, events: r.events };
}

describe('thành tựu', () => {
  it('vượt mốc trong một lệnh thì báo đúng một lần', () => {
    let s = newGame();
    s.stats.harvests = 49;
    const first = growAndHarvest(s, T0);
    expect(unlocked(first.events)).toEqual([['green_thumb', 0]]);
    expect(first.state.stats.harvests).toBe(50);
    // Thu hoạch tiếp: mốc đã qua, không báo lại.
    s = first.state;
    const second = growAndHarvest(s, T0 + 3_600_000);
    expect(unlocked(second.events)).toEqual([]);
  });

  it('nhảy qua nhiều bậc một lúc thì báo từng bậc chưa nhận', () => {
    const before = newGame();
    const after = structuredClone(before);
    after.stats.goldEarned = 60_000;
    const events: GameEvent[] = [];
    checkAchievements(before, after, events);
    expect(unlocked(events)).toEqual([
      ['merchant', 0],
      ['merchant', 1],
    ]);
    // Bậc đã nhận thưởng thì không báo nữa.
    after.achievements.merchant = 1;
    const again: GameEvent[] = [];
    checkAchievements(before, after, again);
    expect(unlocked(again)).toEqual([['merchant', 1]]);
  });

  it('bán hàng cộng vàng kiếm được và mở thành tựu thương nhân', () => {
    const s = newGame();
    s.items = { rose: 40 };
    s.stats.goldEarned = 1990;
    const r = sellItem(s, 'rose', 40, T0);
    expect(r.ok && unlocked(r.events)).toEqual([['merchant', 0]]);
  });

  it('chỉ số suy ra (số tầng) cũng mở thành tựu', () => {
    let s = newGame();
    s.level = 10;
    s.gold = 100_000;
    expect(s.floors.length).toBe(2);
    s = ok(unlockFloor(s, T0));
    const r = unlockFloor(s, T0);
    expect(r.ok && unlocked(r.events)).toEqual([['sky_architect', 0]]);
  });

  it('nhận thưởng theo từng bậc, đúng lỗi khi chưa đạt hoặc đã nhận hết', () => {
    let s = newGame();
    expect(errorOf(claimAchievement(s, 'potter', T0))).toBe('NOT_ACHIEVED');
    s.stats.potsForged = 50;
    expect(claimableCount(s)).toBe(3);
    const ruby = s.ruby;
    for (const [i, tier] of ACHIEVEMENTS.potter.tiers.entries()) {
      const r = claimAchievement(s, 'potter', T0);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.events).toContainEqual({
        type: 'achievementClaimed',
        id: 'potter',
        tier: i,
        reward: tier.reward,
      });
      s = r.state;
      expect(s.achievements.potter).toBe(i + 1);
      expect(checkInvariants(s)).toEqual([]);
    }
    expect(s.ruby).toBe(ruby + 2 + 5 + 15);
    expect(claimableCount(s)).toBe(0);
    expect(errorOf(claimAchievement(s, 'potter', T0))).toBe('ALREADY_CLAIMED');
    expect(achievementProgress(s, 'potter').next).toBeNull();
  });

  it('chưa đạt bậc kế tiếp thì không nhận được', () => {
    let s = newGame();
    s.stats.ordersDelivered = 10;
    s = ok(claimAchievement(s, 'owl_friend', T0));
    expect(s.gold).toBe(100 + 150);
    expect(errorOf(claimAchievement(s, 'owl_friend', T0))).toBe('NOT_ACHIEVED');
  });

  it('lệnh nhận thưởng kiểm tra id', () => {
    expect(parseCommand({ type: 'claimAchievement', id: 'potter' })).toEqual({
      type: 'claimAchievement',
      id: 'potter',
    });
    expect(parseCommand({ type: 'claimAchievement', id: 'constructor' })).toBeNull();
    expect(parseCommand({ type: 'claimAchievement' })).toBeNull();
  });

  it('bất biến: không nhận quá số bậc', () => {
    const s = newGame();
    s.achievements.potter = 4;
    expect(checkInvariants(s).some((e) => e.includes('potter'))).toBe(true);
  });
});
