// Bảng công thức hiệu ứng âm thanh (dữ liệu thuần) và hàm phát một công thức.
// Thời gian trong công thức tính bằng mili giây, tần số bằng Hz, gain tuyến tính.
import { playFm, playNoise, playTone, type Filter } from './synth';

export type SfxId =
  | 'click'
  | 'select'
  | 'whoosh'
  | 'plant'
  | 'harvest'
  | 'potPlace'
  | 'coin'
  | 'coinSpend'
  | 'error'
  | 'levelUp'
  | 'unlock'
  | 'magic'
  | 'owlHoot'
  | 'chime'
  | 'fanfare'
  | 'bugCatch'
  | 'machineDone'
  | 'dig'
  | 'rockBreak'
  | 'gem'
  | 'boom'
  | 'munch'
  | 'petCoo';

export type Layer =
  | {
      type: 'tone';
      wave: OscillatorType;
      f0: number;
      f1?: number;
      /** Trượt tiếp tới f2 ở nửa sau (vd. f0 → f1 → f2). */
      f2?: number;
      /** Mỗi lần phát chọn ngẫu nhiên một tần số đầu trong danh sách (cả lớp dịch theo tỉ lệ). */
      pick?: readonly number[];
      at?: number;
      dur: number;
      attack?: number;
      gain: number;
      vibrato?: readonly [rateHz: number, depthHz: number];
      filter?: Filter;
    }
  | {
      type: 'noise';
      at?: number;
      dur: number;
      attack?: number;
      gain: number;
      filter: Filter & { freq1?: number };
    }
  | { type: 'fm'; f0: number; ratio: number; index0: number; at?: number; dur: number; gain: number };

export interface SfxRecipe {
  layers: readonly Layer[];
  /** Lệch cao độ ngẫu nhiên ±phân số mỗi lần phát. */
  jitter?: number;
  /** Khoảng cách tối thiểu giữa hai lần phát (ms), mặc định DEFAULT_COOLDOWN_MS. */
  cooldownMs?: number;
  /** Hạ nhỏ nhạc nền trong chừng này giây. */
  duckMusic?: number;
  /** Cao độ đi lên theo ngũ cung khi phát liên tục (kéo tay qua nhiều chậu). */
  combo?: boolean;
}

export const DEFAULT_COOLDOWN_MS = 30;

// Cao độ (Hz) dùng trong bảng.
const G4 = 392;
const B4 = 493.88;
const C5 = 523.25;
const D5 = 587.33;
const E5 = 659.25;
const G5 = 783.99;
const C6 = 1046.5;
/** Ngũ cung cao (G6 A6 C7 D7 E7) cho tiếng phép thuật. */
const PENTA_HIGH = [1568, 1760, 2093, 2349, 2637] as const;
/** Mảnh đá vụn: tiếng tick 300–600 Hz. */
const DEBRIS = [311, 370, 415, 494, 554] as const;

const tone = (
  wave: OscillatorType,
  f0: number,
  dur: number,
  gain: number,
  extra: Partial<Extract<Layer, { type: 'tone' }>> = {},
): Layer => ({ type: 'tone', wave, f0, dur, gain, ...extra });

const noise = (
  filter: Filter & { freq1?: number },
  dur: number,
  gain: number,
  extra: { at?: number; attack?: number } = {},
): Layer => ({ type: 'noise', filter, dur, gain, ...extra });

