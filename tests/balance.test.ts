import { describe, expect, it } from 'vitest';
import { checkInvariants } from '../src/game';
import { Bot, type BotDay } from './bot';

/** Nửa đêm (UTC+7) của một ngày cố định, để bot chơi theo giờ trong ngày. */
const START = Date.UTC(2026, 0, 4, 17, 0, 0);

describe('cân bằng kinh tế (bot chơi 28 ngày)', () => {
  it('lên cấp đều, không bao giờ âm tiền hay vi phạm bất biến', () => {
    const bot = new Bot(12345, START);
    const days: BotDay[] = [];
    bot.play(28, (d) => {
      days.push(d);
      expect(checkInvariants(bot.state)).toEqual([]);
      expect(bot.state.gold).toBeGreaterThanOrEqual(0);
    });
    if (process.env.SIM_VERBOSE) console.table(days);
    const levelOn = (day: number) => days[day - 1]!.level;
    // Bot chơi khá vụng (tham lam, 5 lượt/ngày), nên đây là cận dưới của người chơi thật.
    // Lần chạy gốc: ngày 1 → cấp 6, ngày 7 → 15, ngày 21 → 24, ngày 28 → 27.
    expect(levelOn(1)).toBeGreaterThanOrEqual(5);
    expect(levelOn(1)).toBeLessThanOrEqual(9);
    expect(levelOn(7)).toBeGreaterThanOrEqual(13);
    expect(levelOn(7)).toBeLessThanOrEqual(19);
    expect(levelOn(21)).toBeGreaterThanOrEqual(21);
    expect(levelOn(21)).toBeLessThanOrEqual(30);
    expect(levelOn(28)).toBeLessThanOrEqual(34);
    // Có dùng đủ các hệ thống: mở hết tầng, có máy.
    expect(days.at(-1)!.floors).toBe(8);
    expect(days.at(-1)!.machines).toBeGreaterThanOrEqual(5);
  }, 120_000);
});
