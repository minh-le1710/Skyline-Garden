import {
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  IcosahedronGeometry,
  MeshBasicMaterial,
  OctahedronGeometry,
  Shape,
  type Mesh,
} from 'three';
import { Mesh as MeshClass } from 'three';
import type { PlantId } from '../../game';
import { toon } from '../materials';
import { C, addLeaves, ball, geo, leaf, mesh, stem } from './common';

export interface PlantModel {
  /** Mầm non (giai đoạn đầu). */
  sprout: Group;
  /** Thân + lá, hiện ở giai đoạn đang lớn và khi chín. */
  body: Group;
  /** Hoa/quả, chỉ hiện khi chín. */
  bloom: Group;
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
  mint: () => {
    const body = new Group();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const s = new Group();
      s.position.set(Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08);
      s.rotation.set(Math.sin(a) * 0.2, 0, Math.cos(a) * 0.2);
      s.add(stem(0.38, 0.025, 0x4fae6a));
      for (let j = 0; j < 3; j++) {
        for (const side of [-1, 1]) {
          const l = leaf(0.11, 0x5fd38a);
          l.position.set(side * 0.09, 0.12 + j * 0.1, 0);
          l.rotation.z = side * 0.35;
          s.add(l);
        }
      }
      body.add(s);
    }
    const bloom = new Group();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      for (let j = 0; j < 3; j++) {
        bloom.add(
          ball(0.03, 0xc8a2e8, Math.cos(a) * 0.15 + (j - 1) * 0.03, 0.42 + j * 0.03, Math.sin(a) * 0.15),
        );
      }
    }
    return { body, bloom };
  },
  tea: () => {
    const body = new Group();
    const spots = [
      [0, 0.22, 0],
      [0.18, 0.16, 0.05],
      [-0.17, 0.17, 0.06],
      [0.05, 0.18, 0.18],
      [-0.06, 0.16, -0.17],
      [0.12, 0.34, -0.06],
      [-0.1, 0.33, 0.08],
    ];
    spots.forEach(([x, y, z], i) => body.add(ball(0.15, i % 2 ? 0x2f7d3a : 0x3a9146, x, y, z)));
    const bloom = new Group();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const tip = mesh(
        geo('teaTip', () => new ConeGeometry(0.04, 0.12, 5)),
        toon(0x9be36f),
      );
      tip.position.set(Math.cos(a) * 0.17, 0.45, Math.sin(a) * 0.17);
      bloom.add(tip);
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      bloom.add(ball(0.045, 0xffffff, Math.cos(a) * 0.24, 0.28, Math.sin(a) * 0.24));
      bloom.add(ball(0.02, 0xf2c94c, Math.cos(a) * 0.27, 0.29, Math.sin(a) * 0.27));
    }
    return { body, bloom };
  },
  cotton: () => {
    const body = new Group();
    body.add(stem(0.45, 0.045, C.trunk));
    const tips: [number, number, number][] = [];
    for (const side of [-1, 1]) {
      const branch = new Group();
      branch.position.y = 0.4;
      branch.rotation.z = side * 0.6;
      branch.add(stem(0.35, 0.03, C.trunk));
      body.add(branch);
      tips.push([side * 0.2, 0.7, 0]);
    }
    tips.push([0, 0.62, 0.05]);
    addLeaves(body, 0.25, 0.14, 3, 0.4, C.leafDark);
    const bloom = new Group();
    for (const [x, y, z] of tips) {
      bloom.add(
        mesh(
          geo('calyx', () => new ConeGeometry(0.07, 0.08, 6)),
          toon(0x7a4a2a),
          x,
          y - 0.06,
          z,
        ),
      );
      const boll = mesh(
        geo('boll', () => new IcosahedronGeometry(0.11, 1)),
        toon(0xffffff),
        x,
        y + 0.02,
        z,
      );
      boll.scale.set(1.1, 0.9, 1.1);
      bloom.add(boll);
    }
    return { body, bloom };
  },
  lotus: () => {
    const body = new Group();
    const water = mesh(
      geo('water', () => new CylinderGeometry(0.45, 0.45, 0.02, 20)),
      toon(0x6fb9e8),
      0,
      0.01,
    );
    body.add(water);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.3;
      const pad = mesh(
        geo('pad', () => new CylinderGeometry(0.16, 0.16, 0.015, 14, 1, false, 0, 5.6)),
        toon(0x4caf50),
        Math.cos(a) * 0.22,
        0.03,
        Math.sin(a) * 0.22,
      );
      pad.rotation.y = a;
      body.add(pad);
    }
    body.add(stem(0.35, 0.02, 0x4f9f3d));
    const bloom = new Group();
    bloom.position.y = 0.36;
    for (const [ringRadius, count, tilt, color] of [
      [0.08, 6, 0.5, 0xffb3d1],
      [0.05, 5, 0.9, 0xff8fbf],
    ] as const) {
      for (let i = 0; i < count; i++) {
        const pivot = new Group();
        pivot.rotation.y = (i / count) * Math.PI * 2;
        const petal = leaf(0.11, color);
        petal.position.x = ringRadius;
        petal.rotation.z = tilt;
        pivot.add(petal);
        bloom.add(pivot);
      }
    }
    bloom.add(
      mesh(
        geo('pod', () => new CylinderGeometry(0.05, 0.04, 0.05, 10)),
        toon(0xf2c94c),
        0,
        0.04,
      ),
    );
    return { body, bloom };
  },
  cocoa: () => {
    const body = new Group();
    body.add(stem(0.6, 0.07, C.trunk));
    for (let i = 0; i < 5; i++) {
      const pivot = new Group();
      pivot.position.y = 0.58;
      pivot.rotation.y = (i / 5) * Math.PI * 2;
      const l = leaf(0.3, i % 2 ? C.leafDark : C.leaf);
      l.position.x = 0.26;
      l.rotation.z = -0.55;
      pivot.add(l);
      body.add(pivot);
    }
    const bloom = new Group();
    const colors = [0xe8892f, 0xc4561e, 0x8a2a1f];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      const pod = ball(0.08, colors[i]!, Math.cos(a) * 0.09, 0.32 + i * 0.05, Math.sin(a) * 0.09);
      pod.scale.set(0.75, 1.4, 0.75);
      bloom.add(pod);
    }
    return { body, bloom };
  },
  dragonfruit: () => {
    const body = new Group();
    for (let i = 0; i < 3; i++) {
      const arm = new Group();
      arm.rotation.y = (i / 3) * Math.PI * 2;
      for (let j = 0; j < 3; j++) {
        const seg = mesh(
          geo('dfSeg', () => new CylinderGeometry(0.06, 0.07, 0.24, 3)),
          toon(0x3f9b4f),
        );
        seg.position.set(j * 0.09, 0.12 + j * 0.2, 0);
        seg.rotation.z = -0.35 * j;
        arm.add(seg);
      }
      body.add(arm);
    }
    const bloom = new Group();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const fruit = ball(0.08, 0xe0307b, Math.cos(a) * 0.22, 0.62, Math.sin(a) * 0.22);
      fruit.scale.set(0.9, 1.25, 0.9);
      bloom.add(fruit);
      const tip = mesh(
        geo('dfTip', () => new ConeGeometry(0.025, 0.08, 4)),
        toon(0x8fd16b),
      );
      tip.position.set(Math.cos(a) * 0.22, 0.74, Math.sin(a) * 0.22);
      bloom.add(tip);
    }
    return { body, bloom };
  },
  vanilla: () => {
    const body = new Group();
    body.add(stem(0.85, 0.025, 0x8a6a46));
    for (let i = 0; i < 7; i++) {
      // Lá leo xoắn quanh cọc.
      const pivot = new Group();
      pivot.position.y = 0.1 + i * 0.1;
      pivot.rotation.y = i * 1.3;
      const l = leaf(0.12, i % 2 ? C.leaf : C.leafDark);
      l.position.x = 0.1;
      l.rotation.z = 0.25;
      pivot.add(l);
      body.add(pivot);
    }
    const bloom = new Group();
    for (let i = 0; i < 3; i++) {
      const y = 0.4 + i * 0.18;
      const a = i * 2.1;
      const flower = new Group();
      flower.position.set(Math.cos(a) * 0.12, y, Math.sin(a) * 0.12);
      for (let p = 0; p < 3; p++) {
        const petal = leaf(0.06, 0xfff2a8);
        petal.rotation.y = (p / 3) * Math.PI * 2;
        petal.position.x = 0.03;
        flower.add(petal);
      }
      bloom.add(flower);
      const pod = mesh(
        geo('vPod', () => new CapsuleGeometry(0.015, 0.18, 2, 5)),
        toon(0x5b8a3a),
      );
      pod.position.set(-Math.cos(a) * 0.1, y - 0.08, -Math.sin(a) * 0.1);
      bloom.add(pod);
    }
    return { body, bloom };
  },
  starfruit: () => {
    const body = new Group();
    body.add(stem(0.55, 0.07, C.trunk));
    const canopy = ball(0.42, 0x5cae4a, 0, 0.85, 0);
    canopy.scale.set(1.05, 0.8, 1.05);
    body.add(canopy);
    const bloom = new Group();
    const spots = [
      [0.3, 0.72, 0.28],
      [-0.3, 0.8, 0.25],
      [0.05, 0.62, 0.38],
      [0.38, 0.95, 0],
    ];
    for (const [x, y, z] of spots) {
      const star = mesh(geo('starFruit', starFruitGeometry), toon(0xf6d743), x, y, z);
      star.rotation.set(0.3, Math.atan2(x!, z!), 0);
      bloom.add(star);
    }
    return { body, bloom };
  },
};

/** Quả khế: ngôi sao năm cánh được ép dày. */
function starFruitGeometry(): ExtrudeGeometry {
  const shape = new Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.045 : 0.1;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  const g = new ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false });
  g.center();
  return g;
}

export function buildPlant(plantId: PlantId): PlantModel {
  return { sprout: buildSprout(), ...BUILDERS[plantId]() };
}

const sparkleMaterial = new MeshBasicMaterial({ color: 0xffe066 });

/** Ngôi sao nhỏ xoay phía trên cây đã chín. */
export function readySparkle(): Mesh {
  return new MeshClass(
    geo('sparkle', () => new OctahedronGeometry(0.09, 0)),
    sparkleMaterial,
  );
}
