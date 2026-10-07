import {
  CanvasTexture,
  Color,
  Group,
  Mesh,
  MeshToonMaterial,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  TetrahedronGeometry,
  Vector3,
  type BufferGeometry,
  type Scene,
} from 'three';
import { MAX_FLOORS, growthProgress, type GameState, type PlantId, type Pot } from '../game';
import type { AppEvent, Game } from '../core/Game';
import { t } from '../i18n';
import { cloudGeometry, seeded, type Puff } from './clouds';
import { FLOOR_BOTTOM, FLOOR_TOP, GARDEN_WIDTH, floorY, slotPosition } from './layout';
import { toon } from './materials';
import {
  POT_HEIGHT,
  blobShadow,
  buildPlant,
  buildPot,
  emptySlotMarker,
  readySparkle,
  selectionRing,
  type PlantModel,
} from './models';
import { easeOutBack, type Tweens } from './tween';

const SPROUT_END = 0.25;

/** Một ô trên tầng mây: chậu, cây và các trạng thái hiển thị. */
class SlotView {
  readonly group = new Group();
  private key = '';
  private content = new Group();
  private model: PlantModel | null = null;
  private plantRoot: Group | null = null;
  private sparkle: Mesh | null = null;
  private stage = -1;
  /** Bật hiệu ứng "nảy" khi đổi giai đoạn; tắt cho lần dựng đầu tiên lúc tải game. */
  private animateNextStage = false;
  private readonly phase = Math.random() * Math.PI * 2;

  constructor(
    floor: number,
    slot: number,
    private readonly tweens: Tweens,
  ) {
    slotPosition(floor, slot, this.group.position);
    this.group.add(this.content);
  }

  sync(pot: Pot | null, animate: boolean): void {
    const key = pot ? `${pot.potId}|${pot.plant?.plantId ?? ''}|${pot.plant?.plantedAt ?? ''}` : 'empty';
    if (key === this.key) return;
    const potChanged = this.key.split('|')[0] !== key.split('|')[0];
    this.key = key;

    if (potChanged) {
      this.group.remove(this.content);
      this.content = new Group();
      this.group.add(this.content);
      this.plantRoot = null;
      if (!pot) {
        this.content.add(emptySlotMarker());
      } else {
        this.content.add(blobShadow(), buildPot(pot.potId));
        if (animate) this.pop(this.content, 0.4);
      }
    }
    if (this.plantRoot) {
      this.content.remove(this.plantRoot);
      this.plantRoot = null;
      this.model = null;
      this.sparkle = null;
    }
    this.stage = -1;
    if (pot?.plant) {
      this.model = buildPlant(pot.plant.plantId);
      this.plantRoot = new Group();
      this.plantRoot.position.y = POT_HEIGHT - 0.05;
      this.sparkle = readySparkle();
      this.sparkle.position.y = 1.5;
      this.plantRoot.add(this.model.sprout, this.model.body, this.model.bloom, this.sparkle);
      this.content.add(this.plantRoot);
      this.animateNextStage = animate;
    }
  }

  update(pot: Pot | null, now: number, time: number): void {
    const plant = pot?.plant;
    if (!plant || !this.model || !this.plantRoot) return;
    const p = growthProgress(plant, now);
    const stage = p < SPROUT_END ? 0 : p < 1 ? 1 : 2;
    const { sprout, body, bloom } = this.model;

    if (stage !== this.stage) {
      sprout.visible = stage === 0;
      body.visible = stage > 0;
      bloom.visible = stage === 2;
      this.sparkle!.visible = stage === 2;
      if (this.animateNextStage) this.pop(this.plantRoot, 0.5);
      this.animateNextStage = true;
      this.stage = stage;
    }
    if (stage === 0) sprout.scale.setScalar(0.6 + (p / SPROUT_END) * 0.6);
    else if (stage === 1) body.scale.setScalar(0.45 + ((p - SPROUT_END) / (1 - SPROUT_END)) * 0.45);
    else {
      body.scale.setScalar(1);
      // Cây chín đung đưa nhẹ, ngôi sao nhỏ xoay và nhấp nhô.
      body.rotation.z = Math.sin(time * 2 + this.phase) * 0.04;
      bloom.rotation.z = body.rotation.z;
      this.sparkle!.rotation.y = time * 2.5;
      this.sparkle!.position.y = 1.45 + Math.sin(time * 3 + this.phase) * 0.06;
    }
  }

