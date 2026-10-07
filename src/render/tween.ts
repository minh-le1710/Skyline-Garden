import { reduceMotion } from '../core/motion';

export type Ease = (k: number) => number;

export const linear: Ease = (k) => k;
export const easeOutCubic: Ease = (k) => 1 - (1 - k) ** 3;
export const easeOutBack: Ease = (k) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (k - 1) ** 3 + c1 * (k - 1) ** 2;
};

interface Tween {
  elapsed: number;
  duration: number;
  ease: Ease;
  update: (k: number) => void;
  resolve: () => void;
}

/** Bộ chạy tween tối giản, cập nhật trong vòng lặp render. */
export class Tweens {
  private list: Tween[] = [];

  add(duration: number, update: (k: number) => void, ease: Ease = easeOutCubic): Promise<void> {
    return new Promise((resolve) => {
      // Giảm chuyển động: nhảy thẳng tới trạng thái cuối.
      if (reduceMotion.value) {
        update(1);
        resolve();
        return;
      }
      update(0);
      this.list.push({ elapsed: 0, duration, ease, update, resolve });
    });
  }

  update(dt: number): void {
    if (this.list.length === 0) return;
    const done: Tween[] = [];
    for (const tw of this.list) {
      tw.elapsed += dt;
      const k = Math.min(1, tw.elapsed / tw.duration);
      tw.update(tw.ease(k));
      if (k >= 1) done.push(tw);
    }
    if (done.length) {
      this.list = this.list.filter((tw) => !done.includes(tw));
      for (const tw of done) tw.resolve();
    }
  }
}
