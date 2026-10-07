import { describe, expect, it } from 'vitest';
import {
  SAVE_KEY,
  deserialize,
  harvest,
  loadGame,
  offlineSummary,
  plant,
  saveGame,
  serialize,
} from '../src/game';
import { T0, newGame, ok } from './helpers';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  };
}

describe('lưu game', () => {
  it('lưu rồi tải lại giữ nguyên state', () => {
    const storage = memoryStorage();
    const s = ok(plant(newGame(), 0, 0, 'rose', T0));
    saveGame(storage, s);
    expect(storage.data.has(SAVE_KEY)).toBe(true);
    expect(loadGame(storage)).toEqual(s);
  });

  it('chưa có save thì trả về null', () => {
    expect(loadGame(memoryStorage())).toBeNull();
  });

  it('save hỏng hoặc version lạ thì bỏ qua', () => {
    expect(deserialize('{not json')).toBeNull();
    expect(deserialize('null')).toBeNull();
    expect(deserialize(JSON.stringify({ ...newGame(), version: 999 }))).toBeNull();
    expect(deserialize(JSON.stringify({ ...newGame(), version: 0 }))).toBeNull();
    expect(deserialize(JSON.stringify({ ...newGame(), floors: [] }))).toBeNull();
    expect(deserialize(JSON.stringify({ ...newGame(), gold: 'nhiều' }))).toBeNull();
    expect(deserialize(JSON.stringify({ ...newGame(), items: { rose: -1 } }))).toBeNull();
  });

  it('tính tiến độ khi đi vắng', () => {
    let s = ok(plant(newGame(), 0, 0, 'rose', T0));
    s = ok(plant(s, 0, 1, 'sunflower', T0));
    s.lastSeenAt = T0 + 1_000;
    const back = deserialize(serialize(s))!;
    expect(offlineSummary(back, T0 + 60_000)).toEqual({ awayMs: 59_000, readyWhileAway: 1, pestsWaiting: 0 });
    expect(harvest(back, 0, 0, T0 + 60_000).ok).toBe(true);
  });
});
