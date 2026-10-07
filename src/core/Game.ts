import { signal, type Signal } from '@preact/signals-core';
import {
  BACKUP_KEY,
  CORRUPT_KEY,
  SAVE_KEY,
  checkInvariants,
  createNewGame,
  offlineSummary,
  readSave,
  serialize,
  step,
  type ActionError,
  type ActionResult,
  type Command,
  type GameEvent,
  type GameState,
  type MachineId,
  type OfflineSummary,
  type PlantId,
} from '../game';
import { Clock } from './Clock';
import { SettingsStore } from './settings';
import { EventBus } from './EventBus';

const randomSeed = (): number => Math.floor(Math.random() * 2 ** 32);

export type Tool =
  | { kind: 'seed'; plantId: PlantId }
  /** Đặt chậu từ một chồng trong khay (các chậu giống hệt nhau). */
  | { kind: 'pot'; stack: string }
  | { kind: 'harvest' }
  /** Vừa mua máy: chạm vào ô trống để đặt. */
  | { kind: 'machine'; machineId: MachineId }
  /** Di chuyển chậu/máy: chạm ô nguồn rồi ô đích. */
  | { kind: 'move'; from: SlotRef | null };

export type PanelId =
  'shop' | 'storage' | 'orders' | 'unlock' | 'machine' | 'quests' | 'balloon' | 'settings';
export type ScreenId = 'garden' | 'mine';
export type ShopTab = 'seeds' | 'pots' | 'machines' | 'upgrades';
export type StorageTab = 'crops' | 'goods' | 'materials' | 'pots';

export interface SlotRef {
  floor: number;
  slot: number;
}

export type AppEvent =
  | GameEvent
  | { type: 'actionFailed'; error: ActionError }
  | ({ type: 'welcomeBack' } & OfflineSummary)
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
    storageTab: signal<StorageTab>('crops'),
    selected: signal<SlotRef | null>(null),
    /** Màn 3D đang xem (ScreenHost chuyển màn theo signal này). */
    screen: signal<ScreenId>('garden'),
    /** Hiệu ứng mây che khi chuyển màn: 'in' đang che lại, 'out' đang mở ra. */
    transition: signal<'none' | 'in' | 'out'>('none'),
  };

  /** Khác null thì game tạm dừng: không lưu, giao diện hiện thông báo chặn. */
  readonly blocked = signal<BlockReason | null>(null);

  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  /**
   * Nội dung save mà tab này đọc/ghi lần cuối. Nếu khóa SAVE_KEY khác giá trị này lúc sắp ghi,
   * nghĩa là tab khác đã ghi: tab này tạm dừng thay vì ghi đè.
   */
  private lastWritten: string | null = null;
  private intervals: ReturnType<typeof setInterval>[] = [];
  private pendingNotices: AppEvent[] = [];

  constructor(
    private readonly storage: Storage | null,
    readonly settings: SettingsStore = new SettingsStore(null),
  ) {
    const now = this.clock.now();
    const raw = storage?.getItem(SAVE_KEY) ?? null;
    this.lastWritten = raw;
    const loaded = readSave(raw);
    let state: GameState;
    switch (loaded.status) {
      case 'ok': {
        state = loaded.state;
        // Giữ bản save trước khi nâng cấp, phòng khi migration có lỗi.
        if (loaded.migratedFrom !== null && raw) this.writeKey(BACKUP_KEY, raw);
        const summary = offlineSummary(state, now);
        if (summary.readyWhileAway + summary.pestsWaiting > 0) {
          this.pendingNotices.push({ type: 'welcomeBack', ...summary });
        }
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
  /**
   * Tạm dừng game. KHÔNG lưu lần cuối: tab đã mất quyền (tab khác đang chơi) mà ghi thì sẽ đè tiến độ mới hơn.
   * Lý do 'tooNew' (save của bản mới hơn) mạnh hơn và không bị thay.
   */
  block(reason: BlockReason): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    if (this.blocked.value === 'tooNew') return;
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
    // Tab khác ghi save (sự kiện 'storage' chỉ báo thay đổi từ tab khác): dừng ngay, không ghi đè.
    window.addEventListener('storage', (e) => {
      if (e.key === SAVE_KEY && e.newValue !== this.lastWritten) this.externalWrite(e.newValue);
    });
  }

  /** Tab này đang giữ khóa chơi (Web Locks). */
  private lockHeld = false;

  /**
   * Vừa giành được khóa: tab cũ có thể đã kịp lưu một lần trong lúc tab này đang tải.
   * Bản đó mới hơn bản tab này đọc lúc đầu, nên nhận lấy thay vì ghi đè hay tự dừng.
   */
  lockAcquired(): void {
    this.lockHeld = true;
    const raw = this.storage?.getItem(SAVE_KEY) ?? null;
    if (raw !== this.lastWritten) this.externalWrite(raw);
  }

  /**
   * Save bị tab khác ghi. Nếu tab này giữ khóa thì người ghi là tab cũ chưa kịp biết mình mất khóa
   * (nó sẽ dừng ngay sau đó): nhận bản mới hơn. Không thì tab này mới là tab cũ: dừng lại.
   */
  private externalWrite(raw: string | null): void {
    if (this.blocked.value) return;
    const loaded = this.lockHeld && raw !== null ? readSave(raw) : null;
    if (loaded?.status !== 'ok') {
      this.block('otherTab');
      return;
    }
    this.lastWritten = raw;
    this.replaceState(loaded.state, 'sync');
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
      const current = this.storage.getItem(SAVE_KEY);
      if (current !== this.lastWritten) {
        this.externalWrite(current);
        return;
      }
      const json = serialize({ ...this.state.value, lastSeenAt: this.clock.now() });
      this.storage.setItem(SAVE_KEY, json);
      this.lastWritten = json;
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
