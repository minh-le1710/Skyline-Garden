import { ACHIEVEMENTS, ACHIEVEMENT_IDS, achievementProgress, type AchievementId } from '../game';
import { formatNumber, t } from '../i18n';
import { useGame } from './context';
import { RewardChips } from './QuestsPanel';
import { Sheet } from './Sheet';

export const achievementName = (id: AchievementId): string => t(`ach.${id}.name` as const);

/** Bảng thành tựu: mỗi thành tựu một thẻ với sao theo bậc, thanh tiến độ và nút nhận thưởng. */
export function AchievementsPanel() {
  const game = useGame();
  const state = game.state.value;
  // Thành tựu có thưởng chờ nhận lên đầu, rồi tới thành tựu còn bậc, cuối cùng là đã xong hết.
  const rows = ACHIEVEMENT_IDS.map((id) => achievementProgress(state, id)).sort(
    (a, b) => Number(b.claimable) - Number(a.claimable) || Number(a.next === null) - Number(b.next === null),
  );

  return (
    <Sheet title={t('achievements.title')} onClose={() => (game.ui.panel.value = null)} testId="achievements">
      <ul class="achievement-list">
        {rows.map((p) => {
          const tiers = ACHIEVEMENTS[p.id].tiers;
          const goal = p.next?.goal ?? tiers[tiers.length - 1]!.goal;
          const pct = Math.min(100, (p.value / goal) * 100);
          return (
            <li
              key={p.id}
              class={`card achievement ${p.next ? '' : 'done'}`}
              data-testid={`achievement-${p.id}`}
            >
              <div class="achievement-head">
                <strong>{achievementName(p.id)}</strong>
                <span
                  class="stars"
                  aria-label={t('achievements.tier', { n: p.claimed, total: tiers.length })}
                >
                  {tiers.map((_, i) => (
                    <span key={i} aria-hidden="true" class={i < p.claimed ? 'on' : ''}>
                      ★
                    </span>
                  ))}
                </span>
              </div>
              <small>{t(`ach.${p.id}.desc` as const, { goal: formatNumber(goal) })}</small>
              {p.next ? (
                <>
                  <div
                    class="progress"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={goal}
                    aria-valuenow={p.value}
                  >
                    <div class="progress-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <div class="achievement-foot">
                    <small>
                      {formatNumber(Math.min(p.value, goal))}/{formatNumber(goal)}
                    </small>
                    <RewardChips reward={p.next.reward} />
                    <button
                      class="btn primary small"
                      disabled={!p.claimable}
                      onClick={() => game.exec({ type: 'claimAchievement', id: p.id })}
                      data-testid={`claim-${p.id}`}
                    >
                      {t('achievements.claim')}
                    </button>
                  </div>
                </>
              ) : (
                <small class="muted">{t('achievements.done')}</small>
              )}
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
