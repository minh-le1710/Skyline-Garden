import { describe, expect, it } from 'vitest';
import { AudioEngine, Combo, LOG_SIZE, comboPitch } from '../src/audio/AudioEngine';
import { SFX_FOR_EVENT, readyJobCount, sfxForEvent } from '../src/audio/connectAudio';
import { DEFAULT_COOLDOWN_MS, SFX_RECIPES, type SfxId } from '../src/audio/sfx';
import type { AppEvent } from '../src/core/Game';
import { buildMachine, startJob, type GameState } from '../src/game';
import { T0, newGame, ok } from './helpers';

const RECIPE_IDS = Object.keys(SFX_RECIPES) as SfxId[];

describe('bảng hiệu ứng', () => {
  it('mỗi sự kiện được gắn đều trỏ tới một công thức có thật', () => {
    for (const [type, entry] of Object.entries(SFX_FOR_EVENT)) {
      if (typeof entry === 'string') expect(RECIPE_IDS, type).toContain(entry);
      else expect(typeof entry, type).toBe('function');
    }
    // Hàm chọn theo nội dung sự kiện cũng chỉ trả về công thức có thật.
    const samples: AppEvent[] = [
      { type: 'balloonSent', completed: true, reward: { gold: 10 } },
      { type: 'balloonSent', completed: false, reward: {} },
      { type: 'machineBuilt', floor: 1, slot: 3, machineId: 'still', gold: 100 },
    ];
    for (const event of samples) {
      const ids = sfxForEvent(event);
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) expect(RECIPE_IDS).toContain(id);
    }
  });

  it('các sự kiện chính có tiếng', () => {
    const expected: Partial<Record<AppEvent['type'], SfxId>> = {
      planted: 'plant',
      harvested: 'harvest',
      pestCaught: 'bugCatch',
      potPlaced: 'potPlace',
      speedUp: 'magic',
      bought: 'coinSpend',
      sold: 'coin',
      orderDelivered: 'coin',
      levelUp: 'levelUp',
      floorUnlocked: 'unlock',
      ordersArrived: 'owlHoot',
      welcomeBack: 'chime',
      actionFailed: 'error',
    };
    for (const [type, id] of Object.entries(expected))
      expect(SFX_FOR_EVENT[type as AppEvent['type']]).toBe(id);
    // Sự kiện không có tiếng thì trả về danh sách rỗng.
    expect(sfxForEvent({ type: 'stateReplaced', reason: 'reset' })).toEqual([]);
  });

  it('công thức cho hầm mỏ và thú cưng có sẵn; thành tựu mới kêu kèn', () => {
    for (const id of ['dig', 'rockBreak', 'gem', 'boom', 'munch', 'petCoo', 'fanfare'] as SfxId[]) {
      expect(SFX_RECIPES[id]).toBeDefined();
    }
    expect(SFX_FOR_EVENT.achievementUnlocked).toBe('fanfare');
  });

  it('mọi công thức hợp lệ', () => {
    for (const id of RECIPE_IDS) {
      const recipe = SFX_RECIPES[id];
      expect(recipe.layers.length, id).toBeGreaterThan(0);
      expect(recipe.layers.length, id).toBeLessThanOrEqual(16);
      if (recipe.jitter !== undefined) expect(recipe.jitter).toBeGreaterThanOrEqual(0);
      if (recipe.jitter !== undefined) expect(recipe.jitter).toBeLessThan(0.5);
      if (recipe.cooldownMs !== undefined) expect(recipe.cooldownMs).toBeGreaterThan(0);
      if (recipe.duckMusic !== undefined) expect(recipe.duckMusic).toBeGreaterThan(0);
      for (const layer of recipe.layers) {
        expect(layer.dur, id).toBeGreaterThan(0);
        expect(layer.gain, id).toBeGreaterThan(0);
        expect(layer.gain, id).toBeLessThanOrEqual(0.5);
        expect(layer.at ?? 0, id).toBeGreaterThanOrEqual(0);
        // Tần số > 0: đường trượt hàm mũ không nhận 0.
        const freqs =
          layer.type === 'tone'
            ? [layer.f0, layer.f1, layer.f2, ...(layer.pick ?? [])]
            : layer.type === 'fm'
              ? [layer.f0, layer.f0 * layer.ratio]
              : [layer.filter.freq, layer.filter.freq1];
        for (const f of freqs) if (f !== undefined) expect(f, id).toBeGreaterThan(0);
        if (layer.type === 'tone' && layer.attack !== undefined) {
          expect(layer.attack, id).toBeGreaterThan(0);
          expect(layer.attack, id).toBeLessThan(layer.dur);
        }
        if (layer.type === 'fm') expect(layer.index0).toBeGreaterThan(0);
      }
    }
  });
});

describe('AudioEngine (không có Web Audio)', () => {
  const engineAt = () => {
    let now = 1000;
    const engine = new AudioEngine({ now: () => now });
    return { engine, advance: (ms: number) => (now += ms) };
  };

  it('vẫn ghi log khi không có AudioContext, và tôn trọng cooldown', () => {
    const { engine, advance } = engineAt();
    expect(engine.supported).toBe(false);
    expect(engine.play('click')).toBe(true);
    advance(DEFAULT_COOLDOWN_MS - 1);
    expect(engine.play('click')).toBe(false);
    advance(1);
    expect(engine.play('click')).toBe(true);
    expect(engine.play('plant')).toBe(true);
    expect(engine.log).toEqual(['click', 'click', 'plant']);
  });

  it(`log chỉ giữ ${LOG_SIZE} mục gần nhất`, () => {
    const { engine, advance } = engineAt();
    for (let i = 0; i < LOG_SIZE + 10; i++) {
      engine.play(i % 2 ? 'plant' : 'harvest');
      advance(100);
    }
    expect(engine.log).toHaveLength(LOG_SIZE);
    expect(engine.log.at(-1)).toBe('plant');
  });
});

describe('combo khi kéo', () => {
  it('đi lên theo ngũ cung và về đầu sau 600 ms nghỉ', () => {
    const combo = new Combo();
    expect([0, 100, 200, 300].map((t) => combo.next(t))).toEqual([0, 1, 2, 3]);
    expect(combo.next(300 + 601)).toBe(0);
    expect(combo.next(1000)).toBe(1);
    // C D E G A C': hệ số tần số tăng dần, bước 5 lên đúng một quãng tám.
    const ratios = [0, 1, 2, 3, 4, 5].map(comboPitch);
    for (let i = 1; i < ratios.length; i++) expect(ratios[i]!).toBeGreaterThan(ratios[i - 1]!);
    expect(ratios[0]).toBe(1);
    expect(ratios[5]).toBeCloseTo(2, 10);
    expect(comboPitch(6)).toBe(1);
  });
});

describe('chuông máy xong việc', () => {
  it('đếm số mẻ đã xong mà chưa lấy', () => {
    let s: GameState = newGame();
    s.level = 6;
    s.gold = 10_000;
    s.items = { rose: 30 };
    s = ok(buildMachine(s, 'still', 1, 3, T0));
    expect(readyJobCount(s, T0)).toBe(0);
    s = ok(startJob(s, 1, 3, 'rose_water', T0));
    expect(readyJobCount(s, T0)).toBe(0);
    expect(readyJobCount(s, T0 + 24 * 3_600_000)).toBe(1);
  });
});
