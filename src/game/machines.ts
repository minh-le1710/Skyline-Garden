import { speedUpCost } from './config/garden';
import { GOODS, GOOD_LIST } from './config/goods';
import {
  MACHINES,
  MACHINE_LEVELS,
  MACHINE_MAX_LEVEL,
  MACHINE_UPGRADES,
  machineUpgradeGold,
} from './config/machines';
import { commit, fail } from './commit';
import { isGoodId, isInt, isMachineId } from './ids';
import { addXp } from './progression';
import { addCount, getSlot, hasItems, removeItems, storageUsed } from './state';
import type {
  ActionResult,
  BarnItemId,
  Counts,
  GameEvent,
  GameState,
  GoodId,
  Machine,
  MachineId,
  RecipeId,
} from './types';

// ---------- Công thức ----------

export interface RecipeDef {
  id: RecipeId;
  machine: MachineId;
  unlockLevel: number;
  inputs: Counts<BarnItemId>;
  gold: number;
  minutes: number;
}

export function recipeDef(recipe: RecipeId): RecipeDef | null {
  if (isGoodId(recipe)) {
    const g = GOODS[recipe];
    return {
      id: recipe,
      machine: g.machine,
      unlockLevel: g.unlockLevel,
      inputs: g.inputs,
      gold: 0,
      minutes: g.minutes,
    };
  }
  return null;
}

/** Các công thức của một loại máy, theo thứ tự mở khóa. */
export const recipesFor = (machineId: MachineId): RecipeId[] =>
  GOOD_LIST.filter((g) => g.machine === machineId).map((g) => g.id);

// ---------- Trạng thái máy ----------

export const queueCapacity = (m: Machine): number => MACHINE_LEVELS[m.level - 1]?.queue ?? 2;
export const machineSpeedPct = (m: Machine): number => MACHINE_LEVELS[m.level - 1]?.speedPct ?? 0;

/** Thời gian một mẻ trên máy này (đã tính tốc độ theo cấp máy). */
export const jobDurationMs = (recipe: RecipeDef, m: Machine): number =>
  Math.round(recipe.minutes * 60_000 * (1 - machineSpeedPct(m) / 100));

export interface MachineStatus {
  /** Mẻ đang chạy (nếu có). */
  running: { index: number; startAt: number; doneAt: number } | null;
  /** Số mẻ đã xong, đang chờ lấy. */
  readyCount: number;
  /** Số mẻ chưa bắt đầu. */
  pendingCount: number;
}

export function machineStatus(m: Machine, now: number): MachineStatus {
  let running: MachineStatus['running'] = null;
  let readyCount = 0;
  let pendingCount = 0;
  m.queue.forEach((job, index) => {
    if (job.doneAt <= now) readyCount++;
    else if (job.startAt <= now) running = { index, startAt: job.startAt, doneAt: job.doneAt };
    else pendingCount++;
  });
  return { running, readyCount, pendingCount };
}

export interface MachineRef {
  floor: number;
  slot: number;
  machine: Machine;
}

export function* allMachines(state: GameState): Generator<MachineRef> {
  for (let floor = 0; floor < state.floors.length; floor++) {
    const slots = state.floors[floor]!.slots;
    for (let slot = 0; slot < slots.length; slot++) {
      const c = slots[slot];
      if (c?.kind === 'machine') yield { floor, slot, machine: c };
    }
  }
}

export const ownsMachine = (state: GameState, id: MachineId): boolean =>
  [...allMachines(state)].some((r) => r.machine.machineId === id);

/** Hàng chế biến đang làm được (có máy và đã mở công thức): dùng cho đơn hàng, khinh khí cầu, nhiệm vụ. */
export function producibleGoods(state: GameState): GoodId[] {
  const owned = new Set([...allMachines(state)].map((r) => r.machine.machineId));
  return GOOD_LIST.filter((g) => owned.has(g.machine) && g.unlockLevel <= state.level).map((g) => g.id);
}

// ---------- Action ----------

function machineAt(state: GameState, floor: number, slot: number): Machine | ActionResult {
  const content = getSlot(state, floor, slot);
  if (content === undefined) return fail('INVALID');
  if (content?.kind !== 'machine') return fail('NOT_A_MACHINE');
  return content;
}
const isMachine = (x: Machine | ActionResult): x is Machine => 'kind' in x;
const draftMachine = (s: GameState, floor: number, slot: number): Machine =>
  s.floors[floor]!.slots[slot] as Machine;

