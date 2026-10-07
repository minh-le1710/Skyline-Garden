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
    expect(RULES_HASH).toMatchInlineSnapshot(`"z3lksjfs4d"`);
  });
});
