import { reduceMotion } from '../core/motion';
import type { SceneManager } from '../render/SceneManager';

const FRICTION = 4;
const SPRING = 12;
/** Cho phép kéo lố một chút rồi bật lại. */
const OVERSCROLL = 1.5;

export interface ScreenInsets {
  /** Pixel bị HUD che ở trên. */
  top: number;
  /** Pixel bị thanh công cụ che ở dưới. */
  bottom: number;
}

/** Cuộn camera theo chiều dọc qua các tầng mây, có quán tính và giới hạn mềm. */
export class CameraScroller {
  private velocity = 0;
  private dragging = false;
  private initialized = false;
  /** focusY đã lưu khi rời màn (mỗi màn có camera riêng nhưng dùng chung SceneManager). */
  private savedFocus: number | null = null;

  constructor(
    private readonly scene: SceneManager,
    private readonly bounds: () => { bottom: number; top: number },
    private readonly insets: () => ScreenInsets,
    /** Vị trí nhìn lúc đầu; mặc định là đáy khu vực cuộn. */
    private readonly home: (range: { min: number; max: number }) => number = (r) => r.min,
  ) {}

  /** Camera đang trôi theo quán tính hoặc bật lại từ mép. */
  get moving(): boolean {
    if (this.dragging) return true;
    if (this.velocity !== 0) return true;
    const { min, max } = this.range();
    const y = this.scene.focusY;
    return y < min - 0.001 || y > max + 0.001;
  }

  /** Rời màn: nhớ vị trí camera. */
  save(): void {
    this.savedFocus = this.scene.focusY;
    this.velocity = 0;
    this.dragging = false;
  }

  /** Vào lại màn: trả camera về vị trí đã nhớ. */
  restore(): void {
    if (this.savedFocus !== null) this.scene.focusY = this.savedFocus;
    this.scene.updateCamera();
  }

  /** Khoảng focusY hợp lệ để khu vườn nằm trong phần màn hình không bị UI che. */
  range(): { min: number; max: number } {
    const { bottom, top } = this.bounds();
    const half = this.scene.visibleHeight / 2;
    const wpp = this.scene.worldPerPixel;
    const insets = this.insets();
    const min = bottom + half - insets.bottom * wpp;
    const max = top - half + insets.top * wpp;
    // Vừa màn hình thì neo tầng dưới cùng ngay trên thanh công cụ.
    return { min, max: Math.max(min, max) };
  }

  startDrag(): void {
    this.dragging = true;
    this.velocity = 0;
  }

  /** dyPx > 0: ngón tay kéo xuống → nhìn lên các tầng cao hơn. */
  dragBy(dyPx: number): void {
    const { min, max } = this.range();
    let next = this.scene.focusY + dyPx * this.scene.worldPerPixel;
    // Kéo lố ra ngoài thì bị "nặng" dần.
    if (next < min) next = min - Math.min(OVERSCROLL, (min - next) * 0.5);
    if (next > max) next = max + Math.min(OVERSCROLL, (next - max) * 0.5);
    this.scene.focusY = next;
  }

  endDrag(velocityPxPerSec: number): void {
    this.dragging = false;
    // Giảm chuyển động: thả tay là dừng, không trôi theo quán tính.
    this.velocity = reduceMotion.value ? 0 : velocityPxPerSec * this.scene.worldPerPixel;
  }

  scrollBy(dyPx: number): void {
    this.velocity = 0;
    const { min, max } = this.range();
    this.scene.focusY = Math.min(max, Math.max(min, this.scene.focusY + dyPx * this.scene.worldPerPixel));
  }

  scrollTo(y: number): void {
    const { min, max } = this.range();
    this.scene.focusY = Math.min(max, Math.max(min, y));
    this.velocity = 0;
  }

  update(dt: number): void {
    const { min, max } = this.range();
    if (!this.initialized) {
      this.scene.focusY = Math.min(max, Math.max(min, this.home({ min, max })));
      this.initialized = true;
    }
    if (!this.dragging) {
      let y = this.scene.focusY + this.velocity * dt;
      this.velocity *= Math.exp(-FRICTION * dt);
      if (Math.abs(this.velocity) < 0.01) this.velocity = 0;
      const spring = reduceMotion.value ? 1 : Math.min(1, SPRING * dt);
      if (y < min) {
        y += (min - y) * spring;
        this.velocity = Math.max(0, this.velocity);
      } else if (y > max) {
        y += (max - y) * spring;
        this.velocity = Math.min(0, this.velocity);
      }
      this.scene.focusY = y;
    }
    this.scene.updateCamera();
  }
}
