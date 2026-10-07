import {
  BALLOON_UNLOCK_LEVEL,
  QUEST_UNLOCK_LEVEL,
  claimableCount,
  formatDuration,
  loginClaimable,
} from '../game';
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
  const openPanel = (id: 'quests' | 'balloon' | 'achievements' | 'settings') => {
    game.ui.selected.value = null;
    game.ui.panel.value = id;
  };
  const quests = state.daily.quests;
  const claimable = quests.filter((q) => !q.claimed && q.progress >= q.goal).length;
  const done = quests.filter((q) => q.progress >= q.goal).length;
  const loginReady = loginClaimable(state, now);
  const achievements = claimableCount(state);
  const balloonMs =
    state.balloon.phase === 'docked' ? state.balloon.leavesAt - now : state.balloon.returnsAt - now;
  const questsLabel =
    t('chip.questsStatus', { done, total: quests.length }) +
    (claimable > 0 ? `, ${t('chip.claimable', { n: claimable })}` : '');

  return (
    <div class="chip-bar" role="toolbar">
      <button
        class={`hud-chip ${loginReady ? 'pulse' : ''}`}
        aria-label={loginReady ? t('chip.loginReady') : t('chip.login')}
        title={t('chip.login')}
        onClick={() => openPanel('quests')}
        data-testid="chip-login"
      >
        <span aria-hidden="true">🎁</span>
        {loginReady && <span class="dot" />}
      </button>
      {state.level >= QUEST_UNLOCK_LEVEL && (
        <button
          class="hud-chip"
          aria-label={questsLabel}
          title={t('chip.quests')}
          onClick={() => openPanel('quests')}
          data-testid="chip-quests"
        >
          <span aria-hidden="true">📋</span>{' '}
          <small aria-hidden="true">
            {done}/{quests.length}
          </small>
          {claimable > 0 && (
            <span class="badge small" aria-hidden="true">
              {claimable}
            </span>
          )}
        </button>
      )}
      {state.level >= BALLOON_UNLOCK_LEVEL && (
        <button
          class={`hud-chip ${state.balloon.phase === 'away' ? 'dim' : ''}`}
          aria-label={t(state.balloon.phase === 'docked' ? 'chip.balloonDocked' : 'chip.balloonAway', {
            time: formatDuration(balloonMs),
          })}
          title={t('chip.balloon')}
          onClick={() => openPanel('balloon')}
          data-testid="chip-balloon"
        >
          <span aria-hidden="true">🎈</span> <small aria-hidden="true">{formatDuration(balloonMs)}</small>
        </button>
      )}
      <button
        class={`hud-chip ${achievements > 0 ? 'pulse' : ''}`}
        aria-label={
          t('chip.achievements') + (achievements > 0 ? `, ${t('chip.claimable', { n: achievements })}` : '')
        }
        title={t('chip.achievements')}
        onClick={() => openPanel('achievements')}
        data-testid="chip-achievements"
      >
        <span aria-hidden="true">🏆</span>
        {achievements > 0 && (
          <span class="badge small" aria-hidden="true">
            {achievements}
          </span>
        )}
      </button>
      <button
        class="hud-chip"
        aria-label={t('chip.settings')}
        title={t('chip.settings')}
        onClick={() => openPanel('settings')}
        data-testid="chip-settings"
      >
        <span aria-hidden="true">⚙️</span>
      </button>
    </div>
  );
}
