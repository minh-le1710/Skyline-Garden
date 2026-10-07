import type { PotId, Rarity } from '../game';

export { ITEM_ICON } from './itemIcons';
import { ITEM_ICON } from './itemIcons';

/** @deprecated dùng ITEM_ICON */
export const PLANT_ICON = ITEM_ICON;

export const GOLD = '🪙';
export const RUBY = '💎';
export const XP = '⭐';

/** Biểu tượng chậu vẽ bằng CSS; viền màu theo độ hiếm. */
export function PotIcon({ potId, rarity }: { potId: PotId; rarity?: Rarity }) {
  return <span class={`pot-icon pot-${potId} ${rarity ? `rarity-${rarity}` : ''}`} aria-hidden="true" />;
}
