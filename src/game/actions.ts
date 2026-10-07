import { FLOOR_UNLOCKS, MAX_FLOORS, STORAGE_UPGRADES, speedUpCost } from './config/garden';
import { ITEMS } from './config/items';
import { ORDER_DELIVER_COOLDOWN_MS, ORDER_DISCARD_COOLDOWN_MS } from './config/orders';
import { PLANTS } from './config/plants';
import { POT_BAG_MAX, SHOP_POTS } from './config/pots';
import { commit, fail } from './commit';
import { isBarnItemId, isInt, isPlantId, isPositiveInt, isPotId } from './ids';
import { canCollect, collectInDraft } from './machines';
import { canFulfill } from './orders';
import { activePest, harvestQty, pestCatchGold, pestCatchXp, rollPestDrop, rollPlanting } from './pests';
import { grantReward } from './rewards';
import { withRng } from './rng';
import { addXp } from './progression';
import {
  addCount,
  count,
  emptyFloor,
  getSlot,
  growMsFor,
  potStat,
  harvestXpFor,
  hasItems,
  isReady,
  newPotInstance,
  remainingMs,
  removeItems,
  storageUsed,
} from './state';
import type { ActionResult, BarnItemId, GameEvent, GameState, Pot, PlantId, PotId } from './types';

// Các action của khu vườn (Mốc 1). Mỗi action: kiểm tra trên state cũ, rồi sửa trên bản sao qua commit().

/** Lấy chậu tại một ô, hoặc lỗi phù hợp nếu ô không phải chậu. */
function potAt(state: GameState, floor: number, slot: number): Pot | ActionResult {
  const content = getSlot(state, floor, slot);
  if (content === undefined) return fail('INVALID');
  if (content === null) return fail('NO_POT');
  if (content.kind !== 'pot') return fail('NOT_A_POT');
  return content;
}
const isPot = (x: Pot | ActionResult): x is Pot => 'kind' in x;

/** Chậu trong bản nháp (đã kiểm tra là chậu trên state cũ). */
const draftPot = (s: GameState, floor: number, slot: number): Pot => s.floors[floor]!.slots[slot] as Pot;

export function buySeed(state: GameState, plantId: PlantId, qty: number, now: number): ActionResult {
  if (!isPlantId(plantId) || !isPositiveInt(qty)) return fail('INVALID');
  const def = PLANTS[plantId];
  if (state.level < def.unlockLevel) return fail('LEVEL_TOO_LOW');
  const cost = def.seedPrice * qty;
  if (state.gold < cost) return fail('NOT_ENOUGH_GOLD');
  return commit(state, now, (s, events) => {
    s.gold -= cost;
    addCount(s.seeds, plantId, qty);
    events.push({ type: 'bought', item: 'seed', id: plantId, qty, gold: cost });
  });
}

export function buyPot(state: GameState, potId: PotId, qty: number, now: number): ActionResult {
  const def = isPotId(potId) ? SHOP_POTS[potId] : undefined;
  if (!def || !isPositiveInt(qty)) return fail('INVALID');
  if (state.level < def.unlockLevel) return fail('LEVEL_TOO_LOW');
  const cost = def.price * qty;
  if (state.gold < cost) return fail('NOT_ENOUGH_GOLD');
  if (state.potBag.length + qty > POT_BAG_MAX) return fail('POT_BAG_FULL');
  return commit(state, now, (s, events) => {
    s.gold -= cost;
    for (let i = 0; i < qty; i++)
      s.potBag.push(newPotInstance(s, potId, def.rarity, { ...def.stats }, 'shop'));
    events.push({ type: 'bought', item: 'pot', id: potId, qty, gold: cost });
  });
}

/** Đặt một chậu (theo uid) từ kho lên ô trống. */
export function placePot(
  state: GameState,
  floor: number,
  slot: number,
  uid: number,
  now: number,
): ActionResult {
  const content = getSlot(state, floor, slot);
  if (content === undefined || !isInt(uid)) return fail('INVALID');
  if (content !== null) return fail('SLOT_OCCUPIED');
  const index = state.potBag.findIndex((p) => p.uid === uid);
  if (index < 0) return fail('POT_NOT_FOUND');
  return commit(state, now, (s, events) => {
    const [inst] = s.potBag.splice(index, 1);
    s.floors[floor]!.slots[slot] = { kind: 'pot', ...inst!, plant: null };
    events.push({ type: 'potPlaced', floor, slot, potId: inst!.potId, uid });
  });
}

