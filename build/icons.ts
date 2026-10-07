// Biểu tượng ứng dụng vẽ bằng code: không cần file ảnh nhị phân trong repo.
// File này KHÔNG import tương đối để Node chạy thẳng được:
//   node --experimental-strip-types build/icons.ts <thư mục>   (ghi toàn bộ biểu tượng ra thư mục đó)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';
import type { Plugin } from 'vite';

// ---------- Hình vẽ (hệ tọa độ 100×100, trục y hướng xuống, giống viewBox của SVG) ----------

type Rgb = readonly [number, number, number];

interface Circle {
  x: number;
  y: number;
  r: number;
}

interface RoundRect {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
}

interface Leaf {
  x: number;
  y: number;
  /** Bán trục dài (dọc phiến lá) và bán trục ngắn. */
  a: number;
  b: number;
  /** Góc xoay (độ), cùng chiều với `rotate()` của SVG. */
  angle: number;
}

/** Cùng màu với bầu trời trong game (SkyBackground, nền body). */
const SKY_STOPS: readonly (readonly [number, string])[] = [
  [0, '#4f9ff0'],
  [0.55, '#a9dcff'],
  [1, '#ffe3ef'],
];
const CORNER_RADIUS = 22;

/** Mây 4 cụm, vẽ theo thứ tự (cụm sau đè cụm trước): hai bên trước, giữa sau. */
const CLOUD: readonly Circle[] = [
  { x: 28, y: 69, r: 12 },
  { x: 73, y: 70, r: 11 },
  { x: 60, y: 64, r: 14 },
  { x: 43, y: 62, r: 15 },
];
const CLOUD_LIGHT = '#ffffff';
const CLOUD_SHADE = '#d3e4f7';

const STEM: RoundRect = { x: 48.2, y: 30, w: 3.6, h: 13, r: 1.8 };
const STEM_COLOR = '#4a9e4e';
/** Hai lá mọc từ đỉnh thân (50, 31). */
const LEAVES: readonly Leaf[] = [
  { x: 42.2, y: 26.5, a: 9, b: 4.5, angle: 30 },
  { x: 58.2, y: 25.3, a: 10, b: 5, angle: -35 },
];
const LEAF_LIGHT = '#7dd87a';
const LEAF_DARK = '#3f9a4a';

/** Thân chậu đất nung: hình thang, miệng rộng đáy hẹp. */
const POT_BODY: readonly (readonly [number, number])[] = [
  [35, 49],
  [65, 49],
  [61, 67],
  [39, 67],
];
const POT_LIGHT = '#ec8c5c';
const POT_DARK = '#c9653c';
const POT_RIM: RoundRect = { x: 32, y: 41, w: 36, h: 8, r: 3 };
const RIM_LIGHT = '#f39a6b';
const RIM_DARK = '#d4703f';

export interface IconStyle {
  /** true: nền phủ kín cả ô vuông (maskable, Apple tự bo góc); false: ô vuông bo góc, góc trong suốt. */
  fullBleed: boolean;
  /** Tỉ lệ thu nhỏ phần hình (mây, chậu, mầm) quanh tâm. */
  scale: number;
  /** false: chỉ vẽ nền (dùng khi test vùng an toàn). */
  content?: boolean;
}

/** Vùng an toàn của biểu tượng maskable: hình tròn đường kính 80% cạnh, tâm ở giữa. */
export const SAFE_RADIUS = 0.4;

export const ICON_STYLES = {
  any: { fullBleed: false, scale: 0.9 },
  // Phần hình xa tâm nhất cách tâm ~41.5 đơn vị: thu về ~33 để nằm gọn trong vòng tròn an toàn (40).
  maskable: { fullBleed: true, scale: 0.8 },
  apple: { fullBleed: true, scale: 0.9 },
} as const satisfies Record<string, IconStyle>;

const rgb = (hex: string): Rgb => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const SKY = SKY_STOPS.map(([offset, hex]) => [offset, rgb(hex)] as const);
const C_CLOUD_LIGHT = rgb(CLOUD_LIGHT);
const C_CLOUD_SHADE = rgb(CLOUD_SHADE);
const C_STEM = rgb(STEM_COLOR);
const C_LEAF_LIGHT = rgb(LEAF_LIGHT);
const C_LEAF_DARK = rgb(LEAF_DARK);
const C_POT_LIGHT = rgb(POT_LIGHT);
const C_POT_DARK = rgb(POT_DARK);
const C_RIM_LIGHT = rgb(RIM_LIGHT);
const C_RIM_DARK = rgb(RIM_DARK);

