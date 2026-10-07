import { MAX_FLOORS, SLOTS_PER_FLOOR, STORAGE_UPGRADES, storageCapacityAfter } from './config/garden';
import { ACHIEVEMENTS } from './config/achievements';
import { MAX_LEVEL } from './config/levels';
import { orderSlotsForLevel } from './config/orders';
import { POT_BAG_MAX } from './config/pots';
import {
  isAchievementId,
  isBarnItemId,
  isInt,
  isItemId,
  isMachineId,
  isNonNegInt,
  isPlantId,
  isPositiveInt,
  isPotId,
  isRarity,
} from './ids';
import { recipeDef } from './machines';
import { levelForXp } from './progression';
import { storageUsed } from './state';
import {
  PEST_IDS,
  POT_STATS,
  QUEST_KINDS,
  RNG_STREAMS,
  STAT_KEYS,
  type AchievementId,
  type Counts,
  type GameState,
  type PotInstance,
} from './types';

/**
 * Kiểm tra cấu trúc và kiểu dữ liệu: số nguyên không âm, id hợp lệ, hình dạng mảng/ô.
 * KHÔNG phụ thuộc số liệu cân bằng game, nên dùng được khi tải save (đổi cân bằng không làm save cũ "hỏng").
 */
export function checkStructure(s: GameState): string[] {
  const errors: string[] = [];
  const expect = (ok: boolean, message: string) => {
    if (!ok) errors.push(message);
  };

  for (const key of [
    'gold',
    'ruby',
    'xp',
    'nextOrderId',
    'storageUpgrades',
    'nextUid',
    'storageCapacity',
  ] as const) {
    expect(isNonNegInt(s[key]), `${key} phải là số nguyên không âm (đang là ${s[key]})`);
  }
  expect(isPositiveInt(s.level), `level không hợp lệ: ${s.level}`);
  for (const key of ['createdAt', 'lastSeenAt'] as const)
    expect(Number.isFinite(s[key]), `${key} không hợp lệ`);

  const checkCounts = (name: string, counts: Counts<string>, valid: (id: unknown) => boolean) => {
    for (const [id, n] of Object.entries(counts)) {
      expect(valid(id), `${name}: id lạ "${id}"`);
      expect(isPositiveInt(n), `${name}.${id} phải là số nguyên dương (đang là ${n})`);
    }
  };
  checkCounts('seeds', s.seeds, isPlantId);
  checkCounts('items', s.items, isItemId);
  checkCounts('stats', s.stats, (k) => STAT_KEYS.includes(k as never));
  checkCounts('achievements', s.achievements ?? {}, isAchievementId);
  for (const stream of RNG_STREAMS) {
    const v = s.rng?.[stream];
    expect(isNonNegInt(v) && v <= 0xffffffff, `rng.${stream} không hợp lệ`);
  }

  const uids = new Set<number>();
  const checkPot = (p: PotInstance, where: string) => {
    expect(isPositiveInt(p.uid) && p.uid < s.nextUid, `${where}: uid ${p.uid} không hợp lệ`);
    expect(!uids.has(p.uid), `${where}: uid ${p.uid} bị trùng`);
    uids.add(p.uid);
    expect(isPotId(p.potId) && isRarity(p.rarity), `${where}: loại chậu không hợp lệ`);
    expect(['shop', 'forge', 'reward', 'legacy'].includes(p.origin), `${where}: nguồn chậu lạ`);
    expect(typeof p.stats === 'object' && p.stats !== null, `${where}: chỉ số chậu không hợp lệ`);
    for (const [stat, v] of Object.entries(p.stats ?? {})) {
      expect(POT_STATS.includes(stat as never) && isPositiveInt(v), `${where}: chỉ số ${stat} không hợp lệ`);
    }
  };
  expect(Array.isArray(s.potBag), 'potBag không phải mảng');
  s.potBag.forEach((p, i) => checkPot(p, `potBag[${i}]`));

  expect(s.floors.length >= 1, `số tầng không hợp lệ: ${s.floors.length}`);
  s.floors.forEach((floor, f) => {
    expect(
      Array.isArray(floor?.slots) && floor.slots.length === SLOTS_PER_FLOOR,
      `tầng ${f} không đủ ${SLOTS_PER_FLOOR} ô`,
    );
    floor.slots?.forEach((content, i) => {
      const where = `ô ${f}:${i}`;
      if (content === null) return;
      if (content.kind === 'pot') {
        checkPot(content, where);
        const p = content.plant;
        if (p) {
          expect(isPlantId(p.plantId), `${where}: cây lạ`);
          expect(isNonNegInt(p.plantedAt) && isNonNegInt(p.growMs), `${where}: thời gian cây không hợp lệ`);
          expect(isPositiveInt(p.yield), `${where}: sản lượng không hợp lệ`);
          if (p.pest !== null) {
            expect(PEST_IDS.includes(p.pest?.id), `${where}: sâu lạ`);
            expect(p.pest?.at <= p.pest?.leaveAt, `${where}: thời gian sâu không hợp lệ`);
          }
        }
      } else if (content.kind === 'machine') {
        expect(isMachineId(content.machineId), `${where}: máy lạ`);
        expect(isPositiveInt(content.level), `${where}: cấp máy không hợp lệ`);
        expect(Array.isArray(content.queue), `${where}: hàng đợi không hợp lệ`);
        let prevDone = 0;
        for (const job of content.queue ?? []) {
          expect(recipeDef(job.recipe) !== null, `${where}: công thức lạ`);
          expect(job.startAt <= job.doneAt && job.startAt >= prevDone, `${where}: hàng đợi máy sai thứ tự`);
          prevDone = job.doneAt;
        }
      } else {
        errors.push(`${where}: loại ô lạ`);
      }
    });
  });

  const d = s.daily;
  if (typeof d !== 'object' || d === null || Array.isArray(d)) {
    errors.push('daily không hợp lệ');
  } else {
    expect(isInt(d.day) && d.day >= -1 && isInt(d.loginDay) && d.loginDay >= -1, 'daily: ngày không hợp lệ');
    expect(isNonNegInt(d.loginCount), 'daily: số lần nhận quà không hợp lệ');
    expect(
      typeof d.bonusClaimed === 'boolean' && typeof d.freeRerollUsed === 'boolean',
      'daily: cờ không hợp lệ',
    );
    expect(Array.isArray(d.quests), 'daily: quests không phải mảng');
    for (const q of Array.isArray(d.quests) ? d.quests : []) {
      const ok =
        typeof q === 'object' &&
        q !== null &&
        QUEST_KINDS.includes(q.kind) &&
        isPositiveInt(q.goal) &&
        isNonNegInt(q.progress) &&
        typeof q.claimed === 'boolean' &&
        (q.target === null || isBarnItemId(q.target)) &&
        rewardProblems(q.reward) === null;
      expect(ok, 'daily: nhiệm vụ không hợp lệ');
    }
  }

  const b = s.balloon;
  expect(isNonNegInt(b?.trips), 'khinh khí cầu: số chuyến không hợp lệ');
  if (b?.phase === 'docked') {
    expect(b.arrivedAt <= b.leavesAt, 'khinh khí cầu: thời gian đậu sai');
    for (const c of b.crates) {
      expect(isBarnItemId(c.id) && isPositiveInt(c.qty) && isPositiveInt(c.gold), 'khinh khí cầu: thùng lạ');
    }
  } else {
    expect(b?.phase === 'away' && Number.isFinite(b.returnsAt), 'khinh khí cầu: trạng thái lạ');
  }

  expect(Array.isArray(s.orders), 'orders không phải mảng');
  for (const slot of s.orders) {
    expect(Number.isFinite(slot?.readyAt), 'thời điểm đơn mới không hợp lệ');
    const order = slot?.order;
    if (!order) continue;
    expect(order.id < s.nextOrderId, `đơn ${order.id} có id không nhỏ hơn nextOrderId`);
    expect(Array.isArray(order.items) && order.items.length > 0, `đơn ${order.id} rỗng`);
    for (const item of order.items ?? []) {
      expect(isBarnItemId(item.id) && isPositiveInt(item.qty), `món lạ trong đơn ${order.id}`);
    }
    expect(isPositiveInt(order.gold) && isPositiveInt(order.xp), `thưởng đơn ${order.id} không hợp lệ`);
  }
  return errors;
}

