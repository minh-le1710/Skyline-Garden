import { createContext } from 'preact';
import { useContext } from 'preact/hooks';

export interface ScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Cầu nối từ giao diện sang cảnh 3D: vị trí ô trên màn hình và đưa camera tới một tầng. */
export interface Projector {
  slotRect(floor: number, slot: number): ScreenRect;
  focusFloor(floor: number): void;
}

const NONE: Projector = { slotRect: () => ({ x: 0, y: 0, w: 0, h: 0 }), focusFloor: () => {} };

export const ProjectorContext = createContext<Projector>(NONE);
export const useProjector = (): Projector => useContext(ProjectorContext);

/** Hình chữ nhật bao quanh nhiều hình chữ nhật. */
export function unionRect(rects: ScreenRect[]): ScreenRect | null {
  if (!rects.length) return null;
  const x0 = Math.min(...rects.map((r) => r.x));
  const y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.w));
  const y1 = Math.max(...rects.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
