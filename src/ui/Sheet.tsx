import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { t } from '../i18n';

interface SheetProps {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  testId?: string;
  class?: string;
}

const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Bảng trượt từ dưới lên (điện thoại) hoặc hộp thoại giữa màn hình (máy tính).
 * Trợ năng: nhận focus khi mở, giữ phím Tab bên trong, Escape để đóng, trả focus về chỗ cũ khi đóng.
 */
export function Sheet({ title, onClose, children, testId, class: extra = '' }: SheetProps) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'Tab' && ref.current) {
        const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
        if (!items.length) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div class="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section
        ref={ref}
        class={`sheet ${extra}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        data-testid={testId}
      >
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

interface ConfirmProps {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Hộp thoại xác nhận cho thao tác khó hoàn tác (chơi lại, nhập save). */
export function ConfirmDialog({ title, message, confirmLabel, danger, onConfirm, onCancel }: ConfirmProps) {
  return (
    <Sheet title={title} onClose={onCancel} class="small" testId="confirm">
      <p>{message}</p>
      <div class="dialog-actions">
        <button class="btn" onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button class={`btn ${danger ? 'danger' : 'primary'}`} onClick={onConfirm} data-testid="confirm-ok">
          {confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}
