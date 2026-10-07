import type { GameEvent, GameState, StatKey } from './types';

/** Cộng thống kê trọn đời theo sự kiện của một lệnh. */
function recordStats(s: GameState, events: readonly GameEvent[]): void {
  const add = (key: StatKey, n: number) => {
    if (n > 0) s.stats[key] = (s.stats[key] ?? 0) + n;
  };
  for (const e of events) {
    switch (e.type) {
      case 'planted':
        add('seedsPlanted', 1);
        break;
      case 'harvested':
        add('harvests', 1);
        add('cropsHarvested', e.qty);
        add('goldEarned', e.gold);
        if (e.nibbled) add('pestsEscaped', 1);
        break;
      case 'pestCaught':
        add('pestsCaught', 1);
        add('goldEarned', e.gold);
        break;
      case 'orderDelivered':
        add('ordersDelivered', 1);
        add('goldEarned', e.gold);
        break;
      case 'sold':
        add('goldEarned', e.gold);
        break;
      case 'speedUp':
      case 'machineSpeedUp':
        add('rubySpent', e.ruby);
        break;
      case 'goodsCollected':
        add(
          'goodsMade',
          Object.values(e.items).reduce<number>((a, b) => a + (b ?? 0), 0),
        );
        break;
    }
  }
}

/**
 * Chạy sau mỗi lệnh thành công, trong cùng bản nháp: thống kê → nhiệm vụ → hướng dẫn → thành tựu.
 * Chạy đúng một lần: sự kiện do bước này sinh ra không được đưa vào lại.
 */
export function applyMeta(draft: GameState, events: GameEvent[], _now: number): void {
  recordStats(draft, events);
}
