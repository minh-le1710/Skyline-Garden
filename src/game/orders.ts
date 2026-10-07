import { PLANTS } from './config/plants';
import {
  MAX_ITEMS_PER_ORDER,
  ORDER_GOLD_MULTIPLIER,
  ORDER_XP_MULTIPLIER,
  orderQtyRange,
} from './config/orders';
import { unlockedPlants } from './progression';
import { Rng } from './rng';
import type { GameEvent, GameState, Order, OrderItem } from './types';

export function generateOrder(rng: Rng, level: number, id: number): Order {
  const pool = unlockedPlants(level);
  const itemCount = rng.int(1, Math.min(MAX_ITEMS_PER_ORDER, pool.length));
  const items: OrderItem[] = [];
  const remaining = [...pool];
  for (let i = 0; i < itemCount; i++) {
    const plantId = rng.pick(remaining);
    remaining.splice(remaining.indexOf(plantId), 1);
    const [min, max] = orderQtyRange(PLANTS[plantId].growSec);
    items.push({ plantId, qty: rng.int(min, max) });
  }
  let value = 0;
  let xp = 0;
  for (const { plantId, qty } of items) {
    const def = PLANTS[plantId];
    value += qty * def.sellPrice;
    xp += (qty * def.xp) / def.yield;
  }
  return {
    id,
    items,
    gold: Math.round(value * ORDER_GOLD_MULTIPLIER),
    xp: Math.max(1, Math.ceil(xp * ORDER_XP_MULTIPLIER)),
  };
}

/**
 * Điền đơn mới vào các chỗ trống đã tới giờ. Sửa trực tiếp `state`.
 * Gọi khi load game và định kỳ, nên đơn vẫn tới dù người chơi tắt game.
 */
export function fillOrders(state: GameState, now: number, events: GameEvent[]): void {
  const rng = new Rng(state.rngSeed);
  let arrived = 0;
  for (const slot of state.orders) {
    if (slot.order === null && slot.readyAt <= now) {
      slot.order = generateOrder(rng, state.level, state.nextOrderId++);
      arrived++;
    }
  }
  state.rngSeed = rng.seed;
  if (arrived > 0) events.push({ type: 'ordersArrived', count: arrived });
}

export const canFulfill = (state: GameState, order: Order): boolean =>
  order.items.every(({ plantId, qty }) => (state.crops[plantId] ?? 0) >= qty);
