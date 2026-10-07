import { computed, signal } from '@preact/signals';
import { forgeReveal, levelUp } from './feedback';

/**
 * Chỉ hiện một hộp thoại lớn mỗi lúc, theo thứ tự ưu tiên; các cái khác chờ tới lượt.
 * (Thông báo chặn game luôn ở trên cùng và không đi qua hàng đợi này.)
 */
export type ModalId = 'levelUp' | 'forgeReveal' | 'login';

/** Quà đăng nhập: chỉ tự mở một lần mỗi phiên chơi. */
export const loginModalOpen = signal(false);

export const activeModal = computed<ModalId | null>(() => {
  if (levelUp.value) return 'levelUp';
  if (forgeReveal.value.length) return 'forgeReveal';
  if (loginModalOpen.value) return 'login';
  return null;
});
