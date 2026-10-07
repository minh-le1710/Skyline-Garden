import { t } from '../i18n';
import { useGame } from './context';

/** Che toàn màn hình khi game phải tạm dừng (save mới hơn, game mở ở tab khác). */
export function BlockingNotice() {
  const reason = useGame().blocked.value;
  if (!reason) return null;
  return (
    <div class="sheet-backdrop center blocking" data-testid="blocking-notice">
      <section class="levelup" role="alertdialog" aria-live="assertive">
        <div class="levelup-star">{reason === 'otherTab' ? '🪟' : '✨'}</div>
        <h2>{t(reason === 'otherTab' ? 'blocked.otherTab.title' : 'blocked.tooNew.title')}</h2>
        <p>{t(reason === 'otherTab' ? 'blocked.otherTab.body' : 'blocked.tooNew.body')}</p>
        <button class="btn primary big" onClick={() => location.reload()}>
          {t(reason === 'otherTab' ? 'blocked.otherTab.action' : 'blocked.tooNew.action')}
        </button>
      </section>
    </div>
  );
}
