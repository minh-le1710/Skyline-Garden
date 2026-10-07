import { t } from '../i18n';
import { applyUpdate, pwa } from '../platform/pwa';
import { useGame } from './context';

/** Thanh báo bản cập nhật mới: người chơi bấm "Tải lại" thì game lưu rồi chuyển sang bản mới. */
export function UpdateBanner() {
  const game = useGame();
  if (!pwa.needRefresh.value) return null;
  return (
    <div class="update-banner" role="status" data-testid="update-banner">
      <span>{t('pwa.updateAvailable')}</span>
      <button onClick={() => applyUpdate(game)} data-testid="update-reload">
        {t('pwa.reload')}
      </button>
    </div>
  );
}
