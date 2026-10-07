import { signal } from '@preact/signals-core';
import { en } from './en';
import { vi, type MessageKey } from './vi';

export type { MessageKey };
export type Messages = Record<MessageKey, string>;

// Thêm ngôn ngữ mới: tạo file có kiểu `Messages` rồi đăng ký ở đây và trong LOCALES (core/settings.ts).
export const DICTIONARIES = { vi, en } satisfies Record<string, Messages>;
export type LocaleId = keyof typeof DICTIONARIES;

const NUMBER_LOCALE: Record<LocaleId, string> = { vi: 'vi-VN', en: 'en-US' };

/**
 * Ngôn ngữ hiện tại. Là signal nên component Preact gọi `t()` lúc render sẽ tự vẽ lại khi đổi ngôn ngữ.
 */
const current = signal<LocaleId>('vi');
const numberFormats = new Map<LocaleId, Intl.NumberFormat>();

const isLocale = (id: string): id is LocaleId => Object.hasOwn(DICTIONARIES, id);

export function setLocale(next: string): void {
  if (!isLocale(next)) return;
  current.value = next;
  if (typeof document !== 'undefined') document.documentElement.lang = next;
}

export const getLocale = (): LocaleId => current.value;

function numberFormat(): Intl.NumberFormat {
  const id = current.value;
  let format = numberFormats.get(id);
  if (!format) {
    format = new Intl.NumberFormat(NUMBER_LOCALE[id]);
    numberFormats.set(id, format);
  }
  return format;
}

export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const template = DICTIONARIES[current.value][key] ?? vi[key] ?? key;
  if (!params) return template;
  const format = numberFormat();
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    if (value === undefined) return match;
    return typeof value === 'number' ? format.format(value) : value;
  });
}

export const formatNumber = (n: number): string => numberFormat().format(n);
