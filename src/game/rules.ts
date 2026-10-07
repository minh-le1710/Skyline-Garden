import {
  FLOOR_UNLOCKS,
  MAX_FLOORS,
  SLOTS_PER_FLOOR,
  START,
  START_STORAGE,
  STORAGE_UPGRADES,
} from './config/garden';
import { GOODS } from './config/goods';
import { MAX_LEVEL, XP_TABLE } from './config/levels';
import {
  MAX_ITEMS_PER_ORDER,
  ORDER_DELIVER_COOLDOWN_MS,
  ORDER_DISCARD_COOLDOWN_MS,
  ORDER_GOLD_MULTIPLIER,
  ORDER_XP_MULTIPLIER,
} from './config/orders';
import { PLANTS } from './config/plants';
import { POT_BAG_MAX, POT_RESALE_PCT, POT_STAT_CAPS, SHOP_POTS } from './config/pots';
import { LOGIN_GIFTS, QUEST_MATERIAL_CHANCE_PCT, QUEST_UNLOCK_LEVEL, REROLL_RUBY } from './config/daily';
import { FORGES, RARITY_ROLLS, SALVAGE, STAT_WEIGHTS, TIME_STAT_FACTOR } from './config/forge';
import { MACHINES, MACHINE_LEVELS, MACHINE_UPGRADES } from './config/machines';
import { PESTS, PEST_STAY_MAX_MS, PEST_STAY_MIN_MS, PEST_UNLOCK_LEVEL } from './config/pests';
import * as BALLOON from './config/balloon';
import { ACHIEVEMENTS } from './config/achievements';
import { cyrb53, stableStringify } from './hash';
import { SAVE_VERSION } from './state';

/**
 * Phiên bản luật chơi. Tăng bằng tay khi đổi công thức trong code (vd. hàm tính giá) mà bảng config không đổi.
 * Client và server phải cùng RULES_HASH thì mới đồng bộ được.
 */
export const RULES_VERSION = 1;

/** Toàn bộ số liệu cân bằng game. Thêm config mới vào đây để hash phát hiện thay đổi. */
const CONFIG = {
  achievements: ACHIEVEMENTS,
  balloon: { ...BALLOON, crateCount: undefined },
  plants: PLANTS,
  goods: GOODS,
  machines: { MACHINES, MACHINE_LEVELS, MACHINE_UPGRADES },
  forge: { FORGES, RARITY_ROLLS, SALVAGE, STAT_WEIGHTS, TIME_STAT_FACTOR },
  pests: { PESTS, PEST_STAY_MAX_MS, PEST_STAY_MIN_MS, PEST_UNLOCK_LEVEL },
  daily: { LOGIN_GIFTS, QUEST_MATERIAL_CHANCE_PCT, QUEST_UNLOCK_LEVEL, REROLL_RUBY },
  pots: { SHOP_POTS, POT_BAG_MAX, POT_STAT_CAPS, POT_RESALE_PCT },
  garden: { FLOOR_UNLOCKS, MAX_FLOORS, SLOTS_PER_FLOOR, START, START_STORAGE, STORAGE_UPGRADES },
  levels: { MAX_LEVEL, XP_TABLE },
  orders: {
    MAX_ITEMS_PER_ORDER,
    ORDER_DELIVER_COOLDOWN_MS,
    ORDER_DISCARD_COOLDOWN_MS,
    ORDER_GOLD_MULTIPLIER,
    ORDER_XP_MULTIPLIER,
  },
};

export const RULES_HASH = cyrb53(stableStringify({ CONFIG, RULES_VERSION, SAVE_VERSION })).toString(36);
