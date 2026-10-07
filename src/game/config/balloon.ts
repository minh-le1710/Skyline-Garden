export const BALLOON_UNLOCK_LEVEL = 10;
/** Khinh khí cầu đậu lại bao lâu. */
export const DOCK_MS = 14 * 3_600_000;
/** Thời gian đi vắng trước chuyến kế tiếp: ngắn hơn nếu đã xếp đủ mọi thùng. */
export const AWAY_COMPLETED_MS = 3 * 3_600_000;
export const AWAY_INCOMPLETE_MS = 6 * 3_600_000;

export const crateCount = (level: number): number => (level >= 22 ? 9 : level >= 15 ? 8 : 6);

/** Tỉ lệ (0..1) thùng chứa hàng chế biến khi người chơi đã có máy. */
export const CRATE_GOODS_SHARE = 0.6;
export const CRATE_GOLD_MULTIPLIER = 2;
export const CRATE_XP_MULTIPLIER = 1.8;

/** Thưởng khi xếp đủ: % tổng vàng các thùng, ruby, vật liệu, cơ hội vật liệu hiếm. */
export const BALLOON_BONUS = {
  goldPct: 25,
  ruby: 2,
  dewglass: 2,
  sunstonePct: 50,
  stardustPct: 10,
};
