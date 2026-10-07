import { PLANTS } from './config/plants';
import { POTS } from './config/pots';
import type { PlantId, PotId } from './types';

// Dữ liệu từ bên ngoài (save, server, URL) có thể chứa id lạ như "constructor" hay "__proto__".
// Tra trực tiếp `PLANTS[id]` khi đó sẽ trả về thuộc tính kế thừa của Object, nên luôn kiểm tra bằng hasOwn.

export const isPlantId = (id: unknown): id is PlantId => typeof id === 'string' && Object.hasOwn(PLANTS, id);
export const isPotId = (id: unknown): id is PotId => typeof id === 'string' && Object.hasOwn(POTS, id);

export const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);
export const isNonNegInt = (n: unknown): n is number => isInt(n) && n >= 0;
export const isPositiveInt = (n: unknown): n is number => isInt(n) && n > 0;
