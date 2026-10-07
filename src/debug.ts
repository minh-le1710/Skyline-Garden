import type { Game } from './core/Game';
import {
  SHOP_POTS,
  newPotInstance,
  orderSlotsForLevel,
  parseCommand,
  xpForLevel,
  type ActionResult,
  type Counts,
  type GameState,
  type ItemId,
  type PestId,
  type PlantId,
  type PotId,
} from './game';
import type { CameraScroller } from './input/CameraScroller';
import type { GardenView } from './render/GardenView';
import { floorY } from './render/layout';
import type { SceneManager } from './render/SceneManager';

/** Mục tiêu trên màn hình 3D mà test cần chạm vào. Thêm loại mới khi có tính năng mới. */
export type ScreenTarget = { kind: 'slot'; floor: number; slot: number };

export interface DebugApi {
  ready: boolean;
  game: Game;
  state(): GameState;
  /** Chạy một lệnh như người chơi (JSON, được kiểm tra bằng parseCommand). */
  dispatch(cmd: unknown): ActionResult | { ok: false; error: 'BAD_COMMAND' };
  /** Tua nhanh thời gian game. */
  skip(seconds: number): void;
  addGold(n: number): void;
  addRuby(n: number): void;
  setLevel(level: number): void;
  /** Gắn một con sâu xuất hiện ngay trên cây ở ô (floor, slot). */
  spawnPest(floor: number, slot: number, id?: PestId): void;
  /** Tặng đồ trực tiếp (chỉ để dựng tình huống test). `pots` tạo chậu cửa hàng theo loại. */
  grant(items: { seeds?: Counts<PlantId>; items?: Counts<ItemId>; pots?: Counts<PotId> }): void;
  reset(): void;
  screenPos(target: ScreenTarget): { x: number; y: number };
  /** @deprecated dùng screenPos({ kind: 'slot', … }) */
  slotScreenPosition(floor: number, slot: number): { x: number; y: number };
  scrollToFloor(floor: number): void;
  renderInfo(): { calls: number; triangles: number };
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
  game.debugChecks = true;
  const patch = (fn: (s: GameState) => void) => {
    const next = structuredClone(game.state.value);
    fn(next);
    game.state.value = next;
    game.save();
  };
  const merge = <K extends string>(target: Counts<K>, add: Counts<K> = {}) => {
    for (const [k, v] of Object.entries(add) as [K, number][]) target[k] = (target[k] ?? 0) + v;
  };
  const screenPos = (target: ScreenTarget): { x: number; y: number } => {
    switch (target.kind) {
      case 'slot':
        return scene.project(garden.slotWorldPosition(target.floor, target.slot));
    }
  };
  const api: DebugApi = {
    ready: false,
    game,
    state: () => game.state.value,
    dispatch(raw) {
      const cmd = parseCommand(raw);
      return cmd ? game.exec(cmd) : { ok: false, error: 'BAD_COMMAND' };
    },
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
        while (s.orders.length < orderSlotsForLevel(level)) s.orders.push({ order: null, readyAt: 0 });
      }),
    grant: (items) =>
      patch((s) => {
        merge(s.seeds, items.seeds);
        merge(s.items, items.items);
        for (const [potId, n] of Object.entries(items.pots ?? {}) as [PotId, number][]) {
          const def = SHOP_POTS[potId];
          for (let i = 0; i < n; i++) {
            s.potBag.push(
              newPotInstance(s, potId, def?.rarity ?? 'common', { ...(def?.stats ?? {}) }, 'reward'),
            );
          }
        }
      }),
    spawnPest: (floor, slot, id = 'caterpillar') =>
      patch((s) => {
        const content = s.floors[floor]?.slots[slot];
        if (content?.kind !== 'pot' || !content.plant) throw new Error('Ô này không có cây');
        const now = game.clock.now();
        content.plant.pest = { id, at: now, leaveAt: now + 30 * 60_000 };
        // Sâu chỉ hiện khi tới trước lúc cây chín.
        content.plant.growMs = Math.max(content.plant.growMs, now - content.plant.plantedAt + 60_000);
      }),
    reset: () => game.reset(),
    screenPos,
    slotScreenPosition: (floor, slot) => screenPos({ kind: 'slot', floor, slot }),
    scrollToFloor: (floor) => scroller.scrollTo(floorY(floor)),
    renderInfo: () => {
      const { calls, triangles } = scene.renderer.info.render;
      return { calls, triangles };
    },
  };
  window.__skyline = api;
  console.info('[Skyline Garden] Debug: window.__skyline');
  return api;
}