  private pop(target: Group, duration: number): void {
    void this.tweens.add(duration, (k) => target.scale.setScalar(Math.max(0.01, k)), easeOutBack);
  }
}

/** Một tầng mây với 6 ô. */
class FloorView {
  readonly group = new Group();
  readonly slots: SlotView[] = [];

  constructor(floor: number, slotCount: number, tweens: Tweens) {
    this.group.add(new Mesh(floorCloud(floor), toon(0xffffff, { vertexColors: true })));
    for (let i = 0; i < slotCount; i++) {
      const view = new SlotView(floor, i, tweens);
      // SlotView tự đặt vị trí theo tọa độ thế giới; trừ đi độ cao tầng vì group tầng đã dịch lên.
      view.group.position.y -= floorY(floor);
      this.slots.push(view);
      this.group.add(view.group);
    }
    this.group.position.y = floorY(floor);
  }
}

const cloudCache = new Map<number, BufferGeometry>();

function floorCloud(floor: number): BufferGeometry {
  let geometry = cloudCache.get(floor);
  if (geometry) return geometry;
  const rand = seeded(floor * 7919 + 13);
  const puffs: Puff[] = [];
  const half = GARDEN_WIDTH / 2 - 0.3;
  for (let x = -half; x <= half + 0.01; x += 0.8) {
    puffs.push({
      x: x + (rand() - 0.5) * 0.2,
      y: -0.48 + rand() * 0.06,
      z: (rand() - 0.5) * 0.5,
      r: 0.8 + rand() * 0.2,
      sy: 0.6,
    });
  }
  for (let i = 0; i < 9; i++) {
    puffs.push({
      x: -half + 0.6 + rand() * (half * 2 - 1.2),
      y: -0.85 - rand() * 0.2,
      z: (rand() - 0.5) * 0.6,
      r: 0.55 + rand() * 0.25,
      sy: 0.75,
    });
  }
  puffs.push(
    { x: -half - 0.25, y: -0.45, z: 0, r: 0.75, sy: 0.75 },
    { x: half + 0.25, y: -0.45, z: 0, r: 0.75, sy: 0.75 },
  );
  geometry = cloudGeometry(puffs, new Color(0xffffff), new Color(0xbcd7ff));
  cloudCache.set(floor, geometry);
  return geometry;
}

/** Tầng kế tiếp còn khóa: mây mờ + biển báo chạm để mở. */
class LockedFloorView {
  readonly group = new Group();
  private readonly sign: Sprite;
  private readonly material: MeshToonMaterial;

  constructor(floor: number) {
    const material = new MeshToonMaterial({
      color: 0xdfe8f7,
      transparent: true,
      opacity: 0.55,
      vertexColors: true,
    });
    this.group.add(new Mesh(floorCloud(floor), material));
    this.sign = makeSign(t('unlock.sign', { n: floor + 1 }));
    this.group.add(this.sign);
    this.group.position.y = floorY(floor);
    this.material = material;
  }

  /** Giải phóng texture chữ và vật liệu riêng (hình mây dùng chung nên giữ lại). */
  dispose(): void {
    this.sign.material.map?.dispose();
    this.sign.material.dispose();
    this.material.dispose();
  }
}

function makeSign(text: string): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.beginPath();
  ctx.roundRect(8, 8, 496, 112, 56);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#8fb6ec';
  ctx.stroke();
  ctx.fillStyle = '#3c5a8a';
  ctx.font = 'bold 44px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 66);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true }));
  sprite.scale.set(4.4, 1.1, 1);
  sprite.position.y = 1.1;
  return sprite;
}

interface Particle {
  mesh: Mesh;
  velocity: Vector3;
  life: number;
}

const PARTICLE_COLORS: Record<PlantId, number> = {
  rose: 0xe9506a,
  sunflower: 0xffc93c,
  strawberry: 0xe53945,
  lavender: 0xb48ae8,
  lily: 0xffc2da,
  apple: 0xe63b3b,
  banana: 0xf5d33c,
  coconut: 0x8b5a33,
};

/** Toàn bộ khu vườn: đồng bộ cảnh 3D theo GameState mỗi khung hình. */
export class GardenView {
  readonly group = new Group();
  private floors: FloorView[] = [];
  private locked: LockedFloorView | null = null;
  private renderedFloors = -1;
  private readonly selection = selectionRing();
  private particles: Particle[] = [];
  private readonly particleGeometry = new TetrahedronGeometry(0.08);
  private synced = false;

