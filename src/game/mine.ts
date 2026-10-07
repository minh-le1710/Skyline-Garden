import { dayIndex } from './calendar';
import {
  CHEST,
  ENERGY_CAP,
  ENERGY_MAX,
  ENERGY_REGEN_MS,
  KIND_WEIGHTS,
  LOOT_WEIGHTS,
  MINE_COLS,
  MINE_ROWS,
  MINE_SNACKS,
  MINE_UNLOCK_LEVEL,
  PICKAXES,
  REFILL_ENERGY,
  REFILL_RUBY,
  TILE_HP,
  bandOf,
  tileXp,
} from './config/mine';
import { commit, fail } from './commit';
import { isGoodId } from './ids';
import { grantReward } from './rewards';
import { type Rng, withRng } from './rng';
import { count, hasItems, removeItems } from './state';
import type { ActionResult, GameEvent, GameState, GoodId, MineState, MineTile, Reward } from './types';

// ---------- Lưới ----------

export const tileIndex = (x: number, y: number): number => y * MINE_COLS + x;
export const inBounds = (x: number, y: number): boolean =>
  Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < MINE_COLS && y >= 0 && y < MINE_ROWS;

/** Chọn theo trọng số nguyên bằng một số ngẫu nhiên đã rút. */
function weighted<T>(table: readonly (readonly [T, number])[], roll: number): T {
  const total = table.reduce((sum, [, w]) => sum + w, 0);
  let r = Math.floor(roll * total);
  for (const [value, w] of table) {
    if (r < w) return value;
    r -= w;
  }
  return table[table.length - 1]![0];
}

const between = (min: number, max: number, roll: number): number => min + Math.floor(roll * (max - min + 1));

/**
 * Sinh lưới mỏ của một ngày. Mỗi ô luôn rút đúng 3 số (loại, đồ rơi, số lượng) và rương rút 4 số,
 * nên số lần dùng RNG không phụ thuộc kết quả.
 */
export function generateMine(rng: Rng): MineTile[] {
  const chestColumn = rng.int(0, MINE_COLS - 1);
  const tiles: MineTile[] = [];
  for (let y = 0; y < MINE_ROWS; y++) {
    const band = bandOf(y);
    for (let x = 0; x < MINE_COLS; x++) {
      const kindRoll = rng.next();
      const lootRoll = rng.next();
      const amountRoll = rng.next();
      if (y === MINE_ROWS - 1 && x === chestColumn) {
        tiles.push({ kind: 'chest', hp: TILE_HP.chest, loot: null });
        continue;
      }
      const kind = weighted(KIND_WEIGHTS[band]!, kindRoll);
      const roll = weighted(LOOT_WEIGHTS[band]!, lootRoll);
      let loot: Reward | null = null;
      if (roll.kind === 'gold') loot = { gold: between(roll.min, roll.max, amountRoll) };
      else if (roll.kind === 'item') loot = { items: { [roll.id]: between(roll.min, roll.max, amountRoll) } };
      else if (roll.kind === 'ruby') loot = { ruby: 1 };
      tiles.push({ kind, hp: TILE_HP[kind], loot });
    }
  }
  const chest = tiles[tileIndex(chestColumn, MINE_ROWS - 1)]!;
  const gold = between(CHEST.gold[0], CHEST.gold[1], rng.next());
  const ruby = between(CHEST.ruby[0], CHEST.ruby[1], rng.next());
  const stardust = rng.next() * 100 < CHEST.stardustChancePct ? 1 : 0;
  rng.next(); // dự phòng cho món thưởng rương sau này, giữ đủ 4 lần rút
  chest.loot = {
    gold,
    ruby,
    items: { sunstone: CHEST.sunstone, cloudBomb: CHEST.cloudBomb, ...(stardust ? { stardust } : {}) },
  };
  return tiles;
}

/** Đào được ô (x, y) khi ở hàng mặt đất hoặc có một ô kề cạnh đã vỡ. */
export function isReachable(tiles: readonly MineTile[], x: number, y: number): boolean {
  if (y === 0) return true;
  const broken = (nx: number, ny: number) => inBounds(nx, ny) && tiles[tileIndex(nx, ny)]!.hp === 0;
  return broken(x - 1, y) || broken(x + 1, y) || broken(x, y - 1) || broken(x, y + 1);
}

// ---------- Năng lượng ----------

