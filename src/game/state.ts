import { PLANTS } from './config/plants';
import { POTS } from './config/pots';
import { SLOTS_PER_FLOOR, START, START_STORAGE } from './config/garden';
import { orderSlotsForLevel } from './config/orders';
import type { Counts, Floor, GameState, Pot, PlantId, PlantedCrop } from './types';

export const SAVE_VERSION = 1;

export function emptyFloor(): Floor {
  return { slots: Array.from({ length: SLOTS_PER_FLOOR }, () => null) };
}

export function createNewGame(now: number, seed: number = Math.floor(Math.random() * 2 ** 32)): GameState {
  const floors = START.potsPerFloor.map((pots) => {
    const floor = emptyFloor();
    for (let i = 0; i < pots; i++) floor.slots[i] = { potId: 'clay', plant: null };
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
    crops: {},
    potStock: {},
    storageCapacity: START_STORAGE,
    storageUpgrades: 0,
    // Đơn đầu tiên tới ngay khi vào game.
    orders: Array.from({ length: orderSlotsForLevel(1) }, () => ({ order: null, readyAt: now })),
    nextOrderId: 1,
    rngSeed: seed >>> 0,
  };
}

export const count = <K extends string>(counts: Counts<K>, key: K): number => counts[key] ?? 0;

export function addCount<K extends string>(counts: Counts<K>, key: K, delta: number): void {
  const next = (counts[key] ?? 0) + delta;
  if (next <= 0) delete counts[key];
  else counts[key] = next;
}

export const storageUsed = (state: GameState): number =>
  Object.values(state.crops).reduce<number>((sum, n) => sum + (n ?? 0), 0);

export function getPot(state: GameState, floor: number, slot: number): Pot | null | undefined {
  return state.floors[floor]?.slots[slot];
}

export const isReady = (plant: PlantedCrop, now: number): boolean => now >= plant.plantedAt + plant.growMs;

export const remainingMs = (plant: PlantedCrop, now: number): number =>
  Math.max(0, plant.plantedAt + plant.growMs - now);

/** Tiến độ lớn 0..1 (kẹp lại nếu đồng hồ máy bị lùi). */
export const growthProgress = (plant: PlantedCrop, now: number): number =>
  plant.growMs <= 0 ? 1 : Math.min(1, Math.max(0, (now - plant.plantedAt) / plant.growMs));

export function growMsFor(plantId: PlantId, pot: Pot): number {
  const reduce = POTS[pot.potId].timeReducePct;
  return Math.round(PLANTS[plantId].growSec * 1000 * (1 - reduce / 100));
}

export function harvestXpFor(plantId: PlantId, pot: Pot): number {
  return Math.round(PLANTS[plantId].xp * (1 + POTS[pot.potId].xpBonusPct / 100));
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
      const pot = slots[slot];
      if (pot) yield { floor, slot, pot };
    }
  }
}

/** Tóm tắt những gì đã xảy ra trong lúc người chơi đi vắng. */
export function offlineSummary(state: GameState, now: number): { awayMs: number; readyWhileAway: number } {
  let readyWhileAway = 0;
  for (const { pot } of allPots(state)) {
    const p = pot.plant;
    if (p && !isReady(p, state.lastSeenAt) && isReady(p, now)) readyWhileAway++;
  }
  return { awayMs: Math.max(0, now - state.lastSeenAt), readyWhileAway };
}
