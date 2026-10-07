import { canFulfill, count, deliverOrder, discardOrder, formatDuration } from '../game';
import { formatNumber, t } from '../i18n';
import { useGame } from './context';
import { GOLD, PLANT_ICON, XP } from './icons';
import { plantName } from './names';
import { Sheet } from './Sheet';

export function OrdersPanel() {
  const game = useGame();
  const state = game.state.value;
  const now = game.now.value;

  return (
    <Sheet title={t('orders.title')} onClose={() => (game.ui.panel.value = null)} testId="orders">
      <div class="order-grid">
        {state.orders.map((slot, index) => {
          const order = slot.order;
          if (!order) {
            return (
              <div key={`wait-${index}`} class="order-card waiting">
                <span class="owl">🦉</span>
                <small>{t('orders.waiting')}</small>
                <strong>{formatDuration(slot.readyAt - now)}</strong>
              </div>
            );
          }
          const ready = canFulfill(state, order);
          return (
            <div key={order.id} class={`order-card ${ready ? 'ready' : ''}`} data-testid={`order-${index}`}>
              <ul class="order-items">
                {order.items.map(({ plantId, qty }) => {
                  const have = count(state.crops, plantId);
                  return (
                    <li key={plantId} class={have >= qty ? 'ok' : ''} title={plantName(plantId)}>
                      <span class="order-icon">{PLANT_ICON[plantId]}</span>
                      <span>
                        {Math.min(have, qty)}/{qty}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div class="order-reward">
                <span>
                  {GOLD} {formatNumber(order.gold)}
                </span>
                <span>
                  {XP} {order.xp}
                </span>
              </div>
              <div class="order-actions">
                <button
                  class="btn primary"
                  disabled={!ready}
                  onClick={() => game.run((s, n) => deliverOrder(s, index, n))}
                  data-testid={`deliver-${index}`}
                >
                  {t('orders.deliver')}
                </button>
                <button
                  class="icon-btn"
                  title={t('orders.discard')}
                  aria-label={t('orders.discard')}
                  onClick={() => game.run((s, n) => discardOrder(s, index, n))}
                >
                  🗑
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}
