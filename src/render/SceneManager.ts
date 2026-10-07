import {
  AmbientLight,
  DirectionalLight,
  HemisphereLight,
  MathUtils,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { GARDEN_WIDTH } from './layout';

const FOV = 30;
/** Góc nhìn hơi chúc xuống để thấy mặt trên của tầng mây. */
const CAMERA_TILT = 0.16;
/** Luôn thấy ít nhất chừng này đơn vị theo chiều dọc (màn hình ngang). */
const MIN_VISIBLE_HEIGHT = 9.5;

export class SceneManager {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(FOV, 1, 0.5, 1000);
  /** Tâm nhìn theo trục Y (thế giới). */
  focusY = 0;
  private distance = 40;
  private width = 1;
  private height = 1;
  private readonly tmp = new Vector3();

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene.add(new HemisphereLight(0xeaf4ff, 0xffe4cc, 1.6));
    this.scene.add(new AmbientLight(0xffffff, 0.35));
    const sun = new DirectionalLight(0xfff2dd, 2.2);
    sun.position.set(6, 12, 10);
    this.scene.add(sun);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  get viewportHeight(): number {
    return this.height;
  }

  /** Chiều cao thế giới nhìn thấy tại mặt phẳng z = 0. */
  get visibleHeight(): number {
    return 2 * this.distance * Math.tan(MathUtils.degToRad(FOV / 2));
  }

  /** Số đơn vị thế giới ứng với 1 pixel CSS theo chiều dọc. */
  get worldPerPixel(): number {
    return this.visibleHeight / this.height;
  }

  /** Độ nét: 'low' vẽ ở 1x pixel để nhẹ máy; còn lại tối đa 2x. */
  setQuality(quality: 'auto' | 'low' | 'high'): void {
    const ratio = quality === 'low' ? 1 : Math.min(window.devicePixelRatio, 2);
    if (this.renderer.getPixelRatio() === ratio) return;
    this.renderer.setPixelRatio(ratio);
    this.resize();
  }

  resize(): void {
    this.width = Math.max(1, this.canvas.clientWidth);
    this.height = Math.max(1, this.canvas.clientHeight);
    this.renderer.setSize(this.width, this.height, false);
    const aspect = this.width / this.height;
    this.camera.aspect = aspect;
    const halfTan = Math.tan(MathUtils.degToRad(FOV / 2));
    // Vừa khít hàng chậu theo bề ngang (màn hình dọc; mép mây được phép tràn ra ngoài),
    // nhưng không phóng quá to khi màn hình ngang.
    const fitWidth = (GARDEN_WIDTH - 0.5) / (2 * halfTan * aspect);
    const fitHeight = MIN_VISIBLE_HEIGHT / (2 * halfTan);
    this.distance = Math.max(fitWidth, fitHeight);
    this.camera.updateProjectionMatrix();
    this.updateCamera();
  }

  updateCamera(): void {
    this.camera.position.set(0, this.focusY + this.distance * CAMERA_TILT, this.distance);
    this.camera.lookAt(0, this.focusY, 0);
    this.camera.updateMatrixWorld();
  }

  /** Đổi tọa độ thế giới sang pixel CSS trên màn hình. */
  project(world: Vector3): { x: number; y: number } {
    const v = this.tmp.copy(world).project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    return { x: rect.left + ((v.x + 1) / 2) * this.width, y: rect.top + ((1 - v.y) / 2) * this.height };
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
