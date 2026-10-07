import { describe, expect, it } from 'vitest';
import {
  AWAY_COMPLETED_MS,
  AWAY_INCOMPLETE_MS,
  DOCK_MS,
  buildMachine,
  fillCrate,
  sendBalloon,
  tick,
  xpForLevel,
  type GameState,
} from '../src/game';
import { T0, errorOf, newGame, ok } from './helpers';

/** Ván cấp 12, có nồi chưng hương, đã có khinh khí cầu đậu. */
function docked(): GameState {
  let s = newGame();
  s.level = 12;
  s.xp = xpForLevel(12);
  s.gold = 100_000;
  while (s.orders.length < 6) s.orders.push({ order: null, readyAt: T0 });
  s = ok(buildMachine(s, 'still', 1, 3, T0));
  return ok(tick(s, T0));
}

describe('khinh khí cầu', () => {
  it('chưa đủ cấp thì không tới; đủ cấp thì đậu với 6 thùng', () => {
    expect(ok(tick(newGame(), T0)).balloon.phase).toBe('away');
    const s = docked();
    expect(s.balloon).toMatchObject({ phase: 'docked', arrivedAt: T0, leavesAt: T0 + DOCK_MS, trips: 1 });
    if (s.balloon.phase !== 'docked') return;
    expect(s.balloon.crates).toHaveLength(6);
    for (const c of s.balloon.crates) expect(c.gold).toBeGreaterThan(0);
  });

  it('xếp thùng: trừ hàng, cộng vàng và XP; không xếp lại được', () => {
    let s = docked();
    if (s.balloon.phase !== 'docked') throw new Error('chưa đậu');
    const crate = s.balloon.crates[0]!;
    expect(errorOf(fillCrate(s, 0, T0))).toBe('NOT_ENOUGH_ITEMS');
    s.items[crate.id] = crate.qty;
    const gold = s.gold;
    s = ok(fillCrate(s, 0, T0));
    expect(s.items[crate.id]).toBeUndefined();
    expect(s.gold).toBe(gold + crate.gold);
    expect(errorOf(fillCrate(s, 0, T0))).toBe('CRATE_FILLED');
    expect(s.stats.cratesFilled).toBe(1);
  });

  it('xếp đủ rồi cho bay: thưởng lớn, chuyến sau tới sau 3 giờ', () => {
    let s = docked();
    if (s.balloon.phase !== 'docked') throw new Error('chưa đậu');
    for (const [i, c] of s.balloon.crates.entries()) {
      s.items[c.id] = (s.items[c.id] ?? 0) + c.qty;
      s.storageCapacity = 1000;
      s.storageUpgrades = 20;
      s = ok(fillCrate(s, i, T0));
    }
    const ruby = s.ruby;
    const r = sendBalloon(s, T0 + 1000);
    s = ok(r);
    expect(r.ok && r.events.find((e) => e.type === 'balloonSent')).toMatchObject({ completed: true });
    expect(s.ruby).toBeGreaterThanOrEqual(ruby + 2);
    expect(s.balloon).toEqual({ phase: 'away', returnsAt: T0 + 1000 + AWAY_COMPLETED_MS, trips: 1 });
    expect(s.stats.balloonsCompleted).toBe(1);
    expect(errorOf(sendBalloon(s, T0))).toBe('BALLOON_AWAY');
  });

  it('hết giờ đậu thì tự bay; vắng mặt lâu chỉ đi và về một lần', () => {
    const s = docked();
    const later = ok(tick(s, T0 + DOCK_MS + AWAY_INCOMPLETE_MS + 1));
    // Rời đi lúc hết giờ, quay lại 6 giờ sau, và đậu lại từ "bây giờ".
    expect(later.balloon).toMatchObject({
      phase: 'docked',
      trips: 2,
      arrivedAt: T0 + DOCK_MS + AWAY_INCOMPLETE_MS + 1,
    });
    const gone = ok(tick(s, T0 + DOCK_MS));
    expect(gone.balloon).toEqual({ phase: 'away', returnsAt: T0 + DOCK_MS + AWAY_INCOMPLETE_MS, trips: 1 });
  });
});
