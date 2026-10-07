import { describe, expect, it } from 'vitest';
import {
  FIRST_ORDER,
  TUTORIAL_REWARD,
  advanceTutorial,
  checkInvariants,
  readSave,
  serialize,
  skipTutorial,
  step,
  type Command,
  type GameEvent,
  type GameState,
  type PotInstance,
} from '../src/game';
import { T0, errorOf, newGame, ok } from './helpers';

/** Chạy một lệnh qua step (tick + lệnh), trả về state và sự kiện. */
function run(s: GameState, cmd: Command, now: number): { state: GameState; events: GameEvent[] } {
  const r = step(s, cmd, now);
  if (!r.ok) throw new Error(`${cmd.type}: ${r.error}`);
  return { state: r.state, events: r.events };
}

const growMs = (s: GameState, slot: number) =>
  (s.floors[0]!.slots[slot] as PotInstance & { plant: { growMs: number } }).plant.growMs;

describe('hướng dẫn chơi', () => {
  it('ván mới bắt đầu ở bước chào và có đơn hàng đầu cố định', () => {
    const s = newGame();
    expect(s.tutorial).toEqual({ step: 'welcome', progress: 0 });
    expect(s.orders[0]!.order).toEqual({ id: 1, ...FIRST_ORDER });
    expect(s.nextOrderId).toBe(2);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('đi hết các bước bằng lệnh thật, nhận thưởng và mở thành tựu "bước đầu tiên"', () => {
    let s = newGame();
    let now = T0;
    for (const from of ['welcome', 'openTray', 'pickSeed'] as const) {
      s = run(s, { type: 'advanceTutorial', from }, now).state;
    }
    expect(s.tutorial.step).toBe('plantRow');
    for (const slot of [0, 1, 2]) s = run(s, { type: 'plant', floor: 0, slot, plantId: 'rose' }, now).state;
    expect(s.tutorial.step).toBe('waitGrow');

    // Chưa chín: tick không đổi bước. Chín rồi: tick chuyển sang thu hoạch.
    s = run(s, { type: 'tick' }, now + 1000).state;
    expect(s.tutorial.step).toBe('waitGrow');
    now += growMs(s, 0);
    const ticked = run(s, { type: 'tick' }, now);
    expect(ticked.events).toContainEqual({ type: 'tutorialStep', step: 'harvest' });
    s = ticked.state;

    for (const slot of [0, 1]) s = run(s, { type: 'harvest', floor: 0, slot }, now).state;
    expect(s.tutorial).toEqual({ step: 'harvest', progress: 2 });
    s = run(s, { type: 'harvest', floor: 0, slot: 2 }, now).state;
    expect(s.tutorial.step).toBe('openOrders');

    s = run(s, { type: 'advanceTutorial', from: 'openOrders' }, now).state;
    s = run(s, { type: 'deliverOrder', index: 0 }, now).state;
    expect(s.tutorial.step).toBe('openShop');
    s = run(s, { type: 'advanceTutorial', from: 'openShop' }, now).state;
    const gold = s.gold;
    const ruby = s.ruby;
    const done = run(s, { type: 'buySeed', plantId: 'rose', qty: 5 }, now);
    s = done.state;
    expect(s.tutorial.step).toBe('done');
    expect(done.events).toContainEqual({ type: 'tutorialDone', skipped: false, reward: TUTORIAL_REWARD });
    expect(done.events).toContainEqual({ type: 'achievementUnlocked', id: 'first_steps', tier: 0 });
    expect(s.ruby).toBe(ruby + TUTORIAL_REWARD.ruby!);
    expect(s.stats.tutorialDone).toBe(1);
    expect(s.gold).toBeGreaterThan(gold);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('dùng ruby cho chín ngay thì bỏ qua bước chờ', () => {
    let s = newGame();
    s.tutorial = { step: 'waitGrow', progress: 0 };
    s = ok(step(s, { type: 'plant', floor: 0, slot: 0, plantId: 'rose' }, T0));
    s = run(s, { type: 'speedUp', floor: 0, slot: 0 }, T0).state;
    s = run(s, { type: 'harvest', floor: 0, slot: 0 }, T0).state;
    expect(s.tutorial).toEqual({ step: 'harvest', progress: 1 });
  });

  it('advanceTutorial chỉ đúng ở bước hiện tại và chỉ cho bước giao diện', () => {
    const s = newGame();
    expect(errorOf(advanceTutorial(s, 'openTray', T0))).toBe('WRONG_STEP');
    const plantRow = { ...s, tutorial: { step: 'plantRow' as const, progress: 0 } };
    expect(errorOf(advanceTutorial(plantRow, 'plantRow', T0))).toBe('WRONG_STEP');
  });

  it('bỏ qua: xong ngay, không thưởng, không tính thành tựu', () => {
    const s = newGame();
    const r = skipTutorial(s, T0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.tutorial.step).toBe('done');
    expect(r.state.gold).toBe(s.gold);
    expect(r.state.stats.tutorialDone).toBeUndefined();
    expect(r.events).toEqual([{ type: 'tutorialDone', skipped: true, reward: null }]);
    expect(errorOf(skipTutorial(r.state, T0))).toBe('WRONG_STEP');
  });

  it('save cũ: người đã chơi không phải đi lại hướng dẫn', () => {
    const played = JSON.parse(serialize(newGame()));
    delete played.tutorial;
    played.version = 5;
    played.xp = 10;
    const r = readSave(JSON.stringify(played));
    expect(r.status === 'ok' && r.state.tutorial.step).toBe('done');
    played.xp = 0;
    const fresh = readSave(JSON.stringify(played));
    expect(fresh.status === 'ok' && fresh.state.tutorial.step).toBe('welcome');
  });

  it('trạng thái hướng dẫn hỏng thì save bị coi là hỏng', () => {
    const bad = JSON.parse(serialize(newGame()));
    bad.tutorial = { step: 'flying', progress: 0 };
    expect(readSave(JSON.stringify(bad)).status).toBe('corrupt');
  });
});
