// Định nghĩa các bản nhạc nền sinh tự động. Chỉ là dữ liệu: composer.ts đọc để soạn từng ô nhịp.
// File này thuần (không Web Audio, không DOM) như composer.ts.

/** Nhạc cụ mà MusicPlayer biết cách phát. */
export type InstrumentId = 'pad' | 'kalimba' | 'bass' | 'chime' | 'drip';
export type ThemeId = 'garden' | 'mine';

export interface Chord {
  /** Nốt bass (MIDI), chơi ở phách 1 mỗi ô nhịp. */
  root: number;
  /** Ba giọng pad (MIDI). */
  pad: readonly number[];
  /** Lớp cao độ (0..11, 0 = C) của các nốt trong hợp âm: giai điệu ưu tiên chúng ở phách mạnh. */
  tones: readonly number[];
}

export interface Theme {
  id: ThemeId;
  bpm: number;
  beatsPerBar: number;
  /** Lớp cao độ của chủ âm (0 = C). */
  tonic: number;
  /** Các bậc của thang âm, tính bằng nửa cung từ chủ âm. */
  scale: readonly number[];
  chords: readonly Chord[];
  /** Mỗi hợp âm giữ bao nhiêu ô nhịp. */
  barsPerChord: number;
  melody: {
    instrument: InstrumentId;
    /** Khoảng cao độ (MIDI, gồm cả hai đầu). */
    low: number;
    high: number;
    /** Xác suất có nốt ở mỗi móc đơn. */
    prob: number;
    /** Xác suất ở phách vừa đổi hợp âm (thưa hơn để nghe rõ hợp âm mới). */
    probOnChange: number;
    /** Nốt được đặt ngẫu nhiên trong khoảng ±pan. */
    pan: number;
  };
  /** Chuỗi 3 nốt lấp lánh ở cuối mỗi `every` ô nhịp; null nếu không có. */
  sparkle: { every: number; instrument: InstrumentId; low: number; high: number } | null;
  pad: { cutoff: number; lfoDepth: number; gain: number };
  /** Tiếng ù nền (nhiễu lọc thấp), null nếu không có. */
  drone: { cutoff: number; gain: number } | null;
}

/** Vườn trên mây: F trưởng ngũ cung, 70 BPM, Fmaj7 → Dm7 → B♭maj7 → C6sus, mỗi hợp âm 2 ô nhịp. */
const GARDEN: Theme = {
  id: 'garden',
  bpm: 70,
  beatsPerBar: 4,
  tonic: 5,
  scale: [0, 2, 4, 7, 9], // F G A C D
  chords: [
    { root: 53, pad: [57, 60, 64], tones: [5, 9, 0, 4] }, // Fmaj7
    { root: 50, pad: [57, 60, 65], tones: [2, 5, 9, 0] }, // Dm7
    { root: 46, pad: [57, 62, 65], tones: [10, 2, 5, 9] }, // B♭maj7
    { root: 48, pad: [55, 60, 65], tones: [0, 5, 7, 9] }, // C6sus
  ],
  barsPerChord: 2,
  melody: { instrument: 'kalimba', low: 72, high: 96, prob: 0.28, probOnChange: 0.1, pan: 0.4 }, // C5..C7
  sparkle: { every: 4, instrument: 'chime', low: 89, high: 101 }, // F6..F7
  pad: { cutoff: 900, lfoDepth: 300, gain: 0.05 },
  drone: null,
};

/** Hầm mỏ: D dorian, 60 BPM, pad tối hơn, tiếng giọt nước và tiếng ù trầm. */
const MINE: Theme = {
  id: 'mine',
  bpm: 60,
  beatsPerBar: 4,
  tonic: 2,
  scale: [0, 2, 3, 5, 7, 9, 10], // D E F G A B C
  chords: [
    { root: 50, pad: [53, 57, 60], tones: [2, 5, 9, 0] }, // Dm7
    { root: 48, pad: [55, 59, 64], tones: [0, 4, 7, 11] }, // Cmaj7
    { root: 43, pad: [59, 62, 64], tones: [7, 11, 2, 4] }, // G6
    { root: 45, pad: [55, 60, 64], tones: [9, 0, 4, 7] }, // Am7
  ],
  barsPerChord: 2,
  melody: { instrument: 'drip', low: 74, high: 98, prob: 0.15, probOnChange: 0.05, pan: 0.6 }, // D5..D7
  sparkle: null,
  pad: { cutoff: 600, lfoDepth: 200, gain: 0.045 },
  drone: { cutoff: 120, gain: 0.02 },
};

export const THEMES: Record<ThemeId, Theme> = { garden: GARDEN, mine: MINE };
