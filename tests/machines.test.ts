import { describe, expect, it } from 'vitest';
import {
  GOODS,
  MACHINES,
  buildMachine,
  cancelJob,
  collectMachine,
  machineStatus,
  machineUpgradeGold,
  producibleGoods,
  speedUpMachine,
  startJob,
  swapSlots,
  sweep,
  upgradeMachine,
  type GameState,
  type Machine,
} from '../src/game';
import { T0, errorOf, newGame, ok } from './helpers';

const MIN = 60_000;
const machineAt = (s: GameState, floor = 1, slot = 3) => s.floors[floor]!.slots[slot] as Machine;

/** Người chơi cấp 6, có nồi chưng hương ở ô (1,3) và nhiều hoa hồng. */
function withStill(): GameState {
  const s = newGame();
  s.level = 6;
  s.gold = 10_000;
  s.items = { rose: 30 };
  return ok(buildMachine(s, 'still', 1, 3, T0));
}

describe('mua và đặt máy', () => {
  it('cần đủ cấp, vàng, ô trống; mỗi loại chỉ một chiếc', () => {
    const s = newGame();
    expect(errorOf(buildMachine(s, 'still', 1, 3, T0))).toBe('LEVEL_TOO_LOW');
    s.level = 6;
    expect(errorOf(buildMachine(s, 'still', 1, 3, T0))).toBe('NOT_ENOUGH_GOLD');
    s.gold = 5000;
    expect(errorOf(buildMachine(s, 'still', 0, 0, T0))).toBe('SLOT_OCCUPIED');
    const built = ok(buildMachine(s, 'still', 1, 3, T0));
    expect(machineAt(built)).toEqual({ kind: 'machine', machineId: 'still', level: 1, queue: [] });
    expect(built.gold).toBe(5000 - MACHINES.still.price);
    expect(errorOf(buildMachine(built, 'still', 1, 4, T0))).toBe('MACHINE_OWNED');
    expect(producibleGoods(built)).toEqual(['rose_water', 'mint_oil', 'lavender_oil']);
  });
});

describe('hàng làm được', () => {
  it('không tính hàng có nguyên liệu chế biến mà người chơi không làm được', () => {
    const s = newGame();
    s.level = 16;
    s.gold = 100_000;
    // Có nồi chưng và lò nướng nhưng không có máy rang (hạt rang là nguyên liệu bánh chuối).
    let built = ok(buildMachine(s, 'still', 1, 2, T0));
    built = ok(buildMachine(built, 'oven', 1, 3, T0));
    const goods = producibleGoods(built);
    expect(goods).not.toContain('banana_bread');
    expect(goods).toContain('rose_water');
    // Mua thêm máy rang thì làm được.
    built = ok(buildMachine(built, 'roaster', 1, 4, T0));
    expect(producibleGoods(built)).toContain('banana_bread');
  });

  it('mọi hàng được tính đều có đủ máy cho cả chuỗi nguyên liệu', () => {
    const s = newGame();
    s.level = 50;
    s.gold = 1_000_000;
    let built = s;
    built = ok(buildMachine(built, 'atelier', 1, 2, T0));
    built = ok(buildMachine(built, 'oven', 1, 3, T0));
    for (const id of producibleGoods(built)) {
      for (const input of Object.keys(GOODS[id].inputs)) {
        if (input in GOODS) expect(producibleGoods(built)).toContain(input);
      }
    }
  });
});

