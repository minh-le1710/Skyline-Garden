import { SLOTS_PER_FLOOR, START, START_STORAGE } from './config/garden';
import { isBarnItem } from './config/items';
import { orderSlotsForLevel } from './config/orders';
import { PLANTS } from './config/plants';
import { POT_STAT_CAPS } from './config/pots';
import { FIRST_ORDER } from './config/tutorial';
import { deriveSeed } from './rng';
import {
  RNG_STREAMS,
  type Counts,
  type Floor,
  type GameState,
  type ItemId,
  type PlantId,
  type PlantedCrop,
  type Pot,
  type PotId,
  type PotInstance,
  type PotStat,
  type PotStats,
  type Rarity,
  type RngStream,
  type SlotContent,
} from './types';

export const SAVE_VERSION = 6;

export function emptyFloor(): Floor {
  return { slots: Array.from({ length: SLOTS_PER_FLOOR }, () => null) };
}

/** Các luồng RNG từ một seed gốc. Luồng `orders` dùng thẳng seed gốc. */
export function makeRngStreams(seed: number): Record<RngStream, number> {
  const master = seed >>> 0;
  const rng = {} as Record<RngStream, number>;
  for (const name of RNG_STREAMS) rng[name] = name === 'orders' ? master : deriveSeed(master, name);
  return rng;
}

export function createNewGame(now: number, seed: number): GameState {
  let uid = 1;
  const floors = START.potsPerFloor.map((pots) => {
    const floor = emptyFloor();
    for (let i = 0; i < pots; i++) {
      floor.slots[i] = {
        kind: 'pot',
        uid: uid++,
        potId: 'clay',
        rarity: 'common',
        stats: {},
        origin: 'shop',
        plant: null,
      };
    }
    return floor;
  });
  return {
    version: SAVE_VERSION,
    createdAt: now,
    lastSeenAt: now,
    gold: START.gold,
    ruby: START.ruby,
    xp: 0,
    level: 1,
    floors,
    seeds: { ...START.seeds },
    items: {},
    potBag: [],
    nextUid: uid,
    storageCapacity: START_STORAGE,
    storageUpgrades: 0,
    // Đơn đầu tiên cố định (cho bước hướng dẫn giao hàng); các chỗ còn lại cú mang tới ngay.
    orders: Array.from({ length: orderSlotsForLevel(1) }, (_, i) => ({
      order: i === 0 ? { id: 1, ...structuredClone(FIRST_ORDER) } : null,
      readyAt: now,
    })),
    nextOrderId: 2,
    rng: makeRngStreams(seed),
    stats: {},
    daily: { day: -1, quests: [], bonusClaimed: false, freeRerollUsed: false, loginDay: -1, loginCount: 0 },
    balloon: { phase: 'away', returnsAt: 0, trips: 0 },
    achievements: {},
    tutorial: { step: 'welcome', progress: 0 },
  };
}

export const count = <K extends string>(counts: Counts<K>, key: K): number =>
  Object.hasOwn(counts, key) ? (counts[key] ?? 0) : 0;

export function addCount<K extends string>(counts: Counts<K>, key: K, delta: number): void {
  const next = count(counts, key) + delta;
  if (next <= 0) delete counts[key];
  else counts[key] = next;
}

export const hasItems = (s: GameState, need: Counts<ItemId>): boolean =>
  Object.entries(need).every(([id, qty]) => count(s.items, id as ItemId) >= (qty ?? 0));

export function removeItems(s: GameState, need: Counts<ItemId>): void {
  for (const [id, qty] of Object.entries(need)) addCount(s.items, id as ItemId, -(qty ?? 0));
}

/** Số món đang chiếm chỗ trong kho (nông sản + hàng chế biến). */
export function storageUsed(state: GameState): number {
  let used = 0;
  for (const [id, n] of Object.entries(state.items)) if (isBarnItem(id as ItemId)) used += n ?? 0;
  return used;
}

export const storageFree = (state: GameState): number => state.storageCapacity - storageUsed(state);

/** Ô tại (floor, slot); `undefined` nếu chỉ số không hợp lệ (kể cả số thực, số âm). */
export function getSlot(state: GameState, floor: number, slot: number): SlotContent | null | undefined {
  if (!Number.isInteger(floor) || !Number.isInteger(slot) || floor < 0 || slot < 0) return undefined;
  return state.floors[floor]?.slots[slot];
}

export const asPot = (content: SlotContent | null | undefined): Pot | null =>
  content?.kind === 'pot' ? content : null;

export const isReady = (plant: PlantedCrop, now: number): boolean => now >= plant.plantedAt + plant.growMs;

export const remainingMs = (plant: PlantedCrop, now: number): number =>
  Math.max(0, plant.plantedAt + plant.growMs - now);

/** Tiến độ lớn 0..1 (kẹp lại nếu đồng hồ máy bị lùi). */
export const growthProgress = (plant: PlantedCrop, now: number): number =>
  plant.growMs <= 0 ? 1 : Math.min(1, Math.max(0, (now - plant.plantedAt) / plant.growMs));

/** Chỉ số của chậu sau khi áp giới hạn. */
export function potStat(pot: PotInstance, stat: PotStat): number {
  return Math.min(POT_STAT_CAPS[stat], pot.stats[stat] ?? 0);
}

export function growMsFor(plantId: PlantId, pot: PotInstance): number {
  return Math.round(PLANTS[plantId].growSec * 1000 * (1 - potStat(pot, 'timePct') / 100));
}

export function harvestXpFor(plantId: PlantId, pot: PotInstance): number {
  return Math.round(PLANTS[plantId].xp * (1 + potStat(pot, 'xpPct') / 100));
}

/** Tạo chậu mới (lấy uid kế tiếp). Sửa trực tiếp `state`. */
export function newPotInstance(
  state: GameState,
  potId: PotId,
  rarity: Rarity,
  stats: PotStats,
  origin: PotInstance['origin'],
): PotInstance {
  return { uid: state.nextUid++, potId, rarity, stats, origin };
}

export interface PotRef {
  floor: number;
  slot: number;
  pot: Pot;
}

export function* allPots(state: GameState): Generator<PotRef> {
  for (let floor = 0; floor < state.floors.length; floor++) {
    const slots = state.floors[floor]!.slots;
    for (let slot = 0; slot < slots.length; slot++) {
      const content = slots[slot];
      if (content?.kind === 'pot') yield { floor, slot, pot: content };
    }
  }
}

export interface OfflineSummary {
  awayMs: number;
  readyWhileAway: number;
  pestsWaiting: number;
}

/** Tóm tắt những gì đã xảy ra trong lúc người chơi đi vắng. */
export function offlineSummary(state: GameState, now: number): OfflineSummary {
  let readyWhileAway = 0;
  let pestsWaiting = 0;
  for (const { pot } of allPots(state)) {
    const p = pot.plant;
    if (!p) continue;
    if (!isReady(p, state.lastSeenAt) && isReady(p, now)) readyWhileAway++;
    if (p.pest && p.pest.at < p.plantedAt + p.growMs && p.pest.at <= now && now < p.pest.leaveAt)
      pestsWaiting++;
  }
  return { awayMs: Math.max(0, now - state.lastSeenAt), readyWhileAway, pestsWaiting };
}
