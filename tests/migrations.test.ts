import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RULES_HASH, SAVE_VERSION, checkInvariants, readSave, serialize, stateHash } from '../src/game';
import { midgame } from './fixtures';

const DIR = 'tests/fixtures/saves';
const fixtures = readdirSync(DIR).filter((f) => f.endsWith('.json'));

describe('nâng cấp save cũ', () => {
  it('có fixture cho version hiện tại', () => {
    expect(fixtures.some((f) => f.startsWith(`v${SAVE_VERSION}-`))).toBe(true);
  });

  for (const file of fixtures) {
    it(`tải được ${file}`, () => {
      const json = readFileSync(`${DIR}/${file}`, 'utf8');
      const version = Number(/^v(\d+)-/.exec(file)![1]);
      const result = readSave(json);
      expect(result.status).toBe('ok');
      if (result.status !== 'ok') return;
      expect(result.state.version).toBe(SAVE_VERSION);
      expect(result.migratedFrom).toBe(version < SAVE_VERSION ? version : null);
      expect(checkInvariants(result.state)).toEqual([]);
      const again = readSave(serialize(result.state));
      expect(again.status === 'ok' && again.state).toEqual(result.state);
    });
  }

  it('báo save hỏng thay vì trả về null im lặng', () => {
    expect(readSave(null).status).toBe('none');
    expect(readSave('{oops').status).toBe('corrupt');
    expect(readSave('{"version":"1"}').status).toBe('corrupt');
    const tooNew = readSave(JSON.stringify({ version: SAVE_VERSION + 1 }));
    expect(tooNew).toMatchObject({ status: 'tooNew', version: SAVE_VERSION + 1 });
    const broken = JSON.parse(serialize(midgame()));
    broken.gold = -5;
    expect(readSave(JSON.stringify(broken)).status).toBe('corrupt');
  });
});

describe('hash', () => {
  it('stateHash bỏ qua lastSeenAt và thứ tự khóa', () => {
    const s = midgame();
    const shuffled = Object.fromEntries(Object.entries(s).reverse());
    expect(stateHash({ ...shuffled, lastSeenAt: 123 })).toBe(stateHash(s));
    expect(stateHash({ ...s, gold: s.gold + 1 })).not.toBe(stateHash(s));
  });

  it('RULES_HASH đổi thì phải xác nhận (cập nhật snapshot) vì server sẽ từ chối client khác luật', () => {
    expect(RULES_HASH).toMatchInlineSnapshot(`"oyqaosuqjb"`);
  });
});

describe('v1 → v2', () => {
  const v1 = JSON.parse(readFileSync(`${DIR}/v1-midgame.json`, 'utf8'));

  it('chậu thành từng chiếc có uid, giữ chỉ số cũ; nông sản vào kho chung; đơn hàng dùng id', () => {
    const raw = structuredClone(v1);
    raw.potStock = { ceramic: 2, porcelain: 1 };
    raw.floors[1].slots[5] = { potId: 'porcelain', plant: null };
    const result = readSave(JSON.stringify(raw));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    const s = result.state;
    const uids = [...s.potBag, ...s.floors.flatMap((f) => f.slots)].flatMap((p) =>
      p && 'uid' in p ? [p.uid] : [],
    );
    expect(new Set(uids).size).toBe(uids.length);
    expect(s.nextUid).toBe(Math.max(...uids) + 1);
    expect(s.potBag.map((p) => [p.potId, p.stats])).toEqual([
      ['ceramic', { xpPct: 20 }],
      ['ceramic', { xpPct: 20 }],
      ['porcelain', { timePct: 15 }],
    ]);
    expect(s.floors[1]!.slots[5]).toMatchObject({ kind: 'pot', potId: 'porcelain', origin: 'legacy' });
    expect(s.items).toEqual(raw.crops);
    const growing = s.floors.flatMap((f) => f.slots).find((p) => p?.kind === 'pot' && p.plant);
    expect(growing?.kind === 'pot' && growing.plant).toMatchObject({ yield: 2, pest: null });
    for (const slot of s.orders)
      for (const item of slot.order?.items ?? []) expect(item).toHaveProperty('id');
    expect(s.rng.orders).toBe(raw.rngSeed >>> 0);
    expect(new Set(Object.values(s.rng)).size).toBe(Object.keys(s.rng).length);
  });

  it('đổi bảng XP nhưng giữ cấp và tỉ lệ tiến độ trong cấp', () => {
    const raw = structuredClone(v1);
    raw.level = 4;
    raw.xp = 80; // v1: cấp 4 từ 60 tới 100 → đi được một nửa
    while (raw.orders.length < 4) raw.orders.push({ order: null, readyAt: 0 });
    const result = readSave(JSON.stringify(raw));
    expect(result.status === 'ok' && [result.state.level, result.state.xp]).toEqual([4, 150 + 80]);
  });
});
