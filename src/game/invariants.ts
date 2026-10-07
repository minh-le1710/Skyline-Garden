import { MAX_FLOORS, SLOTS_PER_FLOOR, START_STORAGE, STORAGE_UPGRADE_STEP } from './config/garden';
import { MAX_LEVEL } from './config/levels';
import { orderSlotsForLevel } from './config/orders';
import { isNonNegInt, isPlantId, isPositiveInt, isPotId } from './ids';
import { levelForXp } from './progression';
import { storageUsed } from './state';
import type { Counts, GameState } from './types';

/**
 * Các điều kiện luôn phải đúng với mọi state hợp lệ. Trả về danh sách vi phạm (rỗng là ổn).
 * Dùng trong property test, khi tải save, và ở chế độ debug sau mỗi lệnh.
 */
export function checkInvariants(s: GameState): string[] {
  const errors: string[] = [];
  const expect = (ok: boolean, message: string) => {
    if (!ok) errors.push(message);
  };

  for (const key of ['gold', 'ruby', 'xp', 'nextOrderId', 'storageUpgrades'] as const) {
    expect(isNonNegInt(s[key]), `${key} phải là số nguyên không âm (đang là ${s[key]})`);
  }
  expect(isPositiveInt(s.level) && s.level <= MAX_LEVEL, `level không hợp lệ: ${s.level}`);
  expect(s.level === levelForXp(s.xp), `level ${s.level} không khớp XP ${s.xp}`);
  expect(
    s.storageCapacity === START_STORAGE + s.storageUpgrades * STORAGE_UPGRADE_STEP,
    `sức chứa kho ${s.storageCapacity} không khớp số lần nâng cấp`,
  );
  expect(storageUsed(s) <= s.storageCapacity, `kho vượt sức chứa: ${storageUsed(s)}/${s.storageCapacity}`);

  const checkCounts = (name: string, counts: Counts<string>, valid: (id: unknown) => boolean) => {
    for (const [id, n] of Object.entries(counts)) {
      expect(valid(id), `${name}: id lạ "${id}"`);
      expect(isPositiveInt(n), `${name}.${id} phải là số nguyên dương (đang là ${n})`);
    }
  };
  checkCounts('seeds', s.seeds, isPlantId);
  checkCounts('crops', s.crops, isPlantId);
  checkCounts('potStock', s.potStock, isPotId);

  expect(s.floors.length >= 1 && s.floors.length <= MAX_FLOORS, `số tầng không hợp lệ: ${s.floors.length}`);
  s.floors.forEach((floor, f) => {
    expect(floor.slots.length === SLOTS_PER_FLOOR, `tầng ${f} có ${floor.slots.length} ô`);
    floor.slots.forEach((pot, i) => {
      if (pot === null) return;
      expect(isPotId(pot.potId), `chậu lạ ở ${f}:${i}`);
      const p = pot.plant;
      if (p) {
        expect(isPlantId(p.plantId), `cây lạ ở ${f}:${i}`);
        expect(isNonNegInt(p.plantedAt) && isNonNegInt(p.growMs), `thời gian cây không hợp lệ ở ${f}:${i}`);
      }
    });
  });

  expect(s.orders.length === orderSlotsForLevel(s.level), `bảng đơn có ${s.orders.length} chỗ`);
  for (const slot of s.orders) {
    const order = slot.order;
    if (!order) continue;
    expect(order.id < s.nextOrderId, `đơn ${order.id} có id không nhỏ hơn nextOrderId`);
    expect(order.items.length > 0, `đơn ${order.id} rỗng`);
    for (const item of order.items) {
      expect(isPlantId(item.plantId) && isPositiveInt(item.qty), `món lạ trong đơn ${order.id}`);
    }
    expect(isPositiveInt(order.gold) && isPositiveInt(order.xp), `thưởng đơn ${order.id} không hợp lệ`);
  }
  return errors;
}