export const SFX_RECIPES: Record<SfxId, SfxRecipe> = {
  click: { layers: [tone('triangle', 1400, 35, 0.12, { f1: 900, attack: 2 })], jitter: 0.03 },
  select: { layers: [tone('sine', 880, 60, 0.1, { f1: 1320 })] },
  whoosh: {
    layers: [noise({ type: 'bandpass', freq: 300, freq1: 1500, q: 1 }, 160, 0.06, { attack: 50 })],
    cooldownMs: 120,
  },
  plant: {
    layers: [noise({ type: 'lowpass', freq: 500 }, 50, 0.15), tone('sine', 300, 90, 0.18, { f1: 420 })],
    combo: true,
  },
  harvest: {
    layers: [
      noise({ type: 'bandpass', freq: 3000, q: 1 }, 70, 0.06),
      tone('triangle', C5, 120, 0.16, { attack: 2 }),
      tone('sine', C5 * 2, 120, 0.06, { at: 40 }),
    ],
    combo: true,
  },
  potPlace: {
    layers: [tone('sine', 160, 120, 0.25, { f1: 90 }), noise({ type: 'lowpass', freq: 900 }, 40, 0.1)],
    jitter: 0.05,
  },
  coin: {
    layers: [
      tone('square', 988, 70, 0.07, { filter: { type: 'lowpass', freq: 4000 } }),
      tone('square', 1319, 180, 0.07, { at: 70, filter: { type: 'lowpass', freq: 4000 } }),
    ],
    cooldownMs: 60,
  },
  coinSpend: {
    layers: [
      tone('triangle', 1319, 60, 0.06, { f1: 988 }),
      tone('triangle', 1319, 60, 0.06, { f1: 988, at: 90 }),
    ],
    cooldownMs: 60,
  },
  error: {
    layers: [
      tone('square', 196, 80, 0.08, { filter: { type: 'lowpass', freq: 1200 } }),
      tone('square', 147, 120, 0.08, { at: 120, filter: { type: 'lowpass', freq: 1200 } }),
    ],
    cooldownMs: 250,
  },
  levelUp: {
    layers: [
      ...[C5, E5, G5, C6].map((f, i) => tone('triangle', f, 200, 0.1, { at: i * 80 })),
      ...[C5, E5, G5, C6].map((f) => tone('sine', f, 1500, 0.04, { attack: 600 })),
      noise({ type: 'highpass', freq: 6000 }, 500, 0.03, { attack: 100 }),
    ],
    cooldownMs: 500,
    duckMusic: 1.5,
  },
  unlock: {
    layers: [
      tone('sine', 200, 400, 0.1, { f1: 800, attack: 20 }),
      ...[G4, B4, D5].map((f) => tone('sine', f, 500, 0.07, { at: 300, attack: 10 })),
    ],
    cooldownMs: 500,
  },
  magic: {
    layers: [
      ...[0, 50, 100, 150, 200, 250].map((at) =>
        tone('sine', PENTA_HIGH[2], 80, 0.04, { at, pick: PENTA_HIGH }),
      ),
      noise({ type: 'highpass', freq: 2000, freq1: 8000 }, 300, 0.03, { attack: 30 }),
    ],
    cooldownMs: 150,
  },
  owlHoot: {
    layers: [0, 300].map((at, i) =>
      tone('sine', i ? 466 : 523, 180, 0.12, {
        f1: i ? 440 : 494,
        at,
        attack: 20,
        vibrato: [6, 8],
        filter: { type: 'lowpass', freq: 1500 },
      }),
    ),
    cooldownMs: 1000,
  },
  chime: {
    layers: [tone('sine', 1568, 900, 0.08), tone('sine', 2093, 900, 0.08, { at: 60 })],
    cooldownMs: 300,
  },
  fanfare: {
    layers: [
      ...[G4, C5, E5].map((f, i) => tone('triangle', f, 120, 0.12, { at: i * 100 })),
      ...[C5, E5, G5, C6].map((f) => tone('triangle', f, 700, 0.06, { at: 300 })),
    ],
    cooldownMs: 500,
    duckMusic: 1,
  },
  bugCatch: {
    layers: [
      noise({ type: 'bandpass', freq: 2000, q: 2 }, 40, 0.15),
      tone('sine', 1800, 70, 0.1, { f1: 2600 }),
    ],
  },
  machineDone: {
    layers: [{ type: 'fm', f0: 880, ratio: 2.75, index0: 300, dur: 900, gain: 0.12 }],
    cooldownMs: 500,
  },
  // Đào: playSfx nhận pitch = 1 − 0.08·độ cứng của khối đá.
  dig: {
    layers: [tone('sine', 110, 80, 0.3, { f1: 70 }), noise({ type: 'lowpass', freq: 700 }, 60, 0.18)],
    jitter: 0.04,
  },
  rockBreak: {
    layers: [
      noise({ type: 'lowpass', freq: 1200, freq1: 300 }, 220, 0.25),
      ...[20, 60, 100, 150].map((at) => tone('sine', DEBRIS[2], 40, 0.05, { at, pick: DEBRIS })),
    ],
  },
  gem: { layers: [2093, 2637, 3136].map((f, i) => tone('sine', f, 400, 0.07, { at: i * 50 })) },
  boom: {
    layers: [noise({ type: 'lowpass', freq: 400 }, 600, 0.4), tone('sine', 120, 500, 0.35, { f1: 35 })],
    cooldownMs: 100,
  },
  munch: {
    layers: [0, 110, 220].map((at) => noise({ type: 'bandpass', freq: 1200, q: 2 }, 45, 0.12, { at })),
  },
  petCoo: {
    layers: [
      tone('sine', 660, 260, 0.1, { f1: 990, f2: 820, attack: 20, vibrato: [7, 15] }),
      tone('sine', 1320, 260, 0.03, { f1: 1980, f2: 1640, attack: 20 }),
    ],
  },
};

