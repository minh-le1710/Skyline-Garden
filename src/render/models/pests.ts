import {
  CanvasTexture,
  CapsuleGeometry,
  CylinderGeometry,
  Group,
  MeshBasicMaterial,
  SRGBColorSpace,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  DoubleSide,
} from 'three';
import type { PestId } from '../../game';
import { toon } from '../materials';
import { ball, geo, mesh } from './common';

/** Một con sâu có hoạt ảnh riêng. Kích thước cố ý phóng to để dễ chạm trên điện thoại. */
export interface PestModel {
  root: Group;
  animate(time: number): void;
}

function antenna(x: number): Group {
  const g = new Group();
  const stalk = mesh(
    geo('antenna', () => new CylinderGeometry(0.008, 0.008, 0.12, 4)),
    toon(0x2e5a24),
    0,
    0.06,
  );
  g.add(stalk, ball(0.02, 0x2e5a24, 0, 0.12, 0));
  g.position.x = x;
  g.rotation.z = -x * 4;
  return g;
}

function caterpillar(): PestModel {
  const root = new Group();
  const parts = [0.085, 0.08, 0.072, 0.064, 0.055].map((r, i) =>
    ball(r, i === 0 ? 0x7cc043 : i % 2 ? 0x9ad65a : 0x86c94e, -i * 0.1, r, 0),
  );
  root.add(...parts);
  const head = new Group();
  head.position.set(0, 0.16, 0);
  head.add(antenna(-0.03), antenna(0.03));
  head.add(ball(0.018, 0x222222, 0.06, -0.02, 0.05), ball(0.018, 0x222222, 0.06, -0.02, -0.05));
  root.add(head);
  return {
    root,
    animate: (t) => parts.forEach((p, i) => (p.position.y = 0.08 + Math.sin(t * 6 - i * 0.9) * 0.025)),
  };
}

function snail(): PestModel {
  const root = new Group();
  const body = mesh(
    geo('snailBody', () => new CapsuleGeometry(0.05, 0.22, 3, 8)),
    toon(0xc9b28a),
    0,
    0.05,
  );
  body.rotation.z = Math.PI / 2;
  root.add(body);
  const shell = new Group();
  shell.position.set(-0.02, 0.15, 0);
  shell.add(
    mesh(
      geo('shellOuter', () => new TorusGeometry(0.08, 0.045, 8, 16)),
      toon(0xe6a15a),
    ),
  );
  shell.add(
    mesh(
      geo('shellInner', () => new TorusGeometry(0.035, 0.025, 6, 12)),
      toon(0xc9743a),
      0,
      0,
      0.02,
    ),
  );
  root.add(shell);
  root.add(antenna(0.13));
  return { root, animate: (t) => (root.position.x = Math.sin(t * 0.8) * 0.04) };
}

function beetle(): PestModel {
  const root = new Group();
  const shell = mesh(
    geo('beetleShell', () => new SphereGeometry(0.12, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)),
    toon(0x22a38f),
    0,
    0.03,
  );
  shell.scale.set(1.2, 0.9, 1);
  root.add(shell);
  root.add(
    mesh(
      geo('beetleSeam', () => new CylinderGeometry(0.004, 0.004, 0.26, 3)),
      toon(0x0d4f44),
      0,
      0.13,
      0,
    ),
  );
  root.children.at(-1)!.rotation.z = Math.PI / 2;
  root.add(ball(0.05, 0x1b3d36, 0.15, 0.05, 0));
  const legs: Group[] = [];
  for (let i = 0; i < 6; i++) {
    const leg = new Group();
    leg.position.set(-0.07 + (i % 3) * 0.07, 0.03, i < 3 ? 0.1 : -0.1);
    leg.add(
      mesh(
        geo('beetleLeg', () => new CylinderGeometry(0.008, 0.008, 0.08, 3)),
        toon(0x1b3d36),
      ),
    );
    leg.rotation.x = i < 3 ? 0.9 : -0.9;
    legs.push(leg);
    root.add(leg);
  }
  return { root, animate: (t) => legs.forEach((l, i) => (l.rotation.y = Math.sin(t * 10 + i) * 0.4)) };
}

function wingGeometry(): ShapeGeometry {
  const s = new Shape();
  s.moveTo(0, 0);
  s.lineTo(0.22, 0.12);
  s.lineTo(0.16, -0.08);
  s.closePath();
  return new ShapeGeometry(s);
}

const wingMaterial = new MeshBasicMaterial({ color: 0x6f4bd8, side: DoubleSide });

function starmoth(): PestModel {
  const root = new Group();
  root.add(
    mesh(
      geo('mothBody', () => new CapsuleGeometry(0.025, 0.12, 2, 6)),
      toon(0x2c2350),
      0,
      0.12,
    ),
  );
  const wings: Group[] = [];
  for (const side of [-1, 1]) {
    const pivot = new Group();
    pivot.position.y = 0.14;
    pivot.scale.x = side;
    const w = mesh(geo('mothWing', wingGeometry), wingMaterial);
    pivot.add(w, ball(0.018, 0xfff3b0, 0.15, 0.04, 0.005));
    wings.push(pivot);
    root.add(pivot);
  }
  return {
    root,
    animate: (t) => {
      const flap = Math.sin(t * 14) * 0.7;
      wings[0]!.rotation.y = flap;
      wings[1]!.rotation.y = -flap;
      root.position.set(Math.cos(t * 1.5) * 0.15, 0.25 + Math.sin(t * 3) * 0.05, Math.sin(t * 1.5) * 0.15);
    },
  };
}

const BUILDERS: Record<PestId, () => PestModel> = { caterpillar, snail, beetle, starmoth };

export function buildPest(id: PestId): PestModel {
  const model = BUILDERS[id]();
  model.root.scale.setScalar(1.35);
  return model;
}

let alertMaterial: SpriteMaterial | null = null;

/** Bong bóng "!" màu đỏ báo có sâu, luôn quay về phía camera. */
export function alertBubble(): Sprite {
  if (!alertMaterial) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ff5a5f';
    ctx.beginPath();
    ctx.arc(32, 30, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 40px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', 32, 32);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    alertMaterial = new SpriteMaterial({ map: texture, depthTest: false });
  }
  const sprite = new Sprite(alertMaterial);
  sprite.scale.setScalar(0.42);
  sprite.renderOrder = 5;
  return sprite;
}
