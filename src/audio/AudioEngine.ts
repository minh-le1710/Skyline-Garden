// Vòng đời AudioContext, các bus âm lượng, mở khóa trên di động, tạm dừng khi ẩn tab, giới hạn số giọng.
// Không tạo AudioContext trước thao tác đầu tiên của người chơi (tránh cảnh báo autoplay của trình duyệt).
import type { MusicPlayer } from './music/MusicPlayer';
import type { ThemeId } from './music/themes';
import {
  DEFAULT_COOLDOWN_MS,
  SFX_RECIPES,
  playSfx,
  type PlayOptions,
  type SfxId,
  type SfxOutput,
} from './sfx';
import { makeImpulse } from './synth';

/** Tối đa số nguồn âm hiệu ứng phát cùng lúc. */
export const MAX_VOICES = 32;
/** Số hiệu ứng gần nhất giữ trong `log` (để debug và test E2E). */
export const LOG_SIZE = 50;
/** Nghỉ lâu hơn chừng này thì combo về nốt đầu. */
export const COMBO_RESET_MS = 600;
/** Ngũ cung (nửa cung): C D E G A C'. */
const PENTATONIC = [0, 2, 4, 7, 9, 12] as const;
const UNLOCK_EVENTS = ['pointerup', 'touchend', 'keydown'] as const;
const REVERB_WET = 0.3;

/** Đếm bước combo khi kéo tay: mỗi sự kiện nhích lên một nốt, nghỉ quá 600 ms thì về nốt đầu. */
export class Combo {
  private step = -1;
  private last = -Infinity;

  next(nowMs: number): number {
    this.step = nowMs - this.last > COMBO_RESET_MS ? 0 : this.step + 1;
    this.last = nowMs;
    return this.step;
  }
}

/** Hệ số tần số của bước combo: đi dần lên theo ngũ cung trong một quãng tám rồi lặp lại. */
export const comboPitch = (step: number): number => Math.pow(2, PENTATONIC[step % PENTATONIC.length]! / 12);

export interface AudioLevels {
  /** 0..1 (thanh trượt); gain thực là v². */
  sfx: number;
  music: number;
  muted: boolean;
  /** Tiếng vang cho nhạc nền (tắt ở chất lượng thấp). */
  reverb: boolean;
}

type AudioContextCtor = typeof AudioContext;

