/** Số đơn trên bảng của Cú theo cấp: 3 lúc đầu, tối đa 6. */
export const orderSlotsForLevel = (level: number): number => Math.min(6, 3 + Math.floor((level - 1) / 2));

/** Thời gian chờ đơn mới sau khi giao hoặc hủy đơn. */
export const ORDER_DELIVER_COOLDOWN_MS = 60_000;
export const ORDER_DISCARD_COOLDOWN_MS = 180_000;

/** Giao đơn lời hơn bán thẳng cho cửa hàng. */
export const ORDER_GOLD_MULTIPLIER = 1.5;
export const ORDER_XP_MULTIPLIER = 1.5;

export const MAX_ITEMS_PER_ORDER = 3;

/** Khoảng số lượng mỗi món, theo thời gian lớn của cây. */
export const orderQtyRange = (growSec: number): [number, number] => {
  if (growSec <= 300) return [2, 6];
  if (growSec <= 1800) return [1, 4];
  return [1, 2];
};
