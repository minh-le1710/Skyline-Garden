import { describe, expect, it } from 'vitest';
import { CSP, buildPrecacheList, cacheName, injectCsp, manifest, swSource } from '../build/pwa';

describe('PWA', () => {
  const bundle = [
    'index.html',
    'assets/index-abc.js',
    'assets/three-def.js',
    'assets/MusicPlayer-x.js',
    'sw.js',
  ];

  it('precache gồm khung app và mọi file build (cả chunk tải lười), không trùng, không có sw.js', () => {
    const list = buildPrecacheList([
      ...bundle,
      'icons/icon-192.png',
      'manifest.webmanifest',
      'assets/a.js.map',
    ]);
    expect(list.slice(0, 2)).toEqual(['./', 'index.html']);
    expect(list).toContain('assets/MusicPlayer-x.js');
    expect(list).toContain('icons/icon-192.png');
    expect(list).toContain('manifest.webmanifest');
    expect(list).not.toContain('sw.js');
    expect(list).not.toContain('assets/a.js.map');
    expect(new Set(list).size).toBe(list.length);
    // Đường dẫn tương đối: chạy được trên thư mục con của GitHub Pages.
    expect(list.every((f) => !f.startsWith('/'))).toBe(true);
  });

  it('tên cache theo commit; bản dev thì theo danh sách file', () => {
    const files = buildPrecacheList(bundle);
    expect(cacheName('abc123', files)).toBe('skyline-abc123');
    expect(cacheName('dev', files)).toMatch(/^skyline-dev-[0-9a-f]{10}$/);
    expect(cacheName('dev', files)).not.toBe(cacheName('dev', [...files, 'x.js']));
  });

  it('sw.js là JavaScript hợp lệ, không tự skipWaiting khi cài', () => {
    const src = swSource('skyline-test', buildPrecacheList(bundle));
    expect(() => new Function(src)).not.toThrow();
    expect(src).toContain('"skyline-test"');
    expect(src).toContain("'SKIP_WAITING'");
    // skipWaiting chỉ xuất hiện trong nhánh nhận tin nhắn.
    expect(src.match(/skipWaiting\(\)/g)).toHaveLength(1);
  });

  it('manifest đủ trường cho trình duyệt cài đặt', () => {
    const m = manifest();
    expect(m).toMatchObject({ name: 'Skyline Garden', start_url: './', scope: './', display: 'standalone' });
    expect(m.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable')).toBe(true);
    expect(m.icons.some((i) => i.sizes === '192x192')).toBe(true);
  });

  it('CSP được chèn ngay sau meta charset, trước mọi script', () => {
    const html =
      '<html><head><meta charset="UTF-8" /><script type="module" src="x.js"></script></head></html>';
    const out = injectCsp(html);
    expect(out.indexOf('Content-Security-Policy')).toBeGreaterThan(out.indexOf('charset'));
    expect(out.indexOf('Content-Security-Policy')).toBeLessThan(out.indexOf('<script'));
    expect(CSP).toContain("script-src 'self'");
    expect(CSP).not.toMatch(/script-src[^;]*unsafe/);
  });
});
