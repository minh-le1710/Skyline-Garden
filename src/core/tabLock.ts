/**
 * Chỉ cho game chạy ở một tab: hai tab cùng lưu sẽ ghi đè tiến độ của nhau.
 * Tab mở sau "giành" khóa; tab cũ nhận lỗi và gọi `onLost` để tạm dừng.
 */
export function holdTabLock(onLost: () => void): void {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  if (!locks) return;
  locks
    .request('skyline-garden/game', { steal: true }, () => new Promise<void>(() => {}))
    .catch(() => onLost());
}