export function buildMachine(
  state: GameState,
  machineId: MachineId,
  floor: number,
  slot: number,
  now: number,
): ActionResult {
  if (!isMachineId(machineId)) return fail('INVALID');
  const content = getSlot(state, floor, slot);
  if (content === undefined) return fail('INVALID');
  const def = MACHINES[machineId];
  if (state.level < def.unlockLevel) return fail('LEVEL_TOO_LOW');
  if (ownsMachine(state, machineId)) return fail('MACHINE_OWNED');
  if (content !== null) return fail('SLOT_OCCUPIED');
  if (state.gold < def.price) return fail('NOT_ENOUGH_GOLD');
  return commit(state, now, (s, events) => {
    s.gold -= def.price;
    s.floors[floor]!.slots[slot] = { kind: 'machine', machineId, level: 1, queue: [] };
    events.push({ type: 'machineBuilt', floor, slot, machineId, gold: def.price });
  });
}

export function startJob(
  state: GameState,
  floor: number,
  slot: number,
  recipe: RecipeId,
  now: number,
): ActionResult {
  const m = machineAt(state, floor, slot);
  if (!isMachine(m)) return m;
  const def = typeof recipe === 'string' ? recipeDef(recipe) : null;
  if (!def || def.machine !== m.machineId) return fail('INVALID');
  if (state.level < def.unlockLevel) return fail('LEVEL_TOO_LOW');
  if (m.queue.length >= queueCapacity(m)) return fail('QUEUE_FULL');
  if (!hasItems(state, def.inputs)) return fail('NOT_ENOUGH_ITEMS');
  if (state.gold < def.gold) return fail('NOT_ENOUGH_GOLD');
  return commit(state, now, (s, events) => {
    const target = draftMachine(s, floor, slot);
    removeItems(s, def.inputs);
    s.gold -= def.gold;
    const startAt = Math.max(now, target.queue.at(-1)?.doneAt ?? now);
    target.queue.push({ recipe: def.id, startAt, doneAt: startAt + jobDurationMs(def, target) });
    events.push({ type: 'jobStarted', floor, slot, recipe: def.id });
  });
}

/** Số mẻ đầu hàng đợi đã xong và còn chỗ trong kho để lấy. */
function collectableCount(state: GameState, m: Machine, now: number): { count: number; blocked: boolean } {
  let free = state.storageCapacity - storageUsed(state);
  let count = 0;
  for (const job of m.queue) {
    if (job.doneAt > now) break;
    if (free < 1) return { count, blocked: true };
    free--;
    count++;
  }
  return { count, blocked: false };
}

/** Lấy hàng trong bản nháp (đã kiểm tra có ít nhất một mẻ lấy được). */
export function collectInDraft(
  s: GameState,
  floor: number,
  slot: number,
  now: number,
  events: GameEvent[],
): void {
  const target = draftMachine(s, floor, slot);
  const { count } = collectableCount(s, target, now);
  const items: Counts<GoodId> = {};
  let xp = 0;
  for (const job of target.queue.splice(0, count)) {
    const good = job.recipe as GoodId;
    items[good] = (items[good] ?? 0) + 1;
    addCount(s.items, good, 1);
    xp += GOODS[good].xp;
  }
  events.push({ type: 'goodsCollected', floor, slot, items, xp });
  addXp(s, xp, now, events);
}

/** Có lấy được hàng ở máy này lúc `now` không (và lý do nếu không). */
export function canCollect(
  state: GameState,
  m: Machine,
  now: number,
): 'ok' | 'NOTHING_TO_COLLECT' | 'STORAGE_FULL' {
  const { count, blocked } = collectableCount(state, m, now);
  if (count > 0) return 'ok';
  return blocked ? 'STORAGE_FULL' : 'NOTHING_TO_COLLECT';
}

export function collectMachine(state: GameState, floor: number, slot: number, now: number): ActionResult {
  const m = machineAt(state, floor, slot);
  if (!isMachine(m)) return m;
  const can = canCollect(state, m, now);
  if (can !== 'ok') return fail(can);
  return commit(state, now, (s, events) => collectInDraft(s, floor, slot, now, events));
}

