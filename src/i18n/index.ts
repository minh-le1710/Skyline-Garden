import { vi, type MessageKey } from './vi';

export type { MessageKey };
export type Messages = Record<MessageKey, string>;

// Thêm ngôn ngữ mới: tạo file en.ts có kiểu `Messages` rồi đăng ký ở đây.
const dictionaries: Record<string, Messages> = { vi };

let locale = 'vi';
let messages: Messages = vi;
let numberFormat = new Intl.NumberFormat('vi-VN');

export function setLocale(next: string): void {
  const dict = dictionaries[next];
  if (!dict) return;
  locale = next;
  messages = dict;
  numberFormat = new Intl.NumberFormat(next);
  document.documentElement.lang = next;
}

export const getLocale = (): string => locale;

export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const template = messages[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    if (value === undefined) return match;
    return typeof value === 'number' ? numberFormat.format(value) : value;
  });
}

export const formatNumber = (n: number): string => numberFormat.format(n);
