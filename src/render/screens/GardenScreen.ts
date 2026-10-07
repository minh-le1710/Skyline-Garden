import { Scene } from 'three';
import type { Game } from '../../core/Game';
import { CameraScroller, type ScreenInsets } from '../../input/CameraScroller';
import { GardenInput } from '../../input/GardenInput';
import { Picker } from '../../input/Picker';
import { BalloonView } from '../BalloonView';
import { GardenView } from '../GardenView';
import { floorY } from '../layout';
import { addDefaultLights, type SceneManager } from '../SceneManager';
import { SkyBackground } from '../SkyBackground';
import { Tweens } from '../tween';
import type { Screen } from './Screen';

/** Màn chính: bầu trời, các tầng mây với chậu/máy, khinh khí cầu. */
export class GardenScreen implements Screen {
  readonly id = 'garden' as const;
  readonly scene = new Scene();
  readonly scroller: CameraScroller;
  readonly input: GardenInput;
  readonly garden: GardenView;
  readonly sky: SkyBackground;
  private readonly balloon: BalloonView;
  private readonly tweens = new Tweens();

  constructor(
    private readonly manager: SceneManager,
    game: Game,
    insets: () => ScreenInsets,
  ) {
    addDefaultLights(this.scene);
    this.sky = new SkyBackground(this.scene);
    this.garden = new GardenView(this.scene, game, this.tweens);
    this.balloon = new BalloonView(this.scene, game, manager);
    this.scroller = new CameraScroller(manager, () => this.garden.bounds, insets);
    this.input = new GardenInput(game, new Picker(manager));
    game.events.on((event) => {
      if (event.type === 'floorUnlocked') this.scroller.scrollTo(floorY(event.floor));
    });
  }

  get busy(): boolean {
    return this.tweens.busy || this.garden.busy || this.scroller.moving;
  }

  update(dt: number, now: number, time: number): boolean {
    this.garden.update(dt, now, time);
    this.scroller.update(dt);
    this.sky.update(dt, this.manager.focusY);
    this.balloon.update(dt, time);
    this.tweens.update(dt);
    // Mây nền luôn trôi, cây chín đung đưa: luôn có chuyển động nền.
    return true;
  }

  enter(): void {
    this.scroller.restore();
  }

  exit(): void {
    this.scroller.save();
  }
}
