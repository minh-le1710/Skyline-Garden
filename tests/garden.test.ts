import { describe, expect, it } from 'vitest';
import {
  PLANTS,
  POT_BAG_MAX,
  SHOP_POTS,
  STORAGE_UPGRADES,
  buyPot,
  buySeed,
  growthProgress,
  harvest,
  placePot,
  plant,
  sellItem,
  speedUp,
  storageUsed,
  upgradeStorage,
  type GameState,
  type Pot,
} from '../src/game';
import { T0, errorOf, newGame, ok } from './helpers';

const potAt = (s: GameState, floor: number, slot: number) => s.floors[floor]!.slots[slot] as Pot;

/** Mua một chậu rồi đặt vào ô (floor, slot). */
function placeShopPot(s: GameState, potId: 'clay' | 'ceramic' | 'porcelain', floor: number, slot: number) {
  s = ok(buyPot(s, potId, 1, T0));
  const uid = s.potBag.at(-1)!.uid;
  return ok(placePot(s, floor, slot, uid, T0));
}

describe('trồng cây', () => {
  it('trồng vào chậu trống, trừ hạt giống, ghi sản lượng', () => {
    const s = ok(plant(newGame(), 0, 0, 'rose', T0));
    expect(s.seeds.rose).toBe(5);
    expect(potAt(s, 0, 0).plant).toEqual({
      plantId: 'rose',
      plantedAt: T0,
      growMs: 30_000,
      yield: 2,
      pest: null,
    });
    expect(s.stats.seedsPlanted).toBe(1);
  });

  it('không làm thay đổi state cũ', () => {
    const before = newGame();
    const snapshot = structuredClone(before);
    plant(before, 0, 0, 'rose', T0);
    expect(before).toEqual(snapshot);
  });

  it('từ chối khi ô đang có cây, ô chưa có chậu, hết hạt hoặc ô không tồn tại', () => {
    const s = ok(plant(newGame(), 0, 0, 'rose', T0));
    expect(errorOf(plant(s, 0, 0, 'rose', T0))).toBe('SLOT_BUSY');
    expect(errorOf(plant(s, 1, 5, 'rose', T0))).toBe('NO_POT');
    expect(errorOf(plant(s, 0, 1, 'lily', T0))).toBe('NO_SEED');
    expect(errorOf(plant(s, 9, 0, 'rose', T0))).toBe('INVALID');
    expect(errorOf(plant(s, 0, 6, 'rose', T0))).toBe('INVALID');
  });

  it('chậu có chỉ số giảm thời gian lớn', () => {
    let s = newGame();
    s.level = 8;
    s.gold = 5000;
    s = placeShopPot(s, 'porcelain', 1, 4);
    s = ok(plant(s, 1, 4, 'rose', T0));
    const expected = Math.round(PLANTS.rose.growSec * 1000 * (1 - SHOP_POTS.porcelain!.stats.timePct! / 100));
    expect(potAt(s, 1, 4).plant!.growMs).toBe(expected);
  });

  it('tiến độ lớn kẹp trong 0..1 kể cả khi đồng hồ lùi', () => {
    const p = { plantId: 'rose' as const, plantedAt: T0, growMs: 30_000, yield: 2, pest: null };
    expect(growthProgress(p, T0 - 5_000)).toBe(0);
    expect(growthProgress(p, T0 + 15_000)).toBe(0.5);
    expect(growthProgress(p, T0 + 99_000)).toBe(1);
  });
});

describe('thu hoạch', () => {
  it('chưa chín thì không thu hoạch được', () => {
    const s = ok(plant(newGame(), 0, 0, 'rose', T0));
    expect(errorOf(harvest(s, 0, 0, T0 + 29_999))).toBe('NOT_READY');
  });

  it('cây vẫn lớn khi tắt game: chỉ cần thời gian trôi qua', () => {
    let s = ok(plant(newGame(), 0, 0, 'rose', T0));
    s = ok(harvest(s, 0, 0, T0 + 3_600_000));
    expect(s.items.rose).toBe(2);
    expect(potAt(s, 0, 0).plant).toBeNull();
    expect(s.xp).toBe(PLANTS.rose.xp);
    expect(s.stats).toMatchObject({ harvests: 1, cropsHarvested: 2 });
  });

  it('chậu cộng XP cho lần thu hoạch', () => {
    let s = newGame();
    s.level = 6;
    s.gold = 5000;
    s.seeds.lily = 1;
    s = placeShopPot(s, 'ceramic', 1, 3);
    s = ok(plant(s, 1, 3, 'lily', T0));
    const r = harvest(s, 1, 3, T0 + PLANTS.lily.growSec * 1000);
    const xp = Math.round(PLANTS.lily.xp * (1 + SHOP_POTS.ceramic!.stats.xpPct! / 100));
    expect(r.ok && r.events.find((e) => e.type === 'harvested')).toMatchObject({ xp });
  });

  it('kho đầy thì không thu hoạch được; vật liệu không chiếm chỗ', () => {
    const s = ok(plant(newGame(), 0, 0, 'rose', T0));
    s.items = { sunflower: s.storageCapacity - 1, cloudclay: 99 };
    expect(storageUsed(s)).toBe(s.storageCapacity - 1);
    expect(errorOf(harvest(s, 0, 0, T0 + 30_000))).toBe('STORAGE_FULL');
  });

  it('dùng ruby để chín ngay', () => {
    let s = ok(plant(newGame(), 0, 0, 'rose', T0));
    s = ok(speedUp(s, 0, 0, T0 + 1_000));
    expect(s.ruby).toBe(4);
    expect(s.stats.rubySpent).toBe(1);
    expect(errorOf(speedUp(s, 0, 0, T0 + 1_000))).toBe('ALREADY_READY');
    expect(harvest(s, 0, 0, T0 + 1_000).ok).toBe(true);
  });
});

