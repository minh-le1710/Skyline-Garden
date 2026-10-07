import { effect } from '@preact/signals-core';
import type { Game } from '../core/Game';
import type { Screen, ScreenId } from './screens/Screen';

/** Thời gian mây che/mở khi chuyển màn (khớp với CSS `.screen-transition`). */
export const TRANSITION_MS = 350;

export type ScreenLoader = () => Promise<Screen>;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Giữ màn đang hiển thị và chuyển màn theo `game.ui.screen`:
 * mây che lại → tải màn (lần đầu, lazy chunk) → đổi → mây mở ra.
 * Trong lúc chuyển, `active` là null để không nhận cử chỉ.
 */
export class ScreenHost {
  private readonly screens = new Map<ScreenId, Screen>();
  private current: Screen;
  private switching = false;

  constructor(
    private readonly game: Game,
    initial: Screen,
    private readonly loaders: Partial<Record<ScreenId, ScreenLoader>> = {},
    private readonly onSwitched: (screen: Screen) => void = () => {},
  ) {
    this.screens.set(initial.id, initial);
    this.current = initial;
    initial.enter();
    effect(() => {
      const target = game.ui.screen.value;
      if (target !== this.current.id) void this.switchTo(target);
    });
  }

  /** Màn nhận cử chỉ; null khi đang chuyển màn. */
  get active(): Screen | null {
    return this.switching ? null : this.current;
  }

  /** Màn đang được vẽ (kể cả lúc chuyển). */
  get visible(): Screen {
    return this.current;
  }

  get(id: ScreenId): Screen | undefined {
    return this.screens.get(id);
  }

  private async load(id: ScreenId): Promise<Screen | null> {
    const existing = this.screens.get(id);
    if (existing) return existing;
    const loader = this.loaders[id];
    if (!loader) return null;
    try {
      const screen = await loader();
      this.screens.set(id, screen);
      return screen;
    } catch (err) {
      console.error(`Không tải được màn ${id}`, err);
      return null;
    }
  }

  private async switchTo(id: ScreenId): Promise<void> {
    if (this.switching) return;
    this.switching = true;
    const ui = this.game.ui;
    ui.tool.value = null;
    ui.selected.value = null;
    ui.panel.value = null;
    ui.transition.value = 'in';
    const [next] = await Promise.all([this.load(id), wait(TRANSITION_MS)]);
    if (next) {
      this.current.exit();
      this.current = next;
      next.enter();
      this.onSwitched(next);
    }
    ui.transition.value = 'out';
    // Màn không tải được thì quay về màn cũ.
    if (ui.screen.value !== this.current.id) ui.screen.value = this.current.id;
    await wait(TRANSITION_MS);
    ui.transition.value = 'none';
    this.switching = false;
    // Người chơi đã bấm chuyển tiếp trong lúc đang chuyển.
    if (ui.screen.value !== this.current.id) void this.switchTo(ui.screen.value);
  }
}
