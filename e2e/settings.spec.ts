import { readFile } from 'node:fs/promises';
import { expect, openGame, state, test } from './helpers';

test('đổi ngôn ngữ sang tiếng Anh và giữ sau khi tải lại', { tag: '@smoke' }, async ({ page }) => {
  await openGame(page);
  await expect(page.getByTestId('btn-shop')).toContainText('Cửa hàng');
  await page.getByTestId('chip-settings').click();
  await expect(page.getByTestId('settings')).toBeVisible();
  await page.getByTestId('locale-en').click();
  await expect(page.getByTestId('btn-shop')).toContainText('Shop');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  // Escape đóng bảng.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('settings')).toBeHidden();

  await page.reload();
  await page.waitForFunction(() => window.__skyline?.ready === true);
  await expect(page.getByTestId('btn-shop')).toContainText('Shop');
});

test('xuất save rồi nhập lại', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.__skyline!.addGold(1234));
  const exportedGold = (await state(page)).gold;

  await page.getByTestId('chip-settings').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-save').click(),
  ]);
  const json = await readFile((await download.path())!, 'utf8');
  expect(JSON.parse(json).gold).toBe(exportedGold);

  // Tiêu bớt vàng, rồi nhập lại bản đã xuất.
  await page.evaluate(() => window.__skyline!.addGold(-1000));
  expect((await state(page)).gold).toBe(exportedGold - 1000);
  await page.getByTestId('import-save').setInputFiles({
    name: 'save.json',
    mimeType: 'application/json',
    buffer: Buffer.from(json),
  });
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByTestId('confirm')).toBeHidden();
  expect((await state(page)).gold).toBe(exportedGold);
});

test('nhập file hỏng thì báo lỗi và giữ nguyên ván', async ({ page }) => {
  await openGame(page);
  const before = await state(page);
  await page.getByTestId('chip-settings').click();
  await page.getByTestId('import-save').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"version": 1, "gold": "lots"}'),
  });
  await expect(page.locator('.toast.error')).toBeVisible();
  await expect(page.getByTestId('confirm')).toHaveCount(0);
  expect((await state(page)).createdAt).toBe(before.createdAt);
});

test('chơi lại từ đầu cần xác nhận', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.__skyline!.addGold(5000));
  await page.getByTestId('chip-settings').click();
  await page.getByTestId('reset-game').click();
  await expect(page.getByTestId('confirm')).toBeVisible();
  // Hủy thì không mất gì.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('confirm')).toBeHidden();
  expect((await state(page)).gold).toBeGreaterThan(5000);

  await page.getByTestId('reset-game').click();
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByTestId('settings')).toBeHidden();
  const s = await state(page);
  expect(s.gold).toBe(100);
  expect(s.xp).toBe(0);
  // Bản cũ được giữ làm sao lưu.
  const backup = await page.evaluate(() => localStorage.getItem('skyline-garden/save.backup'));
  expect(JSON.parse(backup!).gold).toBeGreaterThan(5000);
});
