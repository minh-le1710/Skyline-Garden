import type { Game } from '../core/Game';
import type { Screen } from '../render/screens/Screen';

/** Di chuyển quá chừng này pixel thì coi là kéo, không phải chạm. */
const TAP_SLOP = 8;

type Mode = 'idle' | 'pending' | 'scroll' | 'tool';

/**
 * Nhận dạng cử chỉ trên canvas (chạm, kéo cuộn có quán tính, kéo công cụ, lăn chuột, Escape)
 * rồi giao cho màn đang hiển thị: `screen.input` xử lý chạm/công cụ, `screen.scroller` cuộn camera.
 */
export class InputController {
  private mode: Mode = 'idle';
  private pointerId = -1;
  private startX = 0;
  private startY = 0;
  private lastY = 0;
  private samples: { y: number; t: number }[] = [];
  /** Màn nhận cử chỉ đang diễn ra (giữ nguyên dù màn đổi giữa chừng). */
  private screen: Screen | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly game: Game,
    private readonly active: () => Screen | null,
    private readonly onActivity: () => void = () => {},
  ) {
    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    canvas.addEventListener('pointerup', (e) => this.onUp(e));
    canvas.addEventListener('pointercancel', (e) => this.onCancel(e));
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.game.ui.tool.value = null;
    });
  }

  private onDown(e: PointerEvent): void {
    this.onActivity();
    const screen = this.active();
    if (this.mode !== 'idle' || !screen) return;
    this.screen = screen;
    this.pointerId = e.pointerId;
    this.startX = e.clientX;
    this.startY = this.lastY = e.clientY;
    this.samples = [{ y: e.clientY, t: e.timeStamp }];
    this.canvas.setPointerCapture(e.pointerId);
    this.mode = screen.input.begin(e.clientX, e.clientY);
  }

  private onMove(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId || !this.screen) return;
    this.onActivity();
    if (this.mode === 'tool') {
      this.screen.input.toolMove?.(e.clientX, e.clientY);
      return;
    }
    if (this.mode === 'pending' && Math.hypot(e.clientX - this.startX, e.clientY - this.startY) > TAP_SLOP) {
      this.mode = 'scroll';
      this.screen.scroller.startDrag();
    }
    if (this.mode === 'scroll') {
      this.screen.scroller.dragBy(e.clientY - this.lastY);
      this.lastY = e.clientY;
      this.samples.push({ y: e.clientY, t: e.timeStamp });
      if (this.samples.length > 6) this.samples.shift();
    }
  }

  private onUp(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId || !this.screen) return;
    this.onActivity();
    if (this.mode === 'pending') this.screen.input.tap(e.clientX, e.clientY);
    if (this.mode === 'scroll') this.screen.scroller.endDrag(this.releaseVelocity(e));
    this.finish(e);
  }

  private onCancel(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId || !this.screen) return;
    if (this.mode === 'scroll') this.screen.scroller.endDrag(0);
    this.finish(e);
  }

  private finish(e: PointerEvent): void {
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    this.mode = 'idle';
    this.pointerId = -1;
    this.screen = null;
  }

  private releaseVelocity(e: PointerEvent): number {
    const first = this.samples.find((s) => e.timeStamp - s.t < 120) ?? this.samples[0];
    if (!first) return 0;
    const dt = (e.timeStamp - first.t) / 1000;
    return dt > 0.005 ? (e.clientY - first.y) / dt : 0;
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    this.onActivity();
    this.active()?.scroller.scrollBy(-e.deltaY);
  }
}
