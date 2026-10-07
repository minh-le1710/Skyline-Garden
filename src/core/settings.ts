import { signal, type Signal } from '@preact/signals-core';

/** Cài đặt của người chơi trên thiết bị này. Lưu riêng ngoài save game: không cần migration, không đồng bộ server. */
export const SETTINGS_KEY = 'skyline-garden/settings';

export const LOCALES = ['vi', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export type Quality = 'auto' | 'low' | 'high';

export interface Settings {
  version: 1;
  /** Âm lượng hiệu ứng, 0..1. */
  sfx: number;
  /** Âm lượng nhạc nền, 0..1. */
  music: number;
  muted: boolean;
  locale: Locale;
  haptics: boolean;
  quality: Quality;
  /** Tắt quán tính camera, hiệu ứng nảy, hoạt ảnh CSS; giảm hạt. */
  reduceMotion: boolean;
  /** Địa chỉ server online; rỗng là chơi offline. */
  serverUrl: string;
  /** Các mẹo tính năng đã xem. */
  seenTips: string[];
}

export const defaultSettings = (reduceMotion = false): Settings => ({
  version: 1,
  sfx: 0.8,
  music: 0.5,
  muted: false,
  locale: 'vi',
  haptics: true,
  quality: 'auto',
  reduceMotion,
  serverUrl: '',
  seenTips: [],
});

const clamp01 = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

/** Đọc cài đặt từ JSON (không tin cậy): giá trị lạ trở về mặc định, không bao giờ ném lỗi. */
export function parseSettings(json: string | null, defaults: Settings = defaultSettings()): Settings {
  let raw: Record<string, unknown> = {};
  try {
    const parsed: unknown = json ? JSON.parse(json) : {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      raw = parsed as Record<string, unknown>;
  } catch {
    // giữ mặc định
  }
  return {
    version: 1,
    sfx: clamp01(raw.sfx, defaults.sfx),
    music: clamp01(raw.music, defaults.music),
    muted: bool(raw.muted, defaults.muted),
    locale: LOCALES.includes(raw.locale as Locale) ? (raw.locale as Locale) : defaults.locale,
    haptics: bool(raw.haptics, defaults.haptics),
    quality: ['auto', 'low', 'high'].includes(raw.quality as string)
      ? (raw.quality as Quality)
      : defaults.quality,
    reduceMotion: bool(raw.reduceMotion, defaults.reduceMotion),
    serverUrl: typeof raw.serverUrl === 'string' ? raw.serverUrl.trim().slice(0, 200) : defaults.serverUrl,
    seenTips: Array.isArray(raw.seenTips)
      ? raw.seenTips.filter((x): x is string => typeof x === 'string').slice(0, 100)
      : defaults.seenTips,
  };
}

type KeyValue = { getItem(k: string): string | null; setItem(k: string, v: string): void };

export class SettingsStore {
  readonly value: Signal<Settings>;

  constructor(
    private readonly storage: KeyValue | null,
    defaults: Settings = defaultSettings(),
  ) {
    let json: string | null;
    try {
      json = storage?.getItem(SETTINGS_KEY) ?? null;
    } catch {
      json = null;
    }
    this.value = signal(parseSettings(json, defaults));
  }

  update(patch: Partial<Settings>): void {
    this.value.value = parseSettings(JSON.stringify({ ...this.value.value, ...patch }), this.value.value);
    try {
      this.storage?.setItem(SETTINGS_KEY, JSON.stringify(this.value.value));
    } catch {
      // hết dung lượng: cài đặt vẫn đúng trong phiên này
    }
  }
}
