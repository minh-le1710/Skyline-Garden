import { expect, openGame, state, test } from './helpers';

test('quà đăng nhập tự mở một lần và nhận được', { tag: '@smoke' }, async ({ page }) => {
  await openGame(page, '&modals');
  await expect(page.getByTestId('login-modal')).toBeVisible();
  const before = (await state(page)).gold;
  await page.getByTestId('login-modal').getByRole('button').click();
  await expect(page.getByTestId('login-modal')).toBeHidden();
  const s = await state(page);
  expect(s.gold).toBeGreaterThan(before);
  expect(s.daily.loginCount).toBe(1);
});

test('nhiệm vụ ngày: xem, đổi miễn phí, nhận thưởng', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.__skyline!.setLevel(3));
  await expect(page.getByTestId('chip-quests')).toBeVisible();
  await expect.poll(async () => (await state(page)).daily.quests.length).toBe(3);

  await page.getByTestId('chip-quests').click();
  await expect(page.getByTestId('quests')).toBeVisible();
  await page.getByTestId('quest-1').getByRole('button', { name: 'Đổi miễn phí' }).click();
  expect((await state(page)).daily.freeRerollUsed).toBe(true);

  await page.evaluate(() => window.__skyline!.completeQuest(0));
  const goldBefore = (await state(page)).gold;
  await page.getByTestId('claim-quest-0').click();
  const s = await state(page);
  expect(s.daily.quests[0]!.claimed).toBe(true);
  expect(s.gold).toBeGreaterThanOrEqual(goldBefore);
  expect(s.stats.questsCompleted).toBe(1);
});