/** Kiểm tra một phần thưởng lưu trong save (nhiệm vụ…). */
function rewardProblems(r: unknown): string | null {
  if (typeof r !== 'object' || r === null || Array.isArray(r)) return 'thưởng không phải object';
  const reward = r as Record<string, unknown>;
  for (const key of ['gold', 'ruby', 'xp'] as const) {
    if (reward[key] !== undefined && !isNonNegInt(reward[key])) return `thưởng ${key} không hợp lệ`;
  }
  const counts = (v: unknown, valid: (id: unknown) => boolean) =>
    v === undefined ||
    (typeof v === 'object' &&
      v !== null &&
      Object.entries(v).every(([id, n]) => valid(id) && isPositiveInt(n)));
  if (!counts(reward.seeds, isPlantId) || !counts(reward.items, isItemId))
    return 'thưởng vật phẩm không hợp lệ';
  return null;
}

/** Các điều kiện phụ thuộc số liệu cân bằng hiện tại (bảng XP, kho, bảng đơn…). */
export function checkBalance(s: GameState): string[] {
  const errors: string[] = [];
  const expect = (ok: boolean, message: string) => {
    if (!ok) errors.push(message);
  };
  expect(s.level <= MAX_LEVEL, `level vượt tối đa: ${s.level}`);
  expect(s.level === levelForXp(s.xp), `level ${s.level} không khớp XP ${s.xp}`);
  expect(s.storageUpgrades <= STORAGE_UPGRADES.length, `nâng kho quá số mức: ${s.storageUpgrades}`);
  expect(
    s.storageCapacity === storageCapacityAfter(s.storageUpgrades),
    `sức chứa kho ${s.storageCapacity} không khớp số lần nâng cấp`,
  );
  expect(storageUsed(s) <= s.storageCapacity, `kho vượt sức chứa: ${storageUsed(s)}/${s.storageCapacity}`);
  expect(s.potBag.length <= POT_BAG_MAX, `kho chậu vượt ${POT_BAG_MAX}`);
  expect(s.floors.length <= MAX_FLOORS, `số tầng vượt tối đa: ${s.floors.length}`);
  expect(s.orders.length >= orderSlotsForLevel(s.level), `bảng đơn chỉ có ${s.orders.length} chỗ`);
  for (const [id, n] of Object.entries(s.achievements) as [AchievementId, number][]) {
    expect(n <= ACHIEVEMENTS[id].tiers.length, `thành tựu ${id}: nhận ${n} bậc, vượt số bậc`);
  }
  return errors;
}