/** Năng lượng hiện tại và thời điểm hồi điểm kế tiếp (null khi đã đầy). */
export function mineEnergy(m: MineState, now: number): { energy: number; nextAt: number | null } {
  if (m.energy >= ENERGY_MAX) return { energy: m.energy, nextAt: null };
  const ticks = Math.floor(Math.max(0, now - m.energyAt) / ENERGY_REGEN_MS);
  const energy = Math.min(ENERGY_MAX, m.energy + ticks);
  return { energy, nextAt: energy >= ENERGY_MAX ? null : m.energyAt + (ticks + 1) * ENERGY_REGEN_MS };
}

/** Chốt năng lượng đã hồi vào state, giữ phần hồi dở cho điểm kế tiếp. */
function settleEnergy(m: MineState, now: number): void {
  if (m.energy >= ENERGY_MAX) {
    m.energyAt = now;
    return;
  }
  const ticks = Math.floor(Math.max(0, now - m.energyAt) / ENERGY_REGEN_MS);
  m.energy = Math.min(ENERGY_MAX, m.energy + ticks);
  m.energyAt = m.energy >= ENERGY_MAX || now < m.energyAt ? now : m.energyAt + ticks * ENERGY_REGEN_MS;
}

function addEnergy(m: MineState, now: number, delta: number, cap = Number.POSITIVE_INFINITY): void {
  settleEnergy(m, now);
  const wasFull = m.energy >= ENERGY_MAX;
  m.energy = Math.max(0, Math.min(cap, m.energy + delta));
  // Vừa tụt khỏi mức đầy: bắt đầu tính giờ hồi từ bây giờ.
  if (wasFull && m.energy < ENERGY_MAX) m.energyAt = now;
}

export const refillCost = (m: MineState): number =>
  REFILL_RUBY[Math.min(m.refillsToday, REFILL_RUBY.length - 1)]!;
export const mineFresh = (s: GameState, now: number): boolean =>
  s.mine !== null && s.mine.day === dayIndex(now);
export const pickaxeDamage = (m: MineState): number => PICKAXES[m.pickaxe]?.damage ?? 1;
export const mineUnlocked = (s: GameState): boolean => s.level >= MINE_UNLOCK_LEVEL;

// ---------- Hành động ----------

/** Vào mỏ: sang ngày mới (hoặc lần đầu) thì tạo lưới mới và nạp đầy năng lượng; còn lại không đổi gì. */
export function openMine(state: GameState, now: number): ActionResult {
  if (!mineUnlocked(state)) return fail('LEVEL_TOO_LOW');
  if (mineFresh(state, now)) return { ok: true, state, events: [] };
  return commit(state, now, (draft, events) => {
    const day = dayIndex(now);
    const tiles = withRng(draft, 'mine', (rng) => generateMine(rng));
    const prev = draft.mine;
    if (prev) {
      settleEnergy(prev, now);
      draft.mine = {
        ...prev,
        day,
        tiles,
        energy: Math.max(prev.energy, ENERGY_MAX),
        energyAt: now,
        refillsToday: 0,
      };
    } else {
      draft.mine = { day, tiles, energy: ENERGY_MAX, energyAt: now, refillsToday: 0, pickaxe: 0 };
    }
    events.push({ type: 'mineOpened', day, fresh: true });
  });
}

/** Phá vỡ một ô trong bản nháp: nhận đồ rơi + XP. */
function breakTile(draft: GameState, x: number, y: number, now: number, events: GameEvent[]): void {
  const tile = draft.mine!.tiles[tileIndex(x, y)]!;
  tile.hp = 0;
  const xp = tileXp(tile.kind);
  const loot = tile.loot;
  grantReward(draft, { ...(loot ?? {}), xp: (loot?.xp ?? 0) + xp }, now, events);
  events.push({ type: 'mineBroken', x, y, kind: tile.kind, loot, xp });
  if (tile.kind === 'chest' && loot) events.push({ type: 'mineChest', reward: loot });
}

/** Lỗi chung trước khi tác động vào một ô. */
function tileError(state: GameState, x: number, y: number, now: number): ActionResult | null {
  if (!mineFresh(state, now)) return fail('MINE_EXPIRED');
  if (!inBounds(x, y)) return fail('INVALID');
  return null;
}

