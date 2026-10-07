import { expect, openGame, state, test } from './helpers';

test('khinh khí cầu tới khi đủ cấp, xếp thùng rồi cho bay', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.__skyline!.setLevel(12));
  await expect.poll(async () => (await state(page)).balloon.phase).toBe('docked');
  await expect(page.getByTestId('chip-balloon')).toBeVisible();
  const s = await state(page);
  if (s.balloon.phase !== 'docked') throw new Error('chưa đậu');
  const crate = s.balloon.crates[0]!;
  await page.evaluate(
    ([id, qty]) => window.__skyline!.grant({ items: { [id as string]: qty as number } }),
    [crate.id, crate.qty],
  );

  await page.getByTestId('chip-balloon').click();
  await expect(page.getByTestId('balloon')).toBeVisible();
  const goldBefore = (await state(page)).gold;
  await page.getByTestId('fill-crate-0').click();
  let after = await state(page);
  expect(after.balloon.phase === 'docked' && after.balloon.crates[0]!.filled).toBe(true);
  expect(after.gold).toBe(goldBefore + crate.gold);

  await page.getByTestId('send-balloon').click();
  after = await state(page);
  expect(after.balloon.phase).toBe('away');
});