// Bộ rasterizer lấy hàng triệu mẫu: ghi màu vào mảng tạm thay vì tạo mảng mới mỗi mẫu.
type Out = [number, number, number];

function mixInto(out: Out, a: Rgb, b: Rgb, t: number): void {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  out[0] = a[0] + (b[0] - a[0]) * k;
  out[1] = a[1] + (b[1] - a[1]) * k;
  out[2] = a[2] + (b[2] - a[2]) * k;
}

/** Màu trời theo độ cao v (0 = đỉnh, 1 = đáy), nội suy tuyến tính như linearGradient của SVG. */
function skyInto(out: Out, v: number): void {
  for (let i = 1; i < SKY.length; i++) {
    const [o1, c1] = SKY[i]!;
    const [o0, c0] = SKY[i - 1]!;
    if (v <= o1 || i === SKY.length - 1) {
      mixInto(out, c0, c1, (v - o0) / (o1 - o0));
      return;
    }
  }
}

export function skyColor(v: number): Rgb {
  const out: Out = [0, 0, 0];
  skyInto(out, v);
  return out;
}

// ---------- Hàm khoảng cách có dấu (âm = bên trong) ----------

const sdCircle = (px: number, py: number, c: Circle): number => Math.hypot(px - c.x, py - c.y) - c.r;

function sdRoundRect(px: number, py: number, rect: RoundRect): number {
  const qx = Math.abs(px - (rect.x + rect.w / 2)) - (rect.w / 2 - rect.r);
  const qy = Math.abs(py - (rect.y + rect.h / 2)) - (rect.h / 2 - rect.r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rect.r;
}

/** Các cạnh của đa giác lồi kèm pháp tuyến đơn vị hướng ra ngoài. */
function convexEdges(points: readonly (readonly [number, number])[]) {
  let cx = 0;
  let cy = 0;
  for (const [x, y] of points) {
    cx += x / points.length;
    cy += y / points.length;
  }
  return points.map(([x0, y0], i) => {
    const [x1, y1] = points[(i + 1) % points.length]!;
    const len = Math.hypot(x1 - x0, y1 - y0);
    const nx = (y1 - y0) / len;
    const ny = -(x1 - x0) / len;
    // Pháp tuyến hướng ra ngoài (ngược phía trọng tâm).
    const flip = nx * (cx - x0) + ny * (cy - y0) > 0 ? -1 : 1;
    return { x: x0, y: y0, nx: nx * flip, ny: ny * flip };
  });
}

/** Đa giác lồi: lớn nhất trong các khoảng cách tới từng cạnh (đúng dấu, đủ dùng để lấy mẫu). */
function sdConvex(px: number, py: number, edges: ReturnType<typeof convexEdges>): number {
  let d = -Infinity;
  for (const e of edges) d = Math.max(d, e.nx * (px - e.x) + e.ny * (py - e.y));
  return d;
}

const POT_EDGES = convexEdges(POT_BODY);
const LEAF_FRAMES = LEAVES.map((leaf) => {
  const rad = (leaf.angle * Math.PI) / 180;
  return { ...leaf, cos: Math.cos(rad), sin: Math.sin(rad) };
});

// ---------- Tô màu một điểm mẫu ----------

const BACKGROUND_SQUARE: RoundRect = { x: 0, y: 0, w: 100, h: 100, r: CORNER_RADIUS };

/** Bóng của một cụm mây: sáng ở phía trên-trái, xanh nhạt về mép dưới (giống radialGradient của SVG). */
function cloudInto(out: Out, px: number, py: number, c: Circle): void {
  const fx = c.x - 0.2 * c.r;
  const fy = c.y - 0.4 * c.r;
  const t = Math.hypot(px - fx, py - fy) / (1.6 * c.r);
  mixInto(out, C_CLOUD_LIGHT, C_CLOUD_SHADE, (t - 0.5) / 0.5);
}

/**
 * Màu phần hình tại (x, y) trong hệ tọa độ hình, ghi vào `out`. Trả về false nếu điểm rơi vào nền.
 * Kiểm tra từ lớp trên cùng xuống: miệng chậu, thân chậu, lá, thân cây, mây.
 */
function contentInto(out: Out, x: number, y: number): boolean {
  if (x < 15 || x > 85 || y < 15 || y > 82) return false;
  if (x > 30 && x < 70 && y < 68) {
    if (sdRoundRect(x, y, POT_RIM) <= 0) {
      mixInto(out, C_RIM_LIGHT, C_RIM_DARK, (x - POT_RIM.x) / POT_RIM.w);
      return true;
    }
    if (sdConvex(x, y, POT_EDGES) <= 0) {
      mixInto(out, C_POT_LIGHT, C_POT_DARK, (x - 35) / 30);
      return true;
    }
    for (let i = LEAF_FRAMES.length - 1; i >= 0; i--) {
      const leaf = LEAF_FRAMES[i]!;
      const dx = x - leaf.x;
      const dy = y - leaf.y;
      const u = dx * leaf.cos + dy * leaf.sin;
      const v = -dx * leaf.sin + dy * leaf.cos;
      if ((u / leaf.a) ** 2 + (v / leaf.b) ** 2 <= 1) {
        mixInto(out, C_LEAF_LIGHT, C_LEAF_DARK, (v + leaf.b) / (2 * leaf.b));
        return true;
      }
    }
    if (sdRoundRect(x, y, STEM) <= 0) {
      out[0] = C_STEM[0];
      out[1] = C_STEM[1];
      out[2] = C_STEM[2];
      return true;
    }
  }
  for (let i = CLOUD.length - 1; i >= 0; i--) {
    const c = CLOUD[i]!;
    if (sdCircle(x, y, c) <= 0) {
      cloudInto(out, x, y, c);
      return true;
    }
  }
  return false;
}

/** Màu một điểm mẫu trong hệ 100×100 của biểu tượng, ghi vào `out`. Trả về false nếu điểm trong suốt. */
function sampleInto(out: Out, x: number, y: number, style: IconStyle): boolean {
  if (!style.fullBleed && sdRoundRect(x, y, BACKGROUND_SQUARE) > 0) return false;
  if (style.content !== false && contentInto(out, (x - 50) / style.scale + 50, (y - 50) / style.scale + 50))
    return true;
  skyInto(out, y / 100);
  return true;
}

const SUPERSAMPLE = 4;

/** Vẽ biểu tượng size×size, trả về RGBA 8-bit (alpha không nhân trước). Mỗi pixel lấy trung bình 4×4 mẫu. */
export function renderIcon(size: number, style: IconStyle): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const n = SUPERSAMPLE * SUPERSAMPLE;
  const color: Out = [0, 0, 0];
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let covered = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        const y = ((py + (sy + 0.5) / SUPERSAMPLE) / size) * 100;
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const x = ((px + (sx + 0.5) / SUPERSAMPLE) / size) * 100;
          if (!sampleInto(color, x, y, style)) continue;
          r += color[0];
          g += color[1];
          b += color[2];
          covered++;
        }
      }
      if (covered === 0) continue;
      const i = (py * size + px) * 4;
      out[i] = Math.round(r / covered);
      out[i + 1] = Math.round(g / covered);
      out[i + 2] = Math.round(b / covered);
      out[i + 3] = Math.round((covered / n) * 255);
    }
  }
  return out;
}

