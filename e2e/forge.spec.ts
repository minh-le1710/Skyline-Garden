import { dispatch, expect, openGame, state, test } from './helpers';

test('đúc chậu ở lò nung, mở chậu rồi đặt từ kho', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    window.__skyline!.setLevel(8);
    window.__skyline!.addGold(20_000);
    window.__skyline!.grant({ items: { cloudclay: 16 } });
  });
  expect(await dispatch(page, { type: 'buildMachine', machineId: 'kiln', floor: 1, slot: 3 })).toEqual({
    ok: true,
  });
  expect(await dispatch(page, { type: 'startJob', floor: 1, slot: 3, recipe: 'forge_basic' })).toEqual({
    ok: true,
  });
  await page.evaluate(() => window.__skyline!.skip(31 * 60));
  expect(await dispatch(page, { type: 'collectMachine', floor: 1, slot: 3 })).toEqual({ ok: true });

  await expect(page.getByTestId('forge-reveal')).toBeVisible();
  await page.getByTestId('forge-reveal').getByRole('button').click();
  const s = await state(page);
  expect(s.potBag).toHaveLength(1);
  expect(s.potBag[0]!.origin).toBe('forge');

  // Mở kho → tab chậu → đặt chậu vừa đúc vào ô trống (1, 4).
  await page.getByTestId('btn-storage').click();
  await page.getByTestId('storage-tab-pots').click();
  await page.getByTestId('pot-card-0').getByRole('button', { name: 'Đặt' }).click();
  await expect(page.getByTestId('tool-banner')).toBeVisible();
  const pos = await page.evaluate(() => window.__skyline!.screenPos({ kind: 'slot', floor: 1, slot: 4 }));
  await page.waitForTimeout(400);
  await page.mouse.click(pos.x, pos.y);
  await expect.poll(async () => (await state(page)).floors[1]!.slots[4]?.kind).toBe('pot');
  const placed = (await state(page)).floors[1]!.slots[4]!;
  expect(placed.kind === 'pot' && placed.origin).toBe('forge');
});
