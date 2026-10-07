import { nextFloorUnlock } from '../game';
import { formatNumber, t } from '../i18n';
import { useGame } from './context';
import { GOLD } from './icons';
import { Sheet } from './Sheet';

export function UnlockDialog() {
  const game = useGame();
  const state = game.state.value;
  const next = nextFloorUnlock(state);
  const close = () => (game.ui.panel.value = null);
  if (!next) return null;
  const levelOk = state.level >= next.level;
  const goldOk = state.gold >= next.gold;

  return (
    <Sheet title={t('unlock.title', { n: next.floor + 1 })} onClose={close} testId="unlock" class="small">
      <p class={goldOk ? '' : 'warn'}>
        {GOLD} {t('unlock.cost', { gold: formatNumber(next.gold) })}
      </p>
      <p class={levelOk ? '' : 'warn'}>⭐ {t('unlock.level', { n: next.level })}</p>
      <div class="dialog-actions">
        <button class="btn" onClick={close}>
          {t('common.cancel')}
        </button>
        <button
          class="btn primary"
          disabled={!levelOk || !goldOk}
          onClick={() => {
            if (game.exec({ type: 'unlockFloor' }).ok) close();
          }}
          data-testid="unlock-confirm"
        >
          {t('unlock.confirm')}
        </button>
      </div>
    </Sheet>
  );
}
