import { dispatch, expect, openGame, slotPosition, state, test } from './helpers';

test('chạm vào cây có sâu để bắt, nhận thưởng', { tag: '@smoke' }, async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    window.__skyline!.setLevel(5);
    window.__skyline!.grant({ seeds: { tea: 2 } });
  });
  expect(await dispatch(page, { type: 'plant', floor: 0, slot: 1, plantId: 'tea' })).toEqual({ ok: true });
  await page.evaluate(() => window.__skyline!.spawnPest(0, 1, 'beetle'));
  const goldBefore = (await state(page)).gold;

  const pos = await slotPosition(page, 0, 1);
  await page.mouse.click(pos.x, pos.y);
  await expect.poll(async () => (await state(page)).stats.pestsCaught).toBe(1);
  const s = await state(page);
  const pot = s.floors[0]!.slots[1]!;
  expect(pot.kind === 'pot' && pot.plant?.pest).toBeNull();
  expect(s.gold).toBeGreaterThan(goldBefore);
  // Bọ cánh cam luôn rơi ít nhất 1 vật liệu.
  expect((s.items.dewglass ?? 0) + (s.items.cloudclay ?? 0)).toBeGreaterThan(0);
});

test('thẻ thông tin chậu báo có sâu và có nút bắt', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    window.__skyline!.setLevel(5);
    window.__skyline!.grant({ seeds: { tea: 1 } });
  });
  await dispatch(page, { type: 'plant', floor: 0, slot: 2, plantId: 'tea' });
  // Chọn chậu trước, rồi mới thả sâu để lần chạm không bắt mất.
  const pos = await slotPosition(page, 0, 2);
  await page.mouse.click(pos.x, pos.y);
  await expect(page.getByTestId('pot-info')).toBeVisible();
  await page.evaluate(() => window.__skyline!.spawnPest(0, 2, 'snail'));
  await expect(page.getByTestId('pot-info')).toContainText('Ốc Sên Mây');
  await page.getByTestId('catch-pest').click();
  await expect(page.getByTestId('catch-pest')).toBeHidden();
  expect((await state(page)).stats.pestsCaught).toBe(1);
});
