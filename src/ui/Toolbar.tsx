import { canFulfill } from '../game';
import { t } from '../i18n';
import type { PanelId } from '../core/Game';
import { useGame } from './context';

export function Toolbar() {
  const game = useGame();
  const { tool, trayOpen, panel } = game.ui;
  const state = game.state.value;
  const deliverable = state.orders.filter((o) => o.order && canFulfill(state, o.order)).length;

  const openPanel = (id: PanelId) => {
    game.ui.selected.value = null;
    panel.value = panel.value === id ? null : id;
  };

  return (
    <nav class="toolbar">
      <button
        class={`tool-btn ${trayOpen.value || tool.value?.kind === 'seed' || tool.value?.kind === 'pot' ? 'active' : ''}`}
        onClick={() => {
          const open = !trayOpen.value;
          trayOpen.value = open;
          if (!open && tool.value?.kind !== 'harvest') tool.value = null;
          if (open && tool.value?.kind === 'harvest') tool.value = null;
        }}
        data-testid="btn-plant"
      >
        <span class="tool-icon">🌱</span>
        {t('toolbar.plant')}
      </button>
      <button
        class={`tool-btn ${tool.value?.kind === 'harvest' ? 'active' : ''}`}
        onClick={() => {
          trayOpen.value = false;
          game.ui.selected.value = null;
          tool.value = tool.value?.kind === 'harvest' ? null : { kind: 'harvest' };
        }}
        data-testid="btn-harvest"
      >
        <span class="tool-icon">🧺</span>
        {t('toolbar.harvest')}
      </button>
      <button
        class={`tool-btn ${panel.value === 'orders' ? 'active' : ''}`}
        onClick={() => openPanel('orders')}
        data-testid="btn-orders"
      >
        <span class="tool-icon">🦉</span>
        {t('toolbar.orders')}
        {deliverable > 0 && <span class="badge">{deliverable}</span>}
      </button>
      <button
        class={`tool-btn ${panel.value === 'storage' ? 'active' : ''}`}
        onClick={() => openPanel('storage')}
        data-fly-target="storage"
        data-testid="btn-storage"
      >
        <span class="tool-icon">📦</span>
        {t('toolbar.storage')}
      </button>
      <button
        class={`tool-btn ${panel.value === 'shop' ? 'active' : ''}`}
        onClick={() => openPanel('shop')}
        data-testid="btn-shop"
      >
        <span class="tool-icon">🏪</span>
        {t('toolbar.shop')}
      </button>
    </nav>
  );
}
