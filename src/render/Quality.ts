import type { Quality } from '../core/settings';

export type QualityTier = 'low' | 'medium' | 'high';

export interface TierSpec {
  /** Mật độ điểm ảnh tối đa. */
  dprCap: number;
  /** Chỉ đổi được khi tạo lại renderer (lần tải sau). */
  antialias: boolean;
  powerPreference: WebGLPowerPreference;
  /** Hệ số số hạt hiệu ứng. */
  particleScale: number;
  /** Số mây nền xa. */
  clouds: number;
  /** Tốc độ khung hình khi không tương tác (chỉ có mây trôi, cây đung đưa). */
  ambientFps: number;
}

export const TIERS: Record<QualityTier, TierSpec> = {
  low: {
    dprCap: 1,
    antialias: false,
    powerPreference: 'low-power',
    particleScale: 0.5,
    clouds: 8,
    ambientFps: 20,
  },
  medium: {
    dprCap: 1.5,
    antialias: true,
    powerPreference: 'default',
    particleScale: 1,
    clouds: 18,
    ambientFps: 30,
  },
  high: {
    dprCap: 2,
    antialias: true,
    powerPreference: 'default',
    particleScale: 1,
    clouds: 18,
    ambientFps: 60,
  },
};

export interface DeviceInfo {
  /** `matchMedia('(pointer: coarse)')`: màn hình cảm ứng (thường là điện thoại). */
  coarsePointer: boolean;
  cores: number | undefined;
  /** GB, chỉ Chrome có. */
  memoryGb: number | undefined;
}

export function detectDevice(): DeviceInfo {
  return {
    coarsePointer: typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches,
    cores: typeof navigator === 'undefined' ? undefined : navigator.hardwareConcurrency,
    memoryGb:
      typeof navigator === 'undefined' ? undefined : (navigator as { deviceMemory?: number }).deviceMemory,
  };
}

/** Cài đặt "tự động" chọn mức trung bình cho điện thoại hoặc máy yếu, còn lại mức cao. */
export function resolveTier(setting: Quality, device: DeviceInfo): QualityTier {
  if (setting === 'low') return 'low';
  if (setting === 'high') return 'high';
  const weak =
    device.coarsePointer ||
    (device.cores !== undefined && device.cores <= 4) ||
    (device.memoryGb !== undefined && device.memoryGb <= 4);
  return weak ? 'medium' : 'high';
}

const TARGET_MS = 1000 / 60;
const WINDOW_MS = 3000;
const RECOVER_MS = 10_000;
const STEP = 0.25;
/** Khung hình quá dài (tab ẩn, giật một lần) không tính. */
const MAX_SAMPLE_MS = 250;

/**
 * Tự giảm DPR khi máy không theo kịp và tăng lại khi đã mượt.
 * Chỉ đo khoảng cách giữa hai khung hình liền nhau mà khung trước có vẽ thật (đo được chi phí vẽ).
 */
export class AdaptiveDpr {
  private sum = 0;
  private count = 0;
  private windowStart = -1;
  private smoothSince = -1;

  private value: number;

  constructor(
    private cap: number,
    private readonly floor = 1,
  ) {
    this.cap = Math.max(floor, cap);
    this.value = this.cap;
  }

  get dpr(): number {
    return this.value;
  }

  setCap(cap: number): void {
    // Đổi mức đồ họa: bắt đầu lại từ mức trần mới.
    this.cap = Math.max(this.floor, cap);
    this.value = this.cap;
    this.reset();
  }

  private reset(): void {
    this.sum = 0;
    this.count = 0;
    this.windowStart = -1;
    this.smoothSince = -1;
  }

  /** Ghi một mẫu thời gian khung hình. Trả về DPR mới khi cần đổi, ngược lại null. */
  sample(time: number, deltaMs: number): number | null {
    if (deltaMs <= 0 || deltaMs > MAX_SAMPLE_MS) return null;
    if (this.windowStart < 0) this.windowStart = time;
    this.sum += deltaMs;
    this.count++;
    if (time - this.windowStart < WINDOW_MS) return null;

    const average = this.sum / this.count;
    this.sum = 0;
    this.count = 0;
    this.windowStart = time;

    if (average > TARGET_MS * 1.5) {
      this.smoothSince = -1;
      if (this.value > this.floor) {
        this.value = Math.max(this.floor, this.value - STEP);
        return this.value;
      }
      return null;
    }
    if (average <= TARGET_MS * 1.15) {
      if (this.smoothSince < 0) this.smoothSince = time - WINDOW_MS;
      if (time - this.smoothSince >= RECOVER_MS && this.value < this.cap) {
        this.value = Math.min(this.cap, this.value + STEP);
        this.smoothSince = time;
        return this.value;
      }
    } else {
      this.smoothSince = -1;
    }
    return null;
  }
}
