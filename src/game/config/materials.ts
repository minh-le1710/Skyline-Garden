import type { ConsumableId, MaterialId } from '../types';

/** Thứ tự từ thường tới hiếm. */
export const MATERIAL_TIER: Record<MaterialId, number> = {
  cloudclay: 1,
  dewglass: 2,
  sunstone: 3,
  stardust: 4,
};

export const CONSUMABLE_INFO: Record<ConsumableId, { unlockLevel: number }> = {
  cloudBomb: { unlockLevel: 9 },
  petTreat: { unlockLevel: 5 },
};
