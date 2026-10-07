// PWA tự viết (không dùng vite-plugin-pwa/workbox): manifest, service worker có danh sách precache, CSP.
import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';

export const SW_FILE = 'sw.js';
export const MANIFEST_FILE = 'manifest.webmanifest';
const CACHE_PREFIX = 'skyline-';

/**
 * CSP chỉ gắn vào bản build (dev server của Vite cần script inline cho HMR).
 * style-src cần 'unsafe-inline' cho thuộc tính style của Preact; connect-src mở https và localhost cho server online.
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'self' https: http://localhost:* ws://localhost:*",
  "worker-src 'self'",
  "manifest-src 'self'",
].join('; ');

export function manifest() {
  return {
    name: 'Skyline Garden',
    short_name: 'Skyline',
    description: 'Trồng cây trên những tầng mây, thu hoạch, giao đơn hàng và mở rộng khu vườn.',
    lang: 'vi',
    start_url: './',
    scope: './',
    id: './',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#a9dcff',
    theme_color: '#7fbff5',
    categories: ['games'],
    icons: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

/**
 * Danh sách precache: `./` và `index.html` trước, rồi mọi file của bản build (kể cả chunk tải lười,
 * CSS, biểu tượng, manifest), sắp xếp để kết quả tất định. Bỏ chính sw.js, sourcemap và file ẩn.
 * Đường dẫn tương đối: service worker giải chúng theo scope, nên bản build chạy được ở thư mục con.
 */
export function buildPrecacheList(bundleFileNames: Iterable<string>): string[] {
  const files = new Set<string>();
  for (const raw of bundleFileNames) {
    const name = raw.replace(/^\.?\//, '');
    if (!name || name === SW_FILE || name.endsWith('.map') || name.startsWith('.')) continue;
    files.add(name);
  }
  files.delete('index.html');
  return ['./', 'index.html', ...[...files].sort()];
}

/**
 * Tên cache theo mã commit. Bản build tại máy (SHA là 'dev') thì thêm mã băm của danh sách file,
 * để bản cập nhật không ghi chồng lên cache mà service worker cũ đang dùng.
 */
export function cacheName(buildSha: string, files: readonly string[]): string {
  if (buildSha !== 'dev') return CACHE_PREFIX + buildSha;
  const hash = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 10);
  return `${CACHE_PREFIX}dev-${hash}`;
}

/** Mã nguồn sw.js. Không tự skipWaiting: bản mới chỉ thay bản cũ khi người chơi bấm "Tải lại". */
export function swSource(cache: string, files: readonly string[]): string {
  return `// Service worker của Skyline Garden, sinh lúc build bởi build/pwa.ts. Đừng sửa tay.
const CACHE = ${JSON.stringify(cache)};
const PREFIX = ${JSON.stringify(CACHE_PREFIX)};
const PRECACHE = ${JSON.stringify(files)};
const SCOPE = self.registration.scope;
const toUrl = (path) => new URL(path, SCOPE).href;
const SHELL = toUrl('index.html');

self.addEventListener('install', (event) => {
  // cache: 'reload' bỏ qua cache HTTP để không precache nhầm bản cũ.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((path) => new Request(toUrl(path), { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith(PREFIX) && key !== CACHE).map((key) => caches.delete(key)));
      // Lần cài đầu, trang đang mở chưa có service worker nào điều khiển: nhận luôn để chơi offline được ngay.
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/** Mở một trang (không phải file như .png, .json): trả về khung ứng dụng index.html. */
function isAppPage(request, url) {
  if (request.mode !== 'navigate') return false;
  const last = url.pathname.slice(url.pathname.lastIndexOf('/') + 1);
  return !last.includes('.') || last.endsWith('.html');
}

async function appShell(request) {
  const cache = await caches.open(CACHE);
  return (await cache.match(SHELL)) || fetch(request);
}

async function cacheFirst(event, request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  // Chỉ lưu phản hồi đầy đủ, cùng nguồn (bỏ qua opaque, lỗi, phản hồi một phần).
  if (response.status === 200 && response.type === 'basic' && !request.headers.has('range')) {
    event.waitUntil(cache.put(request, response.clone()).catch(() => {}));
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Khác nguồn và API server: luôn đi mạng, service worker không can thiệp.
  if (url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  event.respondWith(isAppPage(request, url) ? appShell(request) : cacheFirst(event, request));
});
`;
}

/** Chèn thẻ CSP ngay sau `<meta charset>` (phải đứng trước mọi script). */
export function injectCsp(html: string): string {
  const tag = `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`;
  const charset = /<meta charset=[^>]*>/i;
  if (charset.test(html)) return html.replace(charset, (m) => `${m}\n    ${tag}`);
  return html.replace(/<head>/i, (m) => `${m}\n    ${tag}`);
}

const manifestJson = (): string => JSON.stringify(manifest(), null, 2) + '\n';

/**
 * Plugin PWA: khi build thì xuất manifest.webmanifest, sw.js và gắn CSP vào index.html;
 * khi chạy dev chỉ phục vụ manifest (không đăng ký service worker ở dev).
 * Không dùng cho bản native (Capacitor tự đóng gói file, không cần service worker).
 */
export function pwaPlugin({ buildSha }: { buildSha: string }): Plugin[] {
  return [
    {
      name: 'skyline-pwa-dev',
      apply: 'serve',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if ((req.url ?? '').split('?')[0]!.endsWith(`/${MANIFEST_FILE}`)) {
            res.setHeader('Content-Type', 'application/manifest+json');
            res.end(manifestJson());
            return;
          }
          next();
        });
      },
    },
    {
      name: 'skyline-pwa',
      apply: (_config, env) => env.command === 'build' && env.mode !== 'native',
      enforce: 'post',
      transformIndexHtml: { order: 'post', handler: injectCsp },
      generateBundle: {
        // Chạy sau cùng để thấy mọi file đã xuất (chunk, CSS, biểu tượng, index.html).
        order: 'post',
        handler(_options, bundle) {
          this.emitFile({ type: 'asset', fileName: MANIFEST_FILE, source: manifestJson() });
          const files = buildPrecacheList([...Object.keys(bundle), MANIFEST_FILE]);
          this.emitFile({
            type: 'asset',
            fileName: SW_FILE,
            source: swSource(cacheName(buildSha, files), files),
          });
        },
      },
    },
  ];
}