/** Hàm tạo AudioContext (Safari cũ dùng tiền tố webkit); null nếu trình duyệt không có Web Audio. */
function findAudioContext(): AudioContextCtor | null {
  const g = globalThis as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

/** Safari 17+: âm thanh game tôn trọng nút im lặng và trộn chung với nhạc của người chơi. */
function setAmbientSession(): void {
  if ('audioSession' in navigator) {
    try {
      (navigator as Navigator & { audioSession: { type: string } }).audioSession.type = 'ambient';
    } catch {
      // trình duyệt không cho đổi: bỏ qua
    }
  }
}

interface Buses {
  master: GainNode;
  sfx: GainNode;
  music: GainNode;
  duck: GainNode;
}

const noop = () => {};

export class AudioEngine {
  /** Các hiệu ứng được yêu cầu gần nhất (kể cả khi đang tắt tiếng hoặc chưa mở khóa). */
  readonly log: SfxId[] = [];
  /** Trình duyệt có Web Audio không. Không có thì mọi thứ im lặng, game vẫn chạy bình thường. */
  readonly supported: boolean;

  private ctx: AudioContext | null = null;
  private buses: Buses | null = null;
  private out: SfxOutput | null = null;
  private reverb: { convolver: ConvolverNode; wet: GainNode; connected: boolean } | null = null;
  private voices = 0;
  private readonly lastPlayed = new Map<SfxId, number>();
  private readonly combo = new Combo();
  private levels: AudioLevels = { sfx: 0.8, music: 0.5, muted: false, reverb: true };
  private armed = false;
  /** Đã chạy được ít nhất một lần (người chơi đã chạm): từ đây mới được tải và phát nhạc. */
  private unlocked = false;
  private theme: ThemeId = 'garden';
  private music: MusicPlayer | null = null;
  private musicLoading = false;
  private readonly now: () => number;

  constructor(options: { now?: () => number } = {}) {
    this.now = options.now ?? (() => performance.now());
    this.supported = findAudioContext() !== null;
  }

  /** Trạng thái AudioContext (null khi chưa tạo). */
  get state(): AudioContextState | null {
    return this.ctx?.state ?? null;
  }

  /** Gắn listener mở khóa và ẩn/hiện tab. Không tạo AudioContext ở đây. */
  install(): void {
    if (!this.supported) return;
    this.arm();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.suspend();
      else this.resume();
    });
  }

  /**
   * Phát một hiệu ứng. Ghi vào `log` ngay khi qua được cooldown và giới hạn giọng, dù AudioContext
   * chưa chạy hay đang tắt tiếng (test E2E dựa vào điều này). Trả về false nếu bị bỏ qua.
   */
  play(id: SfxId, options: PlayOptions = {}): boolean {
    const recipe = SFX_RECIPES[id];
    const t = this.now();
    const last = this.lastPlayed.get(id);
    if (last !== undefined && t - last < (recipe.cooldownMs ?? DEFAULT_COOLDOWN_MS)) return false;
    if (this.voices + recipe.layers.length > MAX_VOICES) return false;
    this.lastPlayed.set(id, t);
    this.log.push(id);
    if (this.log.length > LOG_SIZE) this.log.splice(0, this.log.length - LOG_SIZE);

    let pitch = options.pitch ?? 1;
    if (recipe.combo) pitch *= comboPitch(this.combo.next(t));
    if (this.ctx?.state !== 'running' || !this.out || this.levels.muted || this.levels.sfx <= 0) return true;
    playSfx(this.out, id, { pitch });
    if (recipe.duckMusic) this.duck(recipe.duckMusic);
    return true;
  }

  setLevels(levels: AudioLevels): void {
    this.levels = levels;
    const ctx = this.ctx;
    const buses = this.buses;
    if (ctx && buses) {
      const t = ctx.currentTime;
      // setTargetAtTime: đổi mượt, không có tiếng "tách".
      buses.master.gain.setTargetAtTime(levels.muted ? 0 : 1, t, 0.05);
      buses.sfx.gain.setTargetAtTime(levels.sfx * levels.sfx, t, 0.03);
      buses.music.gain.setTargetAtTime(levels.music * levels.music, t, 0.05);
      this.setReverb(levels.reverb);
    }
    this.updateMusic();
  }

  /** Đổi bản nhạc nền (theo màn hình), chuyển mượt 1,5 s. */
  setTheme(theme: ThemeId): void {
    this.theme = theme;
    this.updateMusic();
  }

  /** Tab ẩn. Bản native (Capacitor, M5) gọi thêm khi nhận sự kiện `pause`. */
  suspend(): void {
    void this.ctx?.suspend().catch(noop);
  }

  /** Tab hiện lại (hoặc Capacitor `resume`). iOS có thể từ chối khi không có cử chỉ: chờ lần chạm tới. */
  resume(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'running') return;
    this.arm();
    ctx.resume().then(() => this.onRunning(), noop);
  }

  /** Gọi bên trong một thao tác của người chơi: iOS chỉ cho phát khi resume() và start() nằm trong cử chỉ. */
  unlock(): void {
    // Sự kiện không phải cử chỉ thật (vd. phím Esc đầu tiên): chưa tạo context, tránh cảnh báo autoplay.
    const activation = navigator.userActivation as UserActivation | undefined;
    if (!this.ctx && activation && !activation.hasBeenActive) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (ctx.state !== 'running') ctx.resume().then(() => this.onRunning(), noop);
    try {
      // Một mẫu im lặng: cách chắc chắn nhất để "đánh thức" âm thanh trên Safari iOS.
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, 22050);
      src.connect(ctx.destination);
      src.start(0);
    } catch {
      // bỏ qua
    }
    this.onRunning();
  }

  private readonly onGesture = (): void => this.unlock();

  /** Gắn listener mở khóa (pha capture, tự gỡ khi AudioContext đã chạy). */
  private arm(): void {
    if (this.armed || !this.supported) return;
    this.armed = true;
    for (const type of UNLOCK_EVENTS)
      window.addEventListener(type, this.onGesture, { capture: true, passive: true });
  }

  private disarm(): void {
    if (!this.armed) return;
    this.armed = false;
    for (const type of UNLOCK_EVENTS) window.removeEventListener(type, this.onGesture, { capture: true });
  }

  private onRunning(): void {
    if (this.ctx?.state !== 'running') return;
    this.disarm();
    this.unlocked = true;
    this.updateMusic();
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = findAudioContext();
    if (!Ctor) return null;
    setAmbientSession();
    let ctx: AudioContext;
    try {
      ctx = new Ctor({ latencyHint: 'interactive' });
    } catch (err) {
      console.warn('Không tạo được AudioContext', err);
      this.disarm();
      return null;
    }
    const gain = (value: number, dest: AudioNode): GainNode => {
      const node = ctx.createGain();
      node.gain.value = value;
      node.connect(dest);
      return node;
    };
    // master → limiter → loa; sfx → master; music → duck → master (+ tiếng vang song song).
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.ratio.value = 12;
    limiter.connect(ctx.destination);
    const l = this.levels;
    const master = gain(l.muted ? 0 : 1, limiter);
    const duck = gain(1, master);
    const buses: Buses = {
      master,
      sfx: gain(l.sfx * l.sfx, master),
      music: gain(l.music * l.music, duck),
      duck,
    };
    this.ctx = ctx;
    this.buses = buses;
    this.out = {
      ctx,
      dest: buses.sfx,
      trackVoice: (src) => {
        this.voices++;
        src.addEventListener('ended', () => this.voices--);
      },
    };
    this.setReverb(l.reverb);
    ctx.addEventListener('statechange', () => {
      if (ctx.state === 'running') this.onRunning();
      // iOS báo 'interrupted' (cuộc gọi, Siri…): chạm lần tới sẽ mở lại.
      else if (document.visibilityState === 'visible') this.arm();
    });
    return ctx;
  }

  private setReverb(on: boolean): void {
    const ctx = this.ctx;
    const buses = this.buses;
    if (!ctx || !buses) return;
    if (on && !this.reverb) {
      const convolver = ctx.createConvolver();
      convolver.buffer = makeImpulse(ctx, 2);
      const wet = ctx.createGain();
      wet.gain.value = REVERB_WET;
      convolver.connect(wet).connect(buses.duck);
      this.reverb = { convolver, wet, connected: false };
    }
    const reverb = this.reverb;
    if (!reverb || reverb.connected === on) return;
    if (on) buses.music.connect(reverb.convolver);
    else buses.music.disconnect(reverb.convolver);
    reverb.connected = on;
  }

  /** Hạ nhỏ nhạc nền trong `seconds` giây (khi có hiệu ứng lớn như lên cấp). */
  private duck(seconds: number): void {
    const ctx = this.ctx;
    const buses = this.buses;
    if (!ctx || !buses) return;
    const t = ctx.currentTime;
    buses.duck.gain.cancelScheduledValues(t);
    buses.duck.gain.setTargetAtTime(0.35, t, 0.05);
    buses.duck.gain.setTargetAtTime(1, t + seconds, 0.4);
  }

  /** Nhạc nền chỉ chạy khi đã mở khóa, không tắt tiếng và âm lượng nhạc > 0. Mã nhạc được tải lười. */
  private updateMusic(): void {
    const ctx = this.ctx;
    const buses = this.buses;
    const wanted = this.unlocked && !this.levels.muted && this.levels.music > 0;
    if (!wanted || !ctx || !buses) {
      this.music?.stop();
      return;
    }
    if (this.music) {
      this.music.play(this.theme);
      return;
    }
    if (this.musicLoading) return;
    this.musicLoading = true;
    import('./music/MusicPlayer').then(
      ({ MusicPlayer }) => {
        this.musicLoading = false;
        this.music = new MusicPlayer(ctx, buses.music);
        this.updateMusic();
      },
      (err: unknown) => {
        this.musicLoading = false;
        console.warn('Không tải được nhạc nền', err);
      },
    );
  }
}
