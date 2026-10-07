import { signal } from '@preact/signals-core';

/** Chế độ giảm chuyển động (từ cài đặt). Render và camera đọc để tắt quán tính, hiệu ứng nảy. */
export const reduceMotion = signal(false);
