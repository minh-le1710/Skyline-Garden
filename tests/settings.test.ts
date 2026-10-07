import { describe, expect, it } from 'vitest';
import { SETTINGS_KEY, SettingsStore, defaultSettings, parseSettings } from '../src/core/settings';

describe('cài đặt', () => {
  it('dữ liệu lạ trở về mặc định, không ném lỗi', () => {
    for (const bad of [
      null,
      '',
      '{oops',
      '[]',
      '42',
      '{"sfx":"x","locale":"fr","quality":"ultra","seenTips":7}',
    ]) {
      expect(parseSettings(bad)).toEqual(defaultSettings());
    }
  });

  it('kẹp âm lượng trong 0..1 và giữ các giá trị hợp lệ', () => {
    const s = parseSettings(
      JSON.stringify({ sfx: 3, music: -1, locale: 'en', muted: true, seenTips: ['a', 1] }),
    );
    expect(s).toMatchObject({ sfx: 1, music: 0, locale: 'en', muted: true, seenTips: ['a'] });
  });

  it('lưu ngay khi cập nhật', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    };
    const store = new SettingsStore(storage);
    store.update({ locale: 'en', music: 0.25 });
    expect(JSON.parse(data.get(SETTINGS_KEY)!)).toMatchObject({ locale: 'en', music: 0.25 });
    expect(new SettingsStore(storage).value.value.locale).toBe('en');
  });
});
