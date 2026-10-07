import { levelProgress } from '../game';
import { formatNumber, t } from '../i18n';
import { useGame } from './context';
import { ChipBar } from './ChipBar';
import { GOLD, RUBY } from './icons';

export function Hud() {
  const game = useGame();
  const state = game.state.value;
  const progress = levelProgress(state);
  return (
    <header class="hud">
      <div class="hud-row">
        <div class="hud-level" data-fly-target="xp" title={t('hud.level', { n: state.level })}>
          <span class="level-badge" data-testid="level">
            {state.level}
          </span>
          <div class="xp-bar">
            <div class="xp-fill" style={{ width: `${progress.ratio * 100}%` }} />
            <span class="xp-text">
              {progress.needed
                ? t('hud.xp', { current: progress.current, needed: progress.needed })
                : t('hud.maxLevel')}
            </span>
          </div>
        </div>
        <div class="hud-pill" data-fly-target="gold" data-testid="gold">
          <span aria-hidden="true">{GOLD}</span> {formatNumber(state.gold)}
        </div>
        <div class="hud-pill ruby" data-fly-target="ruby" data-testid="ruby">
          <span aria-hidden="true">{RUBY}</span> {formatNumber(state.ruby)}
        </div>
      </div>
      <ChipBar />
    </header>
  );
}
