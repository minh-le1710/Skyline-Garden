// Phát nhạc nền: bộ lập lịch nhìn trước (mỗi 100 ms, đặt lịch 0,3 s phía trước theo ctx.currentTime),
// các nhạc cụ tổng hợp, chuyển bản nhạc mượt. Chỉ "diễn" các NoteEvent mà composer.ts soạn ra.
// Module này được tải lười (chunk riêng) sau khi người chơi chạm lần đầu.
import { Rng } from '../../game/rng';
import { noiseBuffer } from '../synth';
import { composeBar, newMemory, type NoteEvent } from './composer';
import { THEMES, type Theme, type ThemeId } from './themes';

const TICK_MS = 100;
const LOOKAHEAD_S = 0.3;
const CROSSFADE_S = 1.5;
const PAD_ATTACK_S = 2;
const PAD_RELEASE_S = 3;
/** Pad: 3 giọng lệch nhau ±4 cent, xen kẽ tam giác / sin. */
const PAD_DETUNE = [-4, 0, 4] as const;
const DELAY_S = 0.43;
const DELAY_FEEDBACK = 0.3;
const SILENT = 0.0001;

const midiHz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

interface Scheduled {
  at: number;
  ev: NoteEvent;
}

/** Một bản nhạc đang phát: có đầu ra riêng để chuyển bản bằng cách mờ dần. */
class ThemeRun {
  readonly out: GainNode;
  private readonly rng = new Rng(Math.floor(Math.random() * 4294967296) >>> 0);
  private readonly memory = newMemory();
  private bar = 0;
  private nextBarAt: number;
  private pending: Scheduled[] = [];
  private readonly padIn: BiquadFilterNode;
  private readonly melodyIn: GainNode;
  private readonly loops: AudioScheduledSourceNode[] = [];
  private padVoice = 0;

