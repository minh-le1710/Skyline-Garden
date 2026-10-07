import {
  LOGIN_GIFTS,
  QUEST_UNLOCK_LEVEL,
  REROLL_RUBY,
  dailyGold,
  formatDuration,
  loginClaimable,
  msUntilNextDay,
  questBonusReward,
  type Quest,
  type Reward,
} from '../game';
import { formatNumber, t } from '../i18n';
import { useGame } from './context';
import { GOLD, ITEM_ICON, RUBY, XP } from './icons';
import { itemName } from './names';
import { Sheet } from './Sheet';

export function questText(q: Quest): string {
  return t(`quest.${q.kind}` as const, { goal: q.goal, item: q.target ? itemName(q.target) : '' });
}

export function RewardChips({ reward }: { reward: Reward }) {
  return (
    <span class="reward-chips">
      {reward.gold ? (
        <span>
          {GOLD} {formatNumber(reward.gold)}
        </span>
      ) : null}
      {reward.ruby ? (
        <span>
          {RUBY} {reward.ruby}
        </span>
      ) : null}
      {reward.xp ? (
        <span>
          {XP} {formatNumber(reward.xp)}
        </span>
      ) : null}
      {Object.entries(reward.items ?? {}).map(([id, n]) => (
        <span key={id}>
          {ITEM_ICON[id as keyof typeof ITEM_ICON]} {n}
        </span>
      ))}
    </span>
  );
}

export function QuestsPanel() {
  const game = useGame();
  const state = game.state.value;
  const now = game.now.value;
  const { daily } = state;
  const loginReady = loginClaimable(state, now);
  const position = daily.loginCount % LOGIN_GIFTS.length;
  const allClaimed = daily.quests.length > 0 && daily.quests.every((q) => q.claimed);

  return (
    <Sheet title={t('quests.title')} onClose={() => (game.ui.panel.value = null)} testId="quests">
      <h3>{t('quests.login')}</h3>
      <div class="login-strip">
        {LOGIN_GIFTS.map((gift, i) => {
          // Các ô trước vị trí hiện tại trong vòng là đã nhận.
          const claimed = i < position;
          const isToday = i === position;
          return (
            <div
              key={i}
              class={`login-day ${claimed ? 'claimed' : ''} ${isToday && loginReady ? 'today' : ''}`}
            >
              <small>{t('quests.loginDay', { n: i + 1 })}</small>
              <span>
                {gift.ruby
                  ? RUBY
                  : gift.goldUnits
                    ? GOLD
                    : ITEM_ICON[Object.keys(gift.items)[0] as 'cloudclay']}
              </span>
              <small>
                {gift.goldUnits
                  ? formatNumber(gift.goldUnits * dailyGold(state.level))
                  : gift.ruby || Object.values(gift.items)[0]}
              </small>
            </div>
          );
        })}
      </div>
      <button
        class="btn primary wide"
        disabled={!loginReady}
        onClick={() => game.exec({ type: 'claimLogin' })}
        data-testid="claim-login"
      >
        {loginReady ? t('quests.claimLogin') : t('quests.loginClaimed')}
      </button>

      <h3>
        {t('chip.quests')} · {t('quests.resetIn', { time: formatDuration(msUntilNextDay(now)) })}
      </h3>
      {state.level < QUEST_UNLOCK_LEVEL ? (
        <p class="muted">{t('quests.none', { n: QUEST_UNLOCK_LEVEL })}</p>
      ) : (
        <ul class="card-list">
          {daily.quests.map((q, index) => {
            const done = q.progress >= q.goal;
            return (
              <li
                key={`${q.kind}-${index}`}
                class={`card ${q.claimed ? 'locked' : ''}`}
                data-testid={`quest-${index}`}
              >
                <div class="card-body">
                  <strong>{questText(q)}</strong>
                  <div class="progress">
                    <div class="progress-fill" style={{ width: `${(q.progress / q.goal) * 100}%` }} />
                  </div>
                  <small>
                    {formatNumber(q.progress)}/{formatNumber(q.goal)} · <RewardChips reward={q.reward} />
                  </small>
                </div>
                {q.claimed ? (
                  <span class="lock-note">{t('quests.claimed')}</span>
                ) : done ? (
                  <button
                    class="btn primary"
                    onClick={() => game.exec({ type: 'claimQuest', index })}
                    data-testid={`claim-quest-${index}`}
                  >
                    {t('quests.claim')}
                  </button>
                ) : (
                  <button class="btn" onClick={() => game.exec({ type: 'rerollQuest', index })}>
                    {daily.freeRerollUsed
                      ? `${t('quests.reroll')} ${REROLL_RUBY}${RUBY}`
                      : t('quests.rerollFree')}
                  </button>
                )}
              </li>
            );
          })}
          <li class="card">
            <span class="card-icon">🧰</span>
            <div class="card-body">
              <strong>{t('quests.bonus')}</strong>
              <small>
                <RewardChips reward={questBonusReward(state)} />
              </small>
            </div>
            <button
              class="btn gold"
              disabled={!allClaimed || daily.bonusClaimed}
              onClick={() => game.exec({ type: 'claimQuestBonus' })}
            >
              {daily.bonusClaimed ? t('quests.claimed') : t('quests.bonusClaim')}
            </button>
          </li>
        </ul>
      )}
    </Sheet>
  );
}
