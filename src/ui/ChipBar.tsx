import { BALLOON_UNLOCK_LEVEL, QUEST_UNLOCK_LEVEL, formatDuration, loginClaimable } from '../game';
import { t } from '../i18n';
import { useGame } from './context';

/**
 * Hàng nút nhỏ thứ hai của HUD: hiện dần khi tính năng mở. Nằm trong `.hud` để camera tự chừa chỗ.
 * Nút tròn 40×36, cuộn ngang khi quá nhiều.
 */
export function ChipBar() {
  const game = useGame();
  const state = game.state.value;
  const now = game.now.value;
  const openPanel = (id: 'quests' | 'balloon' | 'settings') => {
    game.ui.selected.value = null;
    game.ui.panel.value = id;
  };
  const quests = state.daily.quests;
  const claimable = quests.filter((q) => !q.claimed && q.progress >= q.goal).length;
  const done = quests.filter((q) => q.progress >= q.goal).length;
  const loginReady = loginClaimable(state, now);

  return (
    <div class="chip-bar" role="toolbar">
      <button
        class={`hud-chip ${loginReady ? 'pulse' : ''}`}
        aria-label={t('chip.login')}
        title={t('chip.login')}
        onClick={() => openPanel('quests')}
        data-testid="chip-login"
      >
        🎁{loginReady && <span class="dot" />}
      </button>
      {state.level >= QUEST_UNLOCK_LEVEL && (
        <button
          class="hud-chip"
          aria-label={t('chip.quests')}
          title={t('chip.quests')}
          onClick={() => openPanel('quests')}
          data-testid="chip-quests"
        >
          📋{' '}
          <small>
            {done}/{quests.length}
          </small>
          {claimable > 0 && <span class="badge small">{claimable}</span>}
        </button>
      )}
      {state.level >= BALLOON_UNLOCK_LEVEL && (
        <button
          class={`hud-chip ${state.balloon.phase === 'away' ? 'dim' : ''}`}
          aria-label={t('chip.balloon')}
          title={t('chip.balloon')}
          onClick={() => openPanel('balloon')}
          data-testid="chip-balloon"
        >
          🎈{' '}
          <small>
            {formatDuration(
              state.balloon.phase === 'docked' ? state.balloon.leavesAt - now : state.balloon.returnsAt - now,
            )}
          </small>
        </button>
      )}
      <button
        class="hud-chip"
        aria-label={t('chip.settings')}
        title={t('chip.settings')}
        onClick={() => openPanel('settings')}
        data-testid="chip-settings"
      >
        ⚙️
      </button>
    </div>
  );
}
