import {
  PLANTS,
  activePest,
  asPot,
  formatDuration,
  growthProgress,
  isNibbled,
  isReady,
  remainingMs,
  speedUpCost,
} from '../game';
import { t } from '../i18n';
import { useGame } from './context';
import { ITEM_ICON, PotIcon, RUBY } from './icons';
import { plantName, potName, potStatsText, rarityName } from './names';

/** Thẻ thông tin của chậu đang chọn. */
export function PotInfo() {
  const game = useGame();
  const selected = game.ui.selected.value;
  if (!selected) return null;
  const pot = asPot(game.state.value.floors[selected.floor]?.slots[selected.slot]);
  if (!pot) return null;
  const now = game.now.value;
  const { floor, slot } = selected;
  const close = () => (game.ui.selected.value = null);

  if (!pot.plant) {
    return (
      <div class="pot-info" data-testid="pot-info">
        <PotIcon potId={pot.potId} rarity={pot.rarity} />
        <div class="pot-info-body">
          <strong>
            {potName(pot.potId)} · {t('pot.info.empty')}
          </strong>
          <small>
            {rarityName(pot.rarity)} · {potStatsText(pot)}
          </small>
          <small>{t('pot.info.plantHint')}</small>
        </div>
        <button
          class="btn primary"
          onClick={() => {
            close();
            game.ui.trayOpen.value = true;
          }}
        >
          {t('pot.info.plant')}
        </button>
        <button
          class="btn"
          onClick={() => {
            close();
            game.exec({ type: 'storePot', floor, slot });
          }}
          data-testid="store-pot"
        >
          {t('pot.info.store')}
        </button>
        <button class="icon-btn" onClick={close} aria-label={t('common.close')}>
          ✕
        </button>
      </div>
    );
  }

  const plant = pot.plant;
  const ready = isReady(plant, now);
  const remaining = remainingMs(plant, now);
  const pest = activePest(plant, now) ? plant.pest : null;
  return (
    <div class="pot-info" data-testid="pot-info">
      <span class="pot-info-icon">{ITEM_ICON[plant.plantId]}</span>
      <div class="pot-info-body">
        <strong>{plantName(plant.plantId)}</strong>
        <div class="progress">
          <div class="progress-fill" style={{ width: `${growthProgress(plant, now) * 100}%` }} />
        </div>
        <small>
          {ready ? t('pot.info.ready') : t('pot.info.remaining', { time: formatDuration(remaining) })} ·{' '}
          {potName(pot.potId)}
        </small>
        {plant.yield > PLANTS[plant.plantId].yield && <small>{t('pot.info.bonusYield')}</small>}
        {pest && <small class="warn">🐛 {t('pot.info.pest', { name: t(`pest.${pest.id}` as const) })}</small>}
        {!pest && isNibbled(plant, now) && <small class="warn">{t('pot.info.nibbled')}</small>}
      </div>
      {pest ? (
        <button
          class="btn danger"
          data-testid="catch-pest"
          onClick={() => game.exec({ type: 'catchPest', floor, slot })}
        >
          {t('pot.info.catch')}
        </button>
      ) : ready ? (
        <button
          class="btn primary"
          onClick={() => {
            close();
            game.exec({ type: 'harvest', floor, slot });
          }}
        >
          {t('pot.info.harvest')}
        </button>
      ) : (
        <button
          class="btn ruby"
          data-testid="speed-up"
          onClick={() => game.exec({ type: 'speedUp', floor, slot })}
        >
          {t('pot.info.speedUp')} {speedUpCost(remaining)} {RUBY}
        </button>
      )}
      <button class="icon-btn" onClick={close} aria-label={t('common.close')}>
        ✕
      </button>
    </div>
  );
}
