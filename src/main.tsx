import { render } from 'preact';
import './styles.css';
import { Game } from './core/Game';
import { installDebug, type DebugApi } from './debug';
import { t } from './i18n';
import { CameraScroller, type ScreenInsets } from './input/CameraScroller';
import { InputController } from './input/InputController';
import { Picker } from './input/Picker';
import { GardenView } from './render/GardenView';
import { floorY } from './render/layout';
import { SceneManager } from './render/SceneManager';
import { SkyBackground } from './render/SkyBackground';
import { Tweens } from './render/tween';
import { App } from './ui/App';
import { connectFeedback } from './ui/feedback';

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
  document.title = t('app.title');

  let scene: SceneManager;
  try {
    scene = new SceneManager(canvas);
  } catch (err) {
    console.error(err);
    uiRoot.innerHTML = `<p class="loading">${t('app.webglError')}</p>`;
    return;
  }

  const game = new Game(safeLocalStorage());
  const tweens = new Tweens();
  const sky = new SkyBackground(scene.scene);
  const garden = new GardenView(scene.scene, game, tweens);

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
  if (new URLSearchParams(location.search).has('debug')) debug = installDebug(game, scene, garden, scroller);

  game.start();

  let last = performance.now();
  const frame = (time: number) => {
    const dt = Math.min(0.1, (time - last) / 1000);
    last = time;
    garden.update(dt, game.clock.now(), time / 1000);
    scroller.update(dt);
    sky.update(dt, scene.focusY);
    tweens.update(dt);
    scene.render();
    if (debug) debug.ready = true;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

boot();
