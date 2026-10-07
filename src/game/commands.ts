import {
  buyPot,
  buySeed,
  catchPest,
  deliverOrder,
  discardOrder,
  harvest,
  placePot,
  plant,
  sellItem,
  speedUp,
  sweep,
  unlockFloor,
  upgradeStorage,
} from './actions';
import { isBarnItemId, isNonNegInt, isPlantId, isPositiveInt, isPotId } from './ids';
import { tick } from './tick';
import type { ActionResult, BarnItemId, GameState, PlantId, PotId } from './types';

/**
 * Mọi thay đổi GameState đều là một lệnh. Lệnh là JSON thuần nên ghi log, gửi lên server
 * và phát lại (replay) được; server chạy đúng `step` này để kiểm tra người chơi không gian lận.
 */
export type Command =
  | { type: 'tick' }
  | { type: 'buySeed'; plantId: PlantId; qty: number }
  | { type: 'buyPot'; potId: PotId; qty: number }
  | { type: 'placePot'; floor: number; slot: number; uid: number }
  | { type: 'plant'; floor: number; slot: number; plantId: PlantId }
  | { type: 'harvest'; floor: number; slot: number }
  | { type: 'catchPest'; floor: number; slot: number }
  | { type: 'sweep'; floor: number; slot: number }
  | { type: 'speedUp'; floor: number; slot: number }
  | { type: 'sellItem'; id: BarnItemId; qty: number }
  | { type: 'upgradeStorage' }
  | { type: 'unlockFloor' }
  | { type: 'deliverOrder'; index: number }
  | { type: 'discardOrder'; index: number };

export type CommandType = Command['type'];
type CommandOf<T extends CommandType> = Extract<Command, { type: T }>;

/** Một lệnh đã chạy thành công, kèm thời điểm (dùng cho log đồng bộ với server). */
export interface LogEntry {
  seq: number;
  t: number;
  cmd: Command;
}

export function applyCommand(s: GameState, c: Command, now: number): ActionResult {
  switch (c.type) {
    case 'tick':
      return tick(s, now);
    case 'buySeed':
      return buySeed(s, c.plantId, c.qty, now);
    case 'buyPot':
      return buyPot(s, c.potId, c.qty, now);
    case 'placePot':
      return placePot(s, c.floor, c.slot, c.uid, now);
    case 'plant':
      return plant(s, c.floor, c.slot, c.plantId, now);
    case 'harvest':
      return harvest(s, c.floor, c.slot, now);
    case 'catchPest':
      return catchPest(s, c.floor, c.slot, now);
    case 'sweep':
      return sweep(s, c.floor, c.slot, now);
    case 'speedUp':
      return speedUp(s, c.floor, c.slot, now);
    case 'sellItem':
      return sellItem(s, c.id, c.qty, now);
    case 'upgradeStorage':
      return upgradeStorage(s, now);
    case 'unlockFloor':
      return unlockFloor(s, now);
    case 'deliverOrder':
      return deliverOrder(s, c.index, now);
    case 'discardOrder':
      return discardOrder(s, c.index, now);
  }
}

/**
 * Chạy một lệnh: luôn cập nhật theo thời gian (tick) trước, rồi mới áp dụng lệnh, cùng một `now`.
 * Client và server đều đi qua đây nên kết quả giống hệt nhau.
 */
export function step(s: GameState, c: Command, now: number): ActionResult {
  const ticked = tick(s, now);
  if (!ticked.ok || c.type === 'tick') return ticked;
  const result = applyCommand(ticked.state, c, now);
  if (!result.ok) return result;
  return { ok: true, state: result.state, events: [...ticked.events, ...result.events] };
}

// ---------- Kiểm tra lệnh từ dữ liệu không tin cậy ----------

type FieldCheck = (value: unknown) => boolean;
const FIELD = {
  plantId: isPlantId,
  potId: isPotId,
  barnItem: isBarnItemId,
  index: isNonNegInt,
  uid: isPositiveInt,
  qty: isPositiveInt,
} satisfies Record<string, FieldCheck>;

const SPECS: { [T in CommandType]: Record<Exclude<keyof CommandOf<T>, 'type'>, FieldCheck> } = {
  tick: {},
  buySeed: { plantId: FIELD.plantId, qty: FIELD.qty },
  buyPot: { potId: FIELD.potId, qty: FIELD.qty },
  placePot: { floor: FIELD.index, slot: FIELD.index, uid: FIELD.uid },
  plant: { floor: FIELD.index, slot: FIELD.index, plantId: FIELD.plantId },
  harvest: { floor: FIELD.index, slot: FIELD.index },
  catchPest: { floor: FIELD.index, slot: FIELD.index },
  sweep: { floor: FIELD.index, slot: FIELD.index },
  speedUp: { floor: FIELD.index, slot: FIELD.index },
  sellItem: { id: FIELD.barnItem, qty: FIELD.qty },
  upgradeStorage: {},
  unlockFloor: {},
  deliverOrder: { index: FIELD.index },
  discardOrder: { index: FIELD.index },
};

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

/**
 * Đọc lệnh từ JSON không tin cậy (log gửi lên server, debug). Từ chối loại lệnh lạ,
 * thiếu hoặc thừa trường, id không hợp lệ. Trả về bản sao chỉ chứa các trường đã kiểm tra.
 */
export function parseCommand(raw: unknown): Command | null {
  if (!isPlainObject(raw) || typeof raw.type !== 'string' || !Object.hasOwn(SPECS, raw.type)) return null;
  const spec = SPECS[raw.type as CommandType] as Record<string, FieldCheck>;
  const keys = Object.keys(raw).filter((k) => k !== 'type');
  if (keys.length !== Object.keys(spec).length) return null;
  const out: Record<string, unknown> = { type: raw.type };
  for (const key of keys) {
    const check = Object.hasOwn(spec, key) ? spec[key] : undefined;
    if (!check || !check(raw[key])) return null;
    out[key] = raw[key];
  }
  return out as Command;
}

export const COMMAND_TYPES = Object.keys(SPECS) as CommandType[];
