import { checkInvariants } from './invariants';
import { migrate } from './migrations';
import { SAVE_VERSION } from './state';
import type { GameState } from './types';

export const SAVE_KEY = 'skyline-garden/save';
/** Bản sao save cũ, ghi trước khi nâng cấp, nhập save, đồng bộ đè lên… */
export const BACKUP_KEY = 'skyline-garden/save.backup';
/** Save không đọc được, giữ lại để người chơi (hoặc dev) cứu dữ liệu. */
export const CORRUPT_KEY = 'skyline-garden/save.corrupt';

/** Kho key-value tối giản (localStorage trên trình duyệt, Map trong test, bảng SQLite trên server). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type LoadResult =
  | { status: 'none' }
  | { status: 'ok'; state: GameState; migratedFrom: number | null }
  | { status: 'corrupt'; raw: string; reason: string }
  /** Save của bản game mới hơn (vd. tab cũ còn mở sau khi cập nhật): không được ghi đè. */
  | { status: 'tooNew'; raw: string; version: number };

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function readSave(json: string | null): LoadResult {
  if (json === null || json === '') return { status: 'none' };
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { status: 'corrupt', raw: json, reason: 'JSON hỏng' };
  }
  if (!isRecord(raw) || !Number.isInteger(raw.version)) {
    return { status: 'corrupt', raw: json, reason: 'thiếu version' };
  }
  const version = raw.version as number;
  if (version > SAVE_VERSION) return { status: 'tooNew', raw: json, version };
  const data = migrate(raw, version, SAVE_VERSION);
  if (!data) return { status: 'corrupt', raw: json, reason: `không nâng cấp được từ v${version}` };
  const problems = shapeProblems(data);
  if (problems) return { status: 'corrupt', raw: json, reason: problems };
  return {
    status: 'ok',
    state: data as unknown as GameState,
    migratedFrom: version < SAVE_VERSION ? version : null,
  };
}

/** Đọc save; null nếu không có hoặc không dùng được. */
export function deserialize(json: string): GameState | null {
  const result = readSave(json);
  return result.status === 'ok' ? result.state : null;
}

export function loadGame(storage: KeyValueStore): GameState | null {
  const result = readSave(storage.getItem(SAVE_KEY));
  return result.status === 'ok' ? result.state : null;
}

export function saveGame(storage: KeyValueStore, state: GameState): void {
  storage.setItem(SAVE_KEY, serialize(state));
}

/** Kiểm tra cấu trúc và bất biến, để save hỏng hoặc bị sửa tay không làm sập game. */
function shapeProblems(d: Record<string, unknown>): string | null {
  const required = ['floors', 'orders', 'seeds', 'crops', 'potStock'];
  for (const key of required) if (!(key in d)) return `thiếu trường ${key}`;
  if (!Array.isArray(d.floors) || !d.floors.every((f) => isRecord(f) && Array.isArray(f.slots))) {
    return 'floors không hợp lệ';
  }
  if (!Array.isArray(d.orders) || ![d.seeds, d.crops, d.potStock].every(isRecord)) return 'kho không hợp lệ';
  try {
    const broken = checkInvariants(d as unknown as GameState);
    return broken.length ? broken.slice(0, 3).join('; ') : null;
  } catch (err) {
    return `lỗi khi kiểm tra: ${String(err)}`;
  }
}
