/** Sau mỗi tương tác/sự kiện, vẽ đủ tốc độ trong chừng này ms. */
export const WAKE_MS = 1500;
/** Tốc độ vẽ nền khi đang mở bảng (khu vườn bị che phần lớn). */
const PANEL_FPS = 15;
/** Dung sai để 30 fps trên màn 60 Hz vẫn vẽ đều mỗi 2 khung. */
const SLACK_MS = 4;

/**
 * Quyết định khung hình nào cần gọi `renderer.render`. Logic, camera và tween vẫn chạy mỗi rAF
 * (rẻ, giữ vị trí ổn định cho test); chỉ phần vẽ GPU tốn pin là được giãn ra:
 * - state/kích thước đổi → vẽ ngay một lần;
 * - vừa có tương tác, sự kiện hay camera/tween đang chạy → vẽ đủ tốc độ;
 * - chỉ còn chuyển động nền (mây trôi, cây đung đưa) → vẽ ở tốc độ nền theo mức đồ họa;
 * - không có gì động → bỏ qua.
 */
export class FrameScheduler {
  private dirty = true;
  private activeUntil = -Infinity;
  private lastRender = -Infinity;
  private time = 0;
  /** Tốc độ vẽ nền (fps), theo mức đồ họa. */
  ambientFps = 60;
  /** Đang mở bảng che khu vườn. */
  panelOpen = false;
  /** Số khung đã vẽ (cho lớp đo hiệu năng). */
  rendered = 0;

  /** Cảnh cần vẽ lại ở khung tới. */
  invalidate(): void {
    this.dirty = true;
  }

  /** Vẽ đủ tốc độ trong một lúc (tương tác, sự kiện game). */
  wake(ms = WAKE_MS): void {
    this.activeUntil = Math.max(this.activeUntil, this.time + ms);
  }

  /** Gọi mỗi rAF. `animating`: màn còn chuyển động nền. `moving`: camera/tween/hạt đang chạy. */
  shouldRender(time: number, animating: boolean, moving = false): boolean {
    this.time = time;
    if (moving) this.wake();
    let render = false;
    if (this.dirty || time < this.activeUntil) render = true;
    else if (animating) {
      const fps = this.panelOpen ? Math.min(PANEL_FPS, this.ambientFps) : this.ambientFps;
      render = time - this.lastRender >= 1000 / fps - SLACK_MS;
    }
    if (render) {
      this.dirty = false;
      this.lastRender = time;
      this.rendered++;
    }
    return render;
  }
}
