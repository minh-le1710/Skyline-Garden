import type { Scene } from 'three';
import type { ScreenId } from '../../core/Game';
import type { CameraScroller } from '../../input/CameraScroller';

export type { ScreenId };

/** Cách một màn xử lý cử chỉ (InputController chỉ nhận dạng chạm/kéo rồi giao lại cho màn). */
export interface ScreenInput {
  /** Ngón tay chạm xuống. 'tool': màn giữ lấy cử chỉ kéo (vd. công cụ trồng); 'pending': chờ xem là chạm hay cuộn. */
  begin(x: number, y: number): 'tool' | 'pending';
  /** Kéo khi màn đã giữ cử chỉ. */
  toolMove?(x: number, y: number): void;
  tap(x: number, y: number): void;
}

/** Một màn 3D (vườn, mỏ…) dùng chung renderer và camera. */
export interface Screen {
  readonly id: ScreenId;
  readonly scene: Scene;
  readonly scroller: CameraScroller;
  readonly input: ScreenInput;
  /** Cập nhật mỗi khung. Trả về true nếu còn chuyển động nền (cần vẽ ở tốc độ nền). */
  update(dt: number, now: number, time: number): boolean;
  /** Có thứ đang chuyển động nhanh (hạt, tween, camera trôi) cần vẽ đủ tốc độ. */
  readonly busy: boolean;
  enter(): void;
  exit(): void;
}
