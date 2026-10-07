import {
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  SphereGeometry,
  type BufferGeometry,
  type Material,
} from 'three';
import { toon } from '../materials';

// Mô hình low-poly dựng hoàn toàn bằng code. Hình học dùng chung qua bộ đệm để hàng chục cây không tạo hàng chục bản sao.

const geometries = new Map<string, BufferGeometry>();

export function geo<T extends BufferGeometry>(key: string, make: () => T): T {
  let g = geometries.get(key);
  if (!g) {
    g = make();
    geometries.set(key, g);
  }
  return g as T;
}

export function mesh(geometry: BufferGeometry, material: Material, x = 0, y = 0, z = 0): Mesh {
  const m = new Mesh(geometry, material);
  m.position.set(x, y, z);
  return m;
}

export const C = {
  stem: 0x4f9f3d,
  leaf: 0x67bf4a,
  leafDark: 0x3f8f35,
  sprout: 0x8ad65a,
  trunk: 0x8a5a36,
  soil: 0x6b4429,
};

export const ball = (r: number, color: number, x = 0, y = 0, z = 0): Mesh =>
  mesh(
    geo(`ball${r}`, () => new IcosahedronGeometry(r, 1)),
    toon(color),
    x,
    y,
    z,
  );

export function stem(height: number, radius = 0.035, color = C.stem): Mesh {
  const m = mesh(
    geo(`stem${height}|${radius}`, () => new CylinderGeometry(radius * 0.8, radius, height, 6)),
    toon(color),
  );
  m.position.y = height / 2;
  return m;
}

/** Lá hình bầu dục dẹt. */
export function leaf(length: number, color = C.leaf): Mesh {
  const m = mesh(
    geo('leaf', () => new SphereGeometry(1, 8, 6)),
    toon(color),
  );
  m.scale.set(length, length * 0.18, length * 0.42);
  return m;
}

/** `count` lá xòe đều quanh thân ở độ cao `y`. */
export function addLeaves(
  group: Group,
  y: number,
  length: number,
  count: number,
  tilt = 0.5,
  color = C.leaf,
): void {
  for (let i = 0; i < count; i++) {
    const pivot = new Group();
    pivot.position.y = y + i * 0.05;
    pivot.rotation.y = (i / count) * Math.PI * 2 + 0.4;
    const l = leaf(length, color);
    l.position.x = length * 0.9;
    l.rotation.z = tilt;
    pivot.add(l);
    group.add(pivot);
  }
}
