import {
  CircleGeometry,
  CylinderGeometry,
  Group,
  LatheGeometry,
  MeshBasicMaterial,
  MeshToonMaterial,
  OctahedronGeometry,
  TorusGeometry,
  Vector2,
  type Mesh,
} from 'three';
import type { PotId, Rarity } from '../../game';
import { toon } from '../materials';
import { C, geo, mesh } from './common';

export const POT_HEIGHT = 0.7;

export const RARITY_COLOR: Record<Rarity, number> = {
  common: 0x9aa5b1,
  uncommon: 0x4caf50,
  rare: 0x3d8bfd,
  epic: 0xa259ff,
  legendary: 0xffb300,
};

interface PotStyle {
  body: number;
  band?: number;
  rim?: number;
  /** Số cạnh của thân chậu (ít cạnh = dáng ngọc bích, pha lê). */
  sides?: number;
  transparent?: boolean;
}

const POT_STYLE: Record<PotId, PotStyle> = {
  clay: { body: 0xd9774a },
  ceramic: { body: 0x6aa6e8, band: 0xffffff },
  porcelain: { body: 0xf7f3ec, rim: 0x4a78c8, band: 0x4a78c8 },
  stoneware: { body: 0x8f8a83, band: 0xc9c2b8 },
  jade: { body: 0x47b07a, rim: 0xd8f5e4, sides: 6 },
  crystal: { body: 0xb9e6ff, rim: 0xffffff, sides: 8, transparent: true },
  celestial: { body: 0xf3c547, rim: 0x3c4fb8, band: 0x3c4fb8 },
};

const potProfile = (sides: number): LatheGeometry =>
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
    sides,
  );

const crystalMaterial = new MeshToonMaterial({ color: 0xb9e6ff, transparent: true, opacity: 0.78 });

function ring(radius: number, tube: number, color: number, y: number): Mesh {
  const m = mesh(
    geo(`ring${radius}|${tube}`, () => new TorusGeometry(radius, tube, 6, 24)),
    toon(color),
    0,
    y,
  );
  m.rotation.x = Math.PI / 2;
  return m;
}

/** Dựng một chiếc chậu theo dáng; độ hiếm (trừ thường) thêm viền màu ở miệng chậu. */
export function buildPot(potId: PotId, rarity: Rarity = 'common'): Group {
  const style = POT_STYLE[potId];
  const sides = style.sides ?? 18;
  const group = new Group();
  group.add(
    mesh(
      geo(`pot${sides}`, () => potProfile(sides)),
      style.transparent ? crystalMaterial : toon(style.body),
    ),
  );
  group.add(
    mesh(
      geo('soil', () => new CylinderGeometry(0.47, 0.47, 0.04, 18)),
      toon(C.soil),
      0,
      POT_HEIGHT - 0.06,
    ),
  );
  if (style.band) group.add(ring(0.455, 0.03, style.band, POT_HEIGHT * 0.45));
  if (style.rim) group.add(ring(0.56, 0.035, style.rim, POT_HEIGHT));
  if (rarity !== 'common') group.add(ring(0.6, 0.03, RARITY_COLOR[rarity], POT_HEIGHT + 0.01));
  if (potId === 'celestial') {
    // Vòng sao nhỏ bay quanh chậu thiên hà.
    const halo = new Group();
    halo.name = 'halo';
    halo.position.y = POT_HEIGHT * 0.55;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      halo.add(
        mesh(
          geo('star', () => new OctahedronGeometry(0.06, 0)),
          toon(0xfff3b0),
          Math.cos(a) * 0.72,
          0,
          Math.sin(a) * 0.72,
        ),
      );
    }
    group.add(halo);
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
