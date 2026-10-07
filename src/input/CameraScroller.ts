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

  constructor(
    private readonly scene: SceneManager,
    private readonly bounds: () => { bottom: number; top: number },
    private readonly insets: () => ScreenInsets,
  ) {}

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
    this.velocity = velocityPxPerSec * this.scene.worldPerPixel;
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
      this.scene.focusY = min;
      this.initialized = true;
    }
    if (!this.dragging) {
      let y = this.scene.focusY + this.velocity * dt;
      this.velocity *= Math.exp(-FRICTION * dt);
      if (Math.abs(this.velocity) < 0.01) this.velocity = 0;
      if (y < min) {
        y += (min - y) * Math.min(1, SPRING * dt);
        this.velocity = Math.max(0, this.velocity);
      } else if (y > max) {
        y += (max - y) * Math.min(1, SPRING * dt);
        this.velocity = Math.min(0, this.velocity);
      }
      this.scene.focusY = y;
    }
    this.scene.updateCamera();
  }
}
