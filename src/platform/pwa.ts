import { effect, signal } from '@preact/signals';
import type { Game } from '../core/Game';
import { t } from '../i18n';
import { showToast } from '../ui/feedback';

// Ứng dụng web cài được (PWA): đăng ký service worker (build/pwa.ts sinh ra sw.js), báo bản cập nhật,
// nút cài ứng dụng và xin trình duyệt giữ dữ liệu lâu dài.

/** Sự kiện `beforeinstallprompt` (Chromium), chưa có trong lib.dom. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface Window {
    Capacitor?: { isNativePlatform?: () => boolean };
  }
}

export const pwa = {
  /** Đã tải xong bản mới, đang chờ người chơi bấm "Tải lại". */
  needRefresh: signal(false),
  /** Lần cài đầu đã lưu xong mọi file: chơi được khi không có mạng. */
  offlineReady: signal(false),
  /** Trình duyệt cho phép hiện hộp thoại cài ứng dụng. */
  canInstall: signal(false),
};

const UPDATE_CHECK_MS = 60 * 60 * 1000;

let registration: ServiceWorkerRegistration | null = null;
let installEvent: BeforeInstallPromptEvent | null = null;
/** Người chơi đã bấm "Tải lại": chỉ khi đó mới tải lại trang lúc service worker đổi. */
let updateRequested = false;
let reloading = false;

export function initPwa(game: Game): void {
  if (import.meta.env.DEV) return;
  if (window.Capacitor?.isNativePlatform?.()) return;
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('beforeinstallprompt', (e) => {
    // Giữ sự kiện lại để hiện hộp thoại cài khi người chơi bấm nút trong Cài đặt.
    e.preventDefault();
    installEvent = e as BeforeInstallPromptEvent;
    pwa.canInstall.value = true;
  });
  window.addEventListener('appinstalled', () => {
    installEvent = null;
    pwa.canInstall.value = false;
  });

  // Chưa có service worker nào điều khiển trang: đây là lần cài đầu, không phải bản cập nhật.
  const firstInstall = navigator.serviceWorker.controller === null;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Bản mới đã nhận quyền điều khiển. Chỉ tải lại một lần, và chỉ khi người chơi yêu cầu
    // (lần cài đầu hay tab khác cập nhật thì không tự tải lại).
    if (!updateRequested || reloading) return;
    reloading = true;
    location.reload();
  });
  void register(firstInstall);
  persistAfterLevel2(game);
}

async function register(firstInstall: boolean): Promise<void> {
  // Playwright chặn service worker bằng cách thay register() bằng hàm trả về undefined.
  let reg: ServiceWorkerRegistration | undefined;
  try {
    reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
  } catch (err) {
    console.warn('Không đăng ký được service worker', err);
    return;
  }
  if (!reg) return;
  registration = reg;

  const tracked = new WeakSet<ServiceWorker>();
  const track = (worker: ServiceWorker | null) => {
    if (!worker || tracked.has(worker)) return;
    tracked.add(worker);
    const onState = () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) pwa.needRefresh.value = true;
      if (worker.state === 'activated' && firstInstall && !pwa.offlineReady.value) {
        pwa.offlineReady.value = true;
        showToast(t('pwa.offlineReady'), 'success');
      }
    };
    worker.addEventListener('statechange', onState);
    onState();
  };

  // Bản mới đã tải xong từ lần trước nhưng chưa được kích hoạt.
  if (reg.waiting && navigator.serviceWorker.controller) pwa.needRefresh.value = true;
  track(reg.installing);
  reg.addEventListener('updatefound', () => track(reg.installing));

  const check = () => void reg.update().catch(() => {});
  setInterval(check, UPDATE_CHECK_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
}

/** Lưu game rồi cho bản mới thay bản cũ; trang tự tải lại khi bản mới nhận quyền điều khiển. */
export function applyUpdate(game: Game): void {
  game.save();
  const waiting = registration?.waiting;
  if (!waiting) {
    // Bản mới đã được kích hoạt (vd. từ tab khác): chỉ cần tải lại.
    reloading = true;
    location.reload();
    return;
  }
  updateRequested = true;
  waiting.postMessage({ type: 'SKIP_WAITING' });
}

/** Hiện hộp thoại cài ứng dụng của trình duyệt (chỉ dùng được một lần cho mỗi sự kiện). */
export async function promptInstall(): Promise<void> {
  const event = installEvent;
  if (!event) return;
  installEvent = null;
  pwa.canInstall.value = false;
  try {
    await event.prompt();
    await event.userChoice;
  } catch (err) {
    console.warn('Không mở được hộp thoại cài ứng dụng', err);
  }
}

/**
 * Người chơi đã lên cấp 2 (đã thật sự chơi): xin trình duyệt không tự xóa save khi thiếu dung lượng.
 * Chỉ xin một lần mỗi phiên.
 */
function persistAfterLevel2(game: Game): void {
  let asked = false;
  const stop = effect(() => {
    if (asked || game.state.value.level < 2) return;
    asked = true;
    queueMicrotask(() => stop());
    void (async () => {
      try {
        if (await navigator.storage?.persisted?.()) return;
        await navigator.storage?.persist?.();
      } catch {
        // Trình duyệt không hỗ trợ hoặc từ chối: save vẫn nằm trong localStorage như cũ.
      }
    })();
  });
}
