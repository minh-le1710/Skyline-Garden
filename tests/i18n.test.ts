import { describe, expect, it } from 'vitest';
import { en } from '../src/i18n/en';
import { vi } from '../src/i18n/vi';

const placeholders = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

describe('i18n', () => {
  it('en và vi có cùng bộ khóa', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(vi).sort());
  });

  it('mỗi câu dịch giữ nguyên các tham số {name}', () => {
    const mismatched = Object.keys(vi).filter((key) => {
      const k = key as keyof typeof vi;
      return placeholders(vi[k]).join() !== placeholders(en[k]).join();
    });
    expect(mismatched).toEqual([]);
  });

  it('không có câu rỗng', () => {
    for (const dict of [vi, en]) {
      expect(Object.entries(dict).filter(([, v]) => v.trim() === '')).toEqual([]);
    }
  });

  it('bản tiếng Anh không còn sót chữ tiếng Việt', () => {
    // Các chữ cái chỉ có trong tiếng Việt (không xuất hiện trong tiếng Anh).
    const viLetters = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i;
    const leftovers = Object.entries(en).filter(([, v]) => viLetters.test(v));
    expect(leftovers).toEqual([]);
  });
});
