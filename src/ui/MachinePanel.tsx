import {
  FORGES,
  GOODS,
  ITEMS,
  RARITIES,
  MACHINE_LEVELS,
  MACHINE_MAX_LEVEL,
  MACHINE_UPGRADES,
  count,
  formatDuration,
  hasItems,
  jobDurationMs,
  machineStatus,
  machineUpgradeGold,
  queueCapacity,
  recipeDef,
  recipesFor,
  speedUpCost,
  type ForgeId,
  type GoodId,
  type ItemId,
  type Machine,
} from '../game';
import { formatNumber, t } from '../i18n';
import { useGame } from './context';
import { GOLD, ITEM_ICON, RUBY, XP } from './icons';
import { machineName, rarityName, recipeIcon, recipeName } from './names';
import { Sheet } from './Sheet';

/** Bảng điều khiển máy chế biến: hàng đợi, công thức, nâng cấp, di chuyển. */
export function MachinePanel() {
  const game = useGame();
  const selected = game.ui.selected.value;
  const state = game.state.value;
  const content = selected ? state.floors[selected.floor]?.slots[selected.slot] : null;
  const close = () => {
    game.ui.panel.value = null;
    game.ui.selected.value = null;
  };
  if (!selected || content?.kind !== 'machine') return null;
  const m: Machine = content;
  const { floor, slot } = selected;
  const now = game.now.value;
  const status = machineStatus(m, now);
  const cap = queueCapacity(m);
  const up = m.level < MACHINE_MAX_LEVEL ? MACHINE_UPGRADES[m.level - 1]! : null;
  const upGold = up ? machineUpgradeGold(m.machineId, m.level + 1) : 0;

  return (
    <Sheet
      title={`${machineName(m.machineId)} · ${t('machine.level', { n: m.level })}`}
      onClose={close}
      testId="machine-panel"
    >
      <h3>{t('machine.queue', { n: m.queue.length, cap })}</h3>
      {m.queue.length === 0 ? (
        <p class="muted">{t('machine.empty')}</p>
      ) : (
        <ul class="queue">
          {m.queue.map((job, i) => {
            const done = job.doneAt <= now;
            const running = !done && job.startAt <= now;
            const progress = running ? (now - job.startAt) / (job.doneAt - job.startAt) : done ? 1 : 0;
            return (
              <li key={`${job.recipe}-${job.startAt}`} class={`queue-item ${done ? 'done' : ''}`}>
                <span class="queue-icon">{recipeIcon(job.recipe)}</span>
                <div class="queue-body">
                  <small>
                    {done
                      ? t('machine.ready')
                      : running
                        ? `${t('machine.running')} · ${formatDuration(job.doneAt - now)}`
                        : t('machine.waiting')}
                  </small>
                  <div class="progress">
                    <div class="progress-fill" style={{ width: `${progress * 100}%` }} />
                  </div>
                </div>
                {running && (
                  <button
                    class="btn ruby small"
                    onClick={() => game.exec({ type: 'speedUpMachine', floor, slot })}
                    data-testid="machine-speedup"
                  >
                    {speedUpCost(job.doneAt - now)} {RUBY}
                  </button>
                )}
                {!done && !running && (
                  <button
                    class="icon-btn"
                    aria-label={t('machine.cancel')}
                    title={t('machine.cancel')}
                    onClick={() => game.exec({ type: 'cancelJob', floor, slot, index: i })}
                  >
                    ✕
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {status.readyCount > 0 && (
        <button
          class="btn primary wide"
          onClick={() => game.exec({ type: 'collectMachine', floor, slot })}
          data-testid="machine-collect"
        >
          {t('machine.collect')} ({status.readyCount})
        </button>
      )}

      <h3>{t('machine.recipes')}</h3>
      <ul class="card-list">
        {recipesFor(m.machineId).map((recipe) => {
          const def = recipeDef(recipe)!;
          const locked = state.level < def.unlockLevel;
          const ok = hasItems(state, def.inputs) && state.gold >= def.gold;
          return (
            <li key={recipe} class={`card ${locked ? 'locked' : ''}`} data-testid={`recipe-${recipe}`}>
              <span class="card-icon">{recipeIcon(recipe)}</span>
              <div class="card-body">
                <strong>{recipeName(recipe)}</strong>
                <small class="inputs">
                  {Object.entries(def.inputs).map(([id, n]) => {
                    const have = count(state.items, id as ItemId);
                    return (
                      <span key={id} class={have >= (n ?? 0) ? 'ok' : 'missing'}>
                        {ITEM_ICON[id as ItemId]} {have}/{n}
                      </span>
                    );
                  })}
                </small>
                {def.output === 'pot' ? (
                  <small>
                    ⏱ {formatDuration(jobDurationMs(def, m))} · {GOLD} −{formatNumber(def.gold)} ·{' '}
                    {t('machine.forgeOdds', {
                      odds: FORGES[recipe as ForgeId].odds
                        .map((pct, i) => (pct ? `${rarityName(RARITIES[i]!)} ${pct}%` : ''))
                        .filter(Boolean)
                        .join(', '),
                    })}
                  </small>
                ) : (
                  <small>
                    ⏱ {formatDuration(jobDurationMs(def, m))} · {GOLD} {ITEMS[recipe as ItemId].sellPrice} ·{' '}
                    {XP} {GOODS[recipe as GoodId].xp}
                  </small>
                )}
              </div>
              {locked ? (
                <span class="lock-note">{t('machine.needLevel', { n: def.unlockLevel })}</span>
              ) : (
                <button
                  class="btn primary"
                  disabled={!ok || m.queue.length >= cap}
                  onClick={() => game.exec({ type: 'startJob', floor, slot, recipe })}
                  data-testid={`start-${recipe}`}
                >
                  {t('machine.start')}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <h3>{t('machine.level', { n: m.level })}</h3>
      <div class="card">
        <span class="card-icon">⚙️</span>
        <div class="card-body">
          {up ? (
            <>
              <strong>{t('machine.upgrade', { n: m.level + 1 })}</strong>
              <small>
                {t('machine.upgradeDesc', {
                  queue: MACHINE_LEVELS[m.level]!.queue,
                  speed: MACHINE_LEVELS[m.level]!.speedPct,
                })}
              </small>
              <small>
                {Object.entries(up.materials)
                  .map(([id, n]) => `${ITEM_ICON[id as ItemId]} ${count(state.items, id as ItemId)}/${n}`)
                  .join(' · ')}
                {state.level < up.playerLevel && ` · ${t('machine.needLevel', { n: up.playerLevel })}`}
              </small>
            </>
          ) : (
            <strong>{t('machine.maxLevel')}</strong>
          )}
        </div>
        {up && (
          <button
            class="btn gold"
            disabled={state.gold < upGold || !hasItems(state, up.materials) || state.level < up.playerLevel}
            onClick={() => game.exec({ type: 'upgradeMachine', floor, slot })}
            data-testid="machine-upgrade"
          >
            ⬆
            <small>
              {GOLD} {formatNumber(upGold)}
            </small>
          </button>
        )}
      </div>
      <button
        class="btn wide"
        onClick={() => {
          game.ui.panel.value = null;
          game.ui.tool.value = { kind: 'move', from: { floor, slot } };
        }}
      >
        ↔ {t('machine.move')}
      </button>
    </Sheet>
  );
}
