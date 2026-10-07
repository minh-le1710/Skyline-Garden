import { test as base, expect, type Page } from '@playwright/test';
import type { GameState } from '../src/game';
import type { ScreenTarget } from '../src/debug';

/** `test` dùng chung: tự đánh rớt test nếu trang có lỗi JS hoặc vi phạm bất biến của game. */
export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      page.on('console', (m) => {
        if (m.type() === 'error' && m.text().startsWith('[invariant]')) errors.push(m.text());
      });
      await use(errors);
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

export const state = (page: Page): Promise<GameState> => page.evaluate(() => window.__skyline!.state());

export async function openGame(page: Page, query = ''): Promise<void> {
  await page.goto(`/?debug${query}`);
  await page.waitForFunction(() => window.__skyline?.ready === true);
}

/** Chạy một lệnh game qua debug API (dựng tình huống bằng thao tác hợp lệ). */
export async function dispatch(page: Page, cmd: object): Promise<{ ok: boolean; error?: string }> {
  return page.evaluate((c) => {
    const r = window.__skyline!.dispatch(c);
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  }, cmd);
}

/**
 * Vị trí một vật thể 3D trên màn hình, chờ camera trượt xong: camera dịch theo kích thước UI
 * (đo sau một khung hình) và có quán tính, nên đợi vài khung hình liên tiếp mà vị trí không đổi.
 */
export async function screenPos(page: Page, target: ScreenTarget): Promise<{ x: number; y: number }> {
  return page.evaluate(async (t) => {
    const frames = (n: number) =>
      new Promise<void>((resolve) => {
        const step = () => (n-- <= 0 ? resolve() : requestAnimationFrame(step));
        step();
      });
    let prev = window.__skyline!.screenPos(t);
    for (let i = 0; i < 60; i++) {
      await frames(3);
      const pos = window.__skyline!.screenPos(t);
      if (Math.abs(pos.x - prev.x) < 0.5 && Math.abs(pos.y - prev.y) < 0.5) return pos;
      prev = pos;
    }
    return prev;
  }, target);
}

export const slotPosition = (page: Page, floor: number, slot: number) =>
  screenPos(page, { kind: 'slot', floor, slot });

/** Nhấn vào ô đầu tiên rồi kéo qua lần lượt các ô (thao tác chính của game). */
export async function dragAcross(page: Page, floor: number, slots: number[]): Promise<void> {
  const points = [];
  for (const slot of slots) points.push(await slotPosition(page, floor, slot));
  await page.mouse.move(points[0]!.x, points[0]!.y);
  await page.mouse.down();
  for (const p of points) await page.mouse.move(p.x, p.y, { steps: 6 });
  await page.mouse.up();
}

export async function dismissLevelUp(page: Page): Promise<void> {
  const modal = page.getByTestId('levelup');
  if (await modal.isVisible()) await modal.getByRole('button').click();
}
