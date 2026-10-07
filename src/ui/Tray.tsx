import { POT_IDS, count, unlockedPlants } from '../game';
import { t } from '../i18n';
import { useGame } from './context';
import { PLANT_ICON, PotIcon } from './icons';
import { plantName, potName } from './names';

/** Khay chọn hạt giống / chậu, hiện phía trên thanh công cụ. */
export function Tray() {
  const game = useGame();
  const { tool, trayOpen } = game.ui;
  if (!trayOpen.value) return null;
  const state = game.state.value;
  const plants = unlockedPlants(state.level);
  const pots = POT_IDS.filter((id) => count(state.potStock, id) > 0);
  const current = tool.value;

  const openShop = () => {
    game.ui.shopTab.value = 'seeds';
    game.ui.panel.value = 'shop';
  };

  return (
    <div class="tray" data-testid="tray">
      <div class="tray-row">
        {plants.map((id) => {
          const n = count(state.seeds, id);
          const active = current?.kind === 'seed' && current.plantId === id;
          return (
            <button
              key={id}
              class={`tray-item ${active ? 'active' : ''} ${n === 0 ? 'empty' : ''}`}
              title={plantName(id)}
              data-testid={`seed-${id}`}
              onClick={() => {
                game.ui.selected.value = null;
                if (n === 0) openShop();
                else tool.value = active ? null : { kind: 'seed', plantId: id };
              }}
            >
              <span class="tray-icon">{PLANT_ICON[id]}</span>
              <span class="tray-count">{n}</span>
            </button>
          );
        })}
        {pots.length > 0 && <span class="tray-divider" />}
        {pots.map((id) => {
          const active = current?.kind === 'pot' && current.potId === id;
          return (
            <button
              key={id}
              class={`tray-item ${active ? 'active' : ''}`}
              title={potName(id)}
              data-testid={`pot-${id}`}
              onClick={() => (tool.value = active ? null : { kind: 'pot', potId: id })}
            >
              <PotIcon potId={id} />
              <span class="tray-count">{count(state.potStock, id)}</span>
            </button>
          );
        })}
        <button class="tray-item tray-buy" onClick={openShop}>
          <span class="tray-icon">＋</span>
          <span class="tray-count">{t('tray.buy')}</span>
        </button>
      </div>
    </div>
  );
}

/** Dải hướng dẫn khi đang cầm công cụ. */
export function ToolBanner() {
  const game = useGame();
  const tool = game.ui.tool.value;
  if (!tool) return null;
  const state = game.state.value;
  let text: string;
  if (tool.kind === 'seed') {
    text = t('tool.seed', { name: plantName(tool.plantId), n: count(state.seeds, tool.plantId) });
  } else if (tool.kind === 'pot') {
    text = t('tool.pot', { name: potName(tool.potId), n: count(state.potStock, tool.potId) });
  } else {
    text = t('tool.harvest');
  }
  return (
    <div class="tool-banner" data-testid="tool-banner">
      <span>{text}</span>
      <button
        onClick={() => {
          game.ui.tool.value = null;
          game.ui.trayOpen.value = false;
        }}
      >
        {t('tool.done')}
      </button>
    </div>
  );
}
