import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  Group,
  LatheGeometry,
  MeshBasicMaterial,
  MeshToonMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  Vector2,
  DoubleSide,
  type Mesh,
} from 'three';
import type { MachineId } from '../../game';
import { toon } from '../materials';
import { ball, geo, mesh } from './common';

/** Mô hình máy có hoạt ảnh khi đang làm hàng. Mỗi máy vừa một ô (khoảng 1,5 × 1,9). */
export interface MachineModel {
  root: Group;
  animate(time: number, working: boolean): void;
}

const lathe = (key: string, points: [number, number][], segments = 16) =>
  geo(
    key,
    () =>
      new LatheGeometry(
        points.map(([x, y]) => new Vector2(x, y)),
        segments,
      ),
  );

/** Làn khói/hơi nước bay lên khi máy chạy. */
function puffs(
  x: number,
  y: number,
  z: number,
  color = 0xffffff,
): { group: Group; animate(t: number, on: boolean): void } {
  const group = new Group();
  group.position.set(x, y, z);
  const balls = [0, 1, 2].map(() => {
    const b = ball(0.07, color);
    group.add(b);
    return b;
  });
  return {
    group,
    animate(t, on) {
      group.visible = on;
      if (!on) return;
      balls.forEach((b, i) => {
        const k = (t * 0.6 + i / 3) % 1;
        b.position.set(Math.sin(k * 6 + i) * 0.05, k * 0.45, 0);
        b.scale.setScalar(0.5 + k * 0.9);
      });
    },
  };
}

const glassMaterial = new MeshToonMaterial({ color: 0xcdeefd, transparent: true, opacity: 0.55 });
const glowMaterial = new MeshBasicMaterial({ color: 0xff9a3c });

function still(): MachineModel {
  const root = new Group();
  root.add(
    mesh(
      lathe('stillPot', [
        [0, 0],
        [0.32, 0],
        [0.38, 0.2],
        [0.34, 0.45],
        [0.18, 0.55],
        [0, 0.6],
      ]),
      toon(0xc8743f),
    ),
  );
  root.add(
    mesh(
      geo('stillCap', () => new SphereGeometry(0.12, 10, 6)),
      toon(0xe0a060),
      0,
      0.62,
    ),
  );
  const pipe = mesh(
    geo('stillPipe', () => new TorusGeometry(0.28, 0.03, 6, 12, Math.PI * 0.8)),
    toon(0xc8743f),
    0.24,
    0.55,
  );
  root.add(pipe);
  const flask = mesh(
    lathe('flask', [
      [0, 0],
      [0.16, 0.02],
      [0.18, 0.15],
      [0.06, 0.3],
      [0.05, 0.38],
    ]),
    glassMaterial,
    0.5,
    0,
    0.05,
  );
  root.add(flask);
  const liquid = mesh(
    geo('liquid', () => new SphereGeometry(0.13, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)),
    toon(0xff8fbf),
    0.5,
    0.13,
    0.05,
  );
  root.add(liquid);
  const steam = puffs(0, 0.7, 0);
  root.add(steam.group);
  return {
    root,
    animate(t, working) {
      steam.animate(t, working);
      liquid.scale.setScalar(working ? 1 + Math.sin(t * 5) * 0.08 : 1);
    },
  };
}

function kettle(): MachineModel {
  const root = new Group();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    root.add(
      mesh(
        geo('kLeg', () => new CylinderGeometry(0.03, 0.03, 0.2, 5)),
        toon(0x333333),
        Math.cos(a) * 0.25,
        0.1,
        Math.sin(a) * 0.25,
      ),
    );
  }
  root.add(
    mesh(
      lathe('cauldron', [
        [0, 0.15],
        [0.3, 0.17],
        [0.4, 0.35],
        [0.38, 0.55],
        [0.33, 0.58],
      ]),
      toon(0x3a3a46),
    ),
  );
  const jam = mesh(
    geo('jam', () => new CylinderGeometry(0.33, 0.33, 0.02, 16)),
    toon(0xd83a5a),
    0,
    0.53,
  );
  root.add(jam);
  const ladle = new Group();
  ladle.position.y = 0.55;
  ladle.add(
    mesh(
      geo('ladle', () => new CylinderGeometry(0.02, 0.02, 0.5, 5)),
      toon(0xa8774a),
      0.12,
      0.15,
    ),
  );
  ladle.children[0]!.rotation.z = 0.5;
  root.add(ladle);
  const bubbles = [0, 1, 2].map((i) => {
    const b = ball(0.04, 0xff7f9a, -0.1 + i * 0.1, 0.55, 0.05 * i);
    root.add(b);
    return b;
  });
  return {
    root,
    animate(t, working) {
      ladle.rotation.y = working ? t * 2 : 0;
      bubbles.forEach((b, i) => {
        b.visible = working;
        b.scale.setScalar(0.5 + ((t * 1.5 + i * 0.33) % 1));
      });
    },
  };
}

