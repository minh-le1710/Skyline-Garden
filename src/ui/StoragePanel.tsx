import { PLANTS, PLANT_IDS, POT_IDS, count, sellCrop, storageUsed } from '../game';
import { t } from '../i18n';
import { useGame } from './context';
import { GOLD, PLANT_ICON, PotIcon } from './icons';
import { plantName, potName } from './names';
import { Sheet } from './Sheet';

export function StoragePanel() {
  const game = useGame();
  const state = game.state.value;
  const used = storageUsed(state);
  const crops = PLANT_IDS.filter((id) => count(state.crops, id) > 0);
  const seeds = PLANT_IDS.filter((id) => count(state.seeds, id) > 0);
  const pots = POT_IDS.filter((id) => count(state.potStock, id) > 0);

  return (
    <Sheet title={t('storage.title')} onClose={() => (game.ui.panel.value = null)} testId="storage">
      <div class="capacity">
        <div class="progress">
          <div
            class="progress-fill"
            style={{ width: `${Math.min(1, used / state.storageCapacity) * 100}%` }}
          />
        </div>
        <small>{t('storage.capacity', { used, cap: state.storageCapacity })}</small>
      </div>

      <h3>{t('storage.crops')}</h3>
      {crops.length === 0 ? (
        <p class="muted">{t('storage.empty')}</p>
      ) : (
        <ul class="card-list">
          {crops.map((id) => {
            const n = count(state.crops, id);
            return (
              <li key={id} class="card" data-testid={`crop-${id}`}>
                <span class="card-icon">{PLANT_ICON[id]}</span>
                <div class="card-body">
                  <strong>
                    {plantName(id)} × {n}
                  </strong>
                  <small>
                    {GOLD} {t('storage.price', { price: PLANTS[id].sellPrice })}
                  </small>
                </div>
                <div class="card-actions">
                  <button class="btn" onClick={() => game.run((s) => sellCrop(s, id, 1))}>
                    {t('storage.sell')}
                  </button>
                  <button
                    class="btn gold"
                    onClick={() => game.run((s) => sellCrop(s, id, n))}
                    data-testid={`sell-all-${id}`}
                  >
                    {t('storage.sellAll')}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {seeds.length > 0 && (
        <>
          <h3>{t('storage.seeds')}</h3>
          <div class="chips">
            {seeds.map((id) => (
              <span key={id} class="chip" title={plantName(id)}>
                {PLANT_ICON[id]} {count(state.seeds, id)}
              </span>
            ))}
          </div>
        </>
      )}

      {pots.length > 0 && (
        <>
          <h3>{t('storage.pots')}</h3>
          <div class="chips">
            {pots.map((id) => (
              <span key={id} class="chip" title={potName(id)}>
                <PotIcon potId={id} /> {count(state.potStock, id)}
              </span>
            ))}
          </div>
        </>
      )}
    </Sheet>
  );
}