export function plant(
  state: GameState,
  floor: number,
  slot: number,
  plantId: PlantId,
  now: number,
): ActionResult {
  if (!isPlantId(plantId)) return fail('INVALID');
  const pot = potAt(state, floor, slot);
  if (!isPot(pot)) return pot;
  if (pot.plant) return fail('SLOT_BUSY');
  if (count(state.seeds, plantId) <= 0) return fail('NO_SEED');
  return commit(state, now, (s, events) => {
    addCount(s.seeds, plantId, -1);
    const target = draftPot(s, floor, slot);
    const growMs = growMsFor(plantId, target);
    const roll = withRng(s, 'crops', (rng) =>
      rollPlanting(rng, plantId, now, growMs, s.level, potStat(target, 'yieldPct')),
    );
    target.plant = {
      plantId,
      plantedAt: now,
      growMs,
      yield: PLANTS[plantId].yield + (roll.bonusYield ? 1 : 0),
      pest: roll.pest,
    };
    events.push({ type: 'planted', floor, slot, plantId });
  });
}

/** Bắt sâu trên một chậu trong bản nháp (dùng chung cho bắt tay, thu hoạch và thú cưng). */
export function catchPestInDraft(
  s: GameState,
  floor: number,
  slot: number,
  now: number,
  events: GameEvent[],
  by: 'player' | 'pet' | 'friend',
): void {
  const target = draftPot(s, floor, slot);
  const pest = target.plant!.pest!;
  target.plant!.pest = null;
  const items = withRng(s, 'loot', (rng) => rollPestDrop(rng, pest.id));
  const xp = pestCatchXp(s.level);
  const gold = pestCatchGold(s.level);
  events.push({ type: 'pestCaught', floor, slot, pestId: pest.id, by, xp, gold, items });
  grantReward(s, { gold, xp, items }, now, events);
}

export function catchPest(state: GameState, floor: number, slot: number, now: number): ActionResult {
  const pot = potAt(state, floor, slot);
  if (!isPot(pot)) return pot;
  if (!pot.plant || !activePest(pot.plant, now)) return fail('NO_PEST');
  return commit(state, now, (s, events) => catchPestInDraft(s, floor, slot, now, events, 'player'));
}

export function harvest(state: GameState, floor: number, slot: number, now: number): ActionResult {
  const pot = potAt(state, floor, slot);
  if (!isPot(pot)) return pot;
  if (!pot.plant) return fail('NOTHING_PLANTED');
  if (!isReady(pot.plant, now)) return fail('NOT_READY');
  const qty = harvestQty(pot.plant, now);
  if (storageUsed(state) + qty > state.storageCapacity) return fail('STORAGE_FULL');
  return commit(state, now, (s, events) => harvestInDraft(s, floor, slot, now, events));
}

/** Thu hoạch trong bản nháp (đã kiểm tra chín và đủ chỗ). Sâu còn trên cây thì bắt luôn, đủ thưởng. */
function harvestInDraft(s: GameState, floor: number, slot: number, now: number, events: GameEvent[]): void {
  const target = draftPot(s, floor, slot);
  if (activePest(target.plant!, now)) catchPestInDraft(s, floor, slot, now, events, 'player');
  const crop = target.plant!;
  const qty = harvestQty(crop, now);
  const nibbled = qty < crop.yield;
  const xp = harvestXpFor(crop.plantId, target);
  const gold = Math.floor((PLANTS[crop.plantId].sellPrice * qty * potStat(target, 'goldPct')) / 100);
  target.plant = null;
  addCount(s.items, crop.plantId, qty);
  s.gold += gold;
  events.push({ type: 'harvested', floor, slot, plantId: crop.plantId, qty, xp, gold, nibbled });
  addXp(s, xp, now, events);
}

/**
 * Làm mọi việc có thể ở một ô trong một lần chạm/kéo: bắt sâu, thu hoạch cây chín, lấy hàng ở máy.
 */
