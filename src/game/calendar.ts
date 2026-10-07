/** Ngày trong game tính theo giờ Việt Nam (UTC+7) cố định, giống nhau trên client và server. */
export const DAY_MS = 86_400_000;
export const DAY_OFFSET_MS = 7 * 3_600_000;

/** Số thứ tự ngày (đổi lúc 0 giờ UTC+7). */
export const dayIndex = (t: number): number => Math.floor((t + DAY_OFFSET_MS) / DAY_MS);

/** Thời điểm bắt đầu của một ngày. */
export const dayStart = (day: number): number => day * DAY_MS - DAY_OFFSET_MS;

/** Số thứ tự tuần (bắt đầu thứ Hai). Ngày 0 (1/1/1970) là thứ Năm. */
export const weekIndex = (t: number): number => Math.floor((dayIndex(t) + 3) / 7);

export const msUntilNextDay = (t: number): number => dayStart(dayIndex(t) + 1) - t;
