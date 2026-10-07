import { POTS, type PlantId, type PotId } from '../game';
import { t } from '../i18n';

export const plantName = (id: PlantId): string => t(`plant.${id}` as const);
export const potName = (id: PotId): string => t(`pot.${id}` as const);

export function potBonus(id: PotId): string {
  const def = POTS[id];
  if (def.xpBonusPct) return t('pot.bonus.xp', { n: def.xpBonusPct });
  if (def.timeReducePct) return t('pot.bonus.time', { n: def.timeReducePct });
  return t('pot.bonus.none');
}

/** Thời lượng dễ đọc cho người chơi, vd. "30 giây", "2 phút", "1 giờ 30 phút". */
export function humanDuration(seconds: number): string {
  if (seconds < 60) return t('time.seconds', { n: seconds });
  if (seconds < 3600) return t('time.minutes', { n: Math.round(seconds / 60) });
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m ? t('time.hoursMinutes', { h, m }) : t('time.hours', { n: h });
}
