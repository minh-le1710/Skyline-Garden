import { signal, type Signal } from '@preact/signals-core';
import {
  BACKUP_KEY,
  CORRUPT_KEY,
  SAVE_KEY,
  checkInvariants,
  createNewGame,
  offlineSummary,
  readSave,
  saveGame,
  step,
  type ActionError,
  type ActionResult,
  type Command,
  type GameEvent,
  type GameState,
  type PlantId,
  type PotId,
} from '../game';
import { Clock } from './Clock';
import { EventBus } from './EventBus';

const randomSeed = (): number => Math.floor(Math.random() * 2 ** 32);

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
  | { type: 'needPot' }
  /** Toàn bộ state bị thay (chơi lại, nhập save, đồng bộ server): view dựng lại không hiệu ứng. */
  | { type: 'stateReplaced'; reason: ReplaceReason }
  /** Save cũ không đọc được: đã giữ bản lỗi lại và bắt đầu ván mới. */
  | { type: 'saveRecovered'; reason: string };

/** Lý do phải tạm dừng game và không được lưu (tránh ghi đè dữ liệu tốt hơn). */
export type BlockReason = 'tooNew' | 'otherTab';

export type ReplaceReason = 'reset' | 'import' | 'sync' | 'conflict' | 'login';

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

  /** Khác null thì game tạm dừng: không lưu, giao diện hiện thông báo chặn. */
  readonly blocked = signal<BlockReason | null>(null);

  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private intervals: ReturnType<typeof setInterval>[] = [];
  private pendingNotices: AppEvent[] = [];

  constructor(private readonly storage: Storage | null) {
    const now = this.clock.now();
    const raw = storage?.getItem(SAVE_KEY) ?? null;
    const loaded = readSave(raw);
    let state: GameState;
    switch (loaded.status) {
      case 'ok': {
        state = loaded.state;
        // Giữ bản save trước khi nâng cấp, phòng khi migration có lỗi.
        if (loaded.migratedFrom !== null && raw) this.writeKey(BACKUP_KEY, raw);
        const summary = offlineSummary(state, now);
        if (summary.readyWhileAway > 0) this.pendingNotices.push({ type: 'welcomeBack', ...summary });
        break;
      }
      case 'corrupt':
        console.warn('Save không đọc được:', loaded.reason);
        this.writeKey(CORRUPT_KEY, loaded.raw);
        this.pendingNotices.push({ type: 'saveRecovered', reason: loaded.reason });
        state = createNewGame(now, randomSeed());
        break;
      case 'tooNew':
        // Bản game này cũ hơn save: chạy tạm một ván trống nhưng tuyệt đối không ghi đè.
        this.blocked.value = 'tooNew';
        state = createNewGame(now, randomSeed());
        break;
      case 'none':
        state = createNewGame(now, randomSeed());
        break;
    }
    this.state = signal(state);
    this.now = signal(now);
  }

  /** Tạm dừng game (vd. game đã mở ở tab khác). */
  block(reason: BlockReason): void {
    this.save();
    this.blocked.value = reason;
  }

  start(): void {
    // Tick đầu tiên chạy ở đây (không phải trong constructor) để được ghi log nếu đã gắn đồng bộ.
    this.update();
    for (const notice of this.pendingNotices) this.events.emit(notice);
    this.pendingNotices = [];
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

  /** Bật ở chế độ debug: kiểm tra bất biến sau mỗi lệnh và báo lỗi ra console (test E2E bắt được). */
  debugChecks = false;

  /** Được gọi sau mỗi lệnh làm thay đổi state (đồng bộ server ghi log ở đây). */
  onCommand: ((t: number, cmd: Command) => void) | null = null;

  /**
   * Chạy một lệnh tại thời điểm hiện tại. Lỗi được báo qua sự kiện `actionFailed`
   * (trừ các lỗi trong `quiet`); sự kiện của lệnh được phát cho render và UI.
   */
  exec(cmd: Command, options: RunOptions = {}): ActionResult {
    const now = this.clock.now();
    const result = step(this.state.value, cmd, now);
    if (!result.ok) {
      if (!options.quiet?.includes(result.error))
        this.events.emit({ type: 'actionFailed', error: result.error });
      return result;
    }
    if (result.state !== this.state.value) {
      if (this.debugChecks) {
        const broken = checkInvariants(result.state);
        if (broken.length) console.error(`[invariant] sau lệnh ${cmd.type}: ${broken.join('; ')}`);
      }
      this.state.value = result.state;
      this.scheduleSave();
      this.onCommand?.(now, cmd);
    }
    for (const event of result.events) this.events.emit(event);
    return result;
  }

  update(): void {
    this.now.value = this.clock.now();
    this.exec({ type: 'tick' });
  }

  /** Thay toàn bộ state (chơi lại, nhập save, đồng bộ). */
  replaceState(state: GameState, reason: ReplaceReason): void {
    if (reason === 'reset' || reason === 'import') {
      this.clock.offsetMs = 0;
      this.clock.resetMonotonic();
    }
    this.state.value = state;
    this.ui.tool.value = null;
    this.ui.selected.value = null;
    this.ui.panel.value = null;
    this.events.emit({ type: 'stateReplaced', reason });
    this.update();
    this.save();
  }

  save(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    if (!this.storage || this.blocked.value) return;
    try {
      saveGame(this.storage, { ...this.state.value, lastSeenAt: this.clock.now() });
    } catch (err) {
      console.warn('Không lưu được game', err);
    }
  }

  reset(): void {
    this.clock.offsetMs = 0;
    this.clock.resetMonotonic();
    this.replaceState(createNewGame(this.clock.now(), randomSeed()), 'reset');
  }

  /** Ghi một khóa phụ (sao lưu); lỗi hết dung lượng không được làm sập game. */
  writeKey(key: string, value: string): void {
    try {
      this.storage?.setItem(key, value);
    } catch (err) {
      console.warn(`Không ghi được ${key}`, err);
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer !== undefined) return;
    this.saveTimer = setTimeout(() => this.save(), SAVE_DEBOUNCE_MS);
  }
}
