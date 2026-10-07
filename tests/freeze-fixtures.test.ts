import { existsSync, writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { SAVE_VERSION, createNewGame, serialize } from '../src/game';
import { midgame } from './fixtures';
import { T0 } from './helpers';

/**
 * Đóng băng fixture save của version hiện tại. Chạy TRƯỚC khi tăng SAVE_VERSION:
 *   FREEZE_FIXTURES=1 npx vitest run tests/freeze-fixtures.test.ts
 * Không bao giờ ghi đè fixture đã có: chúng là bằng chứng save cũ vẫn tải được.
 */
describe.skipIf(!process.env.FREEZE_FIXTURES)('đóng băng fixture', () => {
  it(`ghi fixture v${SAVE_VERSION}`, () => {
    const fixtures = { new: createNewGame(T0, 1), midgame: midgame() };
    for (const [name, state] of Object.entries(fixtures)) {
      const path = `tests/fixtures/saves/v${SAVE_VERSION}-${name}.json`;
      if (existsSync(path)) continue;
      writeFileSync(path, `${JSON.stringify(JSON.parse(serialize(state)), null, 2)}\n`);
    }
  });
});
