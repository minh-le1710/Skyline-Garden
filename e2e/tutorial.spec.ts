import type { Page } from '@playwright/test';
import { dismissLevelUp, dragAcross, expect, openGame, state, test } from './helpers';

const step = async (page: Page) => (await state(page)).tutorial.step;

test('đi hết hướng dẫn bằng thao tác thật', { tag: '@smoke' }, async ({ page }) => {
  await openGame(page, '&tutorial');
  const overlay = page.getByTestId('tutorial');
  await expect(overlay).toBeVisible();
  await page.getByTestId('tutorial-next').click();
  await expect.poll(() => step(page)).toBe('openTray');

  // Ngoài chỗ được chỉ thì bị chặn: bấm Cửa hàng không mở gì.
  await expect(page.locator('.tutorial-ring')).toBeVisible();
  const shop = await page.getByTestId('btn-shop').boundingBox();
  await page.mouse.click(shop!.x + shop!.width / 2, shop!.y + shop!.height / 2);
  await expect(page.getByTestId('shop')).toHaveCount(0);

  await page.getByTestId('btn-plant').click();
  await expect.poll(() => step(page)).toBe('pickSeed');
  await page.getByTestId('seed-rose').click();
  await expect.poll(() => step(page)).toBe('plantRow');
  await page.waitForTimeout(400);
  await dragAcross(page, 0, [0, 1, 2]);
  await expect.poll(() => step(page)).toBe('waitGrow');
  await expect(overlay).toContainText(/chờ|wait/);

  await page.evaluate(() => window.__skyline!.skip(31));
  await expect.poll(() => step(page)).toBe('harvest');
  await page.getByTestId('btn-harvest').click();
  await page.waitForTimeout(400);
  await dragAcross(page, 0, [0, 1, 2]);
  await expect.poll(() => step(page)).toBe('openOrders');
  await dismissLevelUp(page);

  await page.getByTestId('btn-orders').click();
  await expect.poll(() => step(page)).toBe('deliver');
  await page.getByTestId('deliver-0').click();
  await expect.poll(() => step(page)).toBe('openShop');
  await dismissLevelUp(page);
  await expect(page.getByTestId('orders')).toHaveCount(0);

  await page.getByTestId('btn-shop').click();
  await expect.poll(() => step(page)).toBe('buySeeds');
  const ruby = (await state(page)).ruby;
  await page.getByTestId('buy-seed-rose-5').click();
  await expect.poll(() => step(page)).toBe('done');
  await expect(overlay).toHaveCount(0);
  const s = await state(page);
  expect(s.ruby).toBe(ruby + 3);
  expect(s.stats.tutorialDone).toBe(1);
});

test('bỏ qua hướng dẫn bất cứ lúc nào', async ({ page }) => {
  await openGame(page, '&tutorial');
  const gold = (await state(page)).gold;
  await page.getByTestId('tutorial-skip').click();
  await expect(page.getByTestId('tutorial')).toHaveCount(0);
  const s = await state(page);
  expect(s.tutorial.step).toBe('done');
  expect(s.gold).toBe(gold);
});

test('chế độ debug tự bỏ qua hướng dẫn', async ({ page }) => {
  await openGame(page);
  await expect(page.getByTestId('tutorial')).toHaveCount(0);
  expect(await step(page)).toBe('done');
});
