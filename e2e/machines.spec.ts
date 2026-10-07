import { expect, openGame, slotPosition, state, test } from './helpers';

test('mua máy, làm nước hoa hồng, lấy hàng và bán', { tag: '@smoke' }, async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    window.__skyline!.setLevel(6);
    window.__skyline!.addGold(5000);
    window.__skyline!.grant({ items: { rose: 8 } });
  });

  // Mua nồi chưng hương ở cửa hàng rồi chạm vào ô trống để đặt.
  await page.getByTestId('btn-shop').click();
  await page.getByTestId('shop-tab-machines').click();
  await page.getByTestId('buy-machine-still').click();
  await expect(page.getByTestId('tool-banner')).toContainText('Nồi chưng hương');
  let pos = await slotPosition(page, 1, 3);
  await page.mouse.click(pos.x, pos.y);
  await expect.poll(async () => (await state(page)).floors[1]!.slots[3]?.kind).toBe('machine');

  // Chạm vào máy để mở bảng, làm hai mẻ nước hoa hồng.
  pos = await slotPosition(page, 1, 3);
  await page.mouse.click(pos.x, pos.y);
  await expect(page.getByTestId('machine-panel')).toBeVisible();
  await page.getByTestId('start-rose_water').click();
  await page.getByTestId('start-rose_water').click();
  let s = await state(page);
  const machine = s.floors[1]!.slots[3]!;
  expect(machine.kind === 'machine' && machine.queue).toHaveLength(2);
  expect(s.items.rose).toBeUndefined();
  await page.getByTestId('machine-panel').getByRole('button', { name: 'Đóng' }).click();

  // Tua 11 phút, chạm vào máy để lấy cả hai mẻ.
  await page.evaluate(() => window.__skyline!.skip(11 * 60));
  pos = await slotPosition(page, 1, 3);
  await page.mouse.click(pos.x, pos.y);
  await expect.poll(async () => (await state(page)).items.rose_water).toBe(2);
  await page.getByTestId('machine-panel').getByRole('button', { name: 'Đóng' }).click();

  // Bán ở tab hàng hóa.
  await page.getByTestId('btn-storage').click();
  await page.getByTestId('storage-tab-goods').click();
  const goldBefore = (await state(page)).gold;
  await page.getByTestId('sell-all-rose_water').click();
  s = await state(page);
  expect(s.items.rose_water).toBeUndefined();
  expect(s.gold).toBeGreaterThan(goldBefore);
});

test('di chuyển máy sang ô khác', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    window.__skyline!.setLevel(6);
    window.__skyline!.addGold(5000);
    window.__skyline!.dispatch({ type: 'buildMachine', machineId: 'kettle', floor: 1, slot: 4 });
  });
  let pos = await slotPosition(page, 1, 4);
  await page.mouse.click(pos.x, pos.y);
  await page
    .getByTestId('machine-panel')
    .getByRole('button', { name: /Di chuyển/ })
    .click();
  await expect(page.getByTestId('tool-banner')).toContainText('ô muốn chuyển tới');
  pos = await slotPosition(page, 1, 5);
  await page.mouse.click(pos.x, pos.y);
  await expect.poll(async () => (await state(page)).floors[1]!.slots[5]?.kind).toBe('machine');
  expect((await state(page)).floors[1]!.slots[4]).toBeNull();
});