// ---------- PNG (RGBA 8-bit) ----------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const PNG_SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Mã hóa ảnh RGBA thành PNG. Mỗi hàng dùng bộ lọc Paeth (nén tốt với nền gradient và mảng màu phẳng). */
export function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    const prev = row - stride;
    const dst = y * (stride + 1);
    raw[dst] = 4;
    for (let i = 0; i < stride; i++) {
      const left = i >= 4 ? rgba[row + i - 4]! : 0;
      const up = y > 0 ? rgba[prev + i]! : 0;
      const upLeft = y > 0 && i >= 4 ? rgba[prev + i - 4]! : 0;
      raw[dst + 1 + i] = (rgba[row + i]! - paeth(left, up, upLeft)) & 0xff;
    }
  }
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8; // 8 bit mỗi kênh
  ihdr[9] = 6; // RGBA
  const parts = [
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array(deflateSync(raw, { level: 9 }))),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

// ---------- SVG (favicon) ----------

const f = (n: number): string => String(Math.round(n * 100) / 100);

/** Cùng các hình như bản PNG, dạng SVG (favicon nét ở mọi kích thước). */
export function faviconSvg(style: IconStyle = ICON_STYLES.any): string {
  const s = style.scale;
  const background = style.fullBleed
    ? '<rect width="100" height="100" fill="url(#sky)"/>'
    : `<rect width="100" height="100" rx="${CORNER_RADIUS}" fill="url(#sky)"/>`;
  const stops = SKY_STOPS.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('');
  const puffs = CLOUD.map((c) => `<circle cx="${f(c.x)}" cy="${f(c.y)}" r="${f(c.r)}" fill="url(#puff)"/>`);
  const leaves = LEAVES.map(
    (l) =>
      `<ellipse cx="${f(l.x)}" cy="${f(l.y)}" rx="${f(l.a)}" ry="${f(l.b)}" transform="rotate(${l.angle} ${f(l.x)} ${f(l.y)})" fill="url(#leaf)"/>`,
  );
  const rect = (r: RoundRect, fill: string) =>
    `<rect x="${f(r.x)}" y="${f(r.y)}" width="${f(r.w)}" height="${f(r.h)}" rx="${f(r.r)}" fill="${fill}"/>`;
  const pot = POT_BODY.map(([x, y]) => `${f(x)},${f(y)}`).join(' ');
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">',
    '<defs>',
    `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">${stops}</linearGradient>`,
    `<radialGradient id="puff" cx=".4" cy=".3" r=".8"><stop offset=".5" stop-color="${CLOUD_LIGHT}"/><stop offset="1" stop-color="${CLOUD_SHADE}"/></radialGradient>`,
    `<linearGradient id="leaf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${LEAF_LIGHT}"/><stop offset="1" stop-color="${LEAF_DARK}"/></linearGradient>`,
    `<linearGradient id="pot"><stop offset="0" stop-color="${POT_LIGHT}"/><stop offset="1" stop-color="${POT_DARK}"/></linearGradient>`,
    `<linearGradient id="rim"><stop offset="0" stop-color="${RIM_LIGHT}"/><stop offset="1" stop-color="${RIM_DARK}"/></linearGradient>`,
    '</defs>',
    background,
    `<g transform="translate(50 50) scale(${s}) translate(-50 -50)">`,
    ...puffs,
    rect(STEM, STEM_COLOR),
    ...leaves,
    `<polygon points="${pot}" fill="url(#pot)"/>`,
    rect(POT_RIM, 'url(#rim)'),
    '</g>',
    '</svg>',
  ].join('');
}

