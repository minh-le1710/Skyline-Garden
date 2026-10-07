import {
  CapsuleGeometry,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  type BufferGeometry,
  type Material,
} from 'three';
import type { PlantId, PotId } from '../game';
import { toon } from './materials';

// Mô hình low-poly dựng hoàn toàn bằng code. Sau này có thể thay bằng file GLTF mà không đổi phần còn lại.

const geometries = new Map<string, BufferGeometry>();
function geo<T extends BufferGeometry>(key: string, make: () => T): T {
  let g = geometries.get(key);
  if (!g) {
    g = make();
    geometries.set(key, g);
  }
  return g as T;
}

function mesh(geometry: BufferGeometry, material: Material, x = 0, y = 0, z = 0): Mesh {
  const m = new Mesh(geometry, material);
  m.position.set(x, y, z);
  return m;
}

const C = {
  stem: 0x4f9f3d,
  leaf: 0x67bf4a,
  leafDark: 0x3f8f35,
  sprout: 0x8ad65a,
  trunk: 0x8a5a36,
  soil: 0x6b4429,
};

// ---------- Chậu ----------

export const POT_HEIGHT = 0.7;

const POT_STYLE: Record<PotId, { body: number; band?: number; rim?: number }> = {
  clay: { body: 0xd9774a },
  ceramic: { body: 0x6aa6e8, band: 0xffffff },
  porcelain: { body: 0xf7f3ec, rim: 0x4a78c8, band: 0x4a78c8 },
};

const potProfile = (): LatheGeometry =>
  new LatheGeometry(
    [
      new Vector2(0, 0),
      new Vector2(0.36, 0),
      new Vector2(0.4, 0.04),
      new Vector2(0.5, POT_HEIGHT - 0.08),
      new Vector2(0.57, POT_HEIGHT - 0.06),
      new Vector2(0.57, POT_HEIGHT),
      new Vector2(0.48, POT_HEIGHT),
    ],
    18,
  );

export function buildPot(potId: PotId): Group {
  const style = POT_STYLE[potId];
  const group = new Group();
  group.add(mesh(geo('pot', potProfile), toon(style.body)));
  const soil = mesh(
    geo('soil', () => new CylinderGeometry(0.47, 0.47, 0.04, 18)),
    toon(C.soil),
    0,
    POT_HEIGHT - 0.06,
  );
  group.add(soil);
  if (style.band) {
    const band = mesh(
      geo('band', () => new TorusGeometry(0.455, 0.03, 6, 24)),
      toon(style.band),
      0,
      POT_HEIGHT * 0.45,
    );
    band.rotation.x = Math.PI / 2;
    group.add(band);
  }
  if (style.rim) {
    const rim = mesh(
      geo('rim', () => new TorusGeometry(0.56, 0.035, 6, 24)),
      toon(style.rim),
      0,
      POT_HEIGHT,
    );
    rim.rotation.x = Math.PI / 2;
    group.add(rim);
  }
  return group;
}

const shadowMaterial = new MeshBasicMaterial({
  color: 0x5b7ba8,
  transparent: true,
  opacity: 0.18,
  depthWrite: false,
});

/** Bóng tròn giả dưới chậu, rẻ hơn nhiều so với shadow map trên điện thoại. */
export function blobShadow(radius = 0.62): Mesh {
  const m = mesh(
    geo(`shadow${radius}`, () => new CircleGeometry(radius, 20)),
    shadowMaterial,
    0,
    0.02,
  );
  m.rotation.x = -Math.PI / 2;
  return m;
}

const markerMaterial = new MeshBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.55,
  depthWrite: false,
});

/** Vòng đánh dấu ô trống chưa có chậu. */
export function emptySlotMarker(): Mesh {
  const m = mesh(
    geo('marker', () => new TorusGeometry(0.42, 0.04, 4, 28)),
    markerMaterial,
    0,
    0.05,
  );
  m.rotation.x = -Math.PI / 2;
  return m;
}

const highlightMaterial = new MeshBasicMaterial({ color: 0xffd84d, transparent: true, opacity: 0.9 });

export function selectionRing(): Mesh {
  const m = mesh(
    geo('select', () => new TorusGeometry(0.66, 0.05, 6, 32)),
    highlightMaterial,
    0,
    0.06,
  );
  m.rotation.x = -Math.PI / 2;
  return m;
}