describe('làm hàng', () => {
  it('các mẻ chạy nối tiếp, trừ nguyên liệu lúc xếp hàng', () => {
    let s = withStill();
    s = ok(startJob(s, 1, 3, 'rose_water', T0));
    s = ok(startJob(s, 1, 3, 'rose_water', T0 + MIN));
    expect(s.items.rose).toBe(30 - 8);
    const [a, b] = machineAt(s).queue;
    expect(a).toEqual({ recipe: 'rose_water', startAt: T0, doneAt: T0 + 5 * MIN });
    expect(b).toEqual({ recipe: 'rose_water', startAt: T0 + 5 * MIN, doneAt: T0 + 10 * MIN });
    expect(errorOf(startJob(s, 1, 3, 'rose_water', T0))).toBe('QUEUE_FULL');
    expect(errorOf(startJob(s, 0, 0, 'rose_water', T0))).toBe('NOT_A_MACHINE');
    expect(errorOf(startJob(s, 1, 3, 'strawberry_jam', T0))).toBe('INVALID');
    expect(machineStatus(machineAt(s), T0 + 6 * MIN)).toMatchObject({ readyCount: 1, pendingCount: 0 });
  });

  it('thiếu nguyên liệu hoặc chưa đủ cấp công thức thì không làm được', () => {
    const s = withStill();
    expect(errorOf(startJob(s, 1, 3, 'mint_oil', T0))).toBe('NOT_ENOUGH_ITEMS');
    s.items.lotus = 5;
    s.items.rose_water = 1;
    expect(errorOf(startJob(s, 1, 3, 'lotus_essence', T0))).toBe('LEVEL_TOO_LOW');
  });

  it('lấy hàng đã xong theo thứ tự, cộng XP và thống kê', () => {
    let s = withStill();
    s = ok(startJob(s, 1, 3, 'rose_water', T0));
    s = ok(startJob(s, 1, 3, 'rose_water', T0));
    expect(errorOf(collectMachine(s, 1, 3, T0 + MIN))).toBe('NOTHING_TO_COLLECT');
    s = ok(collectMachine(s, 1, 3, T0 + 6 * MIN));
    expect(s.items.rose_water).toBe(1);
    expect(machineAt(s).queue).toHaveLength(1);
    expect(s.stats.goodsMade).toBe(1);
    s = ok(sweep(s, 1, 3, T0 + 11 * MIN));
    expect(s.items.rose_water).toBe(2);
    expect(s.xp).toBe(GOODS.rose_water.xp * 2);
  });

  it('kho đầy thì chỉ lấy phần vừa chỗ, phần còn lại nằm chờ trong máy', () => {
    let s = withStill();
    s = ok(startJob(s, 1, 3, 'rose_water', T0));
    s = ok(startJob(s, 1, 3, 'rose_water', T0));
    s.items.sunflower = s.storageCapacity - 22 - 1;
    s = ok(collectMachine(s, 1, 3, T0 + 20 * MIN));
    expect(s.items.rose_water).toBe(1);
    expect(machineAt(s).queue).toHaveLength(1);
    expect(errorOf(collectMachine(s, 1, 3, T0 + 20 * MIN))).toBe('STORAGE_FULL');
  });

  it('tăng tốc mẻ đang chạy kéo các mẻ sau lên sớm', () => {
    let s = withStill();
    s = ok(startJob(s, 1, 3, 'rose_water', T0));
    s = ok(startJob(s, 1, 3, 'rose_water', T0));
    s = ok(speedUpMachine(s, 1, 3, T0 + 2 * MIN));
    const [a, b] = machineAt(s).queue;
    expect(a!.doneAt).toBe(T0 + 2 * MIN);
    expect(b).toMatchObject({ startAt: T0 + 2 * MIN, doneAt: T0 + 7 * MIN });
    expect(s.ruby).toBe(4);
  });

  it('hủy mẻ chưa chạy thì hoàn nguyên liệu; mẻ đang chạy thì không hủy được', () => {
    let s = withStill();
    s = ok(startJob(s, 1, 3, 'rose_water', T0));
    s = ok(startJob(s, 1, 3, 'rose_water', T0));
    expect(errorOf(cancelJob(s, 1, 3, 0, T0 + MIN))).toBe('JOB_STARTED');
    s = ok(cancelJob(s, 1, 3, 1, T0 + MIN));
    expect(s.items.rose).toBe(30 - 4);
    expect(machineAt(s).queue).toHaveLength(1);
  });
});

describe('nâng cấp và di chuyển', () => {
  it('nâng cấp cần vàng và vật liệu, tăng hàng đợi và tốc độ', () => {
    const s = withStill();
    expect(errorOf(upgradeMachine(s, 1, 3, T0))).toBe('NOT_ENOUGH_ITEMS');
    s.items.cloudclay = 4;
    const up = ok(upgradeMachine(s, 1, 3, T0));
    expect(machineAt(up).level).toBe(2);
    expect(up.gold).toBe(s.gold - machineUpgradeGold('still', 2));
    expect(errorOf(upgradeMachine(up, 1, 3, T0))).toBe('LEVEL_TOO_LOW');
    const withJob = ok(startJob(up, 1, 3, 'rose_water', T0));
    expect(machineAt(withJob).queue[0]!.doneAt).toBe(T0 + Math.round(5 * MIN * 0.95));
  });

  it('đổi chỗ máy và chậu, giữ nguyên hàng đợi', () => {
    let s = withStill();
    s = ok(startJob(s, 1, 3, 'rose_water', T0));
    s = ok(swapSlots(s, 1, 3, 0, 5, T0));
    expect(s.floors[0]!.slots[5]).toMatchObject({ kind: 'machine', queue: [{ recipe: 'rose_water' }] });
    expect(s.floors[1]!.slots[3]).toMatchObject({ kind: 'pot' });
    expect(errorOf(swapSlots(s, 1, 4, 1, 5, T0))).toBe('NOTHING_TO_DO');
    expect(errorOf(swapSlots(s, 1, 4, 1, 4, T0))).toBe('INVALID');
  });
});
