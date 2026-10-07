import { BALLOON_UNLOCK_LEVEL, balloonBonusPreview, count, formatDuration } from '../game';
import { formatNumber, t } from '../i18n';
import { useGame } from './context';
import { GOLD, ITEM_ICON, XP } from './icons';
import { itemName } from './names';
import { RewardChips } from './QuestsPanel';
import { Sheet } from './Sheet';

export function BalloonPanel() {
  const game = useGame();
  const state = game.state.value;
  const now = game.now.value;
  const b = state.balloon;
  const close = () => (game.ui.panel.value = null);

  return (
    <Sheet title={`🎈 ${t('balloon.title')}`} onClose={close} testId="balloon">
      {state.level < BALLOON_UNLOCK_LEVEL ? (
        <p class="muted">{t('balloon.locked', { n: BALLOON_UNLOCK_LEVEL })}</p>
      ) : b.phase === 'away' ? (
        <p class="muted">
          {t('balloon.away')} {t('balloon.returnsIn', { time: formatDuration(b.returnsAt - now) })}
        </p>
      ) : (
        <>
          <p class="muted">{t('balloon.leavesIn', { time: formatDuration(b.leavesAt - now) })}</p>
          <div class="crate-grid">
            {b.crates.map((c, index) => {
              const have = count(state.items, c.id);
              return (
                <div key={index} class={`crate ${c.filled ? 'filled' : ''}`} data-testid={`crate-${index}`}>
                  <span class="crate-icon" title={itemName(c.id)}>
                    {ITEM_ICON[c.id]}
                  </span>
                  <small class={have >= c.qty || c.filled ? '' : 'warn'}>
                    {c.filled ? '✓' : `${Math.min(have, c.qty)}/${c.qty}`}
                  </small>
                  <small>
                    {GOLD} {formatNumber(c.gold)} · {XP} {c.xp}
                  </small>
                  <button
                    class="btn primary small"
                    disabled={c.filled || have < c.qty}
                    onClick={() => game.exec({ type: 'fillCrate', index })}
                    data-testid={`fill-crate-${index}`}
                  >
                    {c.filled ? t('balloon.filled') : t('balloon.fill')}
                  </button>
                </div>
              );
            })}
          </div>
          <p>
            {t('balloon.bonus', { n: b.crates.length })}:{' '}
            <RewardChips reward={balloonBonusPreview(b.crates)} />
          </p>
          <button
            class="btn gold wide"
            onClick={() => {
              game.exec({ type: 'sendBalloon' });
              close();
            }}
            data-testid="send-balloon"
          >
            {b.crates.every((c) => c.filled) ? t('balloon.send') : t('balloon.sendEarly')}
          </button>
        </>
      )}
    </Sheet>
  );
}
