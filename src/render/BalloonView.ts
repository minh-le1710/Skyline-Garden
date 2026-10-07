import { BoxGeometry, CylinderGeometry, Group, LatheGeometry, Mesh, Vector2, type Scene } from 'three';
import type { Game } from '../core/Game';
import { toon } from './materials';
import type { SceneManager } from './SceneManager';

const STRIPES = [0xff6b6b, 0xffd166, 0x4ecdc4, 0xffffff];

/** Bóng khinh khí cầu hình giọt nước, sọc nhiều màu. */
function buildBalloon(): Group {
  const group = new Group();
  const profile: Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    // Giọt nước: phình ở trên, thu nhỏ dần về phía giỏ.
    const r = Math.sin(t * Math.PI) * (0.6 + 0.6 * t) * 1.1;
    profile.push(new Vector2(Math.max(0.12, r), t * 2.2));
  }
  const stripes = 8;
  for (let i = 0; i < stripes; i++) {
    const g = new LatheGeometry(profile, 3, (i / stripes) * Math.PI * 2, (Math.PI * 2) / stripes);
    group.add(new Mesh(g, toon(STRIPES[i % STRIPES.length]!)));
  }
  const basket = new Mesh(new BoxGeometry(0.42, 0.32, 0.42), toon(0xa8774a));
  basket.position.y = -0.55;
  group.add(basket);
  for (const [x, z] of [
    [-0.17, -0.17],
    [0.17, -0.17],
    [-0.17, 0.17],
    [0.17, 0.17],
  ] as const) {
    const rope = new Mesh(new CylinderGeometry(0.01, 0.01, 0.62, 3), toon(0x6d4c3d));
    rope.position.set(x, -0.12, z);
    group.add(rope);
  }
  return group;
}

/**
 * Khinh khí cầu trang trí trên bầu trời: hạ xuống khi tới, nhấp nhô khi đậu, bay lên khi đi.
 * Người chơi tương tác qua nút 🎈 trên HUD, nên không cần chọn bằng tia.
 */
export class BalloonView {
  private readonly root = buildBalloon();
  /** 0 = đang đậu ở vị trí thấp, 1 = đã bay khuất. */
  private height = 1;

  constructor(
    scene: Scene,
    private readonly game: Game,
    private readonly sceneManager: SceneManager,
  ) {
    this.root.scale.setScalar(1.1);
    this.root.visible = false;
    scene.add(this.root);
  }

  update(dt: number, time: number): void {
    const docked = this.game.state.value.balloon.phase === 'docked';
    const target = docked ? 0 : 1;
    this.height += Math.sign(target - this.height) * Math.min(Math.abs(target - this.height), dt * 0.35);
    this.root.visible = this.height < 0.999;
    if (!this.root.visible) return;
    const top = this.sceneManager.focusY + this.sceneManager.visibleHeight * 0.18;
    this.root.position.set(
      3.4 + Math.sin(time * 0.3) * 0.2,
      top + this.height * this.sceneManager.visibleHeight * 0.7 + Math.sin(time * 1.2) * 0.12,
      -4,
    );
    this.root.rotation.y = time * 0.15;
  }
}
