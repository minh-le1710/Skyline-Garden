import { describe, expect, it } from 'vitest';
import {
  ITEMS,
  ORDER_DELIVER_COOLDOWN_MS,
  ORDER_DISCARD_COOLDOWN_MS,
  Rng,
  deliverOrder,
  discardOrder,
  generateOrder,
  tick,
  unlockedPlants,
} from '../src/game';
import { T0, errorOf, newGame, ok } from './helpers';

describe('đơn hàng của Cú', () => {
  it('đơn đầu tiên tới ngay khi vào game', () => {
    const s = ok(tick(newGame(), T0));
    expect(s.orders).toHaveLength(3);
    expect(s.orders.every((o) => o.order !== null)).toBe(true);
  });

  it('tick không tạo bản sao khi không có gì đổi', () => {
    const s = ok(tick(newGame(), T0));
    const r = tick(s, T0 + 1000);
    expect(r.ok && r.state).toBe(s);
  });

  it('đơn tạo ra tất định theo seed, gồm món đã mở, thưởng cao hơn bán thẳng', () => {
    const a = ok(tick(newGame(), T0));
    const b = ok(tick(newGame(), T0));
    expect(a.orders).toEqual(b.orders);
    const pool = unlockedPlants(6);
    for (let i = 0; i < 200; i++) {
      const order = generateOrder(new Rng(i), pool, i);
      const ids = order.items.map((it) => it.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(pool).toContain(id);
      const value = order.items.reduce((sum, it) => sum + it.qty * ITEMS[it.id].sellPrice, 0);
      expect(order.gold).toBeGreaterThan(value);
    }
  });

  it('giao đơn: trừ nông sản, cộng vàng + XP, chờ đơn mới', () => {
    let s = ok(tick(newGame(), T0));
    const order = s.orders[0]!.order!;
    expect(errorOf(deliverOrder(s, 0, T0))).toBe('NOT_ENOUGH_ITEMS');
    for (const { id, qty } of order.items) s.items[id] = qty + 1;
    s = ok(deliverOrder(s, 0, T0));
    expect(s.gold).toBeGreaterThanOrEqual(100 + order.gold);
    expect(s.xp).toBe(order.xp);
    for (const { id } of order.items) expect(s.items[id]).toBe(1);
    expect(s.orders[0]).toEqual({ order: null, readyAt: T0 + ORDER_DELIVER_COOLDOWN_MS });
    expect(s.stats.ordersDelivered).toBe(1);
    expect(errorOf(deliverOrder(s, 0, T0))).toBe('NO_ORDER');

    s = ok(tick(s, T0 + ORDER_DELIVER_COOLDOWN_MS));
    expect(s.orders[0]!.order).not.toBeNull();
    expect(s.orders[0]!.order!.id).not.toBe(order.id);
  });

  it('hủy đơn thì chờ lâu hơn', () => {
    let s = ok(tick(newGame(), T0));
    s = ok(discardOrder(s, 1, T0));
    expect(s.orders[1]!.readyAt).toBe(T0 + ORDER_DISCARD_COOLDOWN_MS);
    expect(errorOf(discardOrder(s, 1, T0))).toBe('NO_ORDER');
    expect(errorOf(discardOrder(s, 7, T0))).toBe('INVALID');
  });
});