  constructor(
    private readonly ctx: AudioContext,
    dest: AudioNode,
    readonly theme: Theme,
  ) {
    const t = ctx.currentTime;
    this.out = ctx.createGain();
    this.out.gain.setValueAtTime(0, t);
    this.out.gain.linearRampToValueAtTime(1, t + CROSSFADE_S);
    this.out.connect(dest);

    // Pad đi qua bộ lọc thấp có LFO rất chậm quét tần số cắt.
    this.padIn = ctx.createBiquadFilter();
    this.padIn.type = 'lowpass';
    this.padIn.frequency.value = theme.pad.cutoff;
    this.padIn.Q.value = 0.5;
    this.padIn.connect(this.out);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = theme.pad.lfoDepth;
    lfo.connect(lfoDepth).connect(this.padIn.frequency);
    lfo.start(t);
    this.loops.push(lfo);

    // Giai điệu có tiếng vọng (delay có hồi tiếp).
    this.melodyIn = ctx.createGain();
    this.melodyIn.connect(this.out);
    const delay = ctx.createDelay(1);
    delay.delayTime.value = DELAY_S;
    const feedback = ctx.createGain();
    feedback.gain.value = DELAY_FEEDBACK;
    this.melodyIn.connect(delay);
    delay.connect(feedback).connect(delay);
    delay.connect(this.out);

    if (theme.drone) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx);
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = theme.drone.cutoff;
      const gain = ctx.createGain();
      gain.gain.value = theme.drone.gain;
      src.connect(filter).connect(gain).connect(this.out);
      src.start(t);
      this.loops.push(src);
    }
    this.nextBarAt = t + 0.1;
  }

  /** Soạn các ô nhịp sắp tới và đặt lịch các nốt bắt đầu trước `until`. */
  schedule(until: number): void {
    const now = this.ctx.currentTime;
    const beat = 60 / this.theme.bpm;
    // Bị trễ (tab treo một lúc): bỏ qua đoạn đã lỡ thay vì phát dồn.
    if (this.nextBarAt < now) this.nextBarAt = now + 0.05;
    while (this.nextBarAt < until) {
      for (const ev of composeBar(this.rng, this.theme, this.bar, this.memory))
        this.pending.push({ at: this.nextBarAt + ev.beat * beat, ev });
      this.bar++;
      this.nextBarAt += this.theme.beatsPerBar * beat;
    }
    const later: Scheduled[] = [];
    for (const p of this.pending) {
      if (p.at >= until) later.push(p);
      else if (p.at >= now - 0.05) this.render(p.ev, Math.max(p.at, now), beat);
    }
    this.pending = later;
  }

  fadeOut(): void {
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(this.out.gain.value, t);
    this.out.gain.linearRampToValueAtTime(0, t + CROSSFADE_S);
  }

  dispose(): void {
    for (const src of this.loops) {
      try {
        src.stop();
      } catch {
        // đã dừng
      }
    }
    this.out.disconnect();
    this.pending = [];
  }

  private render(ev: NoteEvent, at: number, beat: number): void {
    const hz = midiHz(ev.midi);
    switch (ev.instrument) {
      case 'pad': {
        const voice = this.padVoice++ % 3;
        const osc = this.ctx.createOscillator();
        osc.type = voice === 1 ? 'sine' : 'triangle';
        osc.frequency.value = hz;
        osc.detune.value = PAD_DETUNE[voice]!;
        const amp = this.ctx.createGain();
        const peak = this.theme.pad.gain * ev.velocity;
        const end = at + Math.max(PAD_ATTACK_S, ev.length * beat);
        amp.gain.setValueAtTime(0, at);
        amp.gain.linearRampToValueAtTime(peak, at + PAD_ATTACK_S);
        amp.gain.setValueAtTime(peak, end);
        amp.gain.linearRampToValueAtTime(0, end + PAD_RELEASE_S);
        this.voice(osc, amp, this.padIn, at, end + PAD_RELEASE_S);
        break;
      }
      case 'kalimba':
        // Sin + họa âm bậc 2 (30%), tắt dần 1,2 s.
        this.pluck(hz, at, 1.2, 0.08 * ev.velocity, ev.pan, 0.3);
        break;
      case 'chime':
        this.pluck(hz, at, 1.5, 0.035 * ev.velocity, ev.pan, 0);
        break;
      case 'drip':
        this.pluck(hz, at, 0.35, 0.06 * ev.velocity, ev.pan, 0, 0.7);
        break;
      case 'bass': {
        const osc = this.ctx.createOscillator();
        osc.frequency.value = hz;
        const amp = this.ctx.createGain();
        this.decay(amp.gain, at, 0.01, 0.06 * ev.velocity, at + 2);
        this.voice(osc, amp, this.out, at, at + 2);
        break;
      }
    }
  }

  /** Nốt gảy: sin (+ họa âm bậc 2), có thể trượt cao độ xuống (`bend` < 1, tiếng giọt nước). */
  private pluck(hz: number, at: number, dur: number, peak: number, pan: number, partial2: number, bend = 1) {
    const end = at + dur;
    const amp = this.ctx.createGain();
    this.decay(amp.gain, at, bend === 1 ? 0.005 : 0.002, peak, end);
    let dest: AudioNode = this.melodyIn;
    if (pan !== 0 && typeof this.ctx.createStereoPanner === 'function') {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = pan;
      panner.connect(this.melodyIn);
      dest = panner;
    }
    const osc = this.ctx.createOscillator();
    osc.frequency.setValueAtTime(hz, at);
    if (bend !== 1) osc.frequency.exponentialRampToValueAtTime(hz * bend, at + 0.09);
    this.voice(osc, amp, dest, at, end);
    if (partial2 > 0) {
      const over = this.ctx.createOscillator();
      over.frequency.value = hz * 2;
      const g = this.ctx.createGain();
      g.gain.value = partial2;
      over.connect(g).connect(amp);
      over.start(at);
      over.stop(end);
    }
  }

  private decay(param: AudioParam, at: number, attack: number, peak: number, end: number): void {
    param.setValueAtTime(0, at);
    param.linearRampToValueAtTime(peak, at + attack);
    param.exponentialRampToValueAtTime(SILENT, end);
  }

  /** Nối nguồn → đường bao → đích, chạy trong [at, end] rồi tự ngắt. */
  private voice(osc: OscillatorNode, amp: GainNode, dest: AudioNode, at: number, end: number): void {
    osc.connect(amp).connect(dest);
    osc.start(at);
    osc.stop(end + 0.02);
    osc.addEventListener('ended', () => amp.disconnect());
  }
}

/** Nhạc nền sinh tự động. Âm lượng do bus nhạc của AudioEngine quyết định. */
export class MusicPlayer {
  private current: ThemeRun | null = null;
  private readonly fading = new Set<ThemeRun>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly ctx: AudioContext,
    private readonly dest: AudioNode,
  ) {}

  get theme(): ThemeId | null {
    return this.current?.theme.id ?? null;
  }

  /** Phát (hoặc chuyển sang) một bản nhạc; bản cũ mờ dần trong 1,5 s. */
  play(id: ThemeId): void {
    if (this.current?.theme.id === id) return;
    this.retireCurrent();
    this.current = new ThemeRun(this.ctx, this.dest, THEMES[id]);
    this.timer ??= setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  /** Dừng nhạc (mờ dần). */
  stop(): void {
    this.retireCurrent();
  }

  private retireCurrent(): void {
    const run = this.current;
    if (!run) return;
    this.current = null;
    run.fadeOut();
    this.fading.add(run);
    setTimeout(
      () => {
        run.dispose();
        this.fading.delete(run);
        this.tick();
      },
      (CROSSFADE_S + 0.2) * 1000,
    );
  }

  private tick(): void {
    if (this.current) this.current.schedule(this.ctx.currentTime + LOOKAHEAD_S);
    else if (this.fading.size === 0 && this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
