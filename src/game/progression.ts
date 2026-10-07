import { MAX_LEVEL, levelUpReward, xpForLevel } from './config/levels';
import { PLANT_LIST } from './config/plants';
import { orderSlotsForLevel } from './config/orders';
import type { GameEvent, GameState, PlantId } from './types';

/** Cộng XP và xử lý lên cấp (có thể lên nhiều cấp một lúc). Sửa trực tiếp `state`. */
export function addXp(state: GameState, amount: number, now: number, events: GameEvent[]): void {
  state.xp += amount;
  while (state.level < MAX_LEVEL && state.xp >= xpForLevel(state.level + 1)) {
    state.level++;
    const reward = levelUpReward(state.level);
    state.gold += reward.gold;
    state.ruby += reward.ruby;
    events.push({ type: 'levelUp', level: state.level, ...reward });
  }
  // Lên cấp có thể mở thêm chỗ trên bảng đơn hàng.
  const slots = orderSlotsForLevel(state.level);
  while (state.orders.length < slots) state.orders.push({ order: null, readyAt: now });
}

/** Tiến độ trong cấp hiện tại, 0..1. */
export function levelProgress(state: GameState): { current: number; needed: number; ratio: number } {
  if (state.level >= MAX_LEVEL) return { current: 0, needed: 0, ratio: 1 };
  const base = xpForLevel(state.level);
  const needed = xpForLevel(state.level + 1) - base;
  const current = state.xp - base;
  return { current, needed, ratio: Math.min(1, current / needed) };
}

export const unlockedPlants = (level: number): PlantId[] =>
  PLANT_LIST.filter((p) => p.unlockLevel <= level).map((p) => p.id);

export const plantsUnlockedAt = (level: number): PlantId[] =>
  PLANT_LIST.filter((p) => p.unlockLevel === level).map((p) => p.id);
