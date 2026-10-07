/** JSON với khóa đã sắp xếp: cùng dữ liệu luôn cho cùng chuỗi, bất kể thứ tự thêm khóa. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && Object.is(value, -0)) return '0';
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/** cyrb53: hash 53-bit nhanh, đủ để phát hiện lệch dữ liệu (không dùng cho bảo mật). */
export function cyrb53(text: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** Hash của state để client và server so khớp sau khi đồng bộ. Bỏ qua `lastSeenAt` (chỉ là thời điểm lưu). */
export function stateHash(state: object): string {
  const { lastSeenAt: _ignored, ...rest } = state as Record<string, unknown>;
  return cyrb53(stableStringify(rest)).toString(36);
}
