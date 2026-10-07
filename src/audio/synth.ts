// Các khối tổng hợp âm thanh dùng chung cho hiệu ứng và nhạc nền. Mọi âm thanh đều sinh bằng code.

/** Bộ lọc của một lớp âm. */
export interface Filter {
  type: BiquadFilterType;
  /** Tần số cắt/trung tâm (Hz). */
  freq: number;
  q?: number;
}

/** Mức "im lặng" cho đường dốc hàm mũ (không được về 0 tuyệt đối). */
const SILENT = 0.0001;

export function makeFilter(ctx: BaseAudioContext, f: Filter): BiquadFilterNode {
  const node = ctx.createBiquadFilter();
  node.type = f.type;
  node.frequency.value = f.freq;
  if (f.q !== undefined) node.Q.value = f.q;
  return node;
}

/** Đường bao: lên tuyến tính trong `attack` giây tới `peak`, rồi tắt dần theo hàm mũ tới `end`. */
export function envelope(param: AudioParam, t0: number, attack: number, peak: number, end: number): void {
  const a = Math.min(attack, (end - t0) * 0.5);
  param.setValueAtTime(0, t0);
  param.linearRampToValueAtTime(peak, t0 + a);
  param.exponentialRampToValueAtTime(SILENT, end);
}

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

/** Bộ đệm nhiễu trắng 1 giây, tạo một lần cho mỗi AudioContext. */
export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buffer = noiseCache.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, buffer);
  }
  return buffer;
}

/** Đáp ứng xung cho tiếng vang: nhiễu stereo tắt dần theo hàm mũ (-60 dB ở cuối). */
export function makeImpulse(ctx: BaseAudioContext, seconds = 2): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp((-6.9 * i) / length);
  }
  return buffer;
}

/** Ngắt nút đầu ra khi nguồn phát xong, để cả chuỗi nút được thu hồi. */
function disconnectOnEnd(src: AudioScheduledSourceNode, out: AudioNode): void {
  src.addEventListener('ended', () => out.disconnect());
}

export interface ToneOptions {
  wave: OscillatorType;
  /** Tần số đầu (Hz); trượt theo hàm mũ tới f1 (rồi f2, nếu có, ở nửa sau). */
  f0: number;
  f1?: number;
  f2?: number;
  /** Thời điểm bắt đầu (giây, theo ctx.currentTime). */
  t0: number;
  /** Giây. */
  dur: number;
  /** Giây. */
  attack?: number;
  gain: number;
  /** [tần số rung Hz, biên độ rung Hz]. */
  vibrato?: readonly [number, number];
  filter?: Filter;
}

export function playTone(ctx: BaseAudioContext, dest: AudioNode, o: ToneOptions): OscillatorNode {
  const end = o.t0 + o.dur;
  const osc = ctx.createOscillator();
  osc.type = o.wave;
  osc.frequency.setValueAtTime(o.f0, o.t0);
  if (o.f1 !== undefined) {
    if (o.f2 !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(o.f1, o.t0 + o.dur / 2);
      osc.frequency.exponentialRampToValueAtTime(o.f2, end);
    } else {
      osc.frequency.exponentialRampToValueAtTime(o.f1, end);
    }
  }
  const amp = ctx.createGain();
  envelope(amp.gain, o.t0, o.attack ?? 0.003, o.gain, end);
  if (o.filter) {
    const filter = makeFilter(ctx, o.filter);
    osc.connect(filter).connect(amp);
  } else {
    osc.connect(amp);
  }
  amp.connect(dest);
  if (o.vibrato) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = o.vibrato[0];
    const depth = ctx.createGain();
    depth.gain.value = o.vibrato[1];
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(o.t0);
    lfo.stop(end);
  }
  osc.start(o.t0);
  osc.stop(end + 0.02);
  disconnectOnEnd(osc, amp);
  return osc;
}

export interface NoiseOptions {
  t0: number;
  dur: number;
  attack?: number;
  gain: number;
  /** `freq1`: tần số lọc trượt tới ở cuối (Hz). */
  filter: Filter & { freq1?: number };
}

export function playNoise(ctx: BaseAudioContext, dest: AudioNode, o: NoiseOptions): AudioBufferSourceNode {
  const end = o.t0 + o.dur;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const filter = makeFilter(ctx, o.filter);
  if (o.filter.freq1 !== undefined) {
    filter.frequency.setValueAtTime(o.filter.freq, o.t0);
    filter.frequency.exponentialRampToValueAtTime(o.filter.freq1, end);
  }
  const amp = ctx.createGain();
  envelope(amp.gain, o.t0, o.attack ?? 0.002, o.gain, end);
  src.connect(filter).connect(amp).connect(dest);
  // Bắt đầu ở vị trí ngẫu nhiên trong bộ đệm để hai lần phát không giống hệt nhau.
  src.start(o.t0, Math.random() * 0.5);
  src.stop(end + 0.02);
  disconnectOnEnd(src, amp);
  return src;
}

export interface FmOptions {
  /** Tần số sóng mang (Hz). */
  f0: number;
  /** Tỉ lệ tần số sóng điều chế / sóng mang. */
  ratio: number;
  /** Độ lệch tần số ban đầu (Hz), giảm tuyến tính về 0. */
  index0: number;
  t0: number;
  dur: number;
  gain: number;
}

/** Tiếng chuông FM: độ sáng giảm dần cùng âm lượng. */
export function playFm(ctx: BaseAudioContext, dest: AudioNode, o: FmOptions): OscillatorNode {
  const end = o.t0 + o.dur;
  const carrier = ctx.createOscillator();
  carrier.frequency.value = o.f0;
  const mod = ctx.createOscillator();
  mod.frequency.value = o.f0 * o.ratio;
  const index = ctx.createGain();
  index.gain.setValueAtTime(o.index0, o.t0);
  index.gain.linearRampToValueAtTime(0, end);
  mod.connect(index).connect(carrier.frequency);
  const amp = ctx.createGain();
  envelope(amp.gain, o.t0, 0.002, o.gain, end);
  carrier.connect(amp).connect(dest);
  mod.start(o.t0);
  mod.stop(end);
  carrier.start(o.t0);
  carrier.stop(end + 0.02);
  disconnectOnEnd(carrier, amp);
  return carrier;
}
