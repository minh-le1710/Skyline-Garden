import { Box3, Raycaster, Vector2, Vector3 } from 'three';
import { MAX_FLOORS, type GameState } from '../game';
import { floorHitBox, slotHitBox } from '../render/layout';
import type { SceneManager } from '../render/SceneManager';

export type PickTarget = { kind: 'slot'; floor: number; slot: number } | { kind: 'locked'; floor: number };

/** Tìm ô (hoặc tầng khóa) dưới ngón tay bằng cách bắn tia vào các hộp va chạm. */
export class Picker {
  private readonly raycaster = new Raycaster();
  private readonly ndc = new Vector2();
  private readonly box = new Box3();
  private readonly hit = new Vector3();

  constructor(private readonly scene: SceneManager) {}

  pick(clientX: number, clientY: number, state: GameState): PickTarget | null {
    const rect = this.scene.canvas.getBoundingClientRect();
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.scene.camera);
    const ray = this.raycaster.ray;

    let best: PickTarget | null = null;
    let bestDistance = Infinity;
    for (let floor = 0; floor < state.floors.length; floor++) {
      if (!ray.intersectBox(floorHitBox(floor, this.box), this.hit)) continue;
      const slots = state.floors[floor]!.slots.length;
      for (let slot = 0; slot < slots; slot++) {
        if (!ray.intersectBox(slotHitBox(floor, slot, this.box), this.hit)) continue;
        const d = this.hit.distanceTo(ray.origin);
        if (d < bestDistance) {
          bestDistance = d;
          best = { kind: 'slot', floor, slot };
        }
      }
    }
    const lockedFloor = state.floors.length;
    if (!best && lockedFloor < MAX_FLOORS && ray.intersectBox(floorHitBox(lockedFloor, this.box), this.hit)) {
      best = { kind: 'locked', floor: lockedFloor };
    }
    return best;
  }
}
