import {
  Color,
  DataTexture,
  MeshToonMaterial,
  NearestFilter,
  RedFormat,
  type ColorRepresentation,
} from 'three';

let gradient: DataTexture | null = null;

/** Gradient 3 bậc cho hiệu ứng tô màu kiểu hoạt hình. */
function toonGradient(): DataTexture {
  if (!gradient) {
    gradient = new DataTexture(new Uint8Array([110, 190, 255]), 3, 1, RedFormat);
    gradient.minFilter = NearestFilter;
    gradient.magFilter = NearestFilter;
    gradient.generateMipmaps = false;
    gradient.needsUpdate = true;
  }
  return gradient;
}

const cache = new Map<string, MeshToonMaterial>();

/** Vật liệu toon dùng chung theo màu, để hàng chục cây không tạo hàng chục vật liệu giống nhau. */
export function toon(color: ColorRepresentation, options: { vertexColors?: boolean } = {}): MeshToonMaterial {
  const key = `${new Color(color).getHexString()}|${options.vertexColors ? 'vc' : ''}`;
  let material = cache.get(key);
  if (!material) {
    material = new MeshToonMaterial({
      color,
      gradientMap: toonGradient(),
      vertexColors: options.vertexColors ?? false,
    });
    cache.set(key, material);
  }
  return material;
}
