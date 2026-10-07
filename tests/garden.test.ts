import { describe, expect, it } from 'vitest';
import {
  PLANTS,
  POTS,
  buyPot,
  buySeed,
  growthProgress,
  harvest,
  placePot,
  plant,
  sellCrop,
  speedUp,
  storageUsed,
  upgradeStorage,
} from '../src/game';
import { T0, errorOf, newGame, ok } from './helpers';

describe('trồng cây', () => {
  it('trồng vào chậu trống, trừ hạt giống', () => {
    const s = ok(plant(newGame(), 0, 0, 'rose', T0));
    expect(s.seeds.rose).toBe(5);
    expect(s.floors[0]!.slots[0]!.plant).toEqual({ plantId: 'rose', plantedAt: T0, growMs: 30_000 });
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

  it('chậu sứ giảm thời gian lớn', () => {
    let s = newGame();
    s.level = 5;
    s.gold = 1000;
    s = ok(buyPot(s, 'porcelain'));
    s = ok(placePot(s, 1, 4, 'porcelain'));
    s = ok(plant(s, 1, 4, 'rose', T0));
    const expected = PLANTS.rose.growSec * 1000 * (1 - POTS.porcelain.timeReducePct / 100);
    expect(s.floors[1]!.slots[4]!.plant!.growMs).toBe(expected);
  });

  it('tiến độ lớn kẹp trong 0..1 kể cả khi đồng hồ lùi', () => {
    const p = { plantId: 'rose' as const, plantedAt: T0, growMs: 30_000 };
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
    expect(s.crops.rose).toBe(PLANTS.rose.yield);
    expect(s.floors[0]!.slots[0]!.plant).toBeNull();
    expect(s.xp).toBe(PLANTS.rose.xp);
  });

  it('chậu gốm cộng thêm XP', () => {
    let s = newGame();
    s.level = 3;
    s.gold = 1000;
    s.seeds.lily = 1;
    s = ok(buyPot(s, 'ceramic'));
    s = ok(placePot(s, 1, 3, 'ceramic'));
    s = ok(plant(s, 1, 3, 'lily', T0));
    const r = harvest(s, 1, 3, T0 + PLANTS.lily.growSec * 1000);
    expect(r.ok && r.events.find((e) => e.type === 'harvested')).toMatchObject({ xp: 10 });
  });

  it('kho đầy thì không thu hoạch được', () => {
    const s = ok(plant(newGame(), 0, 0, 'rose', T0));
    s.crops = { sunflower: s.storageCapacity - 1 };
    expect(errorOf(harvest(s, 0, 0, T0 + 30_000))).toBe('STORAGE_FULL');
  });

  it('dùng ruby để chín ngay', () => {
    let s = ok(plant(newGame(), 0, 0, 'rose', T0));
    s = ok(speedUp(s, 0, 0, T0 + 1_000));
    expect(s.ruby).toBe(4);
    expect(errorOf(speedUp(s, 0, 0, T0 + 1_000))).toBe('ALREADY_READY');
    expect(harvest(s, 0, 0, T0 + 1_000).ok).toBe(true);
  });
});

describe('cửa hàng và kho', () => {
  it('mua hạt trừ vàng, kiểm tra cấp và số vàng', () => {
    const s = ok(buySeed(newGame(), 'rose', 4));
    expect(s.gold).toBe(100 - 4 * PLANTS.rose.seedPrice);
    expect(s.seeds.rose).toBe(10);
    expect(errorOf(buySeed(s, 'coconut', 1))).toBe('LEVEL_TOO_LOW');
    expect(errorOf(buySeed(s, 'sunflower', 100))).toBe('NOT_ENOUGH_GOLD');
    expect(errorOf(buySeed(s, 'rose', 0))).toBe('INVALID');
    expect(errorOf(buySeed(s, 'rose', 1.5))).toBe('INVALID');
  });

  it('mua chậu rồi đặt vào ô trống', () => {
    let s = ok(buyPot(newGame(), 'clay'));
    expect(s.potStock.clay).toBe(1);
    expect(errorOf(placePot(s, 0, 0, 'clay'))).toBe('SLOT_OCCUPIED');
    s = ok(placePot(s, 1, 2, 'clay'));
    expect(s.potStock.clay).toBeUndefined();
    expect(errorOf(placePot(s, 1, 3, 'clay'))).toBe('NO_POT_STOCK');
  });

  it('bán nông sản lấy vàng', () => {
    const start = newGame();
    start.crops = { rose: 5 };
    const s = ok(sellCrop(start, 'rose', 3));
    expect(s.crops.rose).toBe(2);
    expect(s.gold).toBe(100 + 3 * PLANTS.rose.sellPrice);
    expect(storageUsed(s)).toBe(2);
    expect(errorOf(sellCrop(s, 'rose', 3))).toBe('NOT_ENOUGH_CROPS');
  });

  it('nâng cấp kho', () => {
    const start = newGame();
    start.gold = 1000;
    const s = ok(upgradeStorage(start));
    expect(s.storageCapacity).toBe(75);
    expect(s.gold).toBe(800);
  });
});

describe('id lạ từ dữ liệu bên ngoài', () => {
  it('không làm hỏng state với id kế thừa từ Object', () => {
    const s = newGame();
    s.crops = { rose: 3 };
    for (const id of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(errorOf(sellCrop(s, id as never, 1))).toBe('INVALID');
      expect(errorOf(buySeed(s, id as never, 1))).toBe('INVALID');
      expect(errorOf(buyPot(s, id as never))).toBe('INVALID');
      expect(errorOf(plant(s, 0, 0, id as never, T0))).toBe('INVALID');
      expect(errorOf(placePot(s, 1, 4, id as never))).toBe('INVALID');
    }
  });

  it('từ chối chỉ số ô không phải số nguyên', () => {
    const s = newGame();
    expect(errorOf(plant(s, 0.5, 0, 'rose', T0))).toBe('INVALID');
    expect(errorOf(plant(s, 0, -1, 'rose', T0))).toBe('INVALID');
    expect(errorOf(plant(s, Number.NaN, 0, 'rose', T0))).toBe('INVALID');
  });
});
