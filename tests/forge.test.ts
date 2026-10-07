import { describe, expect, it } from 'vitest';
import {
  FORGES,
  POT_BAG_MAX,
  Rng,
  SALVAGE,
  buildMachine,
  buyPot,
  cancelJob,
  collectMachine,
  potStat,
  rollForgedPot,
  salvagePot,
  sellPot,
  startJob,
  storePot,
  type GameState,
  type Machine,
  type Rarity,
} from '../src/game';
import { T0, errorOf, newGame, ok } from './helpers';

function withKiln(): GameState {
  const s = newGame();
  s.level = 20;
  s.gold = 100_000;
  s.items = { cloudclay: 40, dewglass: 20, sunstone: 10, stardust: 2 };
  return ok(buildMachine(s, 'kiln', 1, 3, T0));
}

describe('tung chậu từ lò đúc', () => {
  it('độ hiếm đúng tỉ lệ, số dòng chỉ số và khoảng giá trị đúng bậc', () => {
    const counts: Record<Rarity, number> = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 };
    const LINES: Record<Rarity, number> = { common: 1, uncommon: 2, rare: 2, epic: 3, legendary: 4 };
    for (let seed = 0; seed < 10_000; seed++) {
      const pot = rollForgedPot(new Rng(seed), FORGES.forge_glazed.odds);
      counts[pot.rarity]++;
      expect(Object.keys(pot.stats)).toHaveLength(LINES[pot.rarity]);
      for (const v of Object.values(pot.stats)) expect(v).toBeGreaterThan(0);
    }
    // forge_glazed: 30/45/20/5/0
    expect(counts.common / 10_000).toBeCloseTo(0.3, 1);
    expect(counts.uncommon / 10_000).toBeCloseTo(0.45, 1);
    expect(counts.rare / 10_000).toBeCloseTo(0.2, 1);
    expect(counts.legendary).toBe(0);
  });
});

describe('lò nung chậu', () => {
  it('đúc chậu: tốn vật liệu + vàng, chậu vào kho chậu, cộng XP và thống kê', () => {
    let s = withKiln();
    const gold = s.gold;
    s = ok(startJob(s, 1, 3, 'forge_basic', T0));
    expect(s.items.cloudclay).toBe(40 - 8);
    expect(s.gold).toBe(gold - FORGES.forge_basic.gold);
    expect(errorOf(collectMachine(s, 1, 3, T0 + 29 * 60_000))).toBe('NOTHING_TO_COLLECT');
    const r = collectMachine(s, 1, 3, T0 + 30 * 60_000);
    s = ok(r);
    expect(s.potBag).toHaveLength(1);
    expect(s.potBag[0]!.origin).toBe('forge');
    expect(r.ok && r.events.find((e) => e.type === 'potForged')).toBeTruthy();
    expect(s.stats.potsForged).toBe(1);
    expect((s.floors[1]!.slots[3] as Machine).queue).toHaveLength(0);
  });

  it('kho chậu đầy thì chậu đúc nằm chờ trong lò', () => {
    let s = withKiln();
    s = ok(startJob(s, 1, 3, 'forge_basic', T0));
    s.gold = 1e6;
    s = ok(buyPot(s, 'clay', POT_BAG_MAX, T0));
    expect(errorOf(collectMachine(s, 1, 3, T0 + 3_600_000))).toBe('POT_BAG_FULL');
  });

  it('hủy mẻ đúc hoàn lại vật liệu và vàng', () => {
    let s = withKiln();
    s = ok(startJob(s, 1, 3, 'forge_basic', T0));
    s = ok(startJob(s, 1, 3, 'forge_basic', T0));
    const before = { clay: s.items.cloudclay, gold: s.gold };
    s = ok(cancelJob(s, 1, 3, 1, T0 + 1000));
    expect(s.items.cloudclay).toBe(before.clay! + 8);
    expect(s.gold).toBe(before.gold + FORGES.forge_basic.gold);
  });
});

describe('cất, bán, phân rã chậu', () => {
  it('cất chậu trống vào kho; chậu có cây thì không cất được', () => {
    const s = newGame();
    s.seeds.rose = 1;
    const stored = ok(storePot(s, 0, 0, T0));
    expect(stored.floors[0]!.slots[0]).toBeNull();
    expect(stored.potBag.at(-1)).toMatchObject({ uid: 1, potId: 'clay' });
    expect(stored.potBag.at(-1)).not.toHaveProperty('plant');
    expect(errorOf(storePot(s, 1, 5, T0))).toBe('NO_POT');
  });

  it('chỉ bán được chậu cửa hàng; chỉ phân rã được chậu đúc', () => {
    let s = ok(buyPot(newGame(), 'clay', 1, T0));
    const shopUid = s.potBag[0]!.uid;
    expect(errorOf(salvagePot(s, shopUid, T0))).toBe('CANNOT_SALVAGE');
    s = ok(sellPot(s, shopUid, T0));
    expect(s.gold).toBe(100 - 40 + 10);
    s.potBag.push({ uid: s.nextUid++, potId: 'jade', rarity: 'rare', stats: { xpPct: 12 }, origin: 'forge' });
    const forged = s.potBag.at(-1)!;
    expect(errorOf(sellPot(s, forged.uid, T0))).toBe('CANNOT_SELL');
    s = ok(salvagePot(s, forged.uid, T0));
    expect(s.items).toMatchObject(SALVAGE.rare);
    expect(potStat(forged, 'xpPct')).toBe(12);
  });
});
