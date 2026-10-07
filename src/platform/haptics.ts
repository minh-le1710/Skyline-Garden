// Rung phản hồi khi trồng/thu hoạch. Web dùng navigator.vibrate; bản native gắn hàm riêng qua setNativeHaptics.

export type HapticKind = 'light' | 'medium';

const VIBRATE_MS: Record<HapticKind, number> = { light: 8, medium: 20 };

/**
 * HOOK CHO BẢN NATIVE (M5, Capacitor): khi chạy trong app, gọi
 * `setNativeHaptics((kind) => Haptics.impact({ style: kind === 'light' ? ImpactStyle.Light : ImpactStyle.Medium }))`
 * với `@capacitor/haptics`. Chưa thêm phụ thuộc Capacitor ở bước này.
 */
let nativeHaptic: ((kind: HapticKind) => void) | null = null;

export function setNativeHaptics(fn: ((kind: HapticKind) => void) | null): void {
  nativeHaptic = fn;
}

/** Thiết bị có rung được không (ẩn tùy chọn rung trong cài đặt nếu không). */
export function hasHaptics(): boolean {
  return (
    nativeHaptic !== null || (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function')
  );
}

export function haptic(kind: HapticKind): void {
  if (nativeHaptic) {
    nativeHaptic(kind);
    return;
  }
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  // Chrome chặn (và cảnh báo) vibrate trước lần chạm đầu tiên.
  // Safari cũ không có userActivation.
  const activation = navigator.userActivation as UserActivation | undefined;
  if (activation && !activation.hasBeenActive) return;
  try {
    navigator.vibrate(VIBRATE_MS[kind]);
  } catch {
    // bỏ qua
  }
}