/** Gõ cuốc vào một ô: tốn 1 năng lượng, trừ độ bền theo sức cuốc; vỡ thì nhận đồ. */
export function digTile(state: GameState, x: number, y: number, now: number): ActionResult {
  const err = tileError(state, x, y, now);
  if (err) return err;
  const m = state.mine!;
  const tile = m.tiles[tileIndex(x, y)]!;
  if (tile.hp === 0) return fail('TILE_BROKEN');
  if (!isReachable(m.tiles, x, y)) return fail('TILE_UNREACHABLE');
  if (mineEnergy(m, now).energy < 1) return fail('NO_ENERGY');
  return commit(state, now, (draft, events) => {
    const dm = draft.mine!;
    addEnergy(dm, now, -1);
    const t = dm.tiles[tileIndex(x, y)]!;
    t.hp = Math.max(0, t.hp - pickaxeDamage(dm));
    events.push({ type: 'mineHit', x, y, hp: t.hp, kind: t.kind });
    if (t.hp === 0) breakTile(draft, x, y, now, events);
  });
}

/** Bom mây: phá cả vùng 3×3 quanh một ô với tới được, không tốn năng lượng. */
export function useBomb(state: GameState, x: number, y: number, now: number): ActionResult {
  const err = tileError(state, x, y, now);
  if (err) return err;
  if (count(state.items, 'cloudBomb') < 1) return fail('NO_BOMB');
  const m = state.mine!;
  const center = m.tiles[tileIndex(x, y)]!;
  if (center.hp > 0 && !isReachable(m.tiles, x, y)) return fail('TILE_UNREACHABLE');
  const targets: [number, number][] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (inBounds(nx, ny) && m.tiles[tileIndex(nx, ny)]!.hp > 0) targets.push([nx, ny]);
    }
  if (!targets.length) return fail('NOTHING_TO_DO');
  return commit(state, now, (draft, events) => {
    removeItems(draft, { cloudBomb: 1 });
    events.push({ type: 'mineBomb', x, y, broken: targets.length });
    for (const [tx, ty] of targets) breakTile(draft, tx, ty, now, events);
  });
}

/** Mua thêm 30 năng lượng bằng ruby (giá tăng dần trong ngày). */
export function refillEnergy(state: GameState, now: number): ActionResult {
  if (!mineFresh(state, now)) return fail('MINE_EXPIRED');
  const ruby = refillCost(state.mine!);
  if (state.ruby < ruby) return fail('NOT_ENOUGH_RUBY');
  return commit(state, now, (draft, events) => {
    const m = draft.mine!;
    draft.ruby -= ruby;
    addEnergy(m, now, REFILL_ENERGY);
    m.refillsToday++;
    events.push({ type: 'energyRefilled', ruby, energy: m.energy });
  });
}

/** Ăn một món hàng chế biến để hồi năng lượng (không quá ENERGY_CAP). */
export function eatSnack(state: GameState, id: GoodId, now: number): ActionResult {
  if (!mineFresh(state, now)) return fail('MINE_EXPIRED');
  const value = isGoodId(id) ? MINE_SNACKS[id] : undefined;
  if (!value) return fail('NOT_A_SNACK');
  if (!hasItems(state, { [id]: 1 })) return fail('NOT_ENOUGH_ITEMS');
  if (mineEnergy(state.mine!, now).energy >= ENERGY_CAP) return fail('NOTHING_TO_DO');
  return commit(state, now, (draft, events) => {
    removeItems(draft, { [id]: 1 });
    addEnergy(draft.mine!, now, value, ENERGY_CAP);
    events.push({ type: 'snackEaten', id, energy: draft.mine!.energy });
  });
}

/** Lên bậc cuốc kế tiếp. */
export function upgradePickaxe(state: GameState, now: number): ActionResult {
  const m = state.mine;
  if (!m) return fail('FEATURE_LOCKED');
  const next = PICKAXES[m.pickaxe + 1];
  if (!next) return fail('MAX_TIER');
  if (state.level < next.level) return fail('LEVEL_TOO_LOW');
  if (state.gold < next.gold) return fail('NOT_ENOUGH_GOLD');
  if (!hasItems(state, next.items)) return fail('NOT_ENOUGH_ITEMS');
  return commit(state, now, (draft, events) => {
    draft.gold -= next.gold;
    removeItems(draft, next.items);
    draft.mine!.pickaxe++;
    events.push({ type: 'pickaxeUpgraded', tier: draft.mine!.pickaxe });
  });
}

/** Số ô còn lại chưa vỡ (để hiện tiến độ). */
export const tilesLeft = (m: MineState): number => m.tiles.filter((t) => t.hp > 0).length;