function kiln(): MachineModel {
  const root = new Group();
  const dome = mesh(
    geo('kilnDome', () => new SphereGeometry(0.45, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2)),
    toon(0xb5573a),
  );
  dome.scale.set(1, 0.9, 0.85);
  root.add(dome);
  root.add(
    mesh(
      geo('chimney', () => new CylinderGeometry(0.08, 0.1, 0.35, 8)),
      toon(0x8a4030),
      0.18,
      0.5,
      -0.1,
    ),
  );
  const mouth = mesh(
    geo('kilnMouth', () => new SphereGeometry(0.15, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)),
    glowMaterial,
    0,
    0.0,
    0.32,
  );
  mouth.rotation.x = Math.PI / 2;
  root.add(mouth);
  const smoke = puffs(0.18, 0.7, -0.1, 0xbfbfbf);
  root.add(smoke.group);
  return {
    root,
    animate(t, working) {
      smoke.animate(t, working);
      mouth.visible = working;
      mouth.scale.setScalar(0.9 + Math.sin(t * 9) * 0.08);
    },
  };
}

function roaster(): MachineModel {
  const root = new Group();
  for (const x of [-0.3, 0.3])
    root.add(
      mesh(
        geo('rStand', () => new BoxGeometry(0.06, 0.45, 0.3)),
        toon(0x6d4c3d),
        x,
        0.22,
      ),
    );
  const drum = new Group();
  drum.position.y = 0.45;
  const body = mesh(
    geo('drum', () => new CylinderGeometry(0.24, 0.24, 0.55, 12)),
    toon(0x9aa3ad),
  );
  body.rotation.z = Math.PI / 2;
  drum.add(body);
  for (let i = 0; i < 3; i++) {
    const band = mesh(
      geo('drumBand', () => new TorusGeometry(0.245, 0.02, 4, 16)),
      toon(0x5f6872),
      -0.2 + i * 0.2,
    );
    band.rotation.y = Math.PI / 2;
    drum.add(band);
  }
  root.add(drum);
  const crank = mesh(
    geo('crank', () => new BoxGeometry(0.04, 0.2, 0.04)),
    toon(0x6d4c3d),
    0.36,
    0.45,
    0.1,
  );
  root.add(crank);
  return {
    root,
    animate(t, working) {
      if (working) drum.rotation.x = t * 3;
      crank.rotation.x = drum.rotation.x;
    },
  };
}

function loom(): MachineModel {
  const root = new Group();
  for (const x of [-0.38, 0.38])
    root.add(
      mesh(
        geo('loomPost', () => new BoxGeometry(0.06, 0.9, 0.06)),
        toon(0x9c6b43),
        x,
        0.45,
      ),
    );
  root.add(
    mesh(
      geo('loomBar', () => new BoxGeometry(0.82, 0.06, 0.06)),
      toon(0x9c6b43),
      0,
      0.88,
    ),
  );
  const cloth = mesh(
    geo('cloth', () => new PlaneGeometry(0.7, 0.45)),
    new MeshToonMaterial({ color: 0xf8f8ff, side: DoubleSide }),
    0,
    0.45,
    0,
  );
  root.add(cloth);
  for (let i = 0; i < 6; i++)
    root.add(
      mesh(
        geo('thread', () => new CylinderGeometry(0.005, 0.005, 0.2, 3)),
        toon(0xb0c4ff),
        -0.3 + i * 0.12,
        0.76,
      ),
    );
  const shuttle = mesh(
    geo('shuttle', () => new BoxGeometry(0.16, 0.05, 0.08)),
    toon(0xe0a060),
    0,
    0.68,
    0.05,
  );
  root.add(shuttle);
  return { root, animate: (t, working) => (shuttle.position.x = working ? Math.sin(t * 4) * 0.3 : 0) };
}

function press(): MachineModel {
  const root = new Group();
  root.add(
    mesh(
      lathe('tub', [
        [0, 0],
        [0.32, 0],
        [0.34, 0.3],
        [0.3, 0.32],
      ]),
      toon(0x8b5a3c),
    ),
  );
  root.add(
    mesh(
      geo('screw', () => new CylinderGeometry(0.05, 0.05, 0.55, 8)),
      toon(0x9aa3ad),
      0,
      0.55,
    ),
  );
  const plate = mesh(
    geo('plate', () => new CylinderGeometry(0.26, 0.26, 0.04, 14)),
    toon(0xb07a4a),
    0,
    0.35,
  );
  root.add(plate);
  const wheel = new Group();
  wheel.position.y = 0.82;
  wheel.add(
    mesh(
      geo('wheelRim', () => new TorusGeometry(0.2, 0.025, 5, 16)),
      toon(0x6d4c3d),
    ),
  );
  wheel.children[0]!.rotation.x = Math.PI / 2;
  for (let i = 0; i < 4; i++) {
    const spoke = mesh(
      geo('spoke', () => new BoxGeometry(0.4, 0.02, 0.02)),
      toon(0x6d4c3d),
    );
    spoke.rotation.y = (i / 4) * Math.PI;
    wheel.add(spoke);
  }
  root.add(wheel);
  return {
    root,
    animate(t, working) {
      if (working) wheel.rotation.y = t * 2;
      plate.position.y = working ? 0.33 + Math.sin(t * 2) * 0.03 : 0.35;
    },
  };
}

