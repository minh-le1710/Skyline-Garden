import {
  FLOOR_UNLOCKS,
  MAX_FLOORS,
  SLOTS_PER_FLOOR,
  START,
  START_STORAGE,
  STORAGE_UPGRADE_STEP,
} from './config/garden';
import { MAX_LEVEL } from './config/levels';
import {
  MAX_ITEMS_PER_ORDER,
  ORDER_DELIVER_COOLDOWN_MS,
  ORDER_DISCARD_COOLDOWN_MS,
  ORDER_GOLD_MULTIPLIER,
  ORDER_XP_MULTIPLIER,
} from './config/orders';
import { PLANTS } from './config/plants';
import { POTS } from './config/pots';
import { cyrb53, stableStringify } from './hash';
import { SAVE_VERSION } from './state';

/**
 * Phiên bản luật chơi. Tăng bằng tay khi đổi công thức trong code (vd. hàm tính giá) mà bảng config không đổi.
 * Client và server phải cùng RULES_HASH thì mới đồng bộ được.
 */
export const RULES_VERSION = 1;

/** Toàn bộ số liệu cân bằng game. Thêm config mới vào đây để hash phát hiện thay đổi. */
const CONFIG = {
  plants: PLANTS,
  pots: POTS,
  garden: { FLOOR_UNLOCKS, MAX_FLOORS, SLOTS_PER_FLOOR, START, START_STORAGE, STORAGE_UPGRADE_STEP },
  levels: { MAX_LEVEL },
  orders: {
    MAX_ITEMS_PER_ORDER,
    ORDER_DELIVER_COOLDOWN_MS,
    ORDER_DISCARD_COOLDOWN_MS,
    ORDER_GOLD_MULTIPLIER,
    ORDER_XP_MULTIPLIER,
  },
};

export const RULES_HASH = cyrb53(stableStringify({ CONFIG, RULES_VERSION, SAVE_VERSION })).toString(36);
