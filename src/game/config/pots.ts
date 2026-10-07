import type { PotId } from '../types';

export interface PotDef {
  id: PotId;
  price: number;
  unlockLevel: number;
  /** % XP cộng thêm khi thu hoạch. */
  xpBonusPct: number;
  /** % thời gian lớn được giảm. */
  timeReducePct: number;
}

export const POTS: Record<PotId, PotDef> = {
  clay: { id: 'clay', price: 20, unlockLevel: 1, xpBonusPct: 0, timeReducePct: 0 },
  ceramic: { id: 'ceramic', price: 120, unlockLevel: 3, xpBonusPct: 20, timeReducePct: 0 },
  porcelain: { id: 'porcelain', price: 300, unlockLevel: 5, xpBonusPct: 0, timeReducePct: 15 },
};

export const POT_LIST: PotDef[] = Object.values(POTS);
