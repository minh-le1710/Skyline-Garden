import { effect } from '@preact/signals-core';
import { render } from 'preact';
import './styles.css';
import { Game } from './core/Game';
import { reduceMotion } from './core/motion';
import { LOCALES, SettingsStore, defaultSettings, type Locale } from './core/settings';
import { holdTabLock } from './core/tabLock';
import { installDebug, type DebugApi } from './debug';
import { setLocale, t } from './i18n';
import { CameraScroller, type ScreenInsets } from './input/CameraScroller';
import { InputController } from './input/InputController';
import { Picker } from './input/Picker';
import { BalloonView } from './render/BalloonView';
import { GardenView } from './render/GardenView';
import { floorY } from './render/layout';
import { SceneManager } from './render/SceneManager';
import { SkyBackground } from './render/SkyBackground';
import { Tweens } from './render/tween';
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

  let scene: SceneManager;
  try {
    scene = new SceneManager(canvas);
  } catch (err) {
    console.error(err);
    uiRoot.innerHTML = `<p class="loading">${t('app.webglError')}</p>`;
    return;
  }

  effect(() => scene.setQuality(settings.value.value.quality));

  const game = new Game(storage, settings);
  const tweens = new Tweens();
  const sky = new SkyBackground(scene.scene);
  const garden = new GardenView(scene.scene, game, tweens);
  const balloon = new BalloonView(scene.scene, game, scene);

  // Phần màn hình bị HUD và thanh công cụ che, để camera không giấu tầng mây dưới UI.
  const insets: ScreenInsets = { top: 0, bottom: 0 };
  const scroller = new CameraScroller(
    scene,
    () => garden.bounds,
    () => insets,
  );
  new InputController(canvas, game, new Picker(scene), scroller);
  connectFeedback(game, (floor, slot) => scene.project(garden.slotWorldPosition(floor, slot)));
  game.events.on((event) => {
    if (event.type === 'floorUnlocked') scroller.scrollTo(floorY(event.floor));
  });

  uiRoot.textContent = '';
  render(<App game={game} />, uiRoot);

  // Khi mở khay hạt giống hay thẻ chậu, vùng dưới cao lên và camera trượt nhẹ để tầng dưới không bị che.
  const measure = () => {
    insets.top = document.querySelector('.hud')?.getBoundingClientRect().bottom ?? 0;
    const bottom = document.querySelector('.bottom')?.getBoundingClientRect();
    insets.bottom = bottom ? window.innerHeight - bottom.top : 0;
  };
  measure();
  const observer = new ResizeObserver(measure);
  for (const el of document.querySelectorAll('.hud, .bottom')) observer.observe(el);
  window.addEventListener('resize', measure);

  let debug: DebugApi | null = null;
  if (params.has('debug')) debug = installDebug(game, scene, garden, scroller);

  // Tab chạy bản cũ (save mới hơn) không bao giờ lưu nên không cần khóa, cũng không được giành khóa của tab đang chơi.
  if (game.blocked.value !== 'tooNew') holdTabLock(() => game.block('otherTab'));
  game.start();
  // Quà đăng nhập tự mở một lần mỗi phiên. Ở chế độ debug (test) chỉ mở khi có `?modals`.
  if (loginClaimable(game.state.value, game.clock.now()) && (!params.has('debug') || params.has('modals'))) {
    loginModalOpen.value = true;
  }

  let last = performance.now();
  const frame = (time: number) => {
    const dt = Math.min(0.1, (time - last) / 1000);
    last = time;
    garden.update(dt, game.clock.now(), time / 1000);
    scroller.update(dt);
    sky.update(dt, scene.focusY);
    balloon.update(dt, time / 1000);
    tweens.update(dt);
    scene.render();
    if (debug) debug.ready = true;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

boot();
