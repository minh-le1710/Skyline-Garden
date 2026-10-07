import { dispatch, expect, openGame, state, test } from './helpers';

test('đạt thành tựu thì báo, chip có huy hiệu và nhận được thưởng', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.__skyline!.setStat('harvests', 49));
  // Trồng rồi thu hoạch một cây: vượt mốc 50 lần thu hoạch.
  expect(await dispatch(page, { type: 'plant', floor: 0, slot: 0, plantId: 'rose' })).toEqual({ ok: true });
  await page.evaluate(() => window.__skyline!.skip(10 * 60));
  expect(await dispatch(page, { type: 'harvest', floor: 0, slot: 0 })).toEqual({ ok: true });
  await expect(page.locator('.toast.success', { hasText: '🏆' })).toBeVisible();

  const chip = page.getByTestId('chip-achievements');
  await expect(chip.locator('.badge')).toHaveText('1');
  await chip.click();
  await expect(page.getByTestId('achievements')).toBeVisible();
  const gold = (await state(page)).gold;
  await page.getByTestId('claim-green_thumb').click();
  await expect.poll(async () => (await state(page)).achievements.green_thumb).toBe(1);
  expect((await state(page)).gold).toBe(gold + 100);
  await expect(chip.locator('.badge')).toHaveCount(0);
  await expect(page.getByTestId('claim-green_thumb')).toBeDisabled();
});
