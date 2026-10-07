import { expect, test, type Page } from '@playwright/test';
import type { GameState } from '../src/game';

const state = (page: Page): Promise<GameState> => page.evaluate(() => window.__skyline!.state());

async function openGame(page: Page): Promise<void> {
  await page.goto('/?debug');
  await page.waitForFunction(() => window.__skyline?.ready === true);
}

/**
 * Vị trí ô trên màn hình, chờ camera trượt xong: camera dịch theo kích thước UI (đo sau một khung hình)
 * và có quán tính, nên đợi vài khung hình liên tiếp mà vị trí không đổi.
 */
async function slotPosition(page: Page, floor: number, slot: number): Promise<{ x: number; y: number }> {
  return page.evaluate(
    async ([f, s]) => {
      const frames = (n: number) =>
        new Promise<void>((resolve) => {
          const step = () => (n-- <= 0 ? resolve() : requestAnimationFrame(step));
          step();
        });
      let prev = window.__skyline!.slotScreenPosition(f!, s!);
      for (let i = 0; i < 60; i++) {
        await frames(3);
        const pos = window.__skyline!.slotScreenPosition(f!, s!);
        if (Math.abs(pos.x - prev.x) < 0.5 && Math.abs(pos.y - prev.y) < 0.5) return pos;
        prev = pos;
      }
      return prev;
    },
    [floor, slot],
  );
}

/** Nhấn vào ô đầu tiên rồi kéo qua lần lượt các ô (thao tác chính của game). */
async function dragAcross(page: Page, floor: number, slots: number[]): Promise<void> {
  const points = [];
  for (const slot of slots) points.push(await slotPosition(page, floor, slot));
  await page.mouse.move(points[0]!.x, points[0]!.y);
  await page.mouse.down();
  for (const p of points) await page.mouse.move(p.x, p.y, { steps: 6 });
  await page.mouse.up();
}

async function dismissLevelUp(page: Page): Promise<void> {
  const modal = page.getByTestId('levelup');
  if (await modal.isVisible()) await modal.getByRole('button').click();
}

test(
  'vòng chơi chính: mua hạt, trồng, thu hoạch, giao đơn, bán, lưu game',
  { tag: '@smoke' },
  async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openGame(page);

    // Mua 5 hạt hoa hồng.
    await page.getByTestId('btn-shop').click();
    await page.getByTestId('buy-seed-rose-5').click();
    await expect(page.getByTestId('gold')).toContainText('75');
    await page.getByTestId('shop').getByRole('button', { name: 'Đóng' }).click();
    expect((await state(page)).seeds.rose).toBe(11);

    // Chọn hạt rồi kéo qua 3 chậu ở tầng dưới cùng.
    await page.getByTestId('btn-plant').click();
    await page.getByTestId('seed-rose').click();
    await expect(page.getByTestId('tool-banner')).toBeVisible();
    await dragAcross(page, 0, [0, 1, 2]);
    let s = await state(page);
    expect(s.floors[0]!.slots.slice(0, 4).map((p) => p?.plant?.plantId ?? null)).toEqual([
      'rose',
      'rose',
      'rose',
      null,
    ]);
    expect(s.seeds.rose).toBe(8);
    await page.screenshot({ path: testInfo.outputPath('planted.png') });

    // Tua nhanh cho cây chín rồi kéo liềm thu hoạch.
    await page.evaluate(() => window.__skyline!.skip(31));
    await page.getByTestId('btn-harvest').click();
    await dragAcross(page, 0, [0, 1, 2]);
    s = await state(page);
    expect(s.crops.rose).toBe(6);
    expect(s.xp).toBe(3);
    expect(s.floors[0]!.slots[0]!.plant).toBeNull();
    await page.getByTestId('btn-harvest').click();

    // Giao đơn hàng đầu tiên của Cú.
    const order = s.orders[0]!.order!;
    const need: Record<string, number> = {};
    for (const { plantId, qty } of order.items) need[plantId] = qty;
    await page.evaluate((crops) => window.__skyline!.grant({ crops }), need);
    const goldBefore = (await state(page)).gold;
    await page.getByTestId('btn-orders').click();
    await page.getByTestId('deliver-0').click();
    await dismissLevelUp(page);
    s = await state(page);
    expect(s.gold).toBeGreaterThanOrEqual(goldBefore + order.gold);
    expect(s.orders[0]!.order).toBeNull();
    await page.screenshot({ path: testInfo.outputPath('orders.png') });
    await page.getByTestId('orders').getByRole('button', { name: 'Đóng' }).click();

    // Bán hết hoa hồng trong kho.
    await page.getByTestId('btn-storage').click();
    const goldBeforeSell = s.gold;
    await page.getByTestId('sell-all-rose').click();
    s = await state(page);
    expect(s.crops.rose).toBeUndefined();
    expect(s.gold).toBe(goldBeforeSell + 6 * 4);
    await page.getByTestId('storage').getByRole('button', { name: 'Đóng' }).click();

    // Tải lại trang: game được lưu.
    await page.waitForTimeout(700);
    await page.reload();
    await page.waitForFunction(() => window.__skyline?.ready === true);
    const reloaded = await state(page);
    expect(reloaded.gold).toBe(s.gold);
    expect(reloaded.seeds).toEqual(s.seeds);
    expect(reloaded.xp).toBe(s.xp);
    expect(errors).toEqual([]);
  },
);

test('chạm vào tầng khóa để mở tầng mới', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    window.__skyline!.setLevel(3);
    window.__skyline!.addGold(500);
    window.__skyline!.scrollToFloor(2);
  });
  const pos = await slotPosition(page, 2, 2);
  await page.mouse.click(pos.x, pos.y);
  await expect(page.getByTestId('unlock')).toBeVisible();
  await page.getByTestId('unlock-confirm').click();
  await expect(page.getByTestId('unlock')).toBeHidden();
  const s = await state(page);
  expect(s.floors).toHaveLength(3);
  expect(s.gold).toBe(100 + 500 - 300);
});

test('chạm vào cây đang lớn để xem thời gian và dùng ruby cho chín ngay', async ({ page }) => {
  await openGame(page);
  await page.getByTestId('btn-plant').click();
  await page.getByTestId('seed-sunflower').click();
  await dragAcross(page, 0, [4]);
  await page.getByTestId('tool-banner').getByRole('button').click();

  const pos = await slotPosition(page, 0, 4);
  await page.mouse.click(pos.x, pos.y);
  await expect(page.getByTestId('pot-info')).toContainText('Hướng dương');
  await page.getByTestId('speed-up').click();
  await expect(page.getByTestId('pot-info')).toContainText('Đã chín');
  expect((await state(page)).ruby).toBe(4);
});