/**
 * Mọi điều kiện luôn phải đúng với state sinh ra từ các lệnh. Trả về danh sách vi phạm (rỗng là ổn).
 * Dùng trong property test, ở chế độ debug sau mỗi lệnh, và khi server replay.
 */
export function checkInvariants(s: GameState): string[] {
  const structure = checkStructure(s);
  return structure.length ? structure : checkBalance(s);
}

/**
 * Sửa các trường suy ra từ số liệu cân bằng khi tải save, thay vì coi save là hỏng.
 * Không bao giờ làm mất đồ: kho vượt sức chứa vẫn giữ nguyên (lệnh sau đó tự từ chối thêm đồ).
 */
export function normalizeLoaded(s: GameState, now: number): GameState {
  const out = structuredClone(s);
  out.level = levelForXp(out.xp);
  out.storageUpgrades = Math.min(out.storageUpgrades, STORAGE_UPGRADES.length);
  out.storageCapacity = storageCapacityAfter(out.storageUpgrades);
  while (out.orders.length < orderSlotsForLevel(out.level)) out.orders.push({ order: null, readyAt: now });
  // Bảng thành tựu bớt bậc sau này: kẹp lại, không coi save là hỏng.
  for (const [id, n] of Object.entries(out.achievements) as [AchievementId, number][]) {
    out.achievements[id] = Math.min(n, ACHIEVEMENTS[id].tiers.length);
  }
  return out;
}