function oven(): MachineModel {
  const root = new Group();
  root.add(
    ball(0.38, 0xfff4e6, 0, 0.32, 0),
    ball(0.26, 0xfff4e6, 0.25, 0.45, -0.05),
    ball(0.24, 0xfff4e6, -0.25, 0.42, -0.05),
  );
  root.add(
    mesh(
      geo('ovenChimney', () => new CylinderGeometry(0.06, 0.07, 0.3, 8)),
      toon(0xd9a066),
      -0.2,
      0.75,
      -0.1,
    ),
  );
  const door = mesh(
    geo('ovenDoor', () => new CylinderGeometry(0.15, 0.15, 0.04, 14)),
    toon(0x8a5a36),
    0,
    0.3,
    0.36,
  );
  door.rotation.x = Math.PI / 2;
  root.add(door);
  const glow = mesh(
    geo('ovenGlow', () => new CylinderGeometry(0.1, 0.1, 0.045, 14)),
    glowMaterial,
    0,
    0.3,
    0.37,
  );
  glow.rotation.x = Math.PI / 2;
  root.add(glow);
  const smoke = puffs(-0.2, 0.92, -0.1, 0xdddddd);
  root.add(smoke.group);
  return {
    root,
    animate(t, working) {
      glow.visible = working;
      smoke.animate(t, working);
    },
  };
}

function atelier(): MachineModel {
  const root = new Group();
  root.add(
    mesh(
      geo('table', () => new BoxGeometry(0.9, 0.06, 0.55)),
      toon(0xb07a4a),
      0,
      0.4,
    ),
  );
  for (const [x, z] of [
    [-0.38, -0.2],
    [0.38, -0.2],
    [-0.38, 0.2],
    [0.38, 0.2],
  ] as const) {
    root.add(
      mesh(
        geo('tableLeg', () => new BoxGeometry(0.05, 0.4, 0.05)),
        toon(0x8a5a36),
        x,
        0.2,
        z,
      ),
    );
  }
  const boxes = [
    [0x7fb2ff, -0.2, 0.2],
    [0xff8fbf, 0.15, 0.16],
    [0xffd166, -0.02, 0.13],
  ].map(([color, x, size], i) => {
    const box = new Group();
    box.position.set(x!, 0.43 + size! / 2 + (i === 2 ? 0.26 : 0), 0);
    box.add(
      mesh(
        geo(`gift${size}`, () => new BoxGeometry(size!, size!, size!)),
        toon(color!),
      ),
    );
    box.add(
      mesh(
        geo(`ribbon${size}`, () => new BoxGeometry(size! + 0.01, size! * 0.18, size! + 0.01)),
        toon(0xffffff),
      ),
    );
    root.add(box);
    return box;
  });
  const spool = mesh(
    geo('spool', () => new CylinderGeometry(0.07, 0.07, 0.12, 10)),
    toon(0xe0457b),
    0.33,
    0.5,
    0.12,
  );
  root.add(spool);
  return {
    root,
    animate(t, working) {
      boxes.forEach(
        (b, i) => (b.children[0]!.position.y = working ? Math.abs(Math.sin(t * 4 + i)) * 0.05 : 0),
      );
      if (working) spool.rotation.y = t * 4;
    },
  };
}

const BUILDERS: Record<MachineId, () => MachineModel> = {
  still,
  kettle,
  kiln,
  roaster,
  loom,
  press,
  oven,
  atelier,
};

export function buildMachine(id: MachineId): MachineModel {
  const model = BUILDERS[id]();
  model.root.scale.setScalar(1.15);
  return model;
}

const bubbleMaterials = new Map<string, SpriteMaterial>();

/** Bong bóng có biểu tượng (vd. hàng đã làm xong) luôn quay về phía camera. */
export function iconBubble(icon: string): Sprite {
  let material = bubbleMaterials.get(icon);
  if (!material) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 96;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(48, 44, 38, 0, Math.PI * 2);
    ctx.moveTo(38, 78);
    ctx.lineTo(48, 94);
    ctx.lineTo(58, 78);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#7fb2ff';
    ctx.beginPath();
    ctx.arc(48, 44, 38, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = '44px system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, 48, 47);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    material = new SpriteMaterial({ map: texture, depthTest: false });
    bubbleMaterials.set(icon, material);
  }
  const sprite = new Sprite(material);
  sprite.scale.setScalar(0.55);
  sprite.renderOrder = 5;
  return sprite;
}

export type { Mesh };
