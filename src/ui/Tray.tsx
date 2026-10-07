import { count, potStacks, unlockedPlants } from '../game';
import { t } from '../i18n';
import { useGame } from './context';
import { ITEM_ICON, PotIcon } from './icons';
import { plantName, potName, potStatsText, rarityName } from './names';

/** Khay chọn hạt giống / chậu, hiện phía trên thanh công cụ. */
export function Tray() {
  const game = useGame();
  const { tool, trayOpen } = game.ui;
  if (!trayOpen.value) return null;
  const state = game.state.value;
  const plants = unlockedPlants(state.level);
  const stacks = potStacks(state);
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
              aria-label={`${plantName(id)}: ${n}`}
              data-testid={`seed-${id}`}
              onClick={() => {
                game.ui.selected.value = null;
                if (n === 0) openShop();
                else tool.value = active ? null : { kind: 'seed', plantId: id };
              }}
            >
              <span class="tray-icon">{ITEM_ICON[id]}</span>
              <span class="tray-count">{n}</span>
            </button>
          );
        })}
        {stacks.length > 0 && <span class="tray-divider" />}
        {stacks.map((stack, i) => {
          const active = current?.kind === 'pot' && current.stack === stack.key;
          const label = `${potName(stack.sample.potId)} (${rarityName(stack.sample.rarity)}): ${potStatsText(stack.sample)}`;
          return (
            <button
              key={stack.key}
              class={`tray-item ${active ? 'active' : ''}`}
              title={label}
              aria-label={label}
              data-testid={`pot-stack-${i}`}
              onClick={() => (tool.value = active ? null : { kind: 'pot', stack: stack.key })}
            >
              <PotIcon potId={stack.sample.potId} rarity={stack.sample.rarity} />
              <span class="tray-count">{stack.uids.length}</span>
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
    const stack = potStacks(state).find((s) => s.key === tool.stack);
    const name = stack ? potName(stack.sample.potId) : '';
    text = t('tool.pot', { name, n: stack?.uids.length ?? 0 });
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
