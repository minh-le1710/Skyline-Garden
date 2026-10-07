import { Box3, Vector3 } from 'three';
import { SLOTS_PER_FLOOR } from '../game';

// Bố cục khu vườn trong không gian 3D: các tầng mây xếp dọc theo trục Y, mỗi tầng một hàng chậu theo trục X.
export const FLOOR_SPACING = 4.2;
export const SLOT_SPACING = 1.75;
export const GARDEN_WIDTH = SLOTS_PER_FLOOR * SLOT_SPACING + 0.9;
/** Phần mây nhô xuống dưới mặt tầng. */
export const FLOOR_BOTTOM = -1.3;
/** Khoảng trên mặt tầng dành cho chậu và cây. */
export const FLOOR_TOP = 2.6;

export const floorY = (floor: number): number => floor * FLOOR_SPACING;
export const slotX = (slot: number): number => (slot - (SLOTS_PER_FLOOR - 1) / 2) * SLOT_SPACING;

export const slotPosition = (floor: number, slot: number, out = new Vector3()): Vector3 =>
  out.set(slotX(slot), floorY(floor), 0);

/** Vùng chạm của một ô: rộng bằng cả ô để dễ kéo ngón tay qua trên điện thoại. */
export function slotHitBox(floor: number, slot: number, out = new Box3()): Box3 {
  const x = slotX(slot);
  const y = floorY(floor);
  const half = SLOT_SPACING / 2;
  return out.set(new Vector3(x - half, y - 0.4, -1.2), new Vector3(x + half, y + 2.2, 1.2));
}

export function floorHitBox(floor: number, out = new Box3()): Box3 {
  const y = floorY(floor);
  return out.set(new Vector3(-GARDEN_WIDTH / 2, y - 1, -1.5), new Vector3(GARDEN_WIDTH / 2, y + 2.4, 1.5));
}