/** Nơi phát hiệu ứng (AudioEngine cung cấp khi đã có AudioContext). */
export interface SfxOutput {
  readonly ctx: BaseAudioContext;
  readonly dest: AudioNode;
  /** Đếm nguồn âm đang phát (giới hạn số giọng). */
  trackVoice(src: AudioScheduledSourceNode): void;
}

export interface PlayOptions {
  /** Hệ số nhân tần số (1 = cao độ gốc). */
  pitch?: number;
}

const randomOf = (list: readonly number[]): number => list[Math.floor(Math.random() * list.length)]!;

/** Phát một công thức ngay lúc này. Không kiểm tra cooldown/giới hạn giọng: AudioEngine.play lo việc đó. */
export function playSfx(out: SfxOutput, id: SfxId, opts: PlayOptions = {}): void {
  const recipe = SFX_RECIPES[id];
  const { ctx, dest } = out;
  const start = ctx.currentTime + 0.005;
  const jitter = recipe.jitter ? 1 + (Math.random() * 2 - 1) * recipe.jitter : 1;
  const pitch = (opts.pitch ?? 1) * jitter;
  for (const layer of recipe.layers) {
    const t0 = start + (layer.at ?? 0) / 1000;
    const dur = layer.dur / 1000;
    let src: AudioScheduledSourceNode;
    switch (layer.type) {
      case 'tone': {
        const k = pitch * (layer.pick ? randomOf(layer.pick) / layer.f0 : 1);
        src = playTone(ctx, dest, {
          wave: layer.wave,
          f0: layer.f0 * k,
          f1: layer.f1 === undefined ? undefined : layer.f1 * k,
          f2: layer.f2 === undefined ? undefined : layer.f2 * k,
          t0,
          dur,
          attack: (layer.attack ?? 3) / 1000,
          gain: layer.gain,
          vibrato: layer.vibrato,
          filter: layer.filter,
        });
        break;
      }
      case 'noise':
        src = playNoise(ctx, dest, {
          t0,
          dur,
          attack: (layer.attack ?? 2) / 1000,
          gain: layer.gain,
          filter: layer.filter,
        });
        break;
      case 'fm':
        src = playFm(ctx, dest, { ...layer, f0: layer.f0 * pitch, t0, dur });
        break;
    }
    out.trackVoice(src);
  }
}
