import { commit } from './commit';
import { dueOrderSlots, fillOrders } from './orders';
import type { ActionResult, GameEvent, GameState } from './types';

/**
 * Một hệ thống chạy theo thời gian (đơn hàng tới, sang ngày mới, khinh khí cầu…).
 * `isDue` phải rẻ và thuần; `run` sửa bản nháp. Mỗi hệ thống tự xử lý được khoảng vắng mặt dài trong một lần chạy.
 */
interface TickSystem {
  name: string;
  isDue(state: GameState, now: number): boolean;
  run(draft: GameState, now: number, events: GameEvent[]): void;
}

const SYSTEMS: TickSystem[] = [
  { name: 'orders', isDue: (s, now) => dueOrderSlots(s, now).length > 0, run: fillOrders },
];

/** Cập nhật theo thời gian. Trả về đúng object cũ nếu không có gì tới hạn (để không ghi log thừa). */
export function tick(state: GameState, now: number): ActionResult {
  if (!SYSTEMS.some((sys) => sys.isDue(state, now))) return { ok: true, state, events: [] };
  return commit(state, now, (draft, events) => {
    for (const sys of SYSTEMS) if (sys.isDue(draft, now)) sys.run(draft, now, events);
  });
}
