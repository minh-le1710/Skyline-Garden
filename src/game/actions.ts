import { PLANTS } from './config/plants';
import { POTS } from './config/pots';
import {
  FLOOR_UNLOCKS,
  MAX_FLOORS,
  STORAGE_UPGRADE_STEP,
  speedUpCost,
  storageUpgradeCost,
} from './config/garden';
import { ORDER_DELIVER_COOLDOWN_MS, ORDER_DISCARD_COOLDOWN_MS } from './config/orders';
import { canFulfill, fillOrders } from './orders';
import { addXp } from './progression';
import {
  addCount,
  count,
  emptyFloor,
  getPot,
  growMsFor,
  harvestXpFor,
  isReady,
  remainingMs,
  storageUsed,
} from './state';
import { commit, fail } from './commit';
import { isInt, isPlantId, isPositiveInt, isPotId } from './ids';
import type { ActionResult, GameState, PlantId, PotId } from './types';

export function buySeed(state: GameState, plantId: PlantId, qty: number): ActionResult {
  if (!isPlantId(plantId) || !isPositiveInt(qty)) return fail('INVALID');
  const def = PLANTS[plantId];
  if (state.level < def.unlockLevel) return fail('LEVEL_TOO_LOW');
  const cost = def.seedPrice * qty;
  if (state.gold < cost) return fail('NOT_ENOUGH_GOLD');
  return commit(state, (s, events) => {
    s.gold -= cost;
    addCount(s.seeds, plantId, qty);
    events.push({ type: 'bought', item: 'seed', id: plantId, qty, gold: cost });
  });
}

export function buyPot(state: GameState, potId: PotId, qty = 1): ActionResult {
  if (!isPotId(potId) || !isPositiveInt(qty)) return fail('INVALID');
  const def = POTS[potId];
  if (state.level < def.unlockLevel) return fail('LEVEL_TOO_LOW');
  const cost = def.price * qty;
  if (state.gold < cost) return fail('NOT_ENOUGH_GOLD');
  return commit(state, (s, events) => {
    s.gold -= cost;
    addCount(s.potStock, potId, qty);
    events.push({ type: 'bought', item: 'pot', id: potId, qty, gold: cost });
  });
}

export function placePot(state: GameState, floor: number, slot: number, potId: PotId): ActionResult {
  const current = getPot(state, floor, slot);
  if (current === undefined || !isPotId(potId)) return fail('INVALID');
  if (current !== null) return fail('SLOT_OCCUPIED');
  if (count(state.potStock, potId) <= 0) return fail('NO_POT_STOCK');
  return commit(state, (s, events) => {
    addCount(s.potStock, potId, -1);
    s.floors[floor]!.slots[slot] = { potId, plant: null };
    events.push({ type: 'potPlaced', floor, slot, potId });
  });
}

export function plant(
  state: GameState,
  floor: number,
  slot: number,
  plantId: PlantId,
  now: number,
): ActionResult {
  const pot = getPot(state, floor, slot);
  if (pot === undefined || !isPlantId(plantId)) return fail('INVALID');
  if (pot === null) return fail('NO_POT');
  if (pot.plant) return fail('SLOT_BUSY');
  if (count(state.seeds, plantId) <= 0) return fail('NO_SEED');
  return commit(state, (s, events) => {
    addCount(s.seeds, plantId, -1);
    const target = s.floors[floor]!.slots[slot]!;
    target.plant = { plantId, plantedAt: now, growMs: growMsFor(plantId, target) };
    events.push({ type: 'planted', floor, slot, plantId });
  });
}

export function harvest(state: GameState, floor: number, slot: number, now: number): ActionResult {
  const pot = getPot(state, floor, slot);
  if (pot === undefined) return fail('INVALID');
  if (pot === null) return fail('NO_POT');
  if (!pot.plant) return fail('NOTHING_PLANTED');
  if (!isReady(pot.plant, now)) return fail('NOT_READY');
  const { plantId } = pot.plant;
  const qty = PLANTS[plantId].yield;
  if (storageUsed(state) + qty > state.storageCapacity) return fail('STORAGE_FULL');
  return commit(state, (s, events) => {
    const target = s.floors[floor]!.slots[slot]!;
    const xp = harvestXpFor(plantId, target);
    target.plant = null;
    addCount(s.crops, plantId, qty);
    events.push({ type: 'harvested', floor, slot, plantId, qty, xp });
    addXp(s, xp, now, events);
  });
}

