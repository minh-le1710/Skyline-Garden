import { expect, openGame, test } from './helpers';

// Các spec khác chặn service worker; ở đây cho phép để thử cài đặt và chơi offline.
test.use({ serviceWorkers: 'allow' });

test('manifest hợp lệ và các biểu tượng tải được', { tag: '@smoke' }, async ({ page, request }) => {
  await openGame(page);
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBe('manifest.webmanifest');
  const res = await request.get(`/${href}`);
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest).toMatchObject({ name: 'Skyline Garden', display: 'standalone', start_url: './' });
  for (const icon of manifest.icons as { src: string; type: string }[]) {
    const r = await request.get(`/${icon.src}`);
    expect(r.ok(), icon.src).toBe(true);
    expect(r.headers()['content-type']).toContain('image/png');
  }
  const favicon = await request.get('/icons/favicon.svg');
  expect(favicon.ok()).toBe(true);
});

test('CSP có trong trang và không chặn gì khi chơi', { tag: '@smoke' }, async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy/i.test(m.text())) violations.push(m.text());
  });
  await openGame(page);
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("script-src 'self'");
  await page.getByTestId('btn-shop').click();
  await expect(page.getByTestId('shop')).toBeVisible();
  expect(violations).toEqual([]);
});

test(
  'cài service worker xong thì tải lại khi mất mạng vẫn chơi được',
  { tag: '@smoke' },
  async ({ page, context }) => {
    await openGame(page);
    // Lần cài đầu: service worker precache mọi file rồi nhận quyền điều khiển trang.
    await page.waitForFunction(async () => {
      const reg = await navigator.serviceWorker.ready;
      return reg.active?.state === 'activated' && navigator.serviceWorker.controller !== null;
    });
    await expect(page.locator('.toast.success')).toBeVisible();
    const gold = await page.evaluate(() => window.__skyline!.state().gold);

    await context.setOffline(true);
    await page.reload();
    await page.waitForFunction(() => window.__skyline?.ready === true);
    expect(await page.evaluate(() => window.__skyline!.state().gold)).toBe(gold);
    // Nhạc nền (chunk tải lười) cũng đã được precache.
    const cached = await page.evaluate(async () => {
      const keys = await caches.keys();
      const cache = await caches.open(keys.find((k) => k.startsWith('skyline-'))!);
      return (await cache.keys()).map((r) => new URL(r.url).pathname);
    });
    expect(cached.some((p) => /\/assets\/MusicPlayer-[\w-]+\.js$/.test(p))).toBe(true);
    await context.setOffline(false);
  },
);
