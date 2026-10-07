import type { ComponentChildren } from 'preact';
import { t } from '../i18n';

interface SheetProps {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  testId?: string;
  class?: string;
}

/** Bảng trượt từ dưới lên (điện thoại) hoặc hộp thoại giữa màn hình (máy tính). */
export function Sheet({ title, onClose, children, testId, class: extra = '' }: SheetProps) {
  return (
    <div class="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section class={`sheet ${extra}`} role="dialog" aria-label={title} data-testid={testId}>
        <header class="sheet-header">
          <h2>{title}</h2>
          <button class="icon-btn" onClick={onClose} aria-label={t('common.close')}>
            ✕
          </button>
        </header>
        <div class="sheet-body">{children}</div>
      </section>
    </div>
  );
}
