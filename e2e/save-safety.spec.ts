import { expect, openGame, state, test } from './helpers';

const SAVE_KEY = 'skyline-garden/save';

/** Ghi thẳng vào localStorage sau khi chặn game lưu, để lần tải lại đọc đúng dữ liệu ta đặt. */
async function plantSave(page: import('@playwright/test').Page, value: string): Promise<void> {
  await page.evaluate(
    ([key, v]) => {
      window.__skyline!.game.blocked.value = 'otherTab';
      localStorage.setItem(key!, v!);
    },
    [SAVE_KEY, value],
  );
}

test('save hỏng: giữ lại bản lỗi và bắt đầu ván mới', async ({ page }) => {
  await openGame(page);
  await plantSave(page, '{khong-phai-json');
  await page.reload();
  await page.waitForFunction(() => window.__skyline?.ready === true);
  await expect(page.getByText('Bản lỗi đã được giữ lại')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('skyline-garden/save.corrupt'))).toBe(
    '{khong-phai-json',
  );
  expect((await state(page)).level).toBe(1);
});

test('save của bản game mới hơn: chặn và không ghi đè', async ({ page }) => {
  await openGame(page);
  const future = JSON.stringify({ version: 999, gold: 123456 });
  await plantSave(page, future);
  await page.reload();
  await page.waitForFunction(() => window.__skyline?.ready === true);
  await expect(page.getByTestId('blocking-notice')).toBeVisible();
  await page.waitForTimeout(600);
  await page.evaluate(() => window.__skyline!.game.save());
  expect(await page.evaluate((k) => localStorage.getItem(k), SAVE_KEY)).toBe(future);
});

test('mở game ở tab thứ hai thì tab cũ tạm dừng', { tag: '@smoke' }, async ({ page, context }) => {
  await openGame(page);
  await expect(page.getByTestId('blocking-notice')).toBeHidden();
  const second = await context.newPage();
  await openGame(second);
  await expect(page.getByTestId('blocking-notice')).toBeVisible();
  await expect(second.getByTestId('blocking-notice')).toBeHidden();
  await second.close();
});

test('tab chạy bản cũ (save mới hơn) không giành quyền của tab đang chơi', async ({ page, context }) => {
  await openGame(page);
  const stale = await context.newPage();
  // Giả lập tab chạy bản cũ: đọc thấy save "mới hơn" (không ghi gì vào localStorage).
  await stale.addInitScript(() => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      return key === 'skyline-garden/save' ? JSON.stringify({ version: 999 }) : original.call(this, key);
    };
  });
  await openGame(stale);
  await expect(stale.getByTestId('blocking-notice')).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByTestId('blocking-notice')).toBeHidden();
  await stale.close();
});

test('tab cũ lưu muộn lúc chuyển giao: tab giữ khóa nhận bản mới hơn, không tự dừng', async ({ page }) => {
  await openGame(page);
  // Khóa được cấp bất đồng bộ: chờ tab này giữ khóa đã.
  await page.waitForFunction(() => window.__skyline!.game.holdsLock);
  await page.evaluate(() => window.__skyline!.game.save());
  // Giả lập tab cũ chưa kịp biết mình mất khóa và ghi một bản save hợp lệ, mới hơn.
  await page.evaluate((key) => {
    const late = JSON.parse(localStorage.getItem(key)!);
    late.gold = 777_777;
    const value = JSON.stringify(late);
    localStorage.setItem(key, value);
    window.dispatchEvent(new StorageEvent('storage', { key, newValue: value }));
  }, SAVE_KEY);
  await expect.poll(async () => (await state(page)).gold).toBe(777_777);
  await expect(page.getByTestId('blocking-notice')).toBeHidden();
});
