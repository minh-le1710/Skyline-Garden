import {
  CONSUMABLE_IDS,
  GOOD_IDS,
  ITEMS,
  MATERIAL_IDS,
  PLANT_IDS,
  count,
  potStacks,
  storageUsed,
  type BarnItemId,
  type ItemId,
} from '../game';
import { t } from '../i18n';
import type { StorageTab } from '../core/Game';
import { useGame } from './context';
import { GOLD, ITEM_ICON, PotIcon } from './icons';
import { itemName, potName, potStatsText, rarityName } from './names';
import { Sheet } from './Sheet';

const TABS: StorageTab[] = ['crops', 'goods', 'materials', 'pots'];

export function StoragePanel() {
  const game = useGame();
  const state = game.state.value;
  const tab = game.ui.storageTab;
  const used = storageUsed(state);
  const owned = (ids: readonly ItemId[]) => ids.filter((id) => count(state.items, id) > 0);

  const sellable = (ids: BarnItemId[], empty: string) =>
    ids.length === 0 ? (
      <p class="muted">{empty}</p>
    ) : (
      <ul class="card-list">
        {ids.map((id) => {
          const n = count(state.items, id);
          return (
            <li key={id} class="card" data-testid={`item-${id}`}>
              <span class="card-icon">{ITEM_ICON[id]}</span>
              <div class="card-body">
                <strong>
                  {itemName(id)} × {n}
                </strong>
                <small>
                  {GOLD} {t('storage.price', { price: ITEMS[id].sellPrice })}
                </small>
              </div>
              <div class="card-actions">
                <button class="btn" onClick={() => game.exec({ type: 'sellItem', id, qty: 1 })}>
                  {t('storage.sell')}
                </button>
                <button
                  class="btn gold"
                  onClick={() => game.exec({ type: 'sellItem', id, qty: n })}
                  data-testid={`sell-all-${id}`}
                >
                  {t('storage.sellAll')}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    );

  const chest = owned([...MATERIAL_IDS, ...CONSUMABLE_IDS]);
  const stacks = potStacks(state);
  const seeds = PLANT_IDS.filter((id) => count(state.seeds, id) > 0);

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
      <div class="tabs" role="tablist">
        {TABS.map((id) => (
          <button
            key={id}
            role="tab"
            class={`tab ${tab.value === id ? 'active' : ''}`}
            aria-selected={tab.value === id}
            onClick={() => (tab.value = id)}
            data-testid={`storage-tab-${id}`}
          >
            {t(`storage.tab.${id}` as const)}
          </button>
        ))}
      </div>

      {tab.value === 'crops' && (
        <>
          {sellable(owned(PLANT_IDS) as BarnItemId[], t('storage.empty'))}
          {seeds.length > 0 && (
            <>
              <h3>{t('storage.seeds')}</h3>
              <div class="chips">
                {seeds.map((id) => (
                  <span key={id} class="chip" title={itemName(id)}>
                    {ITEM_ICON[id]} {count(state.seeds, id)}
                  </span>
                ))}
              </div>
            </>
          )}
        </>
      )}
      {tab.value === 'goods' && sellable(owned(GOOD_IDS) as BarnItemId[], t('storage.noGoods'))}
      {tab.value === 'materials' &&
        (chest.length === 0 ? (
          <p class="muted">{t('storage.noMaterials')}</p>
        ) : (
          <>
            <p class="muted">{t('storage.chest')}</p>
            <div class="chips">
              {chest.map((id) => (
                <span key={id} class="chip" title={itemName(id)} data-testid={`item-${id}`}>
                  {ITEM_ICON[id]} {itemName(id)} × {count(state.items, id)}
                </span>
              ))}
            </div>
          </>
        ))}
      {tab.value === 'pots' &&
        (stacks.length === 0 ? (
          <p class="muted">{t('storage.noPots')}</p>
        ) : (
          <ul class="card-list">
            {stacks.map((stack) => (
              <li key={stack.key} class={`card rarity-border-${stack.sample.rarity}`}>
                <span class="card-icon">
                  <PotIcon potId={stack.sample.potId} rarity={stack.sample.rarity} />
                </span>
                <div class="card-body">
                  <strong>
                    {potName(stack.sample.potId)} × {stack.uids.length}
                  </strong>
                  <small>
                    {rarityName(stack.sample.rarity)} · {potStatsText(stack.sample)}
                  </small>
                </div>
              </li>
            ))}
          </ul>
        ))}
    </Sheet>
  );
}
