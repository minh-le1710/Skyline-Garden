import type { Game } from './core/Game';
import { xpForLevel, type Counts, type GameState, type PlantId, type PotId } from './game';
import type { CameraScroller } from './input/CameraScroller';
import type { GardenView } from './render/GardenView';
import { floorY } from './render/layout';
import type { SceneManager } from './render/SceneManager';

export interface DebugApi {
  ready: boolean;
  game: Game;
  state(): GameState;
  /** Tua nhanh thời gian game. */
  skip(seconds: number): void;
  addGold(n: number): void;
  addRuby(n: number): void;
  setLevel(level: number): void;
  grant(items: { seeds?: Counts<PlantId>; crops?: Counts<PlantId>; pots?: Counts<PotId> }): void;
  reset(): void;
  slotScreenPosition(floor: number, slot: number): { x: number; y: number };
  scrollToFloor(floor: number): void;
}

declare global {
  interface Window {
    __skyline?: DebugApi;
  }
}

/** Công cụ debug trong console, bật bằng `?debug` trên URL. Dùng cho cả test E2E. */
export function installDebug(
  game: Game,
  scene: SceneManager,
  garden: GardenView,
  scroller: CameraScroller,
): DebugApi {
  const patch = (fn: (s: GameState) => void) => {
    const next = structuredClone(game.state.value);
    fn(next);
    game.state.value = next;
    game.save();
  };
  const merge = <K extends string>(target: Counts<K>, add: Counts<K> = {}) => {
    for (const [k, v] of Object.entries(add) as [K, number][]) target[k] = (target[k] ?? 0) + v;
  };
  const api: DebugApi = {
    ready: false,
    game,
    state: () => game.state.value,
    skip(seconds) {
      game.clock.skip(seconds * 1000);
      game.update();
    },
    addGold: (n) => patch((s) => void (s.gold += n)),
    addRuby: (n) => patch((s) => void (s.ruby += n)),
    setLevel: (level) =>
      patch((s) => {
        s.level = level;
        s.xp = xpForLevel(level);
      }),
    grant: (items) =>
      patch((s) => {
        merge(s.seeds, items.seeds);
        merge(s.crops, items.crops);
        merge(s.potStock, items.pots);
      }),
    reset: () => game.reset(),
    slotScreenPosition: (floor, slot) => scene.project(garden.slotWorldPosition(floor, slot)),
    scrollToFloor: (floor) => scroller.scrollTo(floorY(floor)),
  };
  window.__skyline = api;
  console.info('[Skyline Garden] Debug: window.__skyline');
  return api;
}