/** Dùng ruby để cây chín ngay. */
export function speedUp(state: GameState, floor: number, slot: number, now: number): ActionResult {
  const pot = getPot(state, floor, slot);
  if (pot === undefined) return fail('INVALID');
  if (pot === null) return fail('NO_POT');
  if (!pot.plant) return fail('NOTHING_PLANTED');
  if (isReady(pot.plant, now)) return fail('ALREADY_READY');
  const cost = speedUpCost(remainingMs(pot.plant, now));
  if (state.ruby < cost) return fail('NOT_ENOUGH_RUBY');
  return commit(state, (s, events) => {
    s.ruby -= cost;
    const p = s.floors[floor]!.slots[slot]!.plant!;
    p.growMs = Math.max(0, now - p.plantedAt);
    events.push({ type: 'speedUp', floor, slot, ruby: cost });
  });
}

export function sellCrop(state: GameState, plantId: PlantId, qty: number): ActionResult {
  if (!isPlantId(plantId) || !isPositiveInt(qty)) return fail('INVALID');
  const def = PLANTS[plantId];
  if (count(state.crops, plantId) < qty) return fail('NOT_ENOUGH_CROPS');
  const gold = def.sellPrice * qty;
  return commit(state, (s, events) => {
    addCount(s.crops, plantId, -qty);
    s.gold += gold;
    events.push({ type: 'sold', plantId, qty, gold });
  });
}

export function upgradeStorage(state: GameState): ActionResult {
  const cost = storageUpgradeCost(state.storageUpgrades);
  if (state.gold < cost) return fail('NOT_ENOUGH_GOLD');
  return commit(state, (s, events) => {
    s.gold -= cost;
    s.storageUpgrades++;
    s.storageCapacity += STORAGE_UPGRADE_STEP;
    events.push({ type: 'storageUpgraded', capacity: s.storageCapacity });
  });
}

/** Giá và cấp để mở tầng kế tiếp, hoặc null nếu đã mở hết. */
export const nextFloorUnlock = (state: GameState): { floor: number; gold: number; level: number } | null => {
  const floor = state.floors.length;
  const req = FLOOR_UNLOCKS[floor];
  return req ? { floor, ...req } : null;
};

export function unlockFloor(state: GameState): ActionResult {
  const next = nextFloorUnlock(state);
  if (!next || state.floors.length >= MAX_FLOORS) return fail('MAX_FLOORS');
  if (state.level < next.level) return fail('LEVEL_TOO_LOW');
  if (state.gold < next.gold) return fail('NOT_ENOUGH_GOLD');
  return commit(state, (s, events) => {
    s.gold -= next.gold;
    s.floors.push(emptyFloor());
    events.push({ type: 'floorUnlocked', floor: next.floor });
  });
}

export function deliverOrder(state: GameState, index: number, now: number): ActionResult {
  const slot = isInt(index) ? state.orders[index] : undefined;
  if (!slot) return fail('INVALID');
  const order = slot.order;
  if (!order) return fail('NO_ORDER');
  if (!canFulfill(state, order)) return fail('NOT_ENOUGH_CROPS');
  return commit(state, (s, events) => {
    for (const { plantId, qty } of order.items) addCount(s.crops, plantId, -qty);
    s.gold += order.gold;
    s.orders[index] = { order: null, readyAt: now + ORDER_DELIVER_COOLDOWN_MS };
    events.push({ type: 'orderDelivered', index, gold: order.gold, xp: order.xp });
    addXp(s, order.xp, now, events);
  });
}

export function discardOrder(state: GameState, index: number, now: number): ActionResult {
  const slot = isInt(index) ? state.orders[index] : undefined;
  if (!slot) return fail('INVALID');
  if (!slot.order) return fail('NO_ORDER');
  return commit(state, (s, events) => {
    s.orders[index] = { order: null, readyAt: now + ORDER_DISCARD_COOLDOWN_MS };
    events.push({ type: 'orderDiscarded', index });
  });
}

/** Cập nhật theo thời gian: điền đơn hàng mới. Trả về state cũ nếu không có gì thay đổi. */
export function tick(state: GameState, now: number): ActionResult {
  const due = state.orders.some((o) => o.order === null && o.readyAt <= now);
  if (!due) return { ok: true, state, events: [] };
  return commit(state, (s, events) => fillOrders(s, now, events));
}
