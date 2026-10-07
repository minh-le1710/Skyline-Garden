/**
 * Nâng cấp save cũ. MIGRATIONS[n] đưa save từ version n lên n + 1.
 *
 * Quy tắc:
 * - Mỗi migration tự chứa: chỉ dùng hằng số viết sẵn (literal), KHÔNG import config đang dùng,
 *   vì cân bằng lại game sau này không được làm thay đổi kết quả nâng cấp save cũ.
 * - Chỉ phụ thuộc các trường gameplay, không đọc `lastSeenAt` (trường này khác nhau giữa client và server).
 * - Trước khi tăng SAVE_VERSION: đóng băng fixture của version hiện tại (xem tests/freeze-fixtures.test.ts).
 */
export type RawSave = Record<string, unknown>;

export const MIGRATIONS: Record<number, (raw: RawSave) => RawSave> = {};

/** Nâng `raw` lên `target`. Trả về null nếu thiếu migration. */
export function migrate(raw: RawSave, from: number, target: number): RawSave | null {
  let data = raw;
  for (let v = from; v < target; v++) {
    const step = MIGRATIONS[v];
    if (!step) return null;
    data = { ...step(structuredClone(data)), version: v + 1 };
  }
  return data;
}