// ---------- Danh sách file và plugin Vite ----------

const png = (size: number, style: IconStyle) => () => encodePng(size, size, renderIcon(size, style));

/** Các file trong thư mục `icons/` của bản build. */
export const ICON_FILES: Readonly<Record<string, () => Uint8Array | string>> = {
  'icon-192.png': png(192, ICON_STYLES.any),
  'icon-512.png': png(512, ICON_STYLES.any),
  'maskable-512.png': png(512, ICON_STYLES.maskable),
  'apple-touch-icon-180.png': png(180, ICON_STYLES.apple),
  'favicon.svg': () => faviconSvg(),
};

// Vẽ PNG 512 mất vài trăm ms: giữ lại trong bộ nhớ (kết quả tất định nên dùng lại giữa các lần build cũng được).
const rendered = new Map<string, Uint8Array | string>();

/** Nội dung một file biểu tượng (đã cache), hoặc null nếu không có file đó. */
export function iconFile(name: string): Uint8Array | string | null {
  const make = Object.hasOwn(ICON_FILES, name) ? ICON_FILES[name] : undefined;
  if (!make) return null;
  let file = rendered.get(name);
  if (file === undefined) {
    file = make();
    rendered.set(name, file);
  }
  return file;
}

const contentType = (name: string): string => (name.endsWith('.svg') ? 'image/svg+xml' : 'image/png');

/** Plugin Vite: phục vụ `/icons/*` khi chạy dev và xuất các file vào `icons/` khi build. */
export function iconsPlugin(): Plugin {
  return {
    name: 'skyline-icons',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const match = /\/icons\/([\w.-]+)$/.exec((req.url ?? '').split('?')[0]!);
        const file = match ? iconFile(match[1]!) : null;
        if (!file) {
          next();
          return;
        }
        res.setHeader('Content-Type', contentType(match![1]!));
        res.setHeader('Cache-Control', 'no-cache');
        res.end(typeof file === 'string' ? file : Buffer.from(file));
      });
    },
    generateBundle() {
      for (const name of Object.keys(ICON_FILES)) {
        this.emitFile({ type: 'asset', fileName: `icons/${name}`, source: iconFile(name)! });
      }
    },
  };
}

// Chạy trực tiếp bằng Node: ghi các biểu tượng ra thư mục được chỉ định.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2] ?? 'icons';
  mkdirSync(dir, { recursive: true });
  for (const name of Object.keys(ICON_FILES)) writeFileSync(join(dir, name), iconFile(name)!);
  console.log(`Đã ghi ${Object.keys(ICON_FILES).length} biểu tượng vào ${dir}/`);
}
