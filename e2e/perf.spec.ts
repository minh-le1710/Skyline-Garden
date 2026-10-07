import { expect, openGame, test } from './helpers';

const rendered = (page: import('@playwright/test').Page) =>
  page.evaluate(() => window.__skyline!.frameStats().rendered);

test('không tương tác thì chỉ vẽ ở tốc độ nền', async ({ page }) => {
  await openGame(page);
  // Chờ hết đợt vẽ đủ tốc độ sau khi tải.
  await page.waitForTimeout(2000);
  const start = await rendered(page);
  await page.waitForTimeout(2000);
  const idle = (await rendered(page)) - start;
  expect(idle).toBeGreaterThan(0);
  // Điện thoại (pointer: coarse) ở mức "trung bình": 30 fps nền.
  expect(idle).toBeLessThanOrEqual(2 * 32);

  // Có lệnh làm đổi state thì vẽ lại ngay.
  const before = await rendered(page);
  await page.evaluate(() => window.__skyline!.addGold(1));
  await expect.poll(() => rendered(page)).toBeGreaterThan(before);
});

test('8 tầng đầy cây vẫn trong ngân sách draw call', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    const api = window.__skyline!;
    api.setLevel(30);
    api.addGold(1_000_000);
    while (api.state().floors.length < 8) {
      const r = api.dispatch({ type: 'unlockFloor' });
      if (!r.ok) throw new Error(`unlockFloor: ${r.error}`);
    }
    const place = (from: number, to: number) => {
      for (let i = from; i < to; i++) {
        const floor = Math.floor(i / 6);
        const slot = i % 6;
        if (api.state().floors[floor]!.slots[slot]) continue;
        const uid = api.state().potBag[0]!.uid;
        const r = api.dispatch({ type: 'placePot', floor, slot, uid });
        if (!r.ok) throw new Error(`placePot ${floor}:${slot}: ${r.error}`);
      }
    };
    api.grant({ pots: { clay: 30 } });
    place(0, 30);
    api.grant({ pots: { clay: 18 }, seeds: { rose: 48 } });
    place(30, 48);
    for (let i = 0; i < 48; i++) {
      api.dispatch({ type: 'plant', floor: Math.floor(i / 6), slot: i % 6, plantId: 'rose' });
    }
  });
  for (const floor of [0, 3, 7]) {
    await page.evaluate((f) => window.__skyline!.scrollToFloor(f), floor);
    await page.waitForTimeout(300);
    const { calls } = await page.evaluate(() => window.__skyline!.renderInfo());
    expect(calls).toBeLessThanOrEqual(250);
  }
});
