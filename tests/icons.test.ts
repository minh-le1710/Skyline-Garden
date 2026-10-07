import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { ICON_STYLES, SAFE_RADIUS, crc32, encodePng, faviconSvg, renderIcon } from '../build/icons';

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/** Tách các chunk của một file PNG. */
function chunks(png: Uint8Array): { type: string; data: Uint8Array; crc: number }[] {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const out = [];
  for (let at = 8; at < png.length;) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    out.push({ type, data: png.subarray(at + 8, at + 8 + length), crc: view.getUint32(at + 8 + length) });
    at += 12 + length;
  }
  return out;
}

describe('biểu tượng vẽ bằng code', () => {
  it('CRC32 đúng chuẩn', () => {
    expect(crc32(new TextEncoder().encode('IEND'))).toBe(0xae426082);
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('PNG hợp lệ: chữ ký, IHDR đúng kích thước, CRC từng chunk, dữ liệu giải nén đủ', () => {
    const size = 32;
    const png = encodePng(size, size, renderIcon(size, ICON_STYLES.any));
    expect([...png.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
    const list = chunks(png);
    expect(list.map((c) => c.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    for (const c of list) {
      const typed = new Uint8Array(4 + c.data.length);
      typed.set(new TextEncoder().encode(c.type));
      typed.set(c.data, 4);
      expect(crc32(typed)).toBe(c.crc);
    }
    const ihdr = new DataView(list[0]!.data.buffer, list[0]!.data.byteOffset);
    expect([ihdr.getUint32(0), ihdr.getUint32(4)]).toEqual([size, size]);
    // Mỗi hàng: 1 byte bộ lọc + 4 byte mỗi điểm ảnh.
    expect(inflateSync(list[1]!.data).length).toBe(size * (1 + size * 4));
  });

  it('kết quả tất định', () => {
    expect(renderIcon(24, ICON_STYLES.maskable)).toEqual(renderIcon(24, ICON_STYLES.maskable));
  });

  it('biểu tượng thường có góc trong suốt; maskable phủ kín nền', () => {
    const size = 64;
    const any = renderIcon(size, ICON_STYLES.any);
    const mask = renderIcon(size, ICON_STYLES.maskable);
    expect(any[3]).toBe(0);
    expect(mask[3]).toBe(255);
  });

  it('maskable: phần hình nằm gọn trong vòng tròn an toàn 80%', () => {
    const size = 96;
    const full = renderIcon(size, ICON_STYLES.maskable);
    const sky = renderIcon(size, { ...ICON_STYLES.maskable, content: false });
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (x + 0.5) / size - 0.5;
        const dy = (y + 0.5) / size - 0.5;
        if (Math.hypot(dx, dy) <= SAFE_RADIUS) continue;
        const i = (y * size + x) * 4;
        // Ngoài vòng an toàn chỉ có nền trời.
        expect([full[i], full[i + 1], full[i + 2]]).toEqual([sky[i], sky[i + 1], sky[i + 2]]);
      }
    }
  });

  it('favicon SVG có viewBox và không chứa script', () => {
    const svg = faviconSvg();
    expect(svg).toMatch(/^<svg[^>]+viewBox="0 0 100 100"/);
    expect(svg).not.toMatch(/<script/i);
  });
});