describe('cửa hàng và kho', () => {
  it('mua hạt trừ vàng, kiểm tra cấp và số vàng', () => {
    const s = ok(buySeed(newGame(), 'rose', 4, T0));
    expect(s.gold).toBe(100 - 4 * PLANTS.rose.seedPrice);
    expect(s.seeds.rose).toBe(10);
    expect(errorOf(buySeed(s, 'coconut', 1, T0))).toBe('LEVEL_TOO_LOW');
    expect(errorOf(buySeed(s, 'sunflower', 100, T0))).toBe('NOT_ENOUGH_GOLD');
    expect(errorOf(buySeed(s, 'rose', 0, T0))).toBe('INVALID');
    expect(errorOf(buySeed(s, 'rose', 1.5, T0))).toBe('INVALID');
  });

  it('mỗi chậu mua về là một chiếc riêng có uid, đặt bằng uid', () => {
    let s = ok(buyPot(newGame(), 'clay', 2, T0));
    expect(s.potBag.map((p) => p.uid)).toEqual([9, 10]);
    expect(s.potBag[0]).toMatchObject({ potId: 'clay', rarity: 'common', origin: 'shop' });
    expect(errorOf(placePot(s, 0, 0, 9, T0))).toBe('SLOT_OCCUPIED');
    expect(errorOf(placePot(s, 1, 2, 999, T0))).toBe('POT_NOT_FOUND');
    s = ok(placePot(s, 1, 2, 9, T0));
    expect(s.potBag.map((p) => p.uid)).toEqual([10]);
    expect(potAt(s, 1, 2)).toMatchObject({ kind: 'pot', uid: 9, plant: null });
    expect(errorOf(buyPot(s, 'jade', 1, T0))).toBe('INVALID');
  });

  it('kho chậu có giới hạn', () => {
    const s = newGame();
    s.gold = 1e6;
    expect(errorOf(buyPot(s, 'clay', POT_BAG_MAX + 1, T0))).toBe('POT_BAG_FULL');
  });

  it('bán nông sản lấy vàng, vật liệu không bán được', () => {
    const start = newGame();
    start.items = { rose: 5, cloudclay: 3 };
    const s = ok(sellItem(start, 'rose', 3, T0));
    expect(s.items.rose).toBe(2);
    expect(s.gold).toBe(100 + 3 * PLANTS.rose.sellPrice);
    expect(storageUsed(s)).toBe(2);
    expect(errorOf(sellItem(s, 'rose', 3, T0))).toBe('NOT_ENOUGH_ITEMS');
    expect(errorOf(sellItem(s, 'cloudclay' as never, 1, T0))).toBe('INVALID');
  });

  it('nâng cấp kho theo bảng, mức cao cần vật liệu', () => {
    let s = newGame();
    s.gold = 1e6;
    for (let i = 0; i < 3; i++) s = ok(upgradeStorage(s, T0));
    expect(s.storageCapacity).toBe(50 + 75);
    expect(errorOf(upgradeStorage(s, T0))).toBe('NOT_ENOUGH_ITEMS');
    s.items.cloudclay = STORAGE_UPGRADES[3]!.materials.cloudclay!;
    s = ok(upgradeStorage(s, T0));
    expect(s.items.cloudclay).toBeUndefined();
    expect(s.storageUpgrades).toBe(4);
  });
});

describe('id lạ từ dữ liệu bên ngoài', () => {
  it('không làm hỏng state với id kế thừa từ Object', () => {
    const s = newGame();
    s.items = { rose: 3 };
    for (const id of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(errorOf(sellItem(s, id as never, 1, T0))).toBe('INVALID');
      expect(errorOf(buySeed(s, id as never, 1, T0))).toBe('INVALID');
      expect(errorOf(buyPot(s, id as never, 1, T0))).toBe('INVALID');
      expect(errorOf(plant(s, 0, 0, id as never, T0))).toBe('INVALID');
    }
  });

  it('từ chối chỉ số ô không phải số nguyên', () => {
    const s = newGame();
    expect(errorOf(plant(s, 0.5, 0, 'rose', T0))).toBe('INVALID');
    expect(errorOf(plant(s, 0, -1, 'rose', T0))).toBe('INVALID');
    expect(errorOf(plant(s, Number.NaN, 0, 'rose', T0))).toBe('INVALID');
    expect(errorOf(placePot(s, 1, 4, 1.5, T0))).toBe('INVALID');
  });
});
