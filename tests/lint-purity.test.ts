import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

/** Luật lint giữ src/game thuần phải có hiệu lực ở mọi độ sâu thư mục. */
describe('luật thuần của src/game', () => {
  const eslint = new ESLint();
  const lint = async (code: string, filePath: string) => {
    const [result] = await eslint.lintText(code, { filePath });
    return result!.messages.map((m) => m.ruleId);
  };

  it('chặn import ra render/core/i18n từ thư mục con', async () => {
    for (const path of ['../../render/layout', '../../core/Game', '../../i18n/vi', '../../ui/names']) {
      expect(
        await lint(`import { x } from '${path}';\nexport const y = x;\n`, 'src/game/config/probe.ts'),
      ).toContain('no-restricted-imports');
    }
  });

  it('chặn three, preact và API trình duyệt; cho phép import nội bộ', async () => {
    expect(
      await lint(`import { Vector3 } from 'three';\nexport const v = Vector3;\n`, 'src/game/probe.ts'),
    ).toContain('no-restricted-imports');
    expect(await lint(`export const t = Date.now();\n`, 'src/game/probe.ts')).toContain(
      'no-restricted-properties',
    );
    expect(await lint(`export const w = window.innerWidth;\n`, 'src/game/probe.ts')).toContain(
      'no-restricted-globals',
    );
    expect(
      await lint(
        `import { PLANTS } from './plants';\nexport const p = PLANTS;\n`,
        'src/game/config/probe.ts',
      ),
    ).toEqual([]);
  });
});
