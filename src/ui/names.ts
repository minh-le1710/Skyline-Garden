import {
  POT_STATS,
  potStat,
  type ItemId,
  type MachineId,
  type PlantId,
  type PotId,
  type PotInstance,
  type Rarity,
  type RecipeId,
} from '../game';
import { ITEM_ICON } from './itemIcons';
import { t } from '../i18n';

export const itemName = (id: ItemId): string => t(`item.${id}` as const);
export const plantName = (id: PlantId): string => itemName(id);
export const potName = (id: PotId): string => t(`pot.${id}` as const);
export const rarityName = (r: Rarity): string => t(`rarity.${r}` as const);
export const machineName = (id: MachineId): string => t(`machine.${id}` as const);
/** Tên công thức: hàng chế biến hoặc mẻ đúc chậu. */
export const recipeName = (id: RecipeId): string => t(`item.${id}` as const);
/** Biểu tượng công thức (mẻ đúc chậu dùng hình bình gốm). */
export const recipeIcon = (id: RecipeId): string =>
  id.startsWith('forge_') ? '🏺' : ITEM_ICON[id as ItemId];

/** Dòng chỉ số của một chậu, vd. "+10% XP · −8% thời gian". */
export function potStatsText(pot: PotInstance): string {
  const parts = POT_STATS.filter((k) => potStat(pot, k) > 0).map((k) =>
    t(`stat.${k}` as const, { n: potStat(pot, k) }),
  );
  return parts.length ? parts.join(' · ') : t('pot.bonus.none');
}

/** Thời lượng dễ đọc cho người chơi, vd. "30 giây", "2 phút", "1 giờ 30 phút". */
export function humanDuration(seconds: number): string {
  if (seconds < 60) return t('time.seconds', { n: seconds });
  if (seconds < 3600) return t('time.minutes', { n: Math.round(seconds / 60) });
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m ? t('time.hoursMinutes', { h, m }) : t('time.hours', { n: h });
}
