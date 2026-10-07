import { describe, expect, it } from 'vitest';
import {
  PESTS,
  PLANTS,
  Rng,
  activePest,
  catchPest,
  harvest,
  harvestQty,
  isNibbled,
  plant,
  rollPestDrop,
  rollPlanting,
  speedUp,
  sweep,
  type GameState,
  type PlantedCrop,
  type Pot,
} from '../src/game';
import { T0, errorOf, newGame, ok } from './helpers';

const potAt = (s: GameState, floor: number, slot: number) => s.floors[floor]!.slots[slot] as Pot;

/** Trồng `plantId` ở ô (0,0) rồi gắn một con sâu cố định để test các quy tắc. */
function withPest(at: number, leaveAt: number, plantId: 'lavender' | 'tea' = 'tea'): GameState {
  const s = newGame();
  s.level = 5;
  s.seeds[plantId] = 1;
  const planted = ok(plant(s, 0, 0, plantId, T0));
  potAt(planted, 0, 0).plant!.pest = { id: 'beetle', at, leaveAt };
  return planted;
}

const growMs = PLANTS.tea.growSec * 1000;

describe('tung số lúc trồng', () => {
  it('luôn rút đúng 4 số dù có sâu hay không', () => {
    for (let seed = 0; seed < 50; seed++) {
      const a = new Rng(seed);
      rollPlanting(a, 'rose', T0, 30_000, 1, 0);
      const b = new Rng(seed);
      rollPlanting(b, 'tea', T0, growMs, 20, 50);
      expect(a.seed).toBe(b.seed);
    }
  });

  it('cây ngắn hoặc cấp thấp thì không có sâu; sâu tới trong khoảng 20–80% thời gian lớn', () => {
    let pests = 0;
    for (let seed = 0; seed < 2000; seed++) {
      expect(rollPlanting(new Rng(seed), 'rose', T0, 30_000, 30, 0).pest).toBeNull();
      expect(rollPlanting(new Rng(seed), 'tea', T0, growMs, 4, 0).pest).toBeNull();
      const { pest } = rollPlanting(new Rng(seed), 'tea', T0, growMs, 5, 0);
      if (!pest) continue;
      pests++;
      expect(pest.at).toBeGreaterThanOrEqual(T0 + growMs * 0.2);
      expect(pest.at).toBeLessThanOrEqual(T0 + growMs * 0.8);
      expect(pest.leaveAt - pest.at).toBeGreaterThanOrEqual(15 * 60_000);
    }
    // Chè lớn 30 phút: 15% có sâu.
    expect(pests / 2000).toBeGreaterThan(0.11);
    expect(pests / 2000).toBeLessThan(0.19);
  });

  it('chỉ số "được mùa" của chậu cho thêm 1 nông sản', () => {
    let bonus = 0;
    for (let seed = 0; seed < 1000; seed++) if (rollPlanting(new Rng(seed), 'rose', T0, 1, 1, 30).bonusYield) bonus++;
    expect(bonus / 1000).toBeGreaterThan(0.25);
    expect(bonus / 1000).toBeLessThan(0.35);
  });
});

describe('bắt sâu', () => {
  const at = T0 + growMs * 0.3;
  const leaveAt = at + 20 * 60_000;

  it('chỉ bắt được khi sâu đang ở trên cây', () => {
    const s = withPest(at, leaveAt);
    expect(errorOf(catchPest(s, 0, 0, at - 1))).toBe('NO_PEST');
    const after = ok(catchPest(s, 0, 0, at));
    expect(potAt(after, 0, 0).plant!.pest).toBeNull();
    expect(after.stats.pestsCaught).toBe(1);
    expect(after.gold).toBeGreaterThan(s.gold);
    expect(errorOf(catchPest(after, 0, 0, at))).toBe('NO_PEST');
  });

  it('sâu bỏ đi mà không ai bắt thì thu hoạch hụt 1', () => {
    const s = withPest(at, leaveAt);
    const crop = potAt(s, 0, 0).plant!;
    expect(isNibbled(crop, leaveAt)).toBe(true);
    expect(harvestQty(crop, leaveAt)).toBe(1);
    const after = ok(harvest(s, 0, 0, T0 + growMs));
    expect(after.items.tea).toBe(1);
    expect(after.stats.pestsEscaped).toBe(1);
  });

  it('thu hoạch khi sâu còn trên cây thì tự bắt, đủ sản lượng', () => {
    const s = withPest(at, T0 + growMs * 2);
    const r = harvest(s, 0, 0, T0 + growMs);
    expect(r.ok && r.events.map((e) => e.type)).toEqual(expect.arrayContaining(['pestCaught', 'harvested']));
    expect(ok(r).items.tea).toBe(2);
  });

  it('tăng tốc cây làm sâu chưa tới không bao giờ xuất hiện', () => {
    const s = withPest(T0 + growMs * 0.7, T0 + growMs * 2);
    const sped = ok(speedUp(s, 0, 0, T0 + 1000));
    const crop = potAt(sped, 0, 0).plant!;
    expect(activePest(crop, T0 + growMs * 0.75)).toBe(false);
    expect(isNibbled(crop, T0 + growMs * 3)).toBe(false);
  });

  it('sweep: bắt sâu khi cây chưa chín, thu hoạch khi chín, báo lỗi khi không có gì', () => {
    const s = withPest(at, leaveAt);
    expect(errorOf(sweep(s, 0, 0, T0 + 1))).toBe('NOT_READY');
    expect(errorOf(sweep(s, 1, 4, T0))).toBe('NOTHING_TO_DO');
    const caught = ok(sweep(s, 0, 0, at + 1));
    expect(potAt(caught, 0, 0).plant).not.toBeNull();
    const harvested = ok(sweep(caught, 0, 0, T0 + growMs));
    expect(potAt(harvested, 0, 0).plant).toBeNull();
  });

  it('đồ rơi theo bảng của từng loại sâu', () => {
    for (let seed = 0; seed < 500; seed++) {
      const drop = rollPestDrop(new Rng(seed), 'beetle');
      const total = Object.values(drop).reduce((a, b) => a + (b ?? 0), 0);
      expect(total).toBeGreaterThanOrEqual(1);
      for (const id of Object.keys(drop)) expect(['dewglass', 'cloudclay']).toContain(id);
    }
    expect(Object.keys(PESTS)).toHaveLength(4);
  });
});

describe('sản lượng', () => {
  it('harvestQty không bao giờ dưới 1', () => {
    const crop: PlantedCrop = {
      plantId: 'rose',
      plantedAt: T0,
      growMs: 1000,
      yield: 1,
      pest: { id: 'snail', at: T0 + 100, leaveAt: T0 + 200 },
    };
    expect(harvestQty(crop, T0 + 5000)).toBe(1);
  });
});
