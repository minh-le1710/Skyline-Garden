/** Đồng hồ game. `offsetMs` cho phép tua nhanh khi debug/test mà không đụng tới logic. */
export class Clock {
  offsetMs = 0;

  now(): number {
    return Date.now() + this.offsetMs;
  }

  skip(ms: number): void {
    this.offsetMs += ms;
  }
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