  constructor(
    scene: Scene,
    private readonly game: Game,
    private readonly tweens: Tweens,
  ) {
    scene.add(this.group);
    this.selection.visible = false;
    this.group.add(this.selection);
    game.events.on((event) => this.onEvent(event));
  }

  /** Số tầng đang hiển thị (gồm cả tầng khóa kế tiếp). */
  get visibleFloors(): number {
    return this.floors.length + (this.locked ? 1 : 0);
  }

  get bounds(): { bottom: number; top: number } {
    return { bottom: FLOOR_BOTTOM, top: floorY(this.visibleFloors - 1) + FLOOR_TOP };
  }

  /** Vị trí giữa chậu (tọa độ thế giới), dùng cho hiệu ứng bay và test. */
  slotWorldPosition(floor: number, slot: number): Vector3 {
    return slotPosition(floor, slot).add(new Vector3(0, POT_HEIGHT * 0.7, 0));
  }

  update(dt: number, now: number, time: number): void {
    const state = this.game.state.value;
    if (state.floors.length !== this.renderedFloors) this.rebuildFloors(state);
    for (let f = 0; f < this.floors.length; f++) {
      const slots = state.floors[f]!.slots;
      const view = this.floors[f]!;
      for (let s = 0; s < view.slots.length; s++) {
        const pot = slots[s] ?? null;
        view.slots[s]!.sync(pot, this.synced);
        view.slots[s]!.update(pot, now, time);
      }
    }
    this.synced = true;

    const selected = this.game.ui.selected.value;
    this.selection.visible = selected !== null;
    if (selected) {
      slotPosition(selected.floor, selected.slot, this.selection.position);
      this.selection.scale.setScalar(1 + Math.sin(time * 5) * 0.04);
    }
    this.updateParticles(dt);
  }

  private rebuildFloors(state: GameState): void {
    const animateNew = this.renderedFloors >= 0;
    // Ít tầng hơn (vd. chơi lại từ đầu): bỏ các tầng thừa.
    while (this.floors.length > state.floors.length) this.group.remove(this.floors.pop()!.group);
    for (let f = this.floors.length; f < state.floors.length; f++) {
      const view = new FloorView(f, state.floors[f]!.slots.length, this.tweens);
      this.floors.push(view);
      this.group.add(view.group);
      if (animateNew) {
        void this.tweens.add(0.6, (k) => view.group.scale.set(0.6 + 0.4 * k, 0.6 + 0.4 * k, 1), easeOutBack);
      }
    }
    if (this.locked) {
      this.group.remove(this.locked.group);
      this.locked.dispose();
      this.locked = null;
    }
    if (state.floors.length < MAX_FLOORS) {
      this.locked = new LockedFloorView(state.floors.length);
      this.group.add(this.locked.group);
    }
    this.renderedFloors = state.floors.length;
  }

  private onEvent(event: AppEvent): void {
    if (event.type === 'harvested') {
      const origin = this.slotWorldPosition(event.floor, event.slot).add(new Vector3(0, 0.5, 0));
      this.burst(origin, PARTICLE_COLORS[event.plantId]);
    }
  }

  private burst(origin: Vector3, color: number): void {
    const colors = [color, 0xffe066, 0xffffff];
    for (let i = 0; i < 12; i++) {
      const mesh = new Mesh(this.particleGeometry, toon(colors[i % colors.length]!));
      mesh.position.copy(origin);
      const a = Math.random() * Math.PI * 2;
      const velocity = new Vector3(Math.cos(a) * 1.6, 2.5 + Math.random() * 1.5, Math.sin(a) * 0.8);
      this.group.add(mesh);
      this.particles.push({ mesh, velocity, life: 0.7 });
    }
  }

  private updateParticles(dt: number): void {
    if (this.particles.length === 0) return;
    for (const p of this.particles) {
      p.life -= dt;
      p.velocity.y -= 9 * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.mesh.rotation.x += dt * 8;
      p.mesh.scale.setScalar(Math.max(0.01, p.life / 0.7));
    }
    const dead = this.particles.filter((p) => p.life <= 0);
    for (const p of dead) this.group.remove(p.mesh);
    if (dead.length) this.particles = this.particles.filter((p) => p.life > 0);
  }
}