export function sweep(state: GameState, floor: number, slot: number, now: number): ActionResult {
  const content = getSlot(state, floor, slot);
  if (content === undefined) return fail('INVALID');
  if (content?.kind === 'machine') {
    const can = canCollect(state, content, now);
    if (can !== 'ok') return fail(can === 'STORAGE_FULL' ? 'STORAGE_FULL' : 'NOTHING_TO_DO');
    return commit(state, now, (s, events) => collectInDraft(s, floor, slot, now, events));
  }
  if (!content?.plant) return fail('NOTHING_TO_DO');
  const crop = content.plant;
  const ready = isReady(crop, now);
  const pest = activePest(crop, now);
  if (!ready && !pest) return fail('NOT_READY');
  if (ready && storageUsed(state) + harvestQty(crop, now) > state.storageCapacity) {
    // Kho đầy: vẫn bắt sâu nếu có, nhưng báo lỗi nếu chỉ còn việc thu hoạch.
    if (!pest) return fail('STORAGE_FULL');
    return commit(state, now, (s, events) => catchPestInDraft(s, floor, slot, now, events, 'player'));
  }
  return commit(state, now, (s, events) => {
    if (ready) harvestInDraft(s, floor, slot, now, events);
    else catchPestInDraft(s, floor, slot, now, events, 'player');
  });
}

/** Dùng ruby để cây chín ngay. */
export function speedUp(state: GameState, floor: number, slot: number, now: number): ActionResult {
  const pot = potAt(state, floor, slot);
  if (!isPot(pot)) return pot;
  if (!pot.plant) return fail('NOTHING_PLANTED');
  if (isReady(pot.plant, now)) return fail('ALREADY_READY');
  const cost = speedUpCost(remainingMs(pot.plant, now));
  if (state.ruby < cost) return fail('NOT_ENOUGH_RUBY');
  return commit(state, now, (s, events) => {
    s.ruby -= cost;
    const p = draftPot(s, floor, slot).plant!;
    p.growMs = Math.max(0, now - p.plantedAt);
    events.push({ type: 'speedUp', floor, slot, ruby: cost });
  });
}

/** Bán nông sản hoặc hàng chế biến cho cửa hàng. */
export function sellItem(state: GameState, id: BarnItemId, qty: number, now: number): ActionResult {
  if (!isBarnItemId(id) || !isPositiveInt(qty)) return fail('INVALID');
  const price = ITEMS[id].sellPrice;
  if (price <= 0) return fail('NOT_SELLABLE');
  if (count(state.items, id) < qty) return fail('NOT_ENOUGH_ITEMS');
  const gold = price * qty;
  return commit(state, now, (s, events) => {
    addCount(s.items, id, -qty);
    s.gold += gold;
    events.push({ type: 'sold', item: id, qty, gold });
  });
}

/** Lần nâng cấp kho kế tiếp, hoặc null nếu đã nâng tối đa. */
export const nextStorageUpgrade = (state: GameState) => STORAGE_UPGRADES[state.storageUpgrades] ?? null;

export function upgradeStorage(state: GameState, now: number): ActionResult {
  const next = nextStorageUpgrade(state);
  if (!next) return fail('MAX_LEVEL');
  if (state.gold < next.gold) return fail('NOT_ENOUGH_GOLD');
  if (!hasItems(state, next.materials)) return fail('NOT_ENOUGH_ITEMS');
  return commit(state, now, (s, events) => {
    s.gold -= next.gold;
    removeItems(s, next.materials);
    s.storageUpgrades++;
    s.storageCapacity += next.capacity;
    events.push({ type: 'storageUpgraded', capacity: s.storageCapacity });
  });
}

/** Giá và cấp để mở tầng kế tiếp, hoặc null nếu đã mở hết. */
export const nextFloorUnlock = (state: GameState): { floor: number; gold: number; level: number } | null => {
  const floor = state.floors.length;
  const req = FLOOR_UNLOCKS[floor];
  return req ? { floor, ...req } : null;
};

export function unlockFloor(state: GameState, now: number): ActionResult {
  const next = nextFloorUnlock(state);
  if (!next || state.floors.length >= MAX_FLOORS) return fail('MAX_FLOORS');
  if (state.level < next.level) return fail('LEVEL_TOO_LOW');
  if (state.gold < next.gold) return fail('NOT_ENOUGH_GOLD');
  return commit(state, now, (s, events) => {
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
  if (!canFulfill(state, order)) return fail('NOT_ENOUGH_ITEMS');
  return commit(state, now, (s, events) => {
    for (const { id, qty } of order.items) addCount(s.items, id, -qty);
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
  return commit(state, now, (s, events) => {
    s.orders[index] = { order: null, readyAt: now + ORDER_DISCARD_COOLDOWN_MS };
    events.push({ type: 'orderDiscarded', index });
  });
}
