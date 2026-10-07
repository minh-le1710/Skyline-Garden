import {
  PLANT_LIST,
  SHOP_POT_LIST,
  count,
  hasItems,
  nextStorageUpgrade,
  type ItemId,
  MACHINE_LIST,
  ownsMachine,
  recipesFor,
} from '../game';
import { formatNumber, t } from '../i18n';
import type { ShopTab } from '../core/Game';
import { useGame } from './context';
import { GOLD, ITEM_ICON, PotIcon } from './icons';
import { humanDuration, itemName, machineName, plantName, potName, potStatsText, rarityName } from './names';
import { Sheet } from './Sheet';

const TABS: ShopTab[] = ['seeds', 'pots', 'machines', 'upgrades'];

export function ShopPanel() {
  const game = useGame();
  const { panel, shopTab } = game.ui;
  const state = game.state.value;
  const close = () => (panel.value = null);
  const upgrade = nextStorageUpgrade(state);
  const potsOwned = (potId: string) =>
    state.potBag.filter((p) => p.potId === potId && p.origin === 'shop').length;

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
            data-testid={`shop-tab-${tab}`}
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
                <span class="card-icon">{ITEM_ICON[p.id]}</span>
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
                        onClick={() => game.exec({ type: 'buySeed', plantId: p.id, qty })}
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
          {SHOP_POT_LIST.map((p) => {
            const locked = state.level < p.unlockLevel;
            const sample = { uid: 0, potId: p.id, rarity: p.rarity, stats: p.stats, origin: 'shop' as const };
            return (
              <li key={p.id} class={`card ${locked ? 'locked' : ''}`} data-testid={`shop-pot-${p.id}`}>
                <span class="card-icon">
                  <PotIcon potId={p.id} rarity={p.rarity} />
                </span>
                <div class="card-body">
                  <strong>{potName(p.id)}</strong>
                  <small>
                    {rarityName(p.rarity)} · {potStatsText(sample)}
                  </small>
                  {!locked && <small>{t('shop.owned', { n: potsOwned(p.id) })}</small>}
                </div>
                {locked ? (
                  <span class="lock-note">{t('shop.unlockAt', { n: p.unlockLevel })}</span>
                ) : (
                  <button
                    class="btn gold"
                    disabled={state.gold < p.price}
                    onClick={() => game.exec({ type: 'buyPot', potId: p.id, qty: 1 })}
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

      {shopTab.value === 'machines' && (
        <ul class="card-list">
          {MACHINE_LIST.map((m) => {
            const locked = state.level < m.unlockLevel;
            const owned = ownsMachine(state, m.id);
            return (
              <li key={m.id} class={`card ${locked ? 'locked' : ''}`} data-testid={`shop-machine-${m.id}`}>
                <span class="card-icon">⚙️</span>
                <div class="card-body">
                  <strong>{machineName(m.id)}</strong>
                  <small>
                    {t('machine.makes', {
                      list: recipesFor(m.id)
                        .map((r) => ITEM_ICON[r as ItemId] ?? '🎁')
                        .join(' '),
                    })}
                  </small>
                </div>
                {locked ? (
                  <span class="lock-note">{t('shop.unlockAt', { n: m.unlockLevel })}</span>
                ) : owned ? (
                  <span class="lock-note">{t('shop.machineOwned')}</span>
                ) : (
                  <button
                    class="btn gold"
                    disabled={state.gold < m.price}
                    onClick={() => {
                      // Chọn ô trống để đặt; tiền chỉ bị trừ khi đặt thành công.
                      game.ui.tool.value = { kind: 'machine', machineId: m.id };
                      game.ui.trayOpen.value = false;
                      close();
                    }}
                    data-testid={`buy-machine-${m.id}`}
                  >
                    {t('shop.buy')}
                    <small>
                      {GOLD} {formatNumber(m.price)}
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
              {upgrade ? (
                <>
                  <small>
                    {t('shop.storageDesc', {
                      from: state.storageCapacity,
                      to: state.storageCapacity + upgrade.capacity,
                    })}
                  </small>
                  {Object.keys(upgrade.materials).length > 0 && (
                    <small>
                      {Object.entries(upgrade.materials)
                        .map(
                          ([id, n]) =>
                            `${ITEM_ICON[id as ItemId]} ${itemName(id as ItemId)} ${count(state.items, id as ItemId)}/${n}`,
                        )
                        .join(' · ')}
                    </small>
                  )}
                </>
              ) : (
                <small>{t('shop.storageMax')}</small>
              )}
            </div>
            {upgrade && (
              <button
                class="btn gold"
                disabled={state.gold < upgrade.gold || !hasItems(state, upgrade.materials)}
                onClick={() => game.exec({ type: 'upgradeStorage' })}
                data-testid="upgrade-storage"
              >
                {t('shop.buy')}
                <small>
                  {GOLD} {formatNumber(upgrade.gold)}
                </small>
              </button>
            )}
          </li>
        </ul>
      )}
    </Sheet>
  );
}
