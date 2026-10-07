import { asPot, bestPotUid, nextUidInStack, type ActionError, type ActionResult } from '../game';
import type { Game, Tool } from '../core/Game';
import type { ScreenInput } from '../render/screens/Screen';
import type { PickTarget, Picker } from './Picker';

/** Khi kéo qua nhiều chậu, các lỗi này là bình thường (vd. cây chưa chín) nên không báo. */
const DRAG_QUIET: ActionError[] = [
  'SLOT_BUSY',
  'NOT_READY',
  'NO_POT',
  'NOTHING_PLANTED',
  'SLOT_OCCUPIED',
  'NOT_A_POT',
  'NOTHING_TO_COLLECT',
];

/**
 * Thao tác trên khu vườn:
 * - Đang cầm công cụ (hạt, liềm, chậu): nhấn vào ô rồi kéo qua nhiều ô để áp dụng lần lượt.
 * - Không cầm công cụ: chạm để chọn chậu / thu hoạch / mở tầng (kéo thì InputController cuộn camera).
 */
export class GardenInput implements ScreenInput {
  private visited = new Set<string>();
  private reported = new Set<ActionError>();

  constructor(
    private readonly game: Game,
    private readonly picker: Picker,
  ) {}

  private pick(x: number, y: number): PickTarget | null {
    return this.picker.pick(x, y, this.game.state.value);
  }

  begin(x: number, y: number): 'tool' | 'pending' {
    const tool = this.game.ui.tool.value;
    const target = this.pick(x, y);
    if (!tool || target?.kind !== 'slot') return 'pending';
    this.visited.clear();
    this.reported.clear();
    this.applyTool(tool, target.floor, target.slot, false);
    return 'tool';
  }

  toolMove(x: number, y: number): void {
    const tool = this.game.ui.tool.value;
    const target = this.pick(x, y);
    if (tool && target?.kind === 'slot') this.applyTool(tool, target.floor, target.slot, true);
  }

  tap(x: number, y: number): void {
    this.onTap(this.pick(x, y));
  }

  private applyTool(tool: Tool, floor: number, slot: number, dragging: boolean): void {
    // Đặt máy và di chuyển chỉ tính lần chạm, không áp dụng dọc đường kéo.
    if (dragging && (tool.kind === 'machine' || tool.kind === 'move')) return;
    const key = `${floor}:${slot}`;
    if (this.visited.has(key)) return;
    this.visited.add(key);
    const quiet = dragging ? [...DRAG_QUIET, ...this.reported] : [...this.reported];
    let result: ActionResult;
    if (tool.kind === 'seed') {
      result = this.game.exec({ type: 'plant', floor, slot, plantId: tool.plantId }, { quiet });
    } else if (tool.kind === 'harvest') {
      result = this.game.exec({ type: 'sweep', floor, slot }, { quiet });
    } else if (tool.kind === 'pot') {
      // Mỗi ô lấy chiếc kế tiếp trong chồng chậu đang cầm.
      const uid = nextUidInStack(this.game.state.value, tool.stack);
      if (uid === null) return;
      result = this.game.exec({ type: 'placePot', floor, slot, uid }, { quiet });
    } else if (tool.kind === 'machine') {
      result = this.game.exec({ type: 'buildMachine', machineId: tool.machineId, floor, slot });
      if (result.ok) this.game.ui.tool.value = null;
    } else {
      this.applyMove(tool.from, floor, slot);
      return;
    }
    // Mỗi loại lỗi chỉ báo một lần trong một lần kéo.
    if (!result.ok) this.reported.add(result.error);
  }

  /** Công cụ di chuyển: lần chạm đầu chọn ô nguồn (phải có chậu/máy), lần sau đổi chỗ với ô đích. */
  private applyMove(from: { floor: number; slot: number } | null, floor: number, slot: number): void {
    const ui = this.game.ui;
    if (!from) {
      if (!this.game.state.value.floors[floor]?.slots[slot]) return;
      ui.tool.value = { kind: 'move', from: { floor, slot } };
      ui.selected.value = { floor, slot };
      return;
    }
    if (from.floor === floor && from.slot === slot) {
      ui.tool.value = null;
      ui.selected.value = null;
      return;
    }
    const r = this.game.exec({
      type: 'swapSlots',
      floor: from.floor,
      slot: from.slot,
      toFloor: floor,
      toSlot: slot,
    });
    if (r.ok) {
      ui.tool.value = null;
      ui.selected.value = null;
    }
  }

  private onTap(target: PickTarget | null): void {
    const ui = this.game.ui;
    if (!target) {
      ui.selected.value = null;
      return;
    }
    if (target.kind === 'locked') {
      ui.selected.value = null;
      ui.panel.value = 'unlock';
      return;
    }
    const { floor, slot } = target;
    const state = this.game.state.value;
    const content = state.floors[floor]?.slots[slot];
    if (!content) {
      // Ô trống: đặt chậu tốt nhất trong kho, nếu không có thì mở cửa hàng chậu.
      ui.selected.value = null;
      const uid = bestPotUid(state);
      if (uid !== null) this.game.exec({ type: 'placePot', floor, slot, uid });
      else this.game.events.emit({ type: 'needPot' });
      return;
    }
    // Chạm vào ô: bắt sâu / thu hoạch nếu có việc; không có việc gì thì chọn ô để xem thông tin.
    const swept = this.game.exec({ type: 'sweep', floor, slot }, { quiet: ['NOT_READY', 'NOTHING_TO_DO'] });
    if (content.kind === 'machine') {
      // Máy: lấy hàng xong (nếu có) rồi mở bảng điều khiển máy.
      ui.selected.value = { floor, slot };
      ui.panel.value = 'machine';
      return;
    }
    if (swept.ok) {
      const pot = asPot(this.game.state.value.floors[floor]?.slots[slot]);
      if (!pot?.plant) ui.selected.value = null;
      return;
    }
    if (swept.error === 'STORAGE_FULL') return;
    const same = ui.selected.value?.floor === floor && ui.selected.value.slot === slot;
    ui.selected.value = same ? null : { floor, slot };
  }
}
