/** mulberry32: RNG nhỏ, tất định, seed lưu trong state để test lặp lại được. */
export function nextRandom(seed: number): [value: number, nextSeed: number] {
  const next = (seed + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, next];
}

/** Bọc seed thành một nguồn random có trạng thái, dùng trong một action. */
export class Rng {
  constructor(public seed: number) {}

  next(): number {
    const [value, seed] = nextRandom(this.seed);
    this.seed = seed;
    return value;
  }

  /** Số nguyên trong [min, max]. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(items: readonly T[]): T {
    const item = items[Math.floor(this.next() * items.length)];
    if (item === undefined) throw new Error('pick from empty list');
    return item;
  }
}

/** Tạo seed cho một luồng từ seed gốc và tên luồng (FNV-1a của tên, trộn qua mulberry32). Không được đổi thuật toán. */
export function deriveSeed(master: number, name: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const [value] = nextRandom((master ^ h) >>> 0);
  return (value * 4294967296) >>> 0;
}

/** Seed cho một chuỗi giá trị bất kỳ (vd. NPC theo ngày) mà không tiêu hao luồng nào trong state. */
export function hashSeed(...parts: (string | number)[]): number {
  return deriveSeed(0x9e3779b9, parts.join('|'));
}

/** Chạy `fn` với RNG của một luồng trong state rồi ghi seed mới lại. Sửa trực tiếp `state`. */
export function withRng<T>(state: { rng: Record<string, number> }, stream: string, fn: (rng: Rng) => T): T {
  const rng = new Rng(state.rng[stream] ?? 0);
  const result = fn(rng);
  state.rng[stream] = rng.seed;
  return result;
}
