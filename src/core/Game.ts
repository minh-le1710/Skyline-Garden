import { signal, type Signal } from '@preact/signals-core';
import {
  Clock,
  createNewGame,
  loadGame,
  offlineSummary,
  saveGame,
  tick,
  type ActionError,
  type ActionResult,
  type GameEvent,
  type GameState,
  type PlantId,
  type PotId,
} from '../game';
import { EventBus } from './EventBus';

export type Tool = { kind: 'seed'; plantId: PlantId } | { kind: 'pot'; potId: PotId } | { kind: 'harvest' };

export type PanelId = 'shop' | 'storage' | 'orders' | 'unlock';
export type ShopTab = 'seeds' | 'pots' | 'upgrades';

export interface SlotRef {
  floor: number;
  slot: number;
}

export type AppEvent =
  | GameEvent
  | { type: 'actionFailed'; error: ActionError }
  | { type: 'welcomeBack'; readyWhileAway: number; awayMs: number }
  /** Người chơi chạm vào ô chưa có chậu mà kho không còn chậu. */
  | { type: 'needPot' };

const AUTOSAVE_INTERVAL_MS = 10_000;
const SAVE_DEBOUNCE_MS = 500;
const TICK_INTERVAL_MS = 250;

interface RunOptions {
  /** Lỗi không cần báo cho người chơi (vd. kéo liềm qua cây chưa chín). */
  quiet?: readonly ActionError[];
}

/** Nối logic game thuần với render/UI: giữ state trong signal, chạy action, phát event, tự lưu. */
export class Game {
  readonly clock = new Clock();
  readonly events = new EventBus<AppEvent>();
  readonly state: Signal<GameState>;
  /** Thời gian hiện tại cho UI đếm ngược, cập nhật vài lần mỗi giây. */
  readonly now: Signal<number>;

  readonly ui = {
    tool: signal<Tool | null>(null),
    trayOpen: signal(false),
    panel: signal<PanelId | null>(null),
    shopTab: signal<ShopTab>('seeds'),
    selected: signal<SlotRef | null>(null),
  };

  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private intervals: ReturnType<typeof setInterval>[] = [];
  private pendingWelcome: AppEvent | null = null;

  constructor(private readonly storage: Storage | null) {
    const now = this.clock.now();
    const saved = storage ? loadGame(storage) : null;
    let state = saved ?? createNewGame(now);
    if (saved) {
      const summary = offlineSummary(saved, now);
      if (summary.readyWhileAway > 0) this.pendingWelcome = { type: 'welcomeBack', ...summary };
    }
    // Đơn hàng tới trong lúc vắng mặt: điền luôn, không cần báo.
    const ticked = tick(state, now);
    if (ticked.ok) state = ticked.state;
    this.state = signal(state);
    this.now = signal(now);
  }

  start(): void {
    if (this.pendingWelcome) this.events.emit(this.pendingWelcome);
    this.pendingWelcome = null;
    this.intervals.push(
      setInterval(() => this.update(), TICK_INTERVAL_MS),
      setInterval(() => this.save(), AUTOSAVE_INTERVAL_MS),
    );
    const flush = () => this.save();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
    window.addEventListener('pagehide', flush);
  }

  /** Chạy một action thuần với state và thời gian hiện tại. */
  run(action: (state: GameState, now: number) => ActionResult, options: RunOptions = {}): ActionResult {
    const result = action(this.state.value, this.clock.now());
    if (!result.ok) {
      if (!options.quiet?.includes(result.error))
        this.events.emit({ type: 'actionFailed', error: result.error });
      return result;
    }
    if (result.state !== this.state.value) {
      this.state.value = result.state;
      this.scheduleSave();
    }
    for (const event of result.events) this.events.emit(event);
    return result;
  }

  update(): void {
    const now = this.clock.now();
    this.now.value = now;
    this.run(tick);
  }

  save(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    if (!this.storage) return;
    try {
      saveGame(this.storage, { ...this.state.value, lastSeenAt: this.clock.now() });
    } catch (err) {
      console.warn('Không lưu được game', err);
    }
  }

  reset(): void {
    this.clock.offsetMs = 0;
    this.state.value = createNewGame(this.clock.now());
    this.ui.tool.value = null;
    this.ui.selected.value = null;
    this.ui.panel.value = null;
    this.update();
    this.save();
  }

  private scheduleSave(): void {
    if (this.saveTimer !== undefined) return;
    this.saveTimer = setTimeout(() => this.save(), SAVE_DEBOUNCE_MS);
  }
}
