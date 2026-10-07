import { describe, expect, it } from 'vitest';
import {
  FLOOR_UNLOCKS,
  XP_TABLE,
  addXp,
  levelProgress,
  levelUpReward,
  nextFloorUnlock,
  unlockFloor,
  unlockedPlants,
  unlocksAt,
  xpForLevel,
  type GameEvent,
} from '../src/game';
import { T0, errorOf, newGame, ok } from './helpers';

describe('cấp độ', () => {
  it('ngưỡng XP tăng dần', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(20);
    expect(xpForLevel(5)).toBe(310);
    for (let i = 1; i < XP_TABLE.length; i++) expect(XP_TABLE[i]!).toBeGreaterThan(XP_TABLE[i - 1]!);
  });

  it('lên nhiều cấp một lúc, nhận thưởng và thêm chỗ đơn hàng', () => {
    const s = newGame();
    const events: GameEvent[] = [];
    addXp(s, 60, T0, events);
    expect(s.level).toBe(3);
    expect(events.filter((e) => e.type === 'levelUp')).toHaveLength(2);
    expect(s.gold).toBe(100 + levelUpReward(2).gold + levelUpReward(3).gold);
    expect(s.ruby).toBe(7);
    expect(s.orders).toHaveLength(4);
    expect(levelProgress(s)).toEqual({ current: 0, needed: 90, ratio: 0 });
  });

  it('mở khóa cây theo cấp', () => {
    expect(unlockedPlants(1)).toEqual(['rose', 'sunflower']);
    expect(unlockedPlants(4)).toContain('lavender');
    expect(unlocksAt(3)).toEqual({ plants: ['mint'], pots: [], floors: [2] });
  });
});

describe('mở tầng', () => {
  it('cần đủ cấp và vàng', () => {
    const s = newGame();
    expect(nextFloorUnlock(s)).toEqual({ floor: 2, ...FLOOR_UNLOCKS[2] });
    expect(errorOf(unlockFloor(s, T0))).toBe('LEVEL_TOO_LOW');
    s.level = 3;
    expect(errorOf(unlockFloor(s, T0))).toBe('NOT_ENOUGH_GOLD');
    s.gold = 500;
    const after = ok(unlockFloor(s, T0));
    expect(after.floors).toHaveLength(3);
    expect(after.floors[2]!.slots).toEqual([null, null, null, null, null, null]);
    expect(after.gold).toBe(100);
  });

  it('không mở quá số tầng tối đa', () => {
    let s = newGame();
    s.level = 50;
    s.gold = 1e9;
    while (nextFloorUnlock(s)) s = ok(unlockFloor(s, T0));
    expect(s.floors).toHaveLength(FLOOR_UNLOCKS.length);
    expect(errorOf(unlockFloor(s, T0))).toBe('MAX_FLOORS');
  });
});
