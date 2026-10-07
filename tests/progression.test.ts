import { describe, expect, it } from 'vitest';
import {
  FLOOR_UNLOCKS,
  addXp,
  levelProgress,
  nextFloorUnlock,
  unlockFloor,
  unlockedPlants,
  xpForLevel,
  type GameEvent,
} from '../src/game';
import { T0, errorOf, newGame, ok } from './helpers';

describe('cấp độ', () => {
  it('ngưỡng XP tăng dần', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(10);
    expect(xpForLevel(3)).toBe(30);
  });

  it('lên nhiều cấp một lúc, nhận thưởng và thêm chỗ đơn hàng', () => {
    const s = newGame();
    const events: GameEvent[] = [];
    addXp(s, 30, T0, events);
    expect(s.level).toBe(3);
    expect(events.filter((e) => e.type === 'levelUp')).toHaveLength(2);
    expect(s.gold).toBe(100 + 40 + 60);
    expect(s.ruby).toBe(7);
    expect(s.orders).toHaveLength(4);
    expect(levelProgress(s)).toEqual({ current: 0, needed: 30, ratio: 0 });
  });

  it('mở khóa cây theo cấp', () => {
    expect(unlockedPlants(1)).toEqual(['rose', 'sunflower']);
    expect(unlockedPlants(3)).toContain('lavender');
  });
});

describe('mở tầng', () => {
  it('cần đủ cấp và vàng', () => {
    const s = newGame();
    expect(nextFloorUnlock(s)).toEqual({ floor: 2, ...FLOOR_UNLOCKS[2] });
    expect(errorOf(unlockFloor(s))).toBe('LEVEL_TOO_LOW');
    s.level = 3;
    expect(errorOf(unlockFloor(s))).toBe('NOT_ENOUGH_GOLD');
    s.gold = 500;
    const after = ok(unlockFloor(s));
    expect(after.floors).toHaveLength(3);
    expect(after.floors[2]!.slots).toEqual([null, null, null, null, null, null]);
    expect(after.gold).toBe(200);
  });

  it('không mở quá số tầng tối đa', () => {
    let s = newGame();
    s.level = 50;
    s.gold = 1e9;
    while (nextFloorUnlock(s)) s = ok(unlockFloor(s));
    expect(s.floors).toHaveLength(FLOOR_UNLOCKS.length);
    expect(errorOf(unlockFloor(s))).toBe('MAX_FLOORS');
  });
});
