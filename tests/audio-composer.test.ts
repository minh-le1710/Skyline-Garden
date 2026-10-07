import { describe, expect, it } from 'vitest';
import {
  chordAt,
  composeBar,
  hasSparkle,
  isChordChange,
  newMemory,
  scaleNotes,
  type NoteEvent,
} from '../src/audio/music/composer';
import { THEMES, type Theme } from '../src/audio/music/themes';
import { Rng } from '../src/game/rng';

const MELODY: NoteEvent['instrument'][] = ['kalimba', 'drip'];
const pc = (midi: number) => ((midi % 12) + 12) % 12;

/** Soạn liền `bars` ô nhịp với một seed (như MusicPlayer làm). */
function compose(theme: Theme, seed: number, bars: number): NoteEvent[][] {
  const rng = new Rng(seed);
  const memory = newMemory();
  return Array.from({ length: bars }, (_, bar) => composeBar(rng, theme, bar, memory));
}

describe('composeBar (garden)', () => {
  const garden = THEMES.garden;

  it('tất định theo seed', () => {
    expect(compose(garden, 1234, 32)).toEqual(compose(garden, 1234, 32));
    expect(compose(garden, 1234, 32)).not.toEqual(compose(garden, 1235, 32));
  });

  it('giai điệu nằm trong C5..C7 và trong thang F ngũ cung', () => {
    const fPentatonic = new Set([5, 7, 9, 0, 2]); // F G A C D
    const notes = compose(garden, 7, 400)
      .flat()
      .filter((e) => e.instrument === 'kalimba');
    expect(notes.length).toBeGreaterThan(100);
    for (const n of notes) {
      expect(n.midi).toBeGreaterThanOrEqual(72);
      expect(n.midi).toBeLessThanOrEqual(96);
      expect(fPentatonic.has(pc(n.midi))).toBe(true);
      expect(Math.abs(n.pan)).toBeLessThanOrEqual(0.4);
      expect(n.velocity).toBeGreaterThan(0);
      expect(n.velocity).toBeLessThanOrEqual(1);
      // Móc đơn: phách 0, 0.5, 1 … 3.5.
      expect(Number.isInteger(n.beat * 2)).toBe(true);
      expect(n.beat).toBeLessThan(garden.beatsPerBar);
    }
  });

  it('bước đi ngẫu nhiên chỉ nhảy 1–2 bậc thang âm giữa hai nốt liền nhau', () => {
    const scale = scaleNotes(garden, garden.melody.low, garden.melody.high);
    const melody = compose(garden, 99, 200)
      .flat()
      .filter((e) => e.instrument === 'kalimba')
      .map((e) => scale.indexOf(e.midi));
    for (let i = 1; i < melody.length; i++) {
      // Bước ±1–2, cộng thêm tối đa 1 bậc khi trượt sang nốt hợp âm ở phách mạnh.
      expect(Math.abs(melody[i]! - melody[i - 1]!)).toBeLessThanOrEqual(3);
    }
  });

  it('phách mạnh ưu tiên nốt hợp âm', () => {
    let strong = 0;
    let chordTones = 0;
    compose(garden, 5, 400).forEach((events, bar) => {
      const tones = chordAt(garden, bar).tones;
      for (const e of events) {
        if (e.instrument !== 'kalimba' || e.beat % 2 !== 0) continue;
        strong++;
        if (tones.includes(pc(e.midi))) chordTones++;
      }
    });
    expect(strong).toBeGreaterThan(50);
    expect(chordTones / strong).toBeGreaterThan(0.9);
  });

  it('bass chơi nốt gốc của hợp âm ở phách 1 mỗi ô nhịp; pad chỉ khi đổi hợp âm', () => {
    compose(garden, 3, 32).forEach((events, bar) => {
      const chord = chordAt(garden, bar);
      const bass = events.filter((e) => e.instrument === 'bass');
      expect(bass).toHaveLength(1);
      expect(bass[0]).toMatchObject({ beat: 0, midi: chord.root });
      const pad = events.filter((e) => e.instrument === 'pad');
      if (isChordChange(garden, bar)) {
        expect(pad.map((e) => e.midi)).toEqual(chord.pad);
        for (const e of pad) expect(e.beat).toBe(0);
      } else {
        expect(pad).toHaveLength(0);
      }
    });
    // Fmaj7 → Dm7 → B♭maj7 → C6sus, mỗi hợp âm 2 ô nhịp.
    expect([0, 2, 4, 6, 8].map((bar) => chordAt(garden, bar).root % 12)).toEqual([5, 2, 10, 0, 5]);
  });

  it('mật độ giai điệu khớp xác suất 0.28 (0.1 ở phách đổi hợp âm)', () => {
    const bars = compose(garden, 2024, 3000);
    let normalSlots = 0;
    let normalNotes = 0;
    let changeSlots = 0;
    let changeNotes = 0;
    bars.forEach((events, bar) => {
      const melody = events.filter((e) => e.instrument === 'kalimba');
      const change = isChordChange(garden, bar);
      for (let eighth = 0; eighth < garden.beatsPerBar * 2; eighth++) {
        const hit = melody.some((e) => e.beat === eighth / 2);
        if (change && eighth < 2) {
          changeSlots++;
          if (hit) changeNotes++;
        } else {
          normalSlots++;
          if (hit) normalNotes++;
        }
      }
    });
    expect(normalNotes / normalSlots).toBeCloseTo(0.28, 1);
    expect(Math.abs(normalNotes / normalSlots - 0.28)).toBeLessThan(0.02);
    expect(Math.abs(changeNotes / changeSlots - 0.1)).toBeLessThan(0.03);
  });

  it('cứ ô nhịp thứ 4 có chuỗi chuông lấp lánh 3 nốt', () => {
    const sparkle = garden.sparkle!;
    const sparkleNotes = scaleNotes(garden, sparkle.low, sparkle.high);
    compose(garden, 11, 40).forEach((events, bar) => {
      const chimes = events.filter((e) => e.instrument === 'chime');
      if ((bar + 1) % 4 === 0) {
        expect(hasSparkle(garden, bar)).toBe(true);
        expect(chimes).toHaveLength(3);
        for (const c of chimes) {
          expect(sparkleNotes).toContain(c.midi);
          expect(c.beat).toBeLessThan(garden.beatsPerBar);
        }
      } else {
        expect(chimes).toHaveLength(0);
      }
    });
  });
});

