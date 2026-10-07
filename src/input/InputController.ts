import { asPot, bestPotUid, isReady, nextUidInStack, type ActionError, type ActionResult } from '../game';
import type { Game, Tool } from '../core/Game';
import type { CameraScroller } from './CameraScroller';
import type { PickTarget, Picker } from './Picker';

/** Di chuyển quá chừng này pixel thì coi là kéo, không phải chạm. */
const TAP_SLOP = 8;

/** Khi kéo qua nhiều chậu, các lỗi này là bình thường (vd. cây chưa chín) nên không báo. */
const DRAG_QUIET: ActionError[] = [
  'SLOT_BUSY',
  'NOT_READY',
  'NO_POT',
  'NOTHING_PLANTED',
  'SLOT_OCCUPIED',
  'NOT_A_POT',
];

type Mode = 'idle' | 'pending' | 'scroll' | 'tool';

/**
 * Điều khiển cảm ứng/chuột trên canvas:
 * - Đang cầm công cụ (hạt, liềm, chậu): nhấn vào ô rồi kéo qua nhiều ô để áp dụng lần lượt.
 * - Không cầm công cụ: kéo để cuộn tầng, chạm để chọn chậu / thu hoạch / mở tầng.
 */
export class InputController {
  private mode: Mode = 'idle';
  private pointerId = -1;
  private startX = 0;
  private startY = 0;
  private lastY = 0;
  private samples: { y: number; t: number }[] = [];
  private visited = new Set<string>();
  private reported = new Set<ActionError>();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly game: Game,
    private readonly picker: Picker,
    private readonly scroller: CameraScroller,
  ) {
    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    canvas.addEventListener('pointerup', (e) => this.onUp(e));
    canvas.addEventListener('pointercancel', (e) => this.onCancel(e));
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.game.ui.tool.value = null;
    });
  }

  private pick(e: PointerEvent): PickTarget | null {
    return this.picker.pick(e.clientX, e.clientY, this.game.state.value);
  }

  private onDown(e: PointerEvent): void {
    if (this.mode !== 'idle') return;
    this.pointerId = e.pointerId;
    this.startX = e.clientX;
    this.startY = this.lastY = e.clientY;
    this.samples = [{ y: e.clientY, t: e.timeStamp }];
    this.canvas.setPointerCapture(e.pointerId);

    const tool = this.game.ui.tool.value;
    const target = this.pick(e);
    if (tool && target?.kind === 'slot') {
      this.mode = 'tool';
      this.visited.clear();
      this.reported.clear();
      this.applyTool(tool, target.floor, target.slot, false);
    } else {
      this.mode = 'pending';
    }
  }

  private onMove(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return;
    if (this.mode === 'tool') {
      const tool = this.game.ui.tool.value;
      const target = this.pick(e);
      if (tool && target?.kind === 'slot') this.applyTool(tool, target.floor, target.slot, true);
      return;
    }
    if (this.mode === 'pending' && Math.hypot(e.clientX - this.startX, e.clientY - this.startY) > TAP_SLOP) {
      this.mode = 'scroll';
      this.scroller.startDrag();
    }
    if (this.mode === 'scroll') {
      this.scroller.dragBy(e.clientY - this.lastY);
      this.lastY = e.clientY;
      this.samples.push({ y: e.clientY, t: e.timeStamp });
      if (this.samples.length > 6) this.samples.shift();
    }
  }

  private onUp(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return;
    if (this.mode === 'pending') this.onTap(this.pick(e));
    if (this.mode === 'scroll') this.scroller.endDrag(this.releaseVelocity(e));
    this.finish(e);
  }

  private onCancel(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return;
    if (this.mode === 'scroll') this.scroller.endDrag(0);
    this.finish(e);
  }

  private finish(e: PointerEvent): void {
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    this.mode = 'idle';
    this.pointerId = -1;
  }

  private releaseVelocity(e: PointerEvent): number {
    const first = this.samples.find((s) => e.timeStamp - s.t < 120) ?? this.samples[0];
    if (!first) return 0;
    const dt = (e.timeStamp - first.t) / 1000;
    return dt > 0.005 ? (e.clientY - first.y) / dt : 0;
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    this.scroller.scrollBy(-e.deltaY);
  }

  private applyTool(tool: Tool, floor: number, slot: number, dragging: boolean): void {
    const key = `${floor}:${slot}`;
    if (this.visited.has(key)) return;
    this.visited.add(key);
    const quiet = dragging ? [...DRAG_QUIET, ...this.reported] : [...this.reported];
    let result: ActionResult;
    if (tool.kind === 'seed') {
      result = this.game.exec({ type: 'plant', floor, slot, plantId: tool.plantId }, { quiet });
    } else if (tool.kind === 'harvest') {
      result = this.game.exec({ type: 'harvest', floor, slot }, { quiet });
    } else {
      // Mỗi ô lấy chiếc kế tiếp trong chồng chậu đang cầm.
      const uid = nextUidInStack(this.game.state.value, tool.stack);
      if (uid === null) return;
      result = this.game.exec({ type: 'placePot', floor, slot, uid }, { quiet });
    }
    // Mỗi loại lỗi chỉ báo một lần trong một lần kéo.
    if (!result.ok) this.reported.add(result.error);
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
    const pot = asPot(content);
    if (pot?.plant && isReady(pot.plant, this.game.clock.now())) {
      ui.selected.value = null;
      this.game.exec({ type: 'harvest', floor, slot });
      return;
    }
    const same = ui.selected.value?.floor === floor && ui.selected.value.slot === slot;
    ui.selected.value = same ? null : { floor, slot };
  }
}
