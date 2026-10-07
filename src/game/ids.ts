import { GOODS } from './config/goods';
import { ITEMS, isBarnItem } from './config/items';
import { PLANTS } from './config/plants';
import {
  MACHINE_IDS,
  POT_IDS,
  RARITIES,
  type BarnItemId,
  type GoodId,
  type ItemId,
  type MachineId,
  type PlantId,
  type PotId,
  type Rarity,
} from './types';

// Dữ liệu từ bên ngoài (save, server, URL) có thể chứa id lạ như "constructor" hay "__proto__".
// Tra trực tiếp `PLANTS[id]` khi đó sẽ trả về thuộc tính kế thừa của Object, nên luôn kiểm tra bằng hasOwn.

const has = (record: object, id: unknown): boolean => typeof id === 'string' && Object.hasOwn(record, id);
const inList = (list: readonly string[], id: unknown): boolean => typeof id === 'string' && list.includes(id);

export const isPlantId = (id: unknown): id is PlantId => has(PLANTS, id);
export const isGoodId = (id: unknown): id is GoodId => has(GOODS, id);
export const isItemId = (id: unknown): id is ItemId => has(ITEMS, id);
export const isBarnItemId = (id: unknown): id is BarnItemId => isItemId(id) && isBarnItem(id);
export const isPotId = (id: unknown): id is PotId => inList(POT_IDS, id);
export const isMachineId = (id: unknown): id is MachineId => inList(MACHINE_IDS, id);
export const isRarity = (id: unknown): id is Rarity => inList(RARITIES, id);

export const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);
export const isNonNegInt = (n: unknown): n is number => isInt(n) && n >= 0;
export const isPositiveInt = (n: unknown): n is number => isInt(n) && n > 0;
