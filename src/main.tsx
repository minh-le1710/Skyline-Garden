import { effect } from '@preact/signals-core';
import { render } from 'preact';
import './styles.css';
import { Game } from './core/Game';
import { reduceMotion } from './core/motion';
import { LOCALES, SettingsStore, defaultSettings, type Locale } from './core/settings';
import { holdTabLock } from './core/tabLock';
import { installDebug, type DebugApi } from './debug';
import { getLocale, setLocale, t } from './i18n';
import type { ScreenInsets } from './input/CameraScroller';
import { InputController } from './input/InputController';
import { FrameScheduler } from './render/FrameScheduler';
import { AdaptiveDpr, TIERS, detectDevice, resolveTier } from './render/Quality';
import { SceneManager } from './render/SceneManager';
import { ScreenHost } from './render/ScreenHost';
import { GardenScreen } from './render/screens/GardenScreen';
import { App } from './ui/App';
import { connectFeedback } from './ui/feedback';
import { loginModalOpen } from './ui/modals';
import { loginClaimable } from './game';

function safeLocalStorage(): Storage | null {
  try {
    const storage = window.localStorage;
    storage.getItem('probe');
    return storage;
  } catch {
    return null;
  }
}

function boot(): void {
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const uiRoot = document.getElementById('ui')!;
  const params = new URLSearchParams(location.search);
  const storage = safeLocalStorage();

  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const settings = new SettingsStore(storage, defaultSettings(prefersReducedMotion));
  // `?lang=en` chỉ đổi ngôn ngữ cho phiên này (dùng khi test), không ghi vào cài đặt.
  const langParam = params.get('lang');
  const forcedLocale = LOCALES.includes(langParam as Locale) ? (langParam as Locale) : null;
  effect(() => {
    const s = settings.value.value;
    setLocale(forcedLocale ?? s.locale);
    document.title = t('app.title');
    reduceMotion.value = s.reduceMotion;
    document.documentElement.classList.toggle('reduce-motion', s.reduceMotion);
  });

  // Khử răng cưa và chế độ GPU chỉ đặt được lúc tạo renderer: đổi mức đồ họa có hiệu lực đủ ở lần tải sau.
  const device = detectDevice();
  const bootTier = TIERS[resolveTier(settings.value.value.quality, device)];
  const adaptive = new AdaptiveDpr(Math.min(window.devicePixelRatio || 1, bootTier.dprCap));
  let scene: SceneManager;
  try {
    scene = new SceneManager(canvas, {
      antialias: bootTier.antialias,
      powerPreference: bootTier.powerPreference,
      pixelRatio: adaptive.dpr,
    });
  } catch (err) {
    console.error(err);
    uiRoot.innerHTML = `<p class="loading">${t('app.webglError')}</p>`;
    return;
  }

  const game = new Game(storage, settings);
  const scheduler = new FrameScheduler();

  // Phần màn hình bị HUD và thanh công cụ che, để camera không giấu tầng mây dưới UI.
  const insets: ScreenInsets = { top: 0, bottom: 0 };
  const gardenScreen = new GardenScreen(scene, game, () => insets);
  const host = new ScreenHost(game, gardenScreen, {}, () => scheduler.invalidate());

  effect(() => {
    const tier = TIERS[resolveTier(settings.value.value.quality, device)];
    adaptive.setCap(Math.min(window.devicePixelRatio || 1, tier.dprCap));
    scene.setPixelRatio(adaptive.dpr);
    scheduler.ambientFps = tier.ambientFps;
    gardenScreen.garden.particleScale = tier.particleScale;
    gardenScreen.sky.setCloudCount(tier.clouds);
    scheduler.invalidate();
  });

  new InputController(
    canvas,
    game,
    () => host.active,
    () => scheduler.wake(),
  );
  connectFeedback(game, (floor, slot) => scene.project(gardenScreen.garden.slotWorldPosition(floor, slot)));

  // Vẽ lại khi state hay lựa chọn đổi; vẽ đủ tốc độ một lúc sau mỗi sự kiện game.
  effect(() => {
    void game.state.value;
    void game.ui.selected.value;
    void game.ui.tool.value;
    void getLocale();
    scheduler.invalidate();
  });
  effect(() => {
    scheduler.panelOpen = game.ui.panel.value !== null;
  });
  game.events.on(() => scheduler.wake());

  uiRoot.textContent = '';
  render(<App game={game} />, uiRoot);

  // Khi mở khay hạt giống hay thẻ chậu, vùng dưới cao lên và camera trượt nhẹ để tầng dưới không bị che.
  const measure = () => {
    insets.top = document.querySelector('.hud')?.getBoundingClientRect().bottom ?? 0;
    const bottom = document.querySelector('.bottom')?.getBoundingClientRect();
    insets.bottom = bottom ? window.innerHeight - bottom.top : 0;
    scheduler.wake();
  };
  measure();
  const observer = new ResizeObserver(measure);
  for (const el of document.querySelectorAll('.hud, .bottom')) observer.observe(el);
  window.addEventListener('resize', () => {
    measure();
    scheduler.invalidate();
  });

  let debug: DebugApi | null = null;
  if (params.has('debug')) {
    debug = installDebug(game, scene, gardenScreen.garden, gardenScreen.scroller, {
      frameStats: () => ({ rendered: scheduler.rendered, dpr: scene.pixelRatio }),
    });
  }
  const perf = params.has('debug') && params.has('perf') ? perfOverlay() : null;

  // Tab chạy bản cũ (save mới hơn) không bao giờ lưu nên không cần khóa, cũng không được giành khóa của tab đang chơi.
  if (game.blocked.value !== 'tooNew') {
    holdTabLock(
      () => game.block('otherTab'),
      () => game.lockAcquired(),
    );
  }
  game.start();
  // Quà đăng nhập tự mở một lần mỗi phiên. Ở chế độ debug (test) chỉ mở khi có `?modals`.
  if (loginClaimable(game.state.value, game.clock.now()) && (!params.has('debug') || params.has('modals'))) {
    loginModalOpen.value = true;
  }

  let last = performance.now();
  let renderedLast = false;
  const frame = (time: number) => {
    const deltaMs = time - last;
    const dt = Math.min(0.1, deltaMs / 1000);
    last = time;
    // Thời gian giữa hai khung liền nhau mà khung trước có vẽ: đo được máy có theo kịp không.
    if (renderedLast && settings.value.value.quality === 'auto') {
      const next = adaptive.sample(time, deltaMs);
      if (next !== null) scene.setPixelRatio(next);
    }
    const screen = host.visible;
    const animating = screen.update(dt, game.clock.now(), time / 1000);
    renderedLast = scheduler.shouldRender(time, animating, screen.busy);
    if (renderedLast) scene.render(screen.scene);
    perf?.(time, scene, scheduler);
    if (debug) debug.ready = true;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/** Lớp hiển thị FPS, số draw call và DPR (`?debug&perf`). */
function perfOverlay(): (time: number, scene: SceneManager, scheduler: FrameScheduler) => void {
  const el = document.createElement('div');
  el.className = 'perf-overlay';
  document.body.append(el);
  let windowStart = performance.now();
  let frames = 0;
  let renders = 0;
  return (time, scene, scheduler) => {
    frames++;
    if (time - windowStart < 1000) return;
    const seconds = (time - windowStart) / 1000;
    const { calls, triangles } = scene.renderer.info.render;
    el.textContent =
      `rAF ${Math.round(frames / seconds)} · vẽ ${Math.round((scheduler.rendered - renders) / seconds)} fps\n` +
      `${calls} calls · ${(triangles / 1000).toFixed(1)}k tris · DPR ${scene.pixelRatio}`;
    frames = 0;
    renders = scheduler.rendered;
    windowStart = time;
  };
}
boot();