describe('composeBar (mine)', () => {
  const mine = THEMES.mine;

  it('dùng D dorian, 60 BPM, tiếng giọt nước thưa', () => {
    expect(mine.bpm).toBe(60);
    const dDorian = new Set([2, 4, 5, 7, 9, 11, 0]); // D E F G A B C
    const bars = compose(mine, 42, 2000);
    const drips = bars.flat().filter((e) => e.instrument === 'drip');
    for (const n of drips) {
      expect(dDorian.has(pc(n.midi))).toBe(true);
      expect(n.midi).toBeGreaterThanOrEqual(mine.melody.low);
      expect(n.midi).toBeLessThanOrEqual(mine.melody.high);
    }
    // Khoảng 0.15 mỗi móc đơn (thưa hơn ở phách đổi hợp âm).
    const perEighth = drips.length / (bars.length * 8);
    expect(perEighth).toBeGreaterThan(0.11);
    expect(perEighth).toBeLessThan(0.16);
    // Mọi nốt của hầm mỏ (bass, pad) cũng thuộc D dorian.
    for (const e of bars.flat()) expect(dDorian.has(pc(e.midi))).toBe(true);
    expect(bars.flat().some((e) => e.instrument === 'chime')).toBe(false);
  });

  it('chỉ dùng nhạc cụ giai điệu của theme', () => {
    for (const theme of Object.values(THEMES)) {
      const melody = compose(theme, 8, 50)
        .flat()
        .filter((e) => MELODY.includes(e.instrument));
      expect(new Set(melody.map((e) => e.instrument))).toEqual(new Set([theme.melody.instrument]));
    }
  });
});
