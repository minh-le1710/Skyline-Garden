import { ITEMS } from './config/items';
import {
  MAX_ITEMS_PER_ORDER,
  ORDER_GOLD_MULTIPLIER,
  ORDER_XP_MULTIPLIER,
  orderQtyRange,
} from './config/orders';
import { PLANTS } from './config/plants';
import { unlockedPlants } from './progression';
import { withRng, type Rng } from './rng';
import { count } from './state';
import type { BarnItemId, GameEvent, GameState, Order, OrderItem } from './types';

/** Những món có thể xuất hiện trong đơn hàng ở trạng thái hiện tại. */
export function orderPool(state: GameState): BarnItemId[] {
  return unlockedPlants(state.level);
}

function qtyRange(id: BarnItemId): [number, number] {
  return ITEMS[id].kind === 'crop' ? orderQtyRange(PLANTS[id as keyof typeof PLANTS].growSec) : [1, 2];
}

export function generateOrder(rng: Rng, pool: readonly BarnItemId[], id: number): Order {
  const itemCount = rng.int(1, Math.min(MAX_ITEMS_PER_ORDER, pool.length));
  const items: OrderItem[] = [];
  const remaining = [...pool];
  for (let i = 0; i < itemCount; i++) {
    const itemId = rng.pick(remaining);
    remaining.splice(remaining.indexOf(itemId), 1);
    const [min, max] = qtyRange(itemId);
    items.push({ id: itemId, qty: rng.int(min, max) });
  }
  let value = 0;
  let xp = 0;
  for (const { id: itemId, qty } of items) {
    value += qty * ITEMS[itemId].sellPrice;
    xp += qty * ITEMS[itemId].xpValue;
  }
  return {
    id,
    items,
    gold: Math.round(value * ORDER_GOLD_MULTIPLIER),
    xp: Math.max(1, Math.ceil(xp * ORDER_XP_MULTIPLIER)),
  };
}

/** Các chỗ trống trên bảng đơn đã tới giờ có đơn mới, theo thứ tự thời gian rồi chỉ số. */
export const dueOrderSlots = (state: GameState, now: number): number[] =>
  state.orders
    .map((slot, index) => ({ slot, index }))
    .filter(({ slot }) => slot.order === null && slot.readyAt <= now)
    .sort((a, b) => a.slot.readyAt - b.slot.readyAt || a.index - b.index)
    .map(({ index }) => index);

/**
 * Điền đơn mới vào các chỗ trống đã tới giờ. Sửa trực tiếp `state`.
 * Gọi khi load game và định kỳ, nên đơn vẫn tới dù người chơi tắt game.
 */
export function fillOrders(state: GameState, now: number, events: GameEvent[]): void {
  const due = dueOrderSlots(state, now);
  if (due.length === 0) return;
  const pool = orderPool(state);
  withRng(state, 'orders', (rng) => {
    for (const index of due) state.orders[index]!.order = generateOrder(rng, pool, state.nextOrderId++);
  });
  events.push({ type: 'ordersArrived', count: due.length });
}

export const canFulfill = (state: GameState, order: Order): boolean =>
  order.items.every(({ id, qty }) => count(state.items, id) >= qty);
