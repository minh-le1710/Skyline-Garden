import {
  PLANT_LIST,
  POT_LIST,
  STORAGE_UPGRADE_STEP,
  buyPot,
  buySeed,
  count,
  storageUpgradeCost,
  upgradeStorage,
} from '../game';
import { formatNumber, t } from '../i18n';
import type { ShopTab } from '../core/Game';
import { useGame } from './context';
import { GOLD, PLANT_ICON, PotIcon } from './icons';
import { humanDuration, plantName, potBonus, potName } from './names';
import { Sheet } from './Sheet';

const TABS: ShopTab[] = ['seeds', 'pots', 'upgrades'];

export function ShopPanel() {
  const game = useGame();
  const { panel, shopTab } = game.ui;
  const state = game.state.value;
  const close = () => (panel.value = null);

  return (
    <Sheet title={t('shop.title')} onClose={close} testId="shop">
      <div class="tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab}
            role="tab"
            class={`tab ${shopTab.value === tab ? 'active' : ''}`}
            aria-selected={shopTab.value === tab}
            onClick={() => (shopTab.value = tab)}
          >
            {t(`shop.tab.${tab}` as const)}
          </button>
        ))}
      </div>

      {shopTab.value === 'seeds' && (
        <ul class="card-list">
          {PLANT_LIST.map((p) => {
            const locked = state.level < p.unlockLevel;
            return (
              <li key={p.id} class={`card ${locked ? 'locked' : ''}`} data-testid={`shop-seed-${p.id}`}>
                <span class="card-icon">{PLANT_ICON[p.id]}</span>
                <div class="card-body">
                  <strong>{plantName(p.id)}</strong>
                  <small>{t('shop.growTime', { time: humanDuration(p.growSec) })}</small>
                  <small>{t('shop.yield', { n: p.yield, price: p.sellPrice })}</small>
                  {!locked && <small>{t('shop.owned', { n: count(state.seeds, p.id) })}</small>}
                </div>
                {locked ? (
                  <span class="lock-note">{t('shop.unlockAt', { n: p.unlockLevel })}</span>
                ) : (
                  <div class="card-actions">
                    {[1, 5].map((qty) => (
                      <button
                        key={qty}
                        class="btn gold"
                        disabled={state.gold < p.seedPrice * qty}
                        onClick={() => game.run((s) => buySeed(s, p.id, qty))}
                        data-testid={`buy-seed-${p.id}-${qty}`}
                      >
                        {t('shop.buy')} {qty}
                        <small>
                          {GOLD} {formatNumber(p.seedPrice * qty)}
                        </small>
                      </button>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {shopTab.value === 'pots' && (
        <ul class="card-list">
          {POT_LIST.map((p) => {
            const locked = state.level < p.unlockLevel;
            return (
              <li key={p.id} class={`card ${locked ? 'locked' : ''}`} data-testid={`shop-pot-${p.id}`}>
                <span class="card-icon">
                  <PotIcon potId={p.id} />
                </span>
                <div class="card-body">
                  <strong>{potName(p.id)}</strong>
                  <small>{potBonus(p.id)}</small>
                  {!locked && <small>{t('shop.owned', { n: count(state.potStock, p.id) })}</small>}
                </div>
                {locked ? (
                  <span class="lock-note">{t('shop.unlockAt', { n: p.unlockLevel })}</span>
                ) : (
                  <button
                    class="btn gold"
                    disabled={state.gold < p.price}
                    onClick={() => game.run((s) => buyPot(s, p.id))}
                    data-testid={`buy-pot-${p.id}`}
                  >
                    {t('shop.buy')}
                    <small>
                      {GOLD} {formatNumber(p.price)}
                    </small>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {shopTab.value === 'upgrades' && (
        <ul class="card-list">
          <li class="card">
            <span class="card-icon">📦</span>
            <div class="card-body">
              <strong>{t('shop.storage')}</strong>
              <small>
                {t('shop.storageDesc', {
                  from: state.storageCapacity,
                  to: state.storageCapacity + STORAGE_UPGRADE_STEP,
                })}
              </small>
            </div>
            <button
              class="btn gold"
              disabled={state.gold < storageUpgradeCost(state.storageUpgrades)}
              onClick={() => game.run(upgradeStorage)}
            >
              {t('shop.buy')}
              <small>
                {GOLD} {formatNumber(storageUpgradeCost(state.storageUpgrades))}
              </small>
            </button>
          </li>
        </ul>
      )}
    </Sheet>
  );
}
