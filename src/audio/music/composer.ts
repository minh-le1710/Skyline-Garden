// Soạn nhạc nền theo từng ô nhịp. THUẦN: không Web Audio, không DOM, không Math.random.
// Cùng seed và cùng chuỗi ô nhịp luôn ra cùng một bản nhạc (được kiểm tra bằng unit test).
import type { Rng } from '../../game/rng';
import type { Chord, InstrumentId, Theme } from './themes';

export interface NoteEvent {
  /** Thời điểm bắt đầu, tính bằng phách kể từ đầu ô nhịp. */
  beat: number;
  /** Độ dài (phách). Pad giữ nốt đúng chừng này; nhạc cụ gảy tự tắt theo đường bao riêng. */
  length: number;
  /** Cao độ MIDI (60 = C4). */
  midi: number;
  /** 0..1 */
  velocity: number;
  instrument: InstrumentId;
  /** -1 (trái) .. 1 (phải). */
  pan: number;
}

/** Trạng thái giai điệu nối giữa các ô nhịp: bước đi ngẫu nhiên tiếp tục từ nốt trước. */
export interface ComposerMemory {
  /** Vị trí trong danh sách nốt của thang âm; -1 là chưa bắt đầu. */
  melodyIndex: number;
}

export const newMemory = (): ComposerMemory => ({ melodyIndex: -1 });

const pitchClass = (midi: number, tonic = 0): number => (((midi - tonic) % 12) + 12) % 12;

/** Các nốt của thang âm trong khoảng [low, high], tăng dần. */
export function scaleNotes(theme: Theme, low: number, high: number): number[] {
  const notes: number[] = [];
  for (let n = low; n <= high; n++) if (theme.scale.includes(pitchClass(n, theme.tonic))) notes.push(n);
  return notes;
}

export const chordAt = (theme: Theme, bar: number): Chord =>
  theme.chords[Math.floor(bar / theme.barsPerChord) % theme.chords.length]!;

/** Ô nhịp này mở đầu một hợp âm mới. */
export const isChordChange = (theme: Theme, bar: number): boolean => bar % theme.barsPerChord === 0;

/** Ô nhịp có chuỗi lấp lánh (ô thứ 4, 8, 12… nếu every = 4). */
export const hasSparkle = (theme: Theme, bar: number): boolean =>
  theme.sparkle !== null && (bar + 1) % theme.sparkle.every === 0;

/** Phản xạ chỉ số ở hai đầu để bước đi không dính vào biên. */
function reflect(i: number, n: number): number {
  if (n <= 1) return 0;
  if (i < 0) i = -i;
  if (i > n - 1) i = 2 * (n - 1) - i;
  return Math.min(n - 1, Math.max(0, i));
}

/**
 * Soạn một ô nhịp: pad (khi đổi hợp âm), bass ở phách 1, giai điệu đi ngẫu nhiên ±1–2 bậc theo
 * móc đơn (ưu tiên nốt hợp âm ở phách mạnh), và chuỗi lấp lánh mỗi vài ô nhịp.
 * `memory` giữ nốt giai điệu cuối để ô nhịp sau đi tiếp; bỏ qua thì giai điệu bắt đầu từ giữa khoảng.
 */
export function composeBar(
  rng: Rng,
  theme: Theme,
  bar: number,
  memory: ComposerMemory = newMemory(),
): NoteEvent[] {
  const events: NoteEvent[] = [];
  const chord = chordAt(theme, bar);
  const change = isChordChange(theme, bar);
  const beats = theme.beatsPerBar;

  if (change) {
    chord.pad.forEach((midi, i) =>
      events.push({
        beat: 0,
        length: beats * theme.barsPerChord,
        midi,
        velocity: 1,
        instrument: 'pad',
        pan: (i - 1) * 0.3,
      }),
    );
  }
  events.push({ beat: 0, length: beats, midi: chord.root, velocity: 1, instrument: 'bass', pan: 0 });

  const m = theme.melody;
  const notes = scaleNotes(theme, m.low, m.high);
  const isChordTone = (midi: number) => chord.tones.includes(pitchClass(midi));
  if (memory.melodyIndex < 0 || memory.melodyIndex >= notes.length)
    memory.melodyIndex = Math.floor(notes.length / 2);
  for (let eighth = 0; eighth < beats * 2; eighth++) {
    // Hai móc đơn của phách 1 khi đổi hợp âm thưa hơn.
    const prob = change && eighth < 2 ? m.probOnChange : m.prob;
    if (rng.next() >= prob) continue;
    const step = rng.int(1, 2) * (rng.next() < 0.5 ? -1 : 1);
    let index = reflect(memory.melodyIndex + step, notes.length);
    const strong = eighth % 4 === 0; // phách 1 và 3
    if (strong && !isChordTone(notes[index]!)) {
      // Trượt sang nốt hợp âm liền kề (thứ tự thử ngẫu nhiên), nếu có.
      const dir = rng.next() < 0.5 ? -1 : 1;
      for (const d of [dir, -dir]) {
        const j = index + d;
        if (j >= 0 && j < notes.length && isChordTone(notes[j]!)) {
          index = j;
          break;
        }
      }
    }
    memory.melodyIndex = index;
    events.push({
      beat: eighth / 2,
      length: 0.5,
      midi: notes[index]!,
      velocity: (strong ? 0.8 : 0.6) + rng.next() * 0.2,
      instrument: m.instrument,
      pan: (rng.next() * 2 - 1) * m.pan,
    });
  }

  if (theme.sparkle && hasSparkle(theme, bar)) {
    const s = theme.sparkle;
    const high = scaleNotes(theme, s.low, s.high);
    const start = 2 + rng.int(0, 2) * 0.5; // phách 3 .. 4
    const first = rng.int(0, high.length - 3);
    const down = rng.next() < 0.5;
    for (let k = 0; k < 3; k++) {
      events.push({
        beat: start + k * 0.25,
        length: 0.25,
        midi: high[down ? first + 2 - k : first + k]!,
        velocity: 0.5 + rng.next() * 0.2,
        instrument: s.instrument,
        pan: (rng.next() * 2 - 1) * 0.6,
      });
    }
  }
  return events;
}
