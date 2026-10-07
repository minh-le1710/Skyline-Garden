import { BufferAttribute, Color, IcosahedronGeometry, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export interface Puff {
  x: number;
  y: number;
  z: number;
  r: number;
  /** Ép dẹt theo trục Y. */
  sy?: number;
}

/**
 * Gộp nhiều quả cầu thành một khối mây (1 draw call).
 * Đỉnh phía trên trắng, phía dưới ngả xanh để có cảm giác khối.
 */
export function cloudGeometry(puffs: Puff[], top: Color, bottom: Color, detail = 2): BufferGeometry {
  const parts = puffs.map((p) => {
    const g = new IcosahedronGeometry(p.r, detail);
    g.scale(1, p.sy ?? 1, 1);
    g.translate(p.x, p.y, p.z);
    return g;
  });
  const merged = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  merged.computeBoundingBox();
  const box = merged.boundingBox!;
  const pos = merged.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const k = (pos.getY(i) - box.min.y) / Math.max(0.001, box.max.y - box.min.y);
    c.copy(bottom).lerp(top, Math.min(1, k * 1.4));
    c.toArray(colors, i * 3);
  }
  merged.setAttribute('color', new BufferAttribute(colors, 3));
  return merged;
}

/** RNG tất định nhỏ để mây có hình dạng cố định giữa các lần tải. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
