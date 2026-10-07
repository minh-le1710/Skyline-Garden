import { describe, expect, it } from 'vitest';
import {
  DAY_MS,
  LOGIN_GIFTS,
  buildMachine,
  claimLogin,
  claimQuest,
  claimQuestBonus,
  dayIndex,
  dayStart,
  harvest,
  plant,
  rerollQuest,
  tick,
  weekIndex,
  type GameState,
} from '../src/game';
import { T0, errorOf, newGame, ok } from './helpers';

/** Ván ở cấp 3, đã sang ngày (có nhiệm vụ). */
function questGame(now = T0): GameState {
  const s = newGame();
  s.level = 3;
  s.xp = 60;
  s.orders.push({ order: null, readyAt: now });
  return ok(tick(s, now));
}

describe('lịch ngày (UTC+7)', () => {
  it('đổi ngày lúc 0 giờ giờ Việt Nam', () => {
    const midnightVN = Date.UTC(2026, 9, 7, 17, 0, 0); // 00:00 ngày 8/10 ở UTC+7
    expect(dayIndex(midnightVN) - dayIndex(midnightVN - 1)).toBe(1);
    expect(dayStart(dayIndex(midnightVN))).toBe(midnightVN);
  });

  it('tuần bắt đầu từ thứ Hai', () => {
    const sundayNight = Date.UTC(2026, 9, 11, 16, 59, 0); // CN 23:59 ở UTC+7
    expect(weekIndex(sundayNight + 60_000) - weekIndex(sundayNight)).toBe(1);
  });
});

describe('quà đăng nhập', () => {
  it('mỗi ngày nhận một lần, theo vòng 7 ngày', () => {
    let s = ok(tick(newGame(), T0));
    s = ok(claimLogin(s, T0));
    expect(s.gold).toBeGreaterThan(100);
    expect(errorOf(claimLogin(s, T0 + 1000))).toBe('ALREADY_CLAIMED');
    // Bỏ một ngày cũng không mất vòng.
    s = ok(claimLogin(s, T0 + 3 * DAY_MS));
    expect(s.items.cloudclay).toBe(LOGIN_GIFTS[1]!.items.cloudclay);
    expect(s.daily.loginCount).toBe(2);
    expect(s.stats.loginDays).toBe(2);
  });
});

describe('nhiệm vụ ngày', () => {
  it('chưa đủ cấp thì chưa có; đủ cấp thì có 3 nhiệm vụ khác loại', () => {
    expect(ok(tick(newGame(), T0)).daily.quests).toEqual([]);
    const s = questGame();
    expect(s.daily.quests).toHaveLength(3);
    expect(new Set(s.daily.quests.map((q) => q.kind)).size).toBe(3);
  });

  it('tiến độ tự cộng theo sự kiện; nhận thưởng khi xong; thưởng thêm khi xong hết', () => {
    let s = questGame();
    s.daily.quests = [
      { kind: 'harvestAny', target: null, goal: 2, progress: 0, claimed: false, reward: { gold: 50 } },
      { kind: 'deliverOrders', target: null, goal: 1, progress: 1, claimed: false, reward: { xp: 10 } },
    ];
    expect(errorOf(claimQuest(s, 0, T0))).toBe('QUEST_NOT_DONE');
    s = ok(plant(s, 0, 0, 'rose', T0));
    const r = harvest(s, 0, 0, T0 + 30_000);
    expect(r.ok && r.events.some((e) => e.type === 'questCompleted')).toBe(true);
    s = ok(r);
    expect(s.daily.quests[0]!.progress).toBe(2);
    s = ok(claimQuest(s, 0, T0 + 30_000));
    expect(errorOf(claimQuest(s, 0, T0 + 30_000))).toBe('ALREADY_CLAIMED');
    expect(errorOf(claimQuestBonus(s, T0 + 30_000))).toBe('QUEST_NOT_DONE');
    s = ok(claimQuest(s, 1, T0 + 30_000));
    s = ok(claimQuestBonus(s, T0 + 30_000));
    expect(s.daily.bonusClaimed).toBe(true);
    expect(s.stats.questsCompleted).toBe(2);
  });

  it('sang ngày mới thì làm mới nhiệm vụ', () => {
    const s = questGame();
    const next = ok(tick(s, T0 + DAY_MS));
    expect(next.daily.day).toBe(s.daily.day + 1);
    expect(next.daily.quests).toHaveLength(3);
    expect(next.daily.quests.every((q) => q.progress === 0)).toBe(true);
  });

  it('đổi nhiệm vụ: lần đầu miễn phí, sau đó 2 ruby, không trùng loại', () => {
    let s = questGame();
    s = ok(rerollQuest(s, 0, T0));
    expect(s.ruby).toBe(5);
    s = ok(rerollQuest(s, 0, T0));
    expect(s.ruby).toBe(3);
    expect(new Set(s.daily.quests.map((q) => q.kind)).size).toBe(3);
  });

  it('có máy thì có thể có nhiệm vụ làm hàng', () => {
    const kinds = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      const s = newGame();
      s.rng.daily = seed;
      s.level = 6;
      s.xp = 580;
      s.gold = 5000;
      while (s.orders.length < 5) s.orders.push({ order: null, readyAt: T0 });
      const built = ok(buildMachine(s, 'still', 1, 3, T0));
      for (const q of ok(tick(built, T0)).daily.quests) kinds.add(q.kind);
    }
    expect(kinds).toContain('collectGoods');
    expect(kinds).toContain('catchPests');
  });
});
