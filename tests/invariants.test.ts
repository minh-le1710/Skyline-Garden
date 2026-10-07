import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  COMMAND_TYPES,
  PLANT_IDS,
  orderSlotsForLevel,
  storageCapacityAfter,
  xpForLevel,
  checkInvariants,
  createNewGame,
  deserialize,
  parseCommand,
  serialize,
  step,
  tick,
  type Command,
  type GameState,
} from '../src/game';
import { NUM_RUNS, commandArb, scriptArb } from './arbitraries';
import { T0 } from './helpers';

/** Ván chơi "giàu": cấp cao, nhiều vàng và đồ, để kịch bản ngẫu nhiên chạm được máy, chậu, sâu… */
function richGame(seed: number): GameState {
  const s = createNewGame(T0, seed);
  s.level = 26;
  s.xp = xpForLevel(26);
  s.gold = 1_000_000;
  s.ruby = 500;
  s.storageUpgrades = 20;
  s.storageCapacity = storageCapacityAfter(20);
  s.items = {
    rose: 40,
    sunflower: 40,
    strawberry: 30,
    tea: 20,
    mint: 20,
    cloudclay: 50,
    dewglass: 30,
    sunstone: 10,
    stardust: 3,
  };
  for (const id of PLANT_IDS) s.seeds[id] = 5;
  while (s.orders.length < orderSlotsForLevel(26)) s.orders.push({ order: null, readyAt: T0 });
  return s;
}

/** Chạy một kịch bản lệnh, trả về state cuối và mọi state trung gian. */
function play(seed: number, script: [number, Command][], rich = false): GameState[] {
  let state = rich ? richGame(seed) : createNewGame(T0, seed);
  let now = T0;
  const states = [state];
  for (const [dt, cmd] of script) {
    now += dt;
    const result = step(state, cmd, now);
    if (result.ok) state = result.state;
    states.push(state);
  }
  return states;
}

describe('bất biến của game', () => {
  it('mọi chuỗi lệnh đều giữ state hợp lệ', () => {
    fc.assert(
      fc.property(fc.nat(), scriptArb, (seed, script) => {
        for (const state of play(seed, script)) expect(checkInvariants(state)).toEqual([]);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('ván giàu: máy, chậu, sâu… vẫn giữ state hợp lệ', () => {
    fc.assert(
      fc.property(fc.nat(), scriptArb, (seed, script) => {
        for (const state of play(seed, script, true)) expect(checkInvariants(state)).toEqual([]);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('tất định: cùng seed và lệnh cho cùng kết quả', () => {
    fc.assert(
      fc.property(fc.nat(), scriptArb, (seed, script) => {
        const a = play(seed, script).at(-1);
        const b = play(seed, script).at(-1);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      }),
      { numRuns: NUM_RUNS / 4 },
    );
  });

  it('lưu rồi tải lại không mất dữ liệu', () => {
    fc.assert(
      fc.property(fc.nat(), scriptArb, (seed, script) => {
        const state = play(seed, script).at(-1)!;
        expect(deserialize(serialize(state))).toEqual(state);
      }),
      { numRuns: NUM_RUNS / 4 },
    );
  });

  it('tick không có gì tới hạn thì trả về đúng object cũ, và tick hai lần cùng lúc như một lần', () => {
    fc.assert(
      fc.property(fc.nat(), scriptArb, (seed, script) => {
        const state = play(seed, script).at(-1)!;
        const now = T0 + 1e9;
        const once = tick(state, now);
        expect(once.ok).toBe(true);
        if (!once.ok) return;
        const twice = tick(once.state, now);
        expect(twice.ok && twice.state).toBe(once.state);
      }),
      { numRuns: NUM_RUNS / 4 },
    );
  });

  it('lệnh thất bại không làm thay đổi state', () => {
    fc.assert(
      fc.property(fc.nat(), scriptArb, commandArb, (seed, script, cmd) => {
        const state = play(seed, script).at(-1)!;
        const snapshot = JSON.stringify(state);
        step(state, cmd, T0 + 1e9);
        expect(JSON.stringify(state)).toBe(snapshot);
      }),
      { numRuns: NUM_RUNS / 4 },
    );
  });
});

describe('parseCommand', () => {
  it('nhận lại đúng mọi lệnh hợp lệ', () => {
    fc.assert(
      fc.property(commandArb, (cmd) => {
        expect(parseCommand(JSON.parse(JSON.stringify(cmd)))).toEqual(cmd);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('từ chối dữ liệu rác, trường thừa/thiếu và id kế thừa', () => {
    const bad: unknown[] = [
      null,
      42,
      'tick',
      [],
      {},
      { type: 'nope' },
      { type: 'constructor' },
      { type: '__proto__' },
      { type: 'tick', extra: 1 },
      { type: 'buySeed', plantId: 'rose' },
      { type: 'buySeed', plantId: 'constructor', qty: 1 },
      { type: 'buySeed', plantId: 'rose', qty: 0 },
      { type: 'buySeed', plantId: 'rose', qty: 1.5 },
      { type: 'buySeed', plantId: 'rose', qty: '1' },
      { type: 'sellItem', id: 'cloudclay', qty: 1 },
      { type: 'placePot', floor: 0, slot: 0, uid: 0 },
      { type: 'plant', floor: -1, slot: 0, plantId: 'rose' },
      { type: 'plant', floor: 0, slot: 0, plantId: '__proto__' },
      JSON.parse('{"type":"harvest","floor":0,"slot":0,"__proto__":{"x":1}}'),
      Object.create({ type: 'tick' }),
    ];
    for (const raw of bad) expect(parseCommand(raw)).toBeNull();
  });

  it('không bao giờ ném lỗi với JSON bất kỳ', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (raw) => {
        expect(() => parseCommand(raw)).not.toThrow();
      }),
      { numRuns: NUM_RUNS },
    );
    fc.assert(
      fc.property(
        fc.constantFrom(...COMMAND_TYPES),
        fc.dictionary(fc.string(), fc.jsonValue()),
        (type, extra) => {
          expect(() => parseCommand({ ...extra, type })).not.toThrow();
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
