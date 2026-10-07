import { isReady, type GameState, type TutorialStep } from '../../game';
import type { Game } from '../../core/Game';

/** Chỗ người chơi cần chạm ở mỗi bước: một nút (theo data-testid) hoặc vài ô chậu 3D. */
export type TutorialTarget =
  | { kind: 'dom'; testId: string }
  | { kind: 'slots'; floor: number; slots: number[] }
  /** Không chặn gì (chỉ hiện lời nhắn), vd. lúc chờ cây lớn. */
  | { kind: 'none'; slots?: number[] }
  /** Hộp thoại giữa màn hình (bước chào). */
  | { kind: 'modal' };

const potSlots = (
  s: GameState,
  floor: number,
  keep: (plant: boolean, ready: boolean) => boolean,
  now: number,
) =>
  (s.floors[floor]?.slots ?? []).flatMap((c, i) =>
    c?.kind === 'pot' && keep(c.plant !== null, c.plant !== null && isReady(c.plant, now)) ? [i] : [],
  );

/** Mục tiêu của bước hiện tại, tùy theo giao diện đang mở (vd. chưa mở khay thì chỉ vào nút Trồng). */
export function targetFor(step: TutorialStep, game: Game, now: number): TutorialTarget | null {
  const ui = game.ui;
  const s = game.state.value;
  const tool = ui.tool.value;
  switch (step) {
    case 'welcome':
      return { kind: 'modal' };
    case 'openTray':
      return { kind: 'dom', testId: 'btn-plant' };
    case 'pickSeed':
      return ui.trayOpen.value ? { kind: 'dom', testId: 'seed-rose' } : { kind: 'dom', testId: 'btn-plant' };
    case 'plantRow': {
      if (tool?.kind !== 'seed') {
        return { kind: 'dom', testId: ui.trayOpen.value ? 'seed-rose' : 'btn-plant' };
      }
      const empty = potSlots(s, 0, (planted) => !planted, now);
      return { kind: 'slots', floor: 0, slots: empty.length ? empty.slice(0, 3) : [0, 1, 2] };
    }
    case 'waitGrow':
      return { kind: 'none', slots: potSlots(s, 0, (planted) => planted, now) };
    case 'harvest': {
      if (tool?.kind !== 'harvest') return { kind: 'dom', testId: 'btn-harvest' };
      const ready = potSlots(s, 0, (_, r) => r, now);
      return ready.length ? { kind: 'slots', floor: 0, slots: ready } : { kind: 'none' };
    }
    case 'openOrders':
      return { kind: 'dom', testId: 'btn-orders' };
    case 'deliver':
      return ui.panel.value === 'orders'
        ? { kind: 'dom', testId: 'deliver-0' }
        : { kind: 'dom', testId: 'btn-orders' };
    case 'openShop':
      return { kind: 'dom', testId: 'btn-shop' };
    case 'buySeeds':
      return ui.panel.value === 'shop'
        ? { kind: 'dom', testId: 'buy-seed-rose-5' }
        : { kind: 'dom', testId: 'btn-shop' };
    case 'done':
      return null;
  }
}