// ---------- Cây ----------

export interface PlantModel {
  /** Mầm non (giai đoạn đầu). */
  sprout: Group;
  /** Thân + lá, hiện ở giai đoạn đang lớn và khi chín. */
  body: Group;
  /** Hoa/quả, chỉ hiện khi chín. */
  bloom: Group;
}

const ball = (r: number, color: number, x = 0, y = 0, z = 0) =>
  mesh(
    geo(`ball${r}`, () => new IcosahedronGeometry(r, 1)),
    toon(color),
    x,
    y,
    z,
  );

function stem(height: number, radius = 0.035, color = C.stem): Mesh {
  const m = mesh(
    geo(`stem${height}|${radius}`, () => new CylinderGeometry(radius * 0.8, radius, height, 6)),
    toon(color),
  );
  m.position.y = height / 2;
  return m;
}

/** Lá hình bầu dục dẹt. */
function leaf(length: number, color = C.leaf): Mesh {
  const m = mesh(
    geo(`leaf${length}`, () => new SphereGeometry(1, 8, 6)),
    toon(color),
  );
  m.scale.set(length, length * 0.18, length * 0.42);
  return m;
}

function addLeaves(group: Group, y: number, length: number, count: number, tilt = 0.5, color = C.leaf): void {
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

function buildSprout(): Group {
  const g = new Group();
  g.add(stem(0.18, 0.025, C.sprout));
  addLeaves(g, 0.17, 0.11, 2, 0.4, C.sprout);
  return g;
}

function flower(stemHeight: number, leaves: number): Group {
  const body = new Group();
  body.add(stem(stemHeight));
  addLeaves(body, stemHeight * 0.3, 0.16, leaves, 0.45);
  return body;
}

const BUILDERS: Record<PlantId, () => Omit<PlantModel, 'sprout'>> = {
  rose: () => {
    const body = flower(0.62, 3);
    const bloom = new Group();
    bloom.position.y = 0.66;
    bloom.add(ball(0.13, 0xd8344a));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      bloom.add(ball(0.09, 0xe9506a, Math.cos(a) * 0.1, 0.02, Math.sin(a) * 0.1));
    }
    bloom.add(ball(0.06, 0xb02238, 0, 0.1, 0));
    return { body, bloom };
  },
  sunflower: () => {
    const body = flower(0.85, 2);
    const bloom = new Group();
    bloom.position.set(0, 0.88, 0.04);
    bloom.rotation.x = Math.PI / 2 - 0.35;
    bloom.add(
      mesh(
        geo('sfDisc', () => new CylinderGeometry(0.15, 0.15, 0.06, 14)),
        toon(0x6b4423),
      ),
    );
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const petal = leaf(0.11, 0xffc93c);
      petal.position.set(Math.cos(a) * 0.23, 0, Math.sin(a) * 0.23);
      petal.rotation.y = -a;
      bloom.add(petal);
    }
    return { body, bloom };
  },
  strawberry: () => {
    const body = new Group();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      body.add(ball(0.16, i % 2 ? C.leaf : C.leafDark, Math.cos(a) * 0.17, 0.16, Math.sin(a) * 0.17));
    }
    body.add(ball(0.17, C.leaf, 0, 0.27, 0));
    const bloom = new Group();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.6;
      const berry = mesh(
        geo('berry', () => new ConeGeometry(0.075, 0.16, 8)),
        toon(0xe53945),
      );
      berry.position.set(Math.cos(a) * 0.3, 0.1, Math.sin(a) * 0.3);
      berry.rotation.x = Math.PI;
      bloom.add(berry);
      bloom.add(ball(0.035, C.leafDark, berry.position.x, 0.19, berry.position.z));
    }
    return { body, bloom };
  },
  lavender: () => {
    const body = new Group();
    const bloom = new Group();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const h = 0.55 + (i % 3) * 0.1;
      const s = new Group();
      s.rotation.set(Math.sin(a) * 0.25, 0, Math.cos(a) * 0.25);
      s.add(stem(h, 0.02));
      body.add(s);
      const spike = new Group();
      spike.rotation.copy(s.rotation);
      for (let j = 0; j < 5; j++)
        spike.add(ball(0.045, j % 2 ? 0x9b6fd6 : 0xb48ae8, 0, h - 0.04 - j * 0.07, 0));
      bloom.add(spike);
    }
    addLeaves(body, 0.05, 0.14, 4, 0.7, C.leafDark);
    return { body, bloom };
  },
  lily: () => {
    const body = flower(0.7, 3);
    const bloom = new Group();
    bloom.position.y = 0.72;
    for (let i = 0; i < 6; i++) {
      const pivot = new Group();
      pivot.rotation.y = (i / 6) * Math.PI * 2;
      const petal = leaf(0.17, i % 2 ? 0xffc2da : 0xffe3ee);
      petal.position.x = 0.13;
      petal.rotation.z = 0.7;
      pivot.add(petal);
      bloom.add(pivot);
    }
    for (let i = 0; i < 3; i++)
      bloom.add(ball(0.03, 0xf2b630, Math.cos(i * 2.1) * 0.04, 0.1, Math.sin(i * 2.1) * 0.04));
    return { body, bloom };
  },
  apple: () => {
    const body = new Group();
    body.add(stem(0.55, 0.07, C.trunk));
    const canopy = mesh(
      geo('canopy', () => new IcosahedronGeometry(0.42, 0)),
      toon(0x4caf50),
    );
    canopy.position.y = 0.82;
    canopy.scale.set(1, 0.85, 1);
    body.add(canopy);
    body.add(ball(0.24, 0x5cc35a, 0.25, 0.95, 0.1));
    const bloom = new Group();
    const spots = [
      [0.3, 0.78, 0.28],
      [-0.32, 0.86, 0.22],
      [0.05, 0.62, 0.38],
      [-0.12, 1.06, 0.3],
      [0.38, 1.0, -0.05],
    ];
    for (const [x, y, z] of spots) bloom.add(ball(0.075, 0xe63b3b, x, y, z));
    return { body, bloom };
  },
  banana: () => {
    const body = new Group();
    body.add(stem(0.7, 0.07, 0x7d9b45));
    for (let i = 0; i < 5; i++) {
      const pivot = new Group();
      pivot.position.y = 0.68;
      pivot.rotation.y = (i / 5) * Math.PI * 2;
      const frond = leaf(0.32, i % 2 ? C.leaf : 0x7fcf5a);
      frond.position.x = 0.28;
      frond.rotation.z = -0.35;
      pivot.add(frond);
      body.add(pivot);
    }
    const bloom = new Group();
    bloom.position.set(0.1, 0.5, 0.12);
    for (let i = 0; i < 5; i++) {
      const b = mesh(
        geo('banana', () => new CapsuleGeometry(0.03, 0.14, 2, 6)),
        toon(0xf5d33c),
      );
      b.position.set((i - 2) * 0.05, Math.abs(i - 2) * 0.02, 0);
      b.rotation.z = (i - 2) * 0.25;
      bloom.add(b);
    }
    return { body, bloom };
  },
  coconut: () => {
    const body = new Group();
    for (let i = 0; i < 4; i++) {
      const seg = stem(0.25, 0.065 - i * 0.008, i % 2 ? C.trunk : 0x9b6b43);
      seg.position.set(i * 0.025, 0.125 + i * 0.24, 0);
      body.add(seg);
    }
    for (let i = 0; i < 6; i++) {
      const pivot = new Group();
      pivot.position.set(0.1, 1.0, 0);
      pivot.rotation.y = (i / 6) * Math.PI * 2;
      const frond = leaf(0.38, i % 2 ? C.leafDark : C.leaf);
      frond.position.x = 0.32;
      frond.rotation.z = -0.45;
      pivot.add(frond);
      body.add(pivot);
    }
    const bloom = new Group();
    bloom.add(ball(0.08, 0x7a4a2a, 0.18, 0.9, 0.08), ball(0.08, 0x8b5a33, 0.02, 0.88, 0.12));
    bloom.add(ball(0.08, 0x7a4a2a, 0.12, 0.88, -0.1));
    return { body, bloom };
  },
};

export function buildPlant(plantId: PlantId): PlantModel {
  return { sprout: buildSprout(), ...BUILDERS[plantId]() };
}

const sparkleMaterial = new MeshBasicMaterial({ color: 0xffe066 });

/** Ngôi sao nhỏ xoay phía trên cây đã chín. */
export function readySparkle(): Mesh {
  return new Mesh(
    geo('sparkle', () => new OctahedronGeometry(0.09, 0)),
    sparkleMaterial,
  );
}
