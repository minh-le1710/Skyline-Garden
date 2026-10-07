import type { Counts, MachineId, MaterialId } from '../types';

export interface MachineDef {
  id: MachineId;
  unlockLevel: number;
  price: number;
}

/** Mỗi loại máy chỉ được sở hữu một chiếc; máy chiếm một ô trên tầng mây. */
export const MACHINES: Record<MachineId, MachineDef> = {
  still: { id: 'still', unlockLevel: 4, price: 600 },
  kettle: { id: 'kettle', unlockLevel: 6, price: 1500 },
  kiln: { id: 'kiln', unlockLevel: 7, price: 1200 },
  roaster: { id: 'roaster', unlockLevel: 8, price: 3000 },
  loom: { id: 'loom', unlockLevel: 11, price: 6000 },
  press: { id: 'press', unlockLevel: 13, price: 9000 },
  oven: { id: 'oven', unlockLevel: 16, price: 15000 },
  atelier: { id: 'atelier', unlockLevel: 21, price: 30000 },
};

export const MACHINE_LIST: MachineDef[] = Object.values(MACHINES);

/** Theo cấp máy (1..5): số mẻ trong hàng đợi và % rút ngắn thời gian. */
export const MACHINE_LEVELS: { queue: number; speedPct: number }[] = [
  { queue: 2, speedPct: 0 },
  { queue: 3, speedPct: 5 },
  { queue: 4, speedPct: 10 },
  { queue: 5, speedPct: 15 },
  { queue: 6, speedPct: 20 },
];
export const MACHINE_MAX_LEVEL = MACHINE_LEVELS.length;

export interface MachineUpgrade {
  /** Nhân với giá máy, làm tròn tới 10. */
  goldMultiplier: number;
  materials: Counts<MaterialId>;
  playerLevel: number;
}

/** MACHINE_UPGRADES[n] nâng máy từ cấp n+1 lên n+2. */
export const MACHINE_UPGRADES: MachineUpgrade[] = [
  { goldMultiplier: 0.6, materials: { cloudclay: 4 }, playerLevel: 1 },
  { goldMultiplier: 1.2, materials: { cloudclay: 6, dewglass: 2 }, playerLevel: 10 },
  { goldMultiplier: 2.4, materials: { dewglass: 5, sunstone: 1 }, playerLevel: 17 },
  { goldMultiplier: 4.8, materials: { sunstone: 3, stardust: 1 }, playerLevel: 24 },
];

export const machineUpgradeGold = (machineId: MachineId, toLevel: number): number =>
  Math.round((MACHINES[machineId].price * (MACHINE_UPGRADES[toLevel - 2]?.goldMultiplier ?? 0)) / 10) * 10;