/** Dùng ruby để mẻ đang chạy xong ngay; các mẻ sau được kéo lên sớm tương ứng. */
export function speedUpMachine(state: GameState, floor: number, slot: number, now: number): ActionResult {
  const m = machineAt(state, floor, slot);
  if (!isMachine(m)) return m;
  const { running } = machineStatus(m, now);
  if (!running) return fail('NO_JOB');
  const cost = speedUpCost(running.doneAt - now);
  if (state.ruby < cost) return fail('NOT_ENOUGH_RUBY');
  return commit(state, now, (s, events) => {
    const target = draftMachine(s, floor, slot);
    const delta = running.doneAt - now;
    target.queue.forEach((job, i) => {
      if (i === running.index) job.doneAt = now;
      else if (i > running.index) {
        job.startAt -= delta;
        job.doneAt -= delta;
      }
    });
    s.ruby -= cost;
    events.push({ type: 'machineSpeedUp', floor, slot, ruby: cost });
  });
}

/** Hủy một mẻ chưa bắt đầu, hoàn lại nguyên liệu; các mẻ sau được kéo lên sớm. */
export function cancelJob(
  state: GameState,
  floor: number,
  slot: number,
  index: number,
  now: number,
): ActionResult {
  const m = machineAt(state, floor, slot);
  if (!isMachine(m)) return m;
  const job = isInt(index) ? m.queue[index] : undefined;
  if (!job) return fail('INVALID');
  if (job.startAt <= now) return fail('JOB_STARTED');
  const def = recipeDef(job.recipe)!;
  const refund = Object.values(def.inputs).reduce<number>((a, b) => a + (b ?? 0), 0);
  if (storageUsed(state) + refund > state.storageCapacity) return fail('STORAGE_FULL');
  return commit(state, now, (s, events) => {
    const target = draftMachine(s, floor, slot);
    const [removed] = target.queue.splice(index, 1);
    const duration = removed!.doneAt - removed!.startAt;
    for (let i = index; i < target.queue.length; i++) {
      target.queue[i]!.startAt -= duration;
      target.queue[i]!.doneAt -= duration;
    }
    for (const [id, qty] of Object.entries(def.inputs)) addCount(s.items, id as BarnItemId, qty ?? 0);
    s.gold += def.gold;
    events.push({ type: 'jobCanceled', floor, slot, recipe: removed!.recipe });
  });
}

export function upgradeMachine(state: GameState, floor: number, slot: number, now: number): ActionResult {
  const m = machineAt(state, floor, slot);
  if (!isMachine(m)) return m;
  if (m.level >= MACHINE_MAX_LEVEL) return fail('MAX_LEVEL');
  const up = MACHINE_UPGRADES[m.level - 1]!;
  const gold = machineUpgradeGold(m.machineId, m.level + 1);
  if (state.level < up.playerLevel) return fail('LEVEL_TOO_LOW');
  if (state.gold < gold) return fail('NOT_ENOUGH_GOLD');
  if (!hasItems(state, up.materials)) return fail('NOT_ENOUGH_ITEMS');
  return commit(state, now, (s, events) => {
    const target = draftMachine(s, floor, slot);
    s.gold -= gold;
    removeItems(s, up.materials);
    target.level++;
    events.push({ type: 'machineUpgraded', floor, slot, machineId: target.machineId, level: target.level });
  });
}

/** Đổi chỗ hai ô (chậu, máy hoặc ô trống); cây đang lớn và hàng đợi giữ nguyên thời gian. */
export function swapSlots(
  state: GameState,
  floor: number,
  slot: number,
  toFloor: number,
  toSlot: number,
  now: number,
): ActionResult {
  const a = getSlot(state, floor, slot);
  const b = getSlot(state, toFloor, toSlot);
  if (a === undefined || b === undefined || (floor === toFloor && slot === toSlot)) return fail('INVALID');
  if (a === null && b === null) return fail('NOTHING_TO_DO');
  return commit(state, now, (s, events) => {
    const from = s.floors[floor]!.slots;
    const to = s.floors[toFloor]!.slots;
    const tmp = from[slot] ?? null;
    from[slot] = to[toSlot] ?? null;
    to[toSlot] = tmp;
    events.push({ type: 'slotsSwapped', from: { floor, slot }, to: { floor: toFloor, slot: toSlot } });
  });
}
