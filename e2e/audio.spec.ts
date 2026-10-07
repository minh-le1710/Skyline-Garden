import type { Page } from '@playwright/test';
import { dispatch, expect, openGame, test } from './helpers';

const audioLog = (page: Page): Promise<string[]> => page.evaluate(() => [...window.__skyline!.audio.log]);
const musicLoaded = (page: Page): Promise<boolean> =>
  page.evaluate(() =>
    performance.getEntriesByType('resource').some((e) => /\/MusicPlayer-[\w-]+\.js$/.test(e.name)),
  );

test('hiệu ứng âm thanh theo nút bấm và sự kiện game', { tag: '@smoke' }, async ({ page }) => {
  const warnings: string[] = [];
  page.on('console', (m) => {
    if (/AudioContext/i.test(m.text())) warnings.push(m.text());
  });
  await openGame(page);

  // Chưa chạm gì: chưa có AudioContext, chưa tải mã nhạc nền.
  expect(await page.evaluate(() => window.__skyline!.audio.state)).toBeNull();
  expect(await musicLoaded(page)).toBe(false);

  // Chạm nút đầu tiên: mở khóa âm thanh, kêu "tách", bảng mở kèm tiếng gió.
  await page.getByTestId('btn-shop').click();
  await expect(page.getByTestId('shop')).toBeVisible();
  await expect.poll(() => audioLog(page)).toEqual(expect.arrayContaining(['click', 'whoosh']));
  await expect.poll(() => page.evaluate(() => window.__skyline!.audio.state)).not.toBeNull();

  // Mua hạt: tiêu vàng.
  await page.getByTestId('buy-seed-rose-5').click();
  await expect.poll(() => audioLog(page)).toContain('coinSpend');
  await page.getByTestId('shop').getByRole('button', { name: 'Đóng' }).click();
  await expect(page.getByTestId('shop')).toBeHidden();

  // Trồng rồi thu hoạch qua lệnh game.
  expect(await dispatch(page, { type: 'plant', floor: 0, slot: 0, plantId: 'rose' })).toEqual({ ok: true });
  await expect.poll(() => audioLog(page)).toContain('plant');
  await page.evaluate(() => window.__skyline!.skip(31));
  expect(await dispatch(page, { type: 'harvest', floor: 0, slot: 0 })).toEqual({ ok: true });
  await expect.poll(() => audioLog(page)).toContain('harvest');

  // Lệnh lỗi (ô đã trống) kêu tiếng báo lỗi.
  expect((await dispatch(page, { type: 'harvest', floor: 0, slot: 0 })).ok).toBe(false);
  await expect.poll(() => audioLog(page)).toContain('error');

  // Sau khi mở khóa, nhạc nền được tải lười thành chunk riêng.
  await expect.poll(() => musicLoaded(page)).toBe(true);
  expect(warnings).toEqual([]);
});

test('tắt tiếng vẫn ghi log hiệu ứng (để test), nút data-sfx="none" thì im', async ({ page }) => {
  await openGame(page);
  await page.getByTestId('chip-settings').click();
  await expect(page.getByTestId('settings')).toBeVisible();
  await page.evaluate(() => window.__skyline!.game.settings.update({ muted: true }));
  const before = (await audioLog(page)).length;
  expect(await dispatch(page, { type: 'plant', floor: 0, slot: 1, plantId: 'rose' })).toEqual({ ok: true });
  await expect.poll(async () => (await audioLog(page)).slice(before)).toContain('plant');

  // Nút có data-sfx="none" thì im; nút thường thì kêu (đối chứng).
  const clicks = async () => (await audioLog(page)).filter((id) => id === 'click').length;
  await page.evaluate(() => {
    for (const sfx of ['none', '']) {
      const button = document.createElement('button');
      if (sfx) button.dataset.sfx = sfx;
      button.dataset.testid = `probe-${sfx || 'plain'}`;
      document.body.append(button);
    }
  });
  const n = await clicks();
  await page.getByTestId('probe-none').dispatchEvent('click');
  expect(await clicks()).toBe(n);
  await page.getByTestId('probe-plain').dispatchEvent('click');
  await expect.poll(clicks).toBe(n + 1);
});

test('chuông khi máy làm xong một mẻ', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    window.__skyline!.setLevel(6);
    window.__skyline!.addGold(5000);
    window.__skyline!.grant({ items: { rose: 8 } });
  });
  expect(await dispatch(page, { type: 'buildMachine', machineId: 'still', floor: 1, slot: 3 })).toEqual({
    ok: true,
  });
  expect(await dispatch(page, { type: 'startJob', floor: 1, slot: 3, recipe: 'rose_water' })).toEqual({
    ok: true,
  });
  expect(await audioLog(page)).not.toContain('machineDone');
  await page.evaluate(() => window.__skyline!.skip(6 * 60));
  await expect.poll(() => audioLog(page)).toContain('machineDone');
});
