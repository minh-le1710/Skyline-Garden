import { describe, expect, it } from 'vitest';
import { FrameScheduler, WAKE_MS } from '../src/render/FrameScheduler';
import { AdaptiveDpr, resolveTier } from '../src/render/Quality';

/** Chạy giả lập rAF 60 Hz trong `ms` mili giây, đếm số khung được vẽ. */
function run(s: FrameScheduler, from: number, ms: number, animating: boolean, moving = false): number {
  let count = 0;
  for (let time = from; time < from + ms; time += 1000 / 60) {
    if (s.shouldRender(time, animating, moving)) count++;
  }
  return count;
}

describe('FrameScheduler', () => {
  it('khung đầu luôn vẽ, sau đó không có gì động thì bỏ qua', () => {
    const s = new FrameScheduler();
    expect(s.shouldRender(0, false)).toBe(true);
    expect(run(s, 16, 1000, false)).toBe(0);
  });

  it('invalidate vẽ đúng một lần', () => {
    const s = new FrameScheduler();
    run(s, 0, 100, false);
    s.invalidate();
    expect(run(s, 100, 1000, false)).toBe(1);
  });

  it('chuyển động nền vẽ theo tốc độ nền', () => {
    const s = new FrameScheduler();
    s.ambientFps = 30;
    run(s, 0, 50, true);
    const n = run(s, 50, 1000, true);
    expect(n).toBeGreaterThanOrEqual(28);
    expect(n).toBeLessThanOrEqual(31);
    s.ambientFps = 20;
    const m = run(s, 1050, 1000, true);
    expect(m).toBeGreaterThanOrEqual(19);
    expect(m).toBeLessThanOrEqual(21);
  });

  it('mở bảng thì giảm còn 15 fps', () => {
    const s = new FrameScheduler();
    s.panelOpen = true;
    run(s, 0, 50, true);
    const n = run(s, 50, 1000, true);
    expect(n).toBeGreaterThanOrEqual(14);
    expect(n).toBeLessThanOrEqual(16);
  });

  it('wake vẽ đủ tốc độ trong một lúc rồi trở lại tốc độ nền', () => {
    const s = new FrameScheduler();
    s.ambientFps = 20;
    run(s, 0, 100, true);
    s.wake();
    expect(run(s, 100, WAKE_MS - 50, true)).toBeGreaterThanOrEqual(85);
    expect(run(s, 100 + WAKE_MS + 100, 1000, true)).toBeLessThanOrEqual(21);
  });

  it('camera/hạt đang chạy thì vẽ đủ tốc độ', () => {
    const s = new FrameScheduler();
    s.ambientFps = 20;
    run(s, 0, 100, false);
    expect(run(s, 100, 500, false, true)).toBeGreaterThanOrEqual(29);
  });
});

describe('AdaptiveDpr', () => {
  const feed = (a: AdaptiveDpr, from: number, ms: number, frameMs: number): number[] => {
    const changes: number[] = [];
    for (let time = from; time < from + ms; time += frameMs) {
      const next = a.sample(time, frameMs);
      if (next !== null) changes.push(next);
    }
    return changes;
  };

  it('giật thì giảm 0.25 mỗi 3 giây, không dưới 1', () => {
    const a = new AdaptiveDpr(2);
    expect(feed(a, 0, 3500, 40)).toEqual([1.75]);
    feed(a, 3500, 20_000, 40);
    expect(a.dpr).toBe(1);
  });

  it('mượt đủ 10 giây thì tăng lại, không quá trần', () => {
    const a = new AdaptiveDpr(1.5);
    feed(a, 0, 6500, 40);
    expect(a.dpr).toBe(1);
    const ups = feed(a, 6500, 40_000, 1000 / 60);
    expect(ups).toEqual([1.25, 1.5]);
    expect(a.dpr).toBe(1.5);
  });

  it('bỏ qua khung quá dài (tab ẩn)', () => {
    const a = new AdaptiveDpr(2);
    expect(feed(a, 0, 10_000, 1000)).toEqual([]);
    expect(a.dpr).toBe(2);
  });

  it('đổi trần thì bắt đầu lại từ trần mới', () => {
    const a = new AdaptiveDpr(2);
    feed(a, 0, 3500, 40);
    a.setCap(1);
    expect(a.dpr).toBe(1);
  });
});

describe('resolveTier', () => {
  const desktop = { coarsePointer: false, cores: 8, memoryGb: 8 };
  it('chọn theo cài đặt và thiết bị', () => {
    expect(resolveTier('low', desktop)).toBe('low');
    expect(resolveTier('high', { ...desktop, coarsePointer: true })).toBe('high');
    expect(resolveTier('auto', desktop)).toBe('high');
    expect(resolveTier('auto', { ...desktop, coarsePointer: true })).toBe('medium');
    expect(resolveTier('auto', { ...desktop, cores: 4 })).toBe('medium');
    expect(resolveTier('auto', { ...desktop, memoryGb: 2 })).toBe('medium');
    expect(resolveTier('auto', { coarsePointer: false, cores: undefined, memoryGb: undefined })).toBe('high');
  });
});
