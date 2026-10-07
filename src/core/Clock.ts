/**
 * Đồng hồ game. `offsetMs` cho phép tua nhanh khi debug/test; `serverOffsetMs` bù lệch giờ máy so với server.
 * Thời gian trả về không bao giờ lùi so với lần gọi trước, để log lệnh luôn tăng dần.
 */
export class Clock {
  offsetMs = 0;
  serverOffsetMs = 0;
  private last = 0;

  now(): number {
    const t = Date.now() + this.offsetMs + this.serverOffsetMs;
    this.last = Math.max(this.last, t);
    return this.last;
  }

  skip(ms: number): void {
    this.offsetMs += ms;
  }

  /** Dùng khi thay toàn bộ state (chơi lại, nhập save): cho phép thời gian quay về giờ thật. */
  resetMonotonic(): void {
    this.last = 0;
  }
}
