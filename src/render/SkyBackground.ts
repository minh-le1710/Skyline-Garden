import {
  BackSide,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  ShaderMaterial,
  SphereGeometry,
  type Scene,
} from 'three';
import { cloudGeometry, seeded, type Puff } from './clouds';

const SKY_RADIUS = 600;

/** Bầu trời gradient + những đám mây xa trôi chậm phía sau khu vườn. */
export class SkyBackground {
  private readonly clouds: { mesh: Mesh; speed: number }[] = [];
  private readonly group = new Group();

  constructor(scene: Scene) {
    const sky = new Mesh(
      new SphereGeometry(SKY_RADIUS, 32, 16),
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        uniforms: {
          top: { value: new Color(0x4f9ff0) },
          middle: { value: new Color(0xa9dcff) },
          bottom: { value: new Color(0xffe3ef) },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 top;
          uniform vec3 middle;
          uniform vec3 bottom;
          varying vec3 vDir;
          void main() {
            float h = vDir.y;
            vec3 color = h > 0.0 ? mix(middle, top, smoothstep(0.0, 0.45, h)) : mix(middle, bottom, smoothstep(0.0, 0.35, -h));
            gl_FragColor = vec4(color, 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    );
    sky.renderOrder = -1;
    scene.add(sky);
    scene.add(this.group);

    const rand = seeded(7);
    const material = new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 18; i++) {
      const puffs: Puff[] = [];
      const n = 4 + Math.floor(rand() * 4);
      for (let j = 0; j < n; j++) {
        puffs.push({
          x: (j - n / 2) * 1.6 + rand(),
          y: rand() * 0.8,
          z: rand(),
          r: 1.2 + rand() * 1.4,
          sy: 0.6,
        });
      }
      const mesh = new Mesh(cloudGeometry(puffs, new Color(0xffffff), new Color(0xd6e8ff), 1), material);
      const depth = 40 + rand() * 60;
      mesh.position.set(-70 + rand() * 140, -15 + rand() * 60, -depth);
      mesh.scale.setScalar(1 + depth / 60);
      this.group.add(mesh);
      this.clouds.push({ mesh, speed: 0.4 + rand() * 0.8 });
    }
  }

  /** Mây xa dịch theo camera một phần để tạo chiều sâu (parallax). */
  update(dt: number, focusY: number): void {
    this.group.position.y = focusY * 0.6;
    for (const c of this.clouds) {
      c.mesh.position.x += c.speed * dt;
      if (c.mesh.position.x > 80) c.mesh.position.x = -80;
    }
  }
}
