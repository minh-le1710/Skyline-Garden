import { MAX_FLOORS, SLOTS_PER_FLOOR } from './config/garden';
import { SAVE_VERSION } from './state';
import type { GameState } from './types';

export const SAVE_KEY = 'skyline-garden/save';

/** Kho key-value tối giản (localStorage trên trình duyệt, Map trong test, file trên server). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Migration theo version: MIGRATIONS[n] nâng save từ version n lên n + 1.
 * Khi đổi cấu trúc GameState thì tăng SAVE_VERSION và thêm một hàm ở đây.
 */
const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {};

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

export function deserialize(json: string): GameState | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isRecord(raw) || typeof raw.version !== 'number') return null;
  let data = raw;
  for (let v = raw.version; v < SAVE_VERSION; v++) {
    const migrate = MIGRATIONS[v];
    if (!migrate) return null;
    data = { ...migrate(data), version: v + 1 };
  }
  if (data.version !== SAVE_VERSION || !looksValid(data)) return null;
  return data as unknown as GameState;
}

export function loadGame(storage: KeyValueStore): GameState | null {
  const json = storage.getItem(SAVE_KEY);
  return json ? deserialize(json) : null;
}

export function saveGame(storage: KeyValueStore, state: GameState): void {
  storage.setItem(SAVE_KEY, serialize(state));
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Kiểm tra cấu trúc cơ bản để save hỏng không làm sập game. */
function looksValid(d: Record<string, unknown>): boolean {
  if (![d.gold, d.ruby, d.xp, d.level, d.storageCapacity, d.rngSeed, d.lastSeenAt].every(isNum)) return false;
  if (!Array.isArray(d.floors) || d.floors.length < 1 || d.floors.length > MAX_FLOORS) return false;
  const floorsOk = d.floors.every(
    (f) => isRecord(f) && Array.isArray(f.slots) && f.slots.length === SLOTS_PER_FLOOR,
  );
  return floorsOk && Array.isArray(d.orders) && [d.seeds, d.crops, d.potStock].every(isRecord);
}
